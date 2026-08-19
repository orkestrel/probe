import type { Case, Check, Finding, Source, Stage } from '@src/core'
import type { StageInterface } from '../types.js'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
	inferDocumentLanguage,
	messageFromUnknown,
	parseContentLength,
	relativeWorkspaceFile,
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
 * @example
 * ```ts
 * const stage = new LintStage('/srv/checkout')
 * const check = await stage.inspect(subject)
 * await stage.destroy()
 * ```
 */
export class LintStage implements StageInterface {
	readonly #workspace: string
	readonly #warmth: Promise<ChildProcessWithoutNullStreams>
	readonly #responses = new Map<number, (value: unknown) => void>()
	readonly #failures = new Map<number, (error: Error) => void>()
	readonly #documents = new Map<string, string>()
	readonly #publishes = new Map<string, (findings: readonly Finding[]) => void>()
	readonly #refusals = new Map<string, (error: Error) => void>()
	#child: ChildProcessWithoutNullStreams | undefined
	#buffer = Buffer.alloc(0)
	#sequence = 0
	#closing: Promise<void> | undefined
	#destroyed = false
	// How the language server ended, while it runs. Node leaves `exitCode` at `null` for a child
	// killed by a signal, so reading the child reports a signalled server as alive and every write
	// after that vanishes into a dead pipe.
	#ending: string | undefined

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

	async inspect(subject: Case): Promise<Check> {
		if (this.#destroyed) throw new Error('The lint stage has been destroyed')
		const started = performance.now()
		await this.#warmth
		if (this.#destroyed) throw new Error('The lint stage has been destroyed')
		const findings: Finding[] = []
		for (const source of [...subject.files, subject.test]) {
			findings.push(...(await this.#document(source)))
		}
		return {
			stage: this.stage,
			elapsed: Math.round(performance.now() - started),
			findings,
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
		const child = await this.#warmth.catch(() => this.#child)
		// Abandon every document in flight rather than waiting for it: a server that never publishes
		// its diagnostics would otherwise hold teardown open for the life of the process.
		this.#fail(new Error('The lint stage has been destroyed'))
		if (child === undefined || this.#ending !== undefined) return
		const released = new Promise<void>((resolve) => {
			child.once('exit', () => resolve())
			child.once('close', () => resolve())
		})
		await this.#retire(child)
		await released
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
		// coordinator can recycle around it.
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

	#document(source: Source): Promise<readonly Finding[]> {
		const path = this.#file(source)
		const uri = pathToFileURL(path).href
		const diagnostics = new Promise<readonly Finding[]>((resolve, reject) => {
			this.#documents.set(uri, source.path.replaceAll('\\', '/'))
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
					languageId: inferDocumentLanguage(source.path),
					version: this.#sequence,
					text: source.text,
				},
			})
		} catch (error) {
			this.#refusals.get(uri)?.(new Error(messageFromUnknown(error)))
		}
		return inspected
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

	#file(source: Source): string {
		const declared = relativeWorkspaceFile(
			this.#workspace,
			resolveWorkspaceFile(this.#workspace, source.path),
		)
		const [axis, environment] = declared.split('/')
		const directory =
			(axis === 'src' || axis === 'app') && environment !== undefined && environment !== ''
				? `${axis}/${environment}`
				: 'tests'
		// Keep the declared file name. Oxlint keys its overrides on globs, so a synthesized name that
		// dropped it selects a different rule set from the one the workspace's own gate applies, and
		// the stage reports a finding that gate exempts.
		return resolveWorkspaceFile(
			this.#workspace,
			`${directory}/probe-${randomUUID()}.${basename(declared)}`,
		)
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
			reject?.(new Error(messageFromUnknown(error)))
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
			throw new Error(`The Oxlint language server exited with ${this.#ending}`)
		}
		if (child === undefined) throw new Error('The Oxlint language server is not running')
		// A server that closed its input is unreachable while its process still lives, so a write
		// here would neither fail nor ever be answered.
		if (!child.stdin.writable) throw new Error('The Oxlint language server closed its input')
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
			this.#fail(new Error('Oxlint sent an invalid JSON-RPC frame header'))
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
			this.#fail(new Error(`Oxlint sent invalid JSON: ${messageFromUnknown(error)}`))
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
				reject?.(new Error(messageFromUnknown(message.error)))
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
		publish(this.#findings(params.uri, params.diagnostics))
	}

	// Every finding here is one diagnostic Oxlint published about the text the caller supplied, so
	// each one is that code failing. A server this stage cannot drive rejects the inspection
	// instead, so no fault of its own reaches a caller as a finding.
	#findings(uri: string, diagnostics: readonly unknown[]): readonly Finding[] {
		const path = this.#documents.get(uri)
		if (path === undefined) return []
		const findings: Finding[] = []
		for (const diagnostic of diagnostics) {
			if (typeof diagnostic !== 'object' || diagnostic === null) continue
			if (!('message' in diagnostic) || typeof diagnostic.message !== 'string') continue
			if (
				!('range' in diagnostic) ||
				typeof diagnostic.range !== 'object' ||
				diagnostic.range === null
			) {
				findings.push({ origin: 'code', path, message: diagnostic.message })
				continue
			}
			const range = diagnostic.range
			if (!('start' in range) || typeof range.start !== 'object' || range.start === null) {
				findings.push({ origin: 'code', path, message: diagnostic.message })
				continue
			}
			const start = range.start
			if (!('line' in start) || typeof start.line !== 'number') {
				findings.push({ origin: 'code', path, message: diagnostic.message })
				continue
			}
			findings.push({ origin: 'code', path, message: diagnostic.message, line: start.line + 1 })
		}
		return findings
	}

	#fail(error: Error): void {
		for (const reject of this.#failures.values()) reject(error)
		for (const reject of this.#refusals.values()) reject(error)
		this.#responses.clear()
		this.#failures.clear()
		this.#publishes.clear()
		this.#refusals.clear()
	}

	#exit(code: number | null, signal: NodeJS.Signals | null): void {
		this.#ending = code === null ? `signal ${signal ?? 'unknown'}` : `code ${code}`
		if (this.#destroyed && code === 0) return
		this.#fail(new Error(`The Oxlint language server exited with ${this.#ending}`))
	}
}
