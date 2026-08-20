import type { Case, Check, Draft, Issue, Stage } from '@src/core'
import type { StageInterface } from '../types.js'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { TimeoutInterface } from '@orkestrel/timeout'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createTimeout } from '@orkestrel/timeout'
import { ProbeError, createDestroyedError } from '@src/core'
import {
	describeUnknown,
	inferDocumentLanguage,
	normalizePath,
	parseContentLength,
	resolveWorkspaceBinary,
	resolveWorkspaceFile,
} from '../helpers.js'

/**
 * Inspects virtual documents through one resident Oxlint language server.
 *
 * @remarks
 * Construction starts the target workspace's Oxlint binary with its Language Server Protocol
 * mode. Each inspection opens the supplied text by URI, waits for published diagnostics, and
 * closes the document without writing it to disk.
 *
 * Teardown is bounded at both ends. Warming waits for the server's `initialize` response and the
 * ending waits for its `shutdown` reply, and the protocol leaves both answers to the server, so
 * `destroy` bounds each exchange and takes the ending back with a signal when the bound passes.
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
 * const check = await stage.inspect(subject)
 * await stage.destroy()
 * ```
 */
export class LintStage implements StageInterface {
	readonly #workspace: string
	// The bound on every exchange teardown has with the language server, warming included. The
	// protocol leaves both the warming answer and the ending to the server, so each one is a wait
	// this stage takes back rather than a wait it can rely on.
	readonly #deadline = 2_000
	readonly #warmth: Promise<ChildProcessWithoutNullStreams>
	readonly #responses = new Map<number, (value: unknown) => void>()
	readonly #failures = new Map<number, (error: Error) => void>()
	readonly #documents = new Map<string, string>()
	readonly #publishes = new Map<string, (issues: readonly Issue[]) => void>()
	readonly #refusals = new Map<string, (error: Error) => void>()
	#child: ChildProcessWithoutNullStreams | undefined
	#buffer = Buffer.alloc(0)
	#sequence = 0
	#closing: Promise<void> | undefined
	#progress = 0
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

	async inspect(subject: Case): Promise<Check> {
		if (this.#destroyed) throw createDestroyedError('lint stage')
		const started = performance.now()
		await this.#warmth
		if (this.#destroyed) throw createDestroyedError('lint stage')
		const issues: Issue[] = []
		for (const draft of [...subject.files, subject.test]) {
			issues.push(...(await this.#document(draft)))
		}
		return {
			stage: this.stage,
			elapsed: Math.round(performance.now() - started),
			issues,
		}
	}

	destroy(): Promise<void> {
		if (this.#closing !== undefined) return this.#closing
		this.#destroyed = true
		this.#closing = this.#destroy()
		return this.#closing
	}

	async #destroy(): Promise<void> {
		// A server that failed to warm still leaves a child to release, so read the spawned child
		// rather than the warming result.
		const child = await this.#warmed()
		// Abandon every document in flight rather than waiting for it: a server that never publishes
		// its diagnostics would otherwise hold teardown open for the life of the process.
		this.#fail(createDestroyedError('lint stage'))
		if (child === undefined || this.#ending !== undefined) return
		const released = new Promise<void>((resolve) => {
			child.once('exit', () => resolve())
			child.once('close', () => resolve())
		})
		await this.#release(child, released)
	}

	// Reads the warmed language server, or the spawned child when warming failed or outran the
	// deadline. Warming waits for the `initialize` response, and the protocol leaves that answer to
	// the server: one that accepts the connection and answers nothing has broken no rule, and
	// waiting on it holds teardown open for the life of the host. Teardown needs the child rather
	// than the warming result, and `#warm` has the child before it sends anything, so the bound
	// costs the answer and nothing else. The abandoned warming promise keeps its constructor's
	// observer, so nothing rejects into the host.
	async #warmed(): Promise<ChildProcessWithoutNullStreams | undefined> {
		const timeout = createTimeout({ ms: this.#deadline })
		timeout.start()
		try {
			return await Promise.race([this.#warmth, this.#expiry(timeout)])
		} catch {
			return this.#child
		} finally {
			timeout.clear()
		}
	}

	// Ends the conversation under a deadline and signals the child when that deadline passes. The
	// protocol leaves the ending to the server: a server that answers `shutdown` and then ignores
	// `exit` has broken no rule, and one that answers neither is unreachable rather than dead. Both
	// leave teardown waiting for the life of the host and leak the child with it, so this bounds
	// the whole exchange at two seconds and then takes the ending back. `SIGKILL` cannot be
	// handled, so the child ends and its own `exit` event settles the wait.
	async #release(child: ChildProcessWithoutNullStreams, released: Promise<void>): Promise<void> {
		const timeout = createTimeout({ ms: this.#deadline })
		timeout.start()
		try {
			await Promise.race([this.#retire(child).then(() => released), this.#expiry(timeout)])
		} catch {
			child.kill('SIGKILL')
			await released
		} finally {
			timeout.clear()
		}
	}

	// Asks the language server to shut down and signals it when that conversation fails. A server
	// that died mid-teardown, or that never answers, still has to release its resources, and
	// teardown must not wait on a reply a dead pipe swallowed.
	async #retire(child: ChildProcessWithoutNullStreams): Promise<void> {
		try {
			await this.#request('shutdown', undefined)
			this.#notify('exit', undefined)
		} catch {
			child.kill('SIGKILL')
		}
	}

	// Rejects when the teardown deadline fires, so a race against it settles even when the server
	// it waits on answers nothing.
	#expiry(timeout: TimeoutInterface): Promise<never> {
		return new Promise<never>((_resolve, reject) => {
			timeout.signal.addEventListener(
				'abort',
				() =>
					reject(
						new ProbeError(`The Oxlint language server did not exit within ${timeout.ms} ms`, {
							origin: 'instrument',
							code: 'deadline',
							context: { stage: this.stage, deadline: timeout.ms },
						}),
					),
				{ once: true },
			)
		})
	}

	async #warm(): Promise<ChildProcessWithoutNullStreams> {
		const binary = resolveWorkspaceBinary(this.#workspace, 'oxlint')
		const child = spawn(process.execPath, [binary, '--lsp'], {
			cwd: this.#workspace,
			stdio: 'pipe',
		})
		this.#child = child
		child.stderr.resume()
		child.stdout.on('data', (chunk: Buffer) => this.#read(chunk))
		// A write racing the server's death reports `EPIPE` on this stream rather than throwing, and
		// an unobserved stream error ends the resident host. Report it as a stage fault so the
		// inspection that raced the death is refused rather than left waiting for a reply the pipe
		// swallowed.
		child.stdin.on('error', (error) => this.#fail(error))
		child.on('error', (error) => this.#fail(error))
		child.on('exit', (code, signal) => this.#exit(code, signal))
		await this.#request('initialize', {
			processId: process.pid,
			rootUri: pathToFileURL(this.#workspace).href,
			capabilities: {},
			workspaceFolders: [
				{
					uri: pathToFileURL(this.#workspace).href,
					name: 'workspace',
				},
			],
		})
		this.#notify('initialized', {})
		return child
	}

	// Opens one candidate at the path it was declared. Oxlint keys its overrides on globs, so any
	// identity distinct from that path selects a different rule set from the one the workspace's own
	// gate applies, and an override naming one exact file is reachable by nothing else. One URI
	// carries one open document and one publication, so a caller driving two inspections of one path
	// at once is refused rather than served an answer belonging to the other.
	#document(draft: Draft): Promise<readonly Issue[]> {
		const uri = pathToFileURL(resolveWorkspaceFile(this.#workspace, draft.path)).href
		if (this.#publishes.has(uri)) {
			return Promise.reject(
				new ProbeError(`The lint stage is already inspecting ${draft.path}`, {
					origin: 'claimant',
					code: 'refused',
					context: { stage: this.stage, path: draft.path },
				}),
			)
		}
		const diagnostics = new Promise<readonly Issue[]>((resolve, reject) => {
			this.#documents.set(uri, normalizePath(draft.path))
			this.#publishes.set(uri, resolve)
			this.#refusals.set(uri, reject)
		})
		// Attach the cleanup before opening the document. An open that throws would otherwise leave
		// this promise pending with no handler, and the next failure rejects it into the host.
		const inspected = diagnostics.finally(() => this.#close(uri))
		try {
			this.#notify('textDocument/didOpen', {
				textDocument: {
					uri,
					languageId: inferDocumentLanguage(draft.path),
					version: this.#sequence,
					text: draft.text,
				},
			})
			this.#progress += 1
		} catch (error) {
			this.#refusals.get(uri)?.(this.#fault(describeUnknown(error), error, draft.path))
		}
		return inspected
	}

	// How the language server ended, or `undefined` while it runs. Node records a signal death on
	// `signalCode`, an exit on `exitCode`, and a child that never spawned on `exitCode` too, and it
	// sets each one before the event that announces it. Reading the child covers every ending,
	// including the spawn failure, which reports `error` and `close` and never `exit`.
	get #ending(): string | undefined {
		const child = this.#child
		if (child === undefined) return undefined
		if (child.exitCode === null && child.signalCode === null) return undefined
		return this.#describe(child.exitCode, child.signalCode)
	}

	// Names one ending for a message. Node announces an exit with exactly one non-null argument.
	#describe(code: number | null, signal: NodeJS.Signals | null): string {
		return signal === null ? `code ${code}` : `signal ${signal}`
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

	// Whether the language server can still receive a message. A server that ended, and one that
	// closed its input while its process lives, both take no further writes.
	get #reachable(): boolean {
		return this.#ending === undefined && this.#child?.stdin.writable === true
	}

	// Releases one document. The deletes run before the notification because an unreachable server
	// refuses the write, and a throw here would replace the diagnosis the caller is receiving and
	// leave this document registered for the life of the stage.
	#close(uri: string): void {
		this.#documents.delete(uri)
		this.#publishes.delete(uri)
		this.#refusals.delete(uri)
		if (this.#destroyed || !this.#reachable) return
		this.#notify('textDocument/didClose', { textDocument: { uri } })
	}

	#request(method: string, params: unknown): Promise<unknown> {
		this.#sequence += 1
		const id = this.#sequence
		const response = new Promise<unknown>((resolve, reject) => {
			this.#responses.set(id, resolve)
			this.#failures.set(id, reject)
		})
		try {
			this.#send({ jsonrpc: '2.0', id, method, params })
		} catch (error) {
			// Forget the request before refusing it. A request the stage never sent has no reply to
			// wait for, and leaving its entry behind holds this promise for the life of the stage.
			const reject = this.#failures.get(id)
			this.#responses.delete(id)
			this.#failures.delete(id)
			reject?.(this.#fault(describeUnknown(error), error))
		}
		return response
	}

	#notify(method: string, params: unknown): void {
		this.#sequence += 1
		this.#send({ jsonrpc: '2.0', method, params })
	}

	#send(message: unknown): void {
		const child = this.#child
		if (this.#ending !== undefined) {
			throw this.#fault(`The Oxlint language server exited with ${this.#ending}`)
		}
		if (child === undefined) throw this.#fault('The Oxlint language server is not running')
		// A server that closed its input is unreachable while its process still lives, so a write
		// here would neither fail nor ever be answered.
		if (!child.stdin.writable) throw this.#fault('The Oxlint language server closed its input')
		const content = JSON.stringify(message)
		const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`
		child.stdin.write(header + content)
	}

	#read(chunk: Buffer): void {
		this.#buffer = Buffer.concat([this.#buffer, chunk])
		while (this.#frame()) {}
	}

	#frame(): boolean {
		const boundary = this.#buffer.indexOf('\r\n\r\n')
		if (boundary < 0) return false
		const header = this.#buffer.subarray(0, boundary).toString('ascii')
		const length = parseContentLength(header)
		if (length === undefined) {
			this.#fail(this.#fault('Oxlint sent an invalid JSON-RPC frame header'))
			return false
		}
		const start = boundary + 4
		const end = start + length
		if (this.#buffer.length < end) return false
		const content = this.#buffer.subarray(start, end).toString('utf8')
		this.#buffer = this.#buffer.subarray(end)
		try {
			const message: unknown = JSON.parse(content)
			this.#receive(message)
		} catch (error) {
			this.#fail(this.#fault(`Oxlint sent invalid JSON: ${describeUnknown(error)}`, error))
		}
		return true
	}

	#receive(message: unknown): void {
		if (typeof message !== 'object' || message === null) return
		if ('id' in message && typeof message.id === 'number') {
			const id = message.id
			const resolve = this.#responses.get(id)
			const reject = this.#failures.get(id)
			this.#responses.delete(id)
			this.#failures.delete(id)
			if ('error' in message && message.error !== undefined) {
				reject?.(this.#fault(describeUnknown(message.error)))
			} else {
				resolve?.('result' in message ? message.result : undefined)
			}
			return
		}
		if (!('method' in message) || message.method !== 'textDocument/publishDiagnostics') return
		if (!('params' in message) || typeof message.params !== 'object' || message.params === null) {
			return
		}
		const params = message.params
		if (!('uri' in params) || typeof params.uri !== 'string') return
		if (!('diagnostics' in params) || !Array.isArray(params.diagnostics)) return
		const publish = this.#publishes.get(params.uri)
		if (publish === undefined) return
		publish(this.#issues(params.uri, params.diagnostics))
	}

	// Every issue here is one diagnostic Oxlint published about the text the caller supplied, so
	// each one is that code failing. A server this stage cannot drive rejects the inspection
	// instead, so no fault of its own reaches a caller as an issue.
	#issues(uri: string, diagnostics: readonly unknown[]): readonly Issue[] {
		const path = this.#documents.get(uri)
		if (path === undefined) return []
		const issues: Issue[] = []
		for (const diagnostic of diagnostics) {
			if (typeof diagnostic !== 'object' || diagnostic === null) continue
			if (!('message' in diagnostic) || typeof diagnostic.message !== 'string') continue
			if (
				!('range' in diagnostic) ||
				typeof diagnostic.range !== 'object' ||
				diagnostic.range === null
			) {
				issues.push({ origin: 'claimant', path, message: diagnostic.message })
				continue
			}
			const range = diagnostic.range
			if (!('start' in range) || typeof range.start !== 'object' || range.start === null) {
				issues.push({ origin: 'claimant', path, message: diagnostic.message })
				continue
			}
			const start = range.start
			if (!('line' in start) || typeof start.line !== 'number') {
				issues.push({ origin: 'claimant', path, message: diagnostic.message })
				continue
			}
			issues.push({
				origin: 'claimant',
				path,
				message: diagnostic.message,
				line: start.line + 1,
			})
		}
		return issues
	}

	#fail(error: Error): void {
		for (const reject of this.#failures.values()) reject(error)
		for (const reject of this.#refusals.values()) reject(error)
		this.#responses.clear()
		this.#failures.clear()
		this.#publishes.clear()
		this.#refusals.clear()
	}

	// Settles everything the ended server can no longer answer. A teardown in flight is registered
	// here too: its own `shutdown` request is the last thing outstanding, and a server that exits
	// without replying leaves teardown waiting on it unless this refuses it.
	#exit(code: number | null, signal: NodeJS.Signals | null): void {
		this.#fail(
			this.#fault(`The Oxlint language server exited with ${this.#describe(code, signal)}`),
		)
	}
}
