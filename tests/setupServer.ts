import type { ScratchInterface } from '@orkestrel/test/server'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { attempt } from '@orkestrel/contract'
import { waitForCondition } from '@orkestrel/test'
import { createScratch, supportsDirectoryLinks } from '@orkestrel/test/server'

/** Selects what one built Oxlint language server fixture publishes and how long it answers. */
export interface LintFixtureOptions {
	/**
	 * Holds the milliseconds the server lives before it exits itself, which bounds an abandoned
	 * child rather than any exchange. Size it above the timeout of every row that drives it.
	 * Default: `60_000`.
	 */
	readonly budget?: number
	/**
	 * Holds the milliseconds between one document's admission and its publication. A row reading
	 * what the server does with a document still open raises it. Default: `0`.
	 */
	readonly delay?: number
	/**
	 * Names the JavaScript entry the manifest publishes as the `oxlint` binary. Default: the fixture
	 * program written beside the manifest, which the built file set carries.
	 */
	readonly binary?: string
}

/** Holds one Oxlint language server fixture: its manifest, its program, and the file set both need. */
export interface LintFixture {
	/** Holds the manifest text a target workspace publishes at `node_modules/oxlint/package.json`. */
	readonly manifest: string
	/** Holds the language server program text the manifest's `bin` entry names. */
	readonly program: string
	/** Holds every file a scratch workspace needs to serve this fixture. */
	readonly files: Readonly<Record<string, string>>
}

/**
 * Builds one protocol-faithful Oxlint language server and the workspace files that publish it.
 *
 * @param options - The server's own budget and publication delay, and the binary its manifest names.
 * @returns The manifest text, the server program, and the file set a scratch workspace needs.
 * @remarks The server announces its own process id in `server.pid`, so a test kills the real child a
 * stage owns privately and reads whether that child is still alive. Its `initialize` result declares
 * `textDocumentSync` with `openClose`, which is what a client checks before it opens a document at
 * all — real Oxlint declares the same capability, so a fixture omitting it would refuse every
 * document the real server admits. It appends one line per `didOpen` to `probe-lint.log` carrying
 * the number of documents open at that moment, and one line per `didClose`, so a coordinator that
 * admits two inspections at once or admits them out of order is read off that record. Every admitted
 * document appends its version to `versions`.
 *
 * Marker files in the workspace select how it ends: `frail` exits with a code on the first document,
 * `unanswered-shutdown` exits without replying to `shutdown`, `unanswered-initialize` records
 * `initialized` and exits 250 ms later without replying, `silent-initialize` stays alive and never
 * replies to `initialize`, and `ignored-exit` answers `shutdown` and then stays alive through
 * `exit`, which is the one ending the protocol leaves to the client to force. The `stall-lint`
 * marker silences every document. Markers in a document's own text select how it answers that
 * document: `PROBE_SILENT` writes the document URI to `admitted` and publishes nothing, `PROBE_SLOW`
 * publishes after 3 s, which is past the bound a stage's client holds over its lifecycle exchanges,
 * and `PROBE_CLOSES_INPUT` closes the server's own standard input when that document is closed and
 * then writes the URI into the `closed` record it opened first, so the record's contents land after
 * the close and a test that waits for those contents writes again only after the close has landed.
 *
 * The `stall` marker selects a different conversation entirely, and its content is the one document
 * URI this server answers. It frames `initialize` with blocking reads on the descriptor itself, so
 * it owns no stream buffer of its own, replies, and then reads nothing ever again. Its timer
 * publishes empty diagnostics for the marked URI and records the publication in `published`, so a
 * document it never read is answered while every byte the client writes after the handshake stays in
 * a pipe nobody drains.
 */
export function createLintFixture(options?: LintFixtureOptions): LintFixture {
	const program = [
		"import { appendFileSync, closeSync, existsSync, openSync, readFileSync, readSync, writeFileSync, writeSync } from 'node:fs'",
		'let buffer = Buffer.alloc(0)',
		'let deferred',
		'let open = 0',
		"writeFileSync('server.pid', String(process.pid))",
		`setTimeout(() => process.exit(0), ${options?.budget ?? 60_000})`,
		'function send(message) {',
		'\tconst content = JSON.stringify(message)',
		"\tprocess.stdout.write('Content-Length: ' + Buffer.byteLength(content) + '\\r\\n\\r\\n' + content)",
		'}',
		'function publish(uri) {',
		"\tsend({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri, diagnostics: [] } })",
		'}',
		'function frame() {',
		"\tconst boundary = buffer.indexOf('\\r\\n\\r\\n')",
		'\tif (boundary < 0) return undefined',
		"\tconst header = buffer.subarray(0, boundary).toString('ascii')",
		'\tconst match = /Content-Length: (\\d+)/i.exec(header)',
		'\tif (match === null) return undefined',
		'\tconst length = Number(match[1])',
		'\tconst start = boundary + 4',
		'\tif (buffer.length < start + length) return undefined',
		"\tconst message = JSON.parse(buffer.subarray(start, start + length).toString('utf8'))",
		'\tbuffer = buffer.subarray(start + length)',
		'\treturn message',
		'}',
		"if (existsSync('stall')) {",
		"\tconst held = readFileSync('stall', 'utf8')",
		'\tconst chunk = Buffer.alloc(65_536)',
		'\tlet request',
		'\twhile (request === undefined) {',
		'\t\tconst read = readSync(0, chunk, 0, chunk.length, null)',
		'\t\tbuffer = Buffer.concat([buffer, chunk.subarray(0, read)])',
		'\t\trequest = frame()',
		'\t}',
		"\tsend({ jsonrpc: '2.0', id: request.id, result: { capabilities: { textDocumentSync: { openClose: true, change: 1 } } } })",
		'\tsetTimeout(() => {',
		'\t\tpublish(held)',
		"\t\twriteFileSync('published', held)",
		'\t}, 800)',
		'}',
		"if (!existsSync('stall')) process.stdin.on('data', (chunk) => {",
		'\tbuffer = Buffer.concat([buffer, chunk])',
		'\twhile (true) {',
		'\t\tconst message = frame()',
		'\t\tif (message === undefined) return',
		"\t\tif (message.method === 'initialize') {",
		"\t\t\tif (existsSync('unanswered-initialize')) {",
		"\t\t\t\twriteFileSync('initialized', String(process.pid))",
		'\t\t\t\tsetTimeout(() => process.exit(0), 250)',
		'\t\t\t\treturn',
		'\t\t\t}',
		"\t\t\tif (existsSync('silent-initialize')) return",
		"\t\t\tsend({ jsonrpc: '2.0', id: message.id, result: { capabilities: { textDocumentSync: { openClose: true, change: 1 } } } })",
		'\t\t}',
		"\t\tif (message.method === 'textDocument/didOpen') {",
		"\t\t\tif (existsSync('frail')) process.exit(7)",
		'\t\t\tconst uri = message.params.textDocument.uri',
		'\t\t\tconst text = message.params.textDocument.text',
		'\t\t\topen += 1',
		"\t\t\tappendFileSync('probe-lint.log', 'open ' + open + ' ' + uri + '\\n')",
		"\t\t\twriteFileSync('versions', message.params.textDocument.version + '\\n', { flag: 'a' })",
		"\t\t\tif (text.includes('PROBE_SILENT')) writeFileSync('admitted', uri)",
		"\t\t\tif (text.includes('PROBE_CLOSES_INPUT')) deferred = uri",
		"\t\t\tif (text.includes('PROBE_SLOW')) setTimeout(() => publish(uri), 3_000)",
		"\t\t\tconst held = existsSync('stall-lint') || text.includes('PROBE_SILENT') || text.includes('PROBE_SLOW')",
		`\t\t\tif (!held) setTimeout(() => publish(uri), ${options?.delay ?? 0})`,
		'\t\t}',
		"\t\tif (message.method === 'textDocument/didClose') {",
		'\t\t\topen -= 1',
		"\t\t\tappendFileSync('probe-lint.log', 'close ' + message.params.textDocument.uri + '\\n')",
		'\t\t\tif (message.params.textDocument.uri === deferred) {',
		// The record's descriptor is taken before the close, so the freed descriptor 0 is not the one
		// this write lands on and the pipe's reading end stays closed for the write that follows.
		"\t\t\t\tconst record = openSync('closed', 'w')",
		'\t\t\t\tcloseSync(0)',
		'\t\t\t\twriteSync(record, message.params.textDocument.uri)',
		'\t\t\t\tcloseSync(record)',
		'\t\t\t}',
		'\t\t}',
		"\t\tif (message.method === 'shutdown') {",
		"\t\t\tif (existsSync('unanswered-shutdown')) process.exit(0)",
		"\t\t\tsend({ jsonrpc: '2.0', id: message.id, result: null })",
		'\t\t}',
		"\t\tif (message.method === 'exit' && !existsSync('ignored-exit')) process.exit(0)",
		'\t}',
		'})',
	].join('\n')
	const manifest = `${JSON.stringify({
		name: 'oxlint',
		version: '1.79.0',
		type: 'module',
		bin: { oxlint: options?.binary ?? 'fixture.js' },
	})}\n`
	return {
		manifest,
		program,
		files: {
			'package.json': '{"type":"module"}\n',
			'node_modules/oxlint/package.json': manifest,
			...(options?.binary === undefined ? { 'node_modules/oxlint/fixture.js': program } : {}),
		},
	}
}

/**
 * Reads the process id announced by a fixture server.
 *
 * @param scratch - The fixture workspace carrying `server.pid`.
 * @returns The announced process id.
 * @throws An `Error` when the fixture server has not announced itself.
 */
export function readFixtureServer(scratch: ScratchInterface): number {
	const announced = scratch.read('server.pid')
	if (announced === undefined) throw new Error('The fixture server never announced its process id')
	return Number.parseInt(announced, 10)
}

/**
 * Waits for a fixture server to announce its process id.
 *
 * @param scratch - The fixture workspace that receives `server.pid`.
 * @returns The announced process id.
 * @throws An `Error` when the fixture server does not announce itself within 10 seconds.
 */
export async function waitForFixtureServer(scratch: ScratchInterface): Promise<number> {
	await waitForCondition(
		'the fixture server to announce its process id',
		() => scratch.read('server.pid') !== undefined,
		{ budget: 10_000, interval: 50 },
	)
	return readFixtureServer(scratch)
}

/**
 * Kills the process announced by a fixture server.
 *
 * @param scratch - The fixture workspace carrying `server.pid`.
 * @returns Nothing.
 */
export function killFixtureServer(scratch: ScratchInterface): void {
	process.kill(readFixtureServer(scratch), 'SIGKILL')
}

/** The exit code and the ending signal a host reported for one child. */
export interface Ending {
	readonly code: number | null
	readonly signal: string | null
}

/**
 * Reads the ending one spawned child reports.
 *
 * @param child - The child to read.
 * @returns The child's exit code and ending signal.
 * @remarks Call it as the child is spawned rather than after the work that ends the child: the
 * listener has to be attached before the exit it waits for, and a promise built afterwards never
 * settles.
 */
export function readChildEnding(child: ChildProcess): Promise<Ending> {
	return new Promise<Ending>((settle) => {
		child.once('exit', (code, signal) => settle({ code, signal }))
	})
}

/**
 * Names one child ending for a message.
 *
 * @param ending - The ending to name.
 * @returns `code <n>` when the host reported no signal; `signal <s>` otherwise.
 * @remarks The host announces an ending with exactly one non-null member, which is what lets one
 * phrase carry either answer. The lint stage phrases a language server's ending the same way, so a
 * proof comparing the two reads one construction rather than two.
 */
export function describeEnding(ending: Ending): string {
	return ending.signal === null ? `code ${ending.code}` : `signal ${ending.signal}`
}

/**
 * Reads how this host reports a signal delivered to a real child.
 *
 * @param signal - The signal to deliver after the child announces readiness.
 * @param program - The child program that announces readiness on standard output.
 * @returns The child's exit code and ending signal.
 */
export async function readSignalEnding(signal: NodeJS.Signals, program: string): Promise<Ending> {
	const child = spawn(process.execPath, ['-e', program], { stdio: ['ignore', 'pipe', 'ignore'] })
	const ended = readChildEnding(child)
	await new Promise<void>((armed) => {
		child.stdout.once('data', () => armed())
	})
	child.kill(signal)
	return await ended
}

/**
 * Reads how this host reports a child it killed through the host's own signal door.
 *
 * @param signal - The signal to deliver through `process.kill` after the child spawns. Omit it for
 * the control, where the child ends on its own.
 * @returns The child's exit code and ending signal.
 * @throws An `Error` when the host reports no process id for the spawned child.
 * @remarks The door decides the ending as much as the signal does, so this delivers the signal
 * through `process.kill`, which is the door `killFixtureServer` uses. Readiness is the `spawn` event
 * rather than an announcement on standard output, so the child announces nothing and needs no
 * stream. A call with no signal reports the ending a child takes on its own, which is the control an
 * instrument reporting a kill's ending must be read against.
 */
export async function readHostEnding(signal?: NodeJS.Signals): Promise<Ending> {
	const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 250)'], { stdio: 'ignore' })
	const ended = readChildEnding(child)
	if (signal !== undefined) {
		await new Promise<void>((ready) => {
			child.once('spawn', () => ready())
		})
		const id = child.pid
		if (id === undefined) throw new Error('The probe child never reported a process id')
		process.kill(id, signal)
	}
	return await ended
}

/**
 * Reads, on the host the suite is running on, whether a create fails because the host refuses a
 * name whose final component is longer than the filesystem accepts.
 *
 * @returns True if this host refuses such a name; false otherwise.
 * @remarks The code the failure carries is what decides that: `ENAMETOOLONG` and
 * `ERR_INVALID_ARG_VALUE` name the refusal outright, and `ENOENT` names it while the parent still
 * stats as a directory, because an ordinary absent file beneath an existing directory would have
 * been created instead. Every other code — a denied permission, a full disk, a locked path — is a
 * failure of the host rather than a refusal of the name, and reading the failure alone would run a
 * proof about a refusal on a host that reported none and red it there. A host that creates the file
 * instead refuses no such name, and a proof about a refusal is inapplicable there rather than
 * failing.
 *
 * This reads the codes itself rather than calling `isRefusedName`, so a classifier that stops
 * classifying cannot silence the proof that would catch it. The write goes into an owned scratch
 * directory, so nothing survives the reading.
 */
export function probeRefusedTargets(): boolean {
	const scratch = createScratch({ prefix: 'probe-refused-target-' })
	try {
		const outcome = attempt(() =>
			writeFileSync(resolve(scratch.path, `${'x'.repeat(300)}.test.ts`), '', 'utf8'),
		)
		if (outcome.success) return false
		const error = outcome.error
		if (typeof error !== 'object' || error === null || !('code' in error)) return false
		if (error.code === 'ENAMETOOLONG' || error.code === 'ERR_INVALID_ARG_VALUE') return true
		return error.code === 'ENOENT' && statSync(scratch.path).isDirectory()
	} finally {
		scratch.destroy()
	}
}

/**
 * Whether this host refuses to create a file under a caller-supplied name it will not accept.
 */
export const REFUSED_RUNTIME_TARGETS: boolean = probeRefusedTargets()

/**
 * Whether this host creates a directory link the workspace walker reads as a symbolic link.
 *
 * @remarks `supportsDirectoryLinks` creates one junction, which is the call that lands on a host
 * withholding the privilege a plain symbolic link needs, and answers true only when the link reports
 * as a symbolic link, resolves to a directory, and reaches the destination's contents. The walker's
 * own reading is `lstatSync().isSymbolicLink()`, and every proof gated here also traverses the link,
 * so the stricter answer is the one they need. A host answering false cannot build the linked path
 * those proofs are about, so each is inapplicable there rather than failing.
 */
export const DIRECTORY_LINKS: boolean = supportsDirectoryLinks()
