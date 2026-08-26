import type { Case, Check, Draft, Issue, Stage } from '@src/core'
import type { InspectionOptions, LintStageInterface } from '../types.js'
import type { LSPClientInterface, LSPDiagnostic, LSPExit } from '@orkestrel/lsp'
import { pathToFileURL } from 'node:url'
import { createLSPClient } from '@orkestrel/lsp'
import { createStdioTransport } from '@orkestrel/lsp/server'
import { ProbeError, createDestroyedError } from '@src/core'
import {
	describeUnknown,
	guardStage,
	inferDocumentLanguage,
	normalizePath,
	resolveWorkspaceBinary,
	resolveWorkspaceFile,
} from '../helpers.js'

/**
 * Inspects virtual documents through one resident Oxlint language server.
 *
 * @remarks
 * Construction starts the target workspace's Oxlint binary with its Language Server Protocol mode
 * and hands the conversation to `@orkestrel/lsp`: `createStdioTransport` owns the child process and
 * its bytes, and `createLSPClient` owns the framing, the request correlation, the capabilities this
 * stage advertises, and the choice between pulled and pushed diagnostics. This stage owns the
 * workspace, the candidate identity, and the projection from a diagnostic to an `Issue`.
 *
 * Each inspection opens the supplied text by URI, waits for the client's diagnostics, and closes the
 * document without writing it to disk. The caller's own signal is what bounds that wait, so a server
 * that admits a document and publishes nothing refuses the inspection when the caller's bound
 * expires rather than holding it for the life of the process. This stage mints no bound of its own
 * for the wait: a second one would race the caller's, and the answer would depend on scheduling.
 *
 * Teardown is bounded at both ends. Warming waits for the server's `initialize` response and the
 * ending waits for its `shutdown` reply, and the protocol leaves both answers to the server, so the
 * client's deadline bounds each exchange and the transport's cooperative window takes the ending
 * back with a signal when that window passes.
 *
 * The URI is the path the candidate declared, so the candidate receives exactly the rule set the
 * workspace's own lint gate applies to that path, including an override anchored to one directory,
 * one file name, or one exact file. A path the workspace's version-control ignore files exclude is
 * a path that gate never lints, and this stage reports the same nothing for it. Reuse of one
 * declared path across inspections is what the caller's own serialization protects: the stage
 * refuses a second inspection of a path it already has open rather than answering either one with
 * the other's diagnostics.
 *
 * @example
 * ```ts
 * const stage = new LintStage('/srv/checkout')
 * const check = await stage.inspect(subject, { signal: AbortSignal.timeout(30_000) })
 * await stage.destroy()
 * ```
 */
export class LintStage implements LintStageInterface {
	readonly #workspace: string
	// The bound this stage holds over the lifecycle exchanges the protocol leaves to the server: the
	// `initialize` reply warming waits for and the `shutdown` reply ending waits for. It does not
	// reach the diagnostics an inspection waits for, which the caller's own signal bounds. The
	// transport's cooperative window is half of it, so a child that ignores its ending is signalled
	// and released inside the same bound rather than outliving the client's own wait for the close.
	readonly #deadline = 2_000
	readonly #documents = new Set<string>()
	readonly #warmth: Promise<LSPClientInterface>
	// Teardown reads the constructed client rather than the warming result, because a warming that
	// failed or that is still waiting for its answer still leaves a client and a child to release.
	#client: LSPClientInterface | undefined
	#ending: string | undefined
	#closing: Promise<void> | undefined
	#progress = 0
	// The version every document this stage opens carries. It counts admissions across the stage's
	// whole life and never falls, because the gauge beside it does fall and a version that fell would
	// tell the server this text is older than the text it replaced.
	#revision = 0
	#destroyed = false

	/**
	 * Starts warming the target workspace's Oxlint language server.
	 *
	 * @param workspace - The target workspace root. Default: the current working directory
	 */
	constructor(workspace: string = process.cwd()) {
		this.#workspace = workspace
		this.#warmth = this.#warm()
		// Observe the stored promise here. Nothing reads it until an inspection or a teardown
		// arrives, and an unobserved rejection ends the host process. The stored promise keeps
		// rejecting, so an inspection still reports the warming failure.
		void this.#warmth.catch(() => {})
	}

	get stage(): Stage {
		return 'lint'
	}

	get progress(): number {
		return this.#progress
	}

	inspect(subject: Case, options?: InspectionOptions): Promise<Check> {
		return guardStage(this.stage, this.#inspect(subject, options))
	}

	destroy(): Promise<void> {
		if (this.#closing !== undefined) return this.#closing
		this.#destroyed = true
		this.#closing = guardStage(this.stage, this.#destroy())
		return this.#closing
	}

	async #inspect(subject: Case, options: InspectionOptions | undefined): Promise<Check> {
		if (this.#destroyed) throw createDestroyedError('lint stage')
		// The shared stage contract takes one argument, so this bound is optional in the type and
		// required in fact. Serving without it would mean minting a bound beside the caller's, which
		// is the racing pair this seam exists to remove.
		if (options === undefined) {
			throw new ProbeError('The lint stage inspects only under a bound its caller supplies', {
				origin: 'claimant',
				code: 'refused',
				context: { stage: this.stage },
			})
		}
		const started = performance.now()
		const client = await this.#warmed()
		if (this.#destroyed) throw createDestroyedError('lint stage')
		const issues: Issue[] = []
		for (const draft of [...subject.files, subject.test]) {
			issues.push(...(await this.#document(client, draft, options.signal)))
		}
		return {
			stage: this.stage,
			elapsed: Math.round(performance.now() - started),
			issues,
		}
	}

	// Releases the client, which ends its conversation and its child. The client asks the server to
	// shut down, bounds that reply, writes the `exit` the protocol leaves to the client to force,
	// and hands a child that outlives the cooperative window to a signal, so a server that answers
	// neither its ending nor its signal is released rather than deadlocking this call.
	async #destroy(): Promise<void> {
		await this.#client?.destroy()
	}

	// Builds the conversation and warms it. Everything before the first await runs while the
	// constructor is still on the stack, so teardown finds the client whatever the warming does
	// next; a workspace that publishes no Oxlint binary rejects here instead, and leaves none.
	async #warm(): Promise<LSPClientInterface> {
		const binary = resolveWorkspaceBinary(this.#workspace, 'oxlint')
		const client = createLSPClient({
			transport: createStdioTransport({
				server: {
					command: [process.execPath, binary, '--lsp'],
					directory: this.#workspace,
				},
				grace: this.#deadline / 2,
			}),
			workspace: pathToFileURL(this.#workspace).href,
			timeout: this.#deadline,
		})
		this.#client = client
		client.emitter.on('exit', (exit) => this.#retire(exit))
		await client.start()
		return client
	}

	// Reads the warmed client, phrasing a warming failure the way this stage reports one.
	async #warmed(): Promise<LSPClientInterface> {
		try {
			return await this.#warmth
		} catch (error) {
			throw this.#translate(error)
		}
	}

	// Names one ending for a message. The host announces an exit with exactly one non-null member,
	// and the client reports the signalled death and the code exit through the same event, so a
	// later inspection can say which one the server took.
	#retire(exit: LSPExit): void {
		this.#ending = exit.signal === null ? `code ${exit.code}` : `signal ${exit.signal}`
	}

	// Opens one candidate at the path it was declared. Oxlint keys its overrides on globs, so any
	// identity distinct from that path selects a different rule set from the one the workspace's own
	// gate applies, and an override naming one exact file is reachable by nothing else. One URI
	// carries one open document, so a caller driving two inspections of one path at once is refused
	// rather than served an answer belonging to the other. The document is closed whatever the
	// inspection returned, so the same path is inspectable again.
	async #document(
		client: LSPClientInterface,
		draft: Draft,
		signal: AbortSignal,
	): Promise<readonly Issue[]> {
		const uri = pathToFileURL(resolveWorkspaceFile(this.#workspace, draft.path)).href
		if (this.#documents.has(uri)) {
			throw new ProbeError(`The lint stage is already inspecting ${draft.path}`, {
				origin: 'claimant',
				code: 'refused',
				context: { stage: this.stage, path: draft.path },
			})
		}
		this.#documents.add(uri)
		// Raise the gauge as the document is admitted rather than when its answer arrives, so a
		// coordinator comparing its snapshot reads claimant-owned work in flight, and lower it again
		// in the `finally` block before the close this stage owes its own instrument is awaited, so
		// an expiry during that cleanup reads level with the snapshot and names the instrument.
		this.#progress += 1
		this.#revision += 1
		try {
			const diagnostics = await client.open(
				{
					uri,
					languageId: inferDocumentLanguage(draft.path),
					version: this.#revision,
					text: draft.text,
				},
				{ signal },
			)
			return this.#issues(normalizePath(draft.path), diagnostics)
		} catch (error) {
			if (signal.aborted) throw this.#abandoned(draft.path)
			throw this.#translate(error, draft.path)
		} finally {
			this.#progress -= 1
			this.#documents.delete(uri)
			// A server that ended, and a client that is closing, can no longer be told the document
			// closed. Neither failure may replace the diagnosis the caller is receiving.
			await client.close(uri).catch(() => undefined)
		}
	}

	// Names the caller's own bound as what ended one wait. The client reports its cancellation as a
	// transport failure, and `guardStage` would carry that to the caller as this stage's fault, which
	// tells a coordinator the instrument broke when the instrument was told to stop. A coordinator
	// that armed the signal replaces this with its own refusal; a coordinator of the caller's own
	// reads it directly.
	#abandoned(path: string): ProbeError {
		return new ProbeError('The lint stage inspection stopped at the bound its caller supplied', {
			origin: 'claimant',
			code: 'deadline',
			context: { stage: this.stage, path },
		})
	}

	// Phrases one failure the way this stage reports one. A destroyed stage refuses on its own
	// terms, a server that ended is named by the ending it took, and everything else is the
	// client's own coded failure, which `guardStage` carries to the caller as this stage's fault.
	#translate(error: unknown, path?: string): Error {
		if (this.#destroyed) return createDestroyedError('lint stage')
		const ending = this.#ending
		if (ending !== undefined) {
			return this.#fault(`The Oxlint language server exited with ${ending}`, error, path)
		}
		if (error instanceof Error) return error
		return this.#fault(describeUnknown(error), error, path)
	}

	// Every fault this stage reports about its own language server, under one category and naming
	// the stage that produced it. A caller catching one is told the inspection did not complete,
	// which is a different answer from a diagnostic about the candidate it supplied.
	#fault(message: string, cause?: unknown, path?: string): ProbeError {
		return new ProbeError(message, {
			origin: 'instrument',
			code: 'malformed',
			context: { stage: this.stage, ...(path === undefined ? {} : { path }) },
			...(cause === undefined ? {} : { cause }),
		})
	}

	// Every issue here is one diagnostic Oxlint published about the text the caller supplied, so
	// each one is that code failing. A server this stage cannot drive rejects the inspection
	// instead, so no fault of its own reaches a caller as an issue. The published range is already
	// the zero-based UTF-16 span the issue stores, so no conversion happens here; each coordinate is
	// read once into a span this package owns rather than the diagnostic's own object being carried
	// into a value that outlives the inspection.
	#issues(path: string, diagnostics: readonly LSPDiagnostic[]): readonly Issue[] {
		return diagnostics.map((diagnostic): Issue => ({
			origin: 'claimant',
			path,
			message: diagnostic.message,
			range: {
				start: {
					line: diagnostic.range.start.line,
					character: diagnostic.range.start.character,
				},
				end: { line: diagnostic.range.end.line, character: diagnostic.range.end.character },
			},
		}))
	}
}
