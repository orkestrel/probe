import type { ScratchInterface } from '@orkestrel/test/server'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { waitForDelay } from '@orkestrel/test'
import { createScratch } from '@orkestrel/test/server'
import { isProbeError } from '@src/core'
import { LintStage, resolveWorkspaceBinary } from '@src/server'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const STAGE = resolve(ROOT, 'src/server/stages/LintStage.ts')

// A protocol-faithful Oxlint language server. It announces its own process id, so a test can kill
// the real child the stage owns privately and can read whether that child is still alive. Marker
// files select how it ends: `frail` exits with a code on the first document,
// `unanswered-shutdown` exits without replying to `shutdown`, `unanswered-initialize` exits
// without replying to `initialize`, `silent-initialize` stays alive and never replies to
// `initialize`, and `ignored-exit` answers `shutdown` and then stays alive through `exit`, which is
// the one ending the protocol leaves to the client to force. Markers in a document's own text
// select how it answers that document: `PROBE_SILENT` writes the document URI to `admitted` and
// publishes nothing, and `PROBE_CLOSES_INPUT` closes the server's own standard input when that
// document is closed.
const SERVER = [
	"import { closeSync, existsSync, writeFileSync } from 'node:fs'",
	'let buffer = Buffer.alloc(0)',
	'let deferred',
	"writeFileSync('server.pid', String(process.pid))",
	'setTimeout(() => process.exit(0), 60_000)',
	'function send(message) {',
	'\tconst content = JSON.stringify(message)',
	"\tprocess.stdout.write('Content-Length: ' + Buffer.byteLength(content) + '\\r\\n\\r\\n' + content)",
	'}',
	"process.stdin.on('data', (chunk) => {",
	'\tbuffer = Buffer.concat([buffer, chunk])',
	'\twhile (true) {',
	"\t\tconst boundary = buffer.indexOf('\\r\\n\\r\\n')",
	'\t\tif (boundary < 0) return',
	"\t\tconst header = buffer.subarray(0, boundary).toString('ascii')",
	'\t\tconst match = /Content-Length: (\\d+)/i.exec(header)',
	'\t\tif (match === null) return',
	'\t\tconst length = Number(match[1])',
	'\t\tconst start = boundary + 4',
	'\t\tif (buffer.length < start + length) return',
	"\t\tconst message = JSON.parse(buffer.subarray(start, start + length).toString('utf8'))",
	'\t\tbuffer = buffer.subarray(start + length)',
	"\t\tif (message.method === 'initialize') {",
	"\t\t\tif (existsSync('unanswered-initialize')) {",
	'\t\t\t\tsetTimeout(() => process.exit(0), 250)',
	'\t\t\t\treturn',
	'\t\t\t}',
	"\t\t\tif (existsSync('silent-initialize')) return",
	"\t\t\tsend({ jsonrpc: '2.0', id: message.id, result: { capabilities: {} } })",
	'\t\t}',
	"\t\tif (message.method === 'textDocument/didOpen') {",
	"\t\t\tif (existsSync('frail')) process.exit(7)",
	'\t\t\tconst uri = message.params.textDocument.uri',
	'\t\t\tconst text = message.params.textDocument.text',
	"\t\t\tif (text.includes('PROBE_SILENT')) writeFileSync('admitted', uri)",
	"\t\t\tif (text.includes('PROBE_CLOSES_INPUT')) deferred = uri",
	"\t\t\tif (!text.includes('PROBE_SILENT')) {",
	"\t\t\t\tsend({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri, diagnostics: [] } })",
	'\t\t\t}',
	'\t\t}',
	"\t\tif (message.method === 'textDocument/didClose') {",
	'\t\t\tif (message.params.textDocument.uri === deferred) closeSync(0)',
	'\t\t}',
	"\t\tif (message.method === 'shutdown') {",
	"\t\t\tif (existsSync('unanswered-shutdown')) process.exit(0)",
	"\t\t\tsend({ jsonrpc: '2.0', id: message.id, result: null })",
	'\t\t}',
	"\t\tif (message.method === 'exit' && !existsSync('ignored-exit')) process.exit(0)",
	'\t}',
	'})',
].join('\n')

const FIXTURE = {
	'package.json': '{"type":"module"}\n',
	'node_modules/oxlint/package.json':
		'{"name":"oxlint","version":"1.79.0","type":"module","bin":{"oxlint":"fixture.js"}}\n',
	'node_modules/oxlint/fixture.js': SERVER,
}

const PASSING = "import { test } from 'vitest'\ntest('passes', () => {})\n"

// A resident host that drives the real stage outside Vitest, so an unhandled rejection ends a
// process whose exit code a test can read. Node stops at the `.js` specifiers the source compiles
// against, so the host registers the one resolution rule that maps them onto the TypeScript files
// beside them; it replaces no project behaviour.
const HOST = [
	"import { readFileSync } from 'node:fs'",
	"import { registerHooks } from 'node:module'",
	"import { pathToFileURL } from 'node:url'",
	'const [, , stage, workspace] = process.argv',
	// The stage is loaded as source in a bare host, so this hook stands in for what the workspace's
	// own resolver and the published build each do for it: the extension the source writes, and the
	// core entry the server bundle externalizes `@src/core` to.
	"const root = new URL('../../../', pathToFileURL(stage))",
	'registerHooks({',
	'\tresolve(specifier, context, next) {',
	"\t\tif (specifier.startsWith('.') && specifier.endsWith('.js')) {",
	"\t\t\treturn next(specifier.slice(0, -3) + '.ts', context)",
	'\t\t}',
	"\t\tif (specifier === '@src/core') {",
	"\t\t\treturn next(new URL('src/core/index.ts', root).href, context)",
	'\t\t}',
	'\t\treturn next(specifier, context)',
	'\t},',
	'})',
	'const { LintStage } = await import(pathToFileURL(stage).href)',
	"const text = \"import { test } from 'vitest'\\ntest('passes', () => {})\\n\"",
	'const dead = new LintStage(workspace)',
	"await dead.inspect({ files: [], test: { path: 'tests/src/server/host-warm.test.ts', text } })",
	"const announced = readFileSync(workspace + '/server.pid', 'utf8')",
	"process.kill(Number.parseInt(announced, 10), 'SIGKILL')",
	'await new Promise((settle) => setTimeout(settle, 250))',
	'const refused = await dead',
	"\t.inspect({ files: [], test: { path: 'tests/src/server/host-dead.test.ts', text } })",
	'\t.then(() => undefined, (error) => error.message)',
	"if (refused === undefined) throw new Error('the inspection resolved against a dead server')",
	'await dead.destroy()',
	'const live = new LintStage(workspace)',
	"const check = await live.inspect({ files: [], test: { path: 'tests/src/server/host-live.test.ts', text } })",
	'await live.destroy()',
	'await new Promise((settle) => setTimeout(settle, 300))',
	"console.log('refused ' + refused)",
	"console.log('settled ' + check.stage + ' ' + check.issues.length)",
].join('\n')

// A bare child that ends its own standard input the way the fixture server's `PROBE_CLOSES_INPUT`
// branch does: it reads a message, calls `closeSync(0)` on itself, and announces the close on its
// standard output, so a parent writes again only after the close has landed. The timer holds it
// open past the write that follows.
const CLOSER = [
	"import { closeSync } from 'node:fs'",
	"process.stdin.on('data', () => {",
	'\tcloseSync(0)',
	"\tprocess.stdout.write('closed')",
	'})',
	'setTimeout(() => {}, 10_000)',
].join('\n')

// Reads the process id the fixture server announced. The stage owns its child privately, so this
// is the door a real failure comes through rather than an accessor added to serve a test.
function readFixtureServer(scratch: ScratchInterface): number {
	const announced = scratch.read('server.pid')
	if (announced === undefined) throw new Error('The fixture server never announced its process id')
	return Number.parseInt(announced, 10)
}

// Waits for the fixture server to announce itself, so a teardown under test races a server that
// has accepted the connection rather than a spawn that has not landed yet.
async function waitForFixtureServer(scratch: ScratchInterface): Promise<number> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		const announced = scratch.read('server.pid')
		if (announced !== undefined) return Number.parseInt(announced, 10)
		await waitForDelay(50)
	}
	throw new Error('The fixture server never announced its process id')
}

// Kills the language server the stage spawned, by the process id the fixture announced.
function killFixtureServer(scratch: ScratchInterface): void {
	process.kill(readFixtureServer(scratch), 'SIGKILL')
}

// Reads how this host reports a child that ended, phrased the way the lint stage phrases an ending.
// A kill lands as a signal on one host and as an exit code on another, and the door it came through
// decides too, so this kills with `process.kill`, the door `killFixtureServer` uses, and the
// assertion composes whatever came back. With no signal the child ends on its own, which is the
// control: an instrument that reported a kill's ending for a child nobody killed would be measuring
// nothing.
async function readHostEnding(signal?: NodeJS.Signals): Promise<string> {
	const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 250)'], { stdio: 'ignore' })
	const ended = new Promise<void>((settle) => {
		child.on('exit', () => settle())
	})
	if (signal !== undefined) {
		await new Promise<void>((ready) => {
			child.on('spawn', () => ready())
		})
		const id = child.pid
		if (id === undefined) throw new Error('The probe child never reported a process id')
		process.kill(id, signal)
	}
	await ended
	return child.signalCode === null ? `code ${child.exitCode}` : `signal ${child.signalCode}`
}

// Reads how this host reports a write to a child that closed its own standard input, which is the
// mechanism the fixture server's `PROBE_CLOSES_INPUT` marker uses. A host that breaks the writing
// end when that descriptor closes refuses the next write, and the refusal's own code comes back; a
// host that leaves the writing end open accepts the write, and nothing comes back. Killing the child
// before the write is the control: that write is refused, so an instrument reporting nothing for it
// would be reporting nothing about the write at all.
async function readInputRefusal(signal?: NodeJS.Signals): Promise<string | undefined> {
	const child = spawn(process.execPath, ['-e', CLOSER], { stdio: ['pipe', 'pipe', 'ignore'] })
	// A host that does break the pipe reports it on the stream as well as on the write, and an
	// unheard `error` event there would end the run instead of the write.
	child.stdin.on('error', () => {})
	const closed = new Promise<void>((settle) => {
		child.stdout.on('data', () => settle())
	})
	const ended = new Promise<void>((settle) => {
		child.on('exit', () => settle())
	})
	child.stdin.write('open\n')
	await closed
	if (signal !== undefined) {
		child.kill(signal)
		await ended
	}
	const refusal = await new Promise<string | undefined>((settle) => {
		child.stdin.write('next\n', (error) => {
			if (error === null || error === undefined) {
				settle(undefined)
				return
			}
			settle('code' in error && typeof error.code === 'string' ? error.code : error.message)
		})
	})
	// The control already ended this child, so only the measured run leaves one to end.
	if (signal === undefined) child.kill('SIGKILL')
	await ended
	return refusal
}

// Whether one process still exists. Signal 0 delivers nothing and reports only reachability, which
// is how a caller reads the liveness of a child it does not own.
function isProcessLive(id: number): boolean {
	try {
		process.kill(id, 0)
		return true
	} catch {
		return false
	}
}

// Everything a settled teardown owes a consumer, read through the public surface alone: teardown
// resolves again without doing more work, and every later inspection is refused rather than left
// waiting on a server that is gone.
async function expectReleased(stage: LintStage): Promise<void> {
	await expect(stage.destroy()).resolves.toBeUndefined()
	await expect(
		stage.inspect({
			files: [],
			test: { path: 'tests/src/server/lint-released.test.ts', text: PASSING },
		}),
	).rejects.toThrow('The lint stage has been destroyed')
}

// Allocates a workspace that runs the target's own Oxlint binary against a configuration this file
// owns, so every override under test is one the workspace's gate really applies. The overrides
// are the selection shapes a candidate's declared path has to preserve: a whole directory, a file
// name inside a directory, and one exact path.
function createLintWorkspace(): ScratchInterface {
	return createScratch({
		files: {
			'package.json': '{"type":"module"}\n',
			'node_modules/oxlint/package.json': `${JSON.stringify({
				name: 'oxlint',
				version: '1.79.0',
				bin: { oxlint: resolveWorkspaceBinary(ROOT, 'oxlint') },
			})}\n`,
			'.oxlintrc.json': `${JSON.stringify({
				rules: { 'no-debugger': 'error' },
				overrides: [
					{ files: ['configs/**'], rules: { 'no-debugger': 'off' } },
					{ files: ['guides/candidate*.ts'], rules: { 'no-debugger': 'off' } },
					{ files: ['lib/exempt.ts'], rules: { 'no-debugger': 'off' } },
				],
			})}\n`,
		},
	})
}

describe('lint stage', () => {
	it('reports a workspace lint issue at the declared path', { timeout: 60_000 }, async () => {
		const stage = new LintStage(ROOT)
		try {
			const check = await stage.inspect({
				files: [],
				test: { path: 'tests/src/server/lint-candidate.test.ts', text: 'debugger\n' },
			})
			expect(check.issues.length).toBeGreaterThan(0)
			expect(check.issues).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						origin: 'claimant',
						path: 'tests/src/server/lint-candidate.test.ts',
						message: expect.stringContaining('debugger'),
					}),
				]),
			)
			// Oxlint publishes diagnostics about the supplied text and nothing else, so every
			// issue this stage returns carries the origin that can disprove a claim.
			expect(check.issues.every((issue) => issue.origin === 'claimant')).toBe(true)
		} finally {
			await stage.destroy()
		}
	})

	it(
		'serves sequential inspections of one declared path from one resident server',
		{ timeout: 60_000 },
		async () => {
			const stage = new LintStage(ROOT)
			const path = 'tests/src/server/lint-sequence.ts'
			try {
				// Nothing distinguishes these documents but their text and the order they arrive in, so
				// a server that answered from a cached document rather than the supplied one would
				// repeat its earliest answer for every one of them.
				const first = await stage.inspect({ files: [], test: { path, text: 'debugger\n' } })
				const second = await stage.inspect({
					files: [],
					test: { path, text: 'export const VALUE = 1\n' },
				})
				const third = await stage.inspect({
					files: [],
					test: { path, text: 'debugger\ndebugger\n' },
				})
				expect(first.issues.length).toBe(1)
				expect(second.issues).toStrictEqual([])
				expect(third.issues.length).toBe(2)
			} finally {
				await stage.destroy()
			}
		},
	)

	it('refuses a second inspection of a path already open', { timeout: 20_000 }, async () => {
		const scratch = createScratch({ files: FIXTURE })
		const stage = new LintStage(scratch.path)
		const source = {
			path: 'tests/src/server/lint-collision.test.ts',
			text: `${PASSING}// PROBE_SILENT\n`,
		}
		// The first document never receives its diagnostics, so it is still open when the second
		// arrives. Both name one path, and one URI carries one publication: without a refusal the
		// second registration replaces the first and the first inspection waits for the life of
		// the stage.
		const held = stage.inspect({ files: [], test: source })
		void held.catch(() => {})
		try {
			await waitForDelay(250)
			await expect(stage.inspect({ files: [], test: source })).rejects.toThrow(
				'The lint stage is already inspecting tests/src/server/lint-collision.test.ts',
			)
			await stage.destroy()
			await expect(held).rejects.toThrow('The lint stage has been destroyed')
		} finally {
			await stage.destroy()
			scratch.destroy()
		}
	})

	it(
		'raises progress after admitting a document whose diagnostics are held',
		{ timeout: 20_000 },
		async () => {
			const scratch = createScratch({ files: FIXTURE })
			const stage = new LintStage(scratch.path)
			const path = 'tests/src/server/lint-progress.test.ts'
			const source = { path, text: `${PASSING}// PROBE_SILENT\n` }
			const baseline = stage.progress
			const held = stage.inspect({ files: [], test: source })
			void held.catch(() => {})
			try {
				const deadline = performance.now() + 10_000
				while (scratch.read('admitted') === undefined && performance.now() < deadline) {
					await waitForDelay(20)
				}
				// The protocol peer records `didOpen` and withholds `publishDiagnostics`, so this reads
				// the gauge after admission and before the result exists.
				expect(scratch.read('admitted')).toContain('lint-progress.test.ts')
				expect(stage.progress).toBeGreaterThan(baseline)
			} finally {
				await stage.destroy()
				await expect(held).rejects.toThrow('The lint stage has been destroyed')
				scratch.destroy()
			}
		},
	)

	it(
		'reports nothing for a path the target workspace excludes from linting',
		{ timeout: 60_000 },
		async () => {
			const stage = new LintStage(ROOT)
			try {
				// `.gitignore` holds `tmp`, and Oxlint honours version-control ignore files, so this
				// workspace's own gate never lints this path. The stage reports what that gate reports.
				const excluded = await stage.inspect({
					files: [],
					test: { path: 'tmp/probe/lint-excluded.test.ts', text: 'debugger\n' },
				})
				expect(excluded.issues).toStrictEqual([])
				// The control is the same text under a path the gate does lint. Without it a stage that
				// reported nothing at all would pass the preceding assertion.
				const reported = await stage.inspect({
					files: [],
					test: { path: 'tests/src/server/lint-excluded.test.ts', text: 'debugger\n' },
				})
				expect(reported.issues.length).toBe(1)
			} finally {
				await stage.destroy()
			}
		},
	)

	it(
		'applies the workspace lint overrides the declared path selects',
		{ timeout: 60_000 },
		async () => {
			const stage = new LintStage(ROOT)
			const text = 'export default { value: 1 }\n'
			try {
				// `.oxlintrc.json` exempts `*.config.ts` from `import/no-default-export`, so a probe that
				// reported this candidate would refuse code the workspace's own gate accepts.
				const exempt = await stage.inspect({
					files: [],
					test: { path: 'tests/src/server/lint-override.config.ts', text },
				})
				expect(exempt.issues).toStrictEqual([])
				// The control is the same text under a path the exemption does not reach. Without it a
				// stage that reported nothing at all would pass the preceding assertion.
				const reported = await stage.inspect({
					files: [],
					test: { path: 'tests/src/server/lint-override.ts', text },
				})
				expect(reported.issues).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							origin: 'claimant',
							path: 'tests/src/server/lint-override.ts',
							message: expect.stringContaining('named export'),
						}),
					]),
				)
			} finally {
				await stage.destroy()
			}
		},
	)

	it(
		'applies an override the workspace anchors to the declared directory',
		{ timeout: 60_000 },
		async () => {
			const scratch = createLintWorkspace()
			const stage = new LintStage(scratch.path)
			try {
				// The workspace exempts `configs/**` from `no-debugger`, so a candidate declared there
				// has to reach Oxlint under a path that override still selects.
				const exempt = await stage.inspect({
					files: [],
					test: { path: 'configs/candidate.ts', text: 'debugger\n' },
				})
				expect(exempt.issues).toStrictEqual([])
				// The control is the same text under a directory the override does not reach. Both
				// candidates carry one declared directory and one declared name, so the only thing that
				// can separate these two answers is the directory the stage kept.
				const reported = await stage.inspect({
					files: [],
					test: { path: 'lib/candidate.ts', text: 'debugger\n' },
				})
				expect(reported.issues).toEqual([
					expect.objectContaining({
						origin: 'claimant',
						path: 'lib/candidate.ts',
						message: expect.stringContaining('debugger'),
					}),
				])
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it(
		'applies an override the workspace anchors to a file name inside a directory',
		{ timeout: 60_000 },
		async () => {
			const scratch = createLintWorkspace()
			const stage = new LintStage(scratch.path)
			try {
				// `guides/candidate*.ts` reaches one directory and one name stem, so a stage that kept
				// the directory and dropped the name selects the workspace's default rules instead.
				const exempt = await stage.inspect({
					files: [],
					test: { path: 'guides/candidate.ts', text: 'debugger\n' },
				})
				expect(exempt.issues).toStrictEqual([])
				// The control is a different name in the same directory, so the directory cannot be
				// what separates these two answers.
				const reported = await stage.inspect({
					files: [],
					test: { path: 'guides/other.ts', text: 'debugger\n' },
				})
				expect(reported.issues).toEqual([
					expect.objectContaining({
						origin: 'claimant',
						path: 'guides/other.ts',
						message: expect.stringContaining('debugger'),
					}),
				])
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it(
		'applies an override the workspace anchors to one exact path',
		{ timeout: 60_000 },
		async () => {
			const scratch = createLintWorkspace()
			const stage = new LintStage(scratch.path)
			try {
				// `lib/exempt.ts` names one file and nothing else, so only the declared path itself
				// selects this override. No identity distinct from that path can reach it.
				const exempt = await stage.inspect({
					files: [],
					test: { path: 'lib/exempt.ts', text: 'debugger\n' },
				})
				expect(exempt.issues).toStrictEqual([])
				// The control is the same text in the same directory under a path the override does not
				// name, so the directory cannot be what separates these two answers.
				const reported = await stage.inspect({
					files: [],
					test: { path: 'lib/reported.ts', text: 'debugger\n' },
				})
				expect(reported.issues).toEqual([
					expect.objectContaining({
						origin: 'claimant',
						path: 'lib/reported.ts',
						message: expect.stringContaining('debugger'),
					}),
				])
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it(
		'reports an issue for a boot control candidate the target workspace lints',
		{ timeout: 60_000 },
		async () => {
			// The boot control stages its candidates under `tmp/probe`, and a target workspace that
			// lints that directory selects its rules from there. This workspace turns `no-debugger` on
			// for that directory alone, so a stage that reported the candidate under any other path
			// answers with the workspace's default rules and finds nothing.
			const scratch = createScratch({
				files: {
					'package.json': '{"type":"module"}\n',
					'node_modules/oxlint/package.json': `${JSON.stringify({
						name: 'oxlint',
						version: '1.79.0',
						bin: { oxlint: resolveWorkspaceBinary(ROOT, 'oxlint') },
					})}\n`,
					'.oxlintrc.json': `${JSON.stringify({
						rules: { 'no-debugger': 'off' },
						overrides: [{ files: ['tmp/probe/**'], rules: { 'no-debugger': 'error' } }],
					})}\n`,
				},
			})
			const stage = new LintStage(scratch.path)
			const path = 'tmp/probe/arm-runtime-89ab.test.ts'
			const violation = `debugger\n${PASSING}`
			try {
				const violating = await stage.inspect({ files: [], test: { path, text: violation } })
				expect(violating.issues).toEqual([
					expect.objectContaining({
						origin: 'claimant',
						path,
						message: expect.stringContaining('debugger'),
					}),
				])
				// The `clean` control is the boot control's own clean text at the same path. Without it a
				// stage that reported an issue for everything would pass the preceding assertion.
				const clean = await stage.inspect({ files: [], test: { path, text: PASSING } })
				expect(clean.issues).toStrictEqual([])
				// The `elsewhere` control is the same violation under the same file name outside that
				// directory, where the workspace leaves the rule off. It makes the preceding issue
				// evidence that the declared directory selected the rule set.
				const elsewhere = await stage.inspect({
					files: [],
					test: { path: 'lib/arm-runtime-89ab.test.ts', text: violation },
				})
				expect(elsewhere.issues).toStrictEqual([])
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it('abandons an inspection and destroys idempotently', { timeout: 60_000 }, async () => {
		const stage = new LintStage(ROOT)
		const inspection = stage.inspect({
			files: [],
			test: { path: 'tests/src/server/lint-destroy.test.ts', text: 'debugger\n' },
		})
		void inspection.catch(() => {})
		await Promise.all([stage.destroy(), stage.destroy()])
		await expect(inspection).rejects.toThrow('The lint stage has been destroyed')
		await expectReleased(stage)
	})

	it(
		'serves a later inspection after an earlier one is abandoned',
		{ timeout: 20_000 },
		async () => {
			const scratch = createScratch({ files: FIXTURE })
			const stage = new LintStage(scratch.path)
			const held = stage.inspect({
				files: [{ path: 'src/core/held.ts', text: 'export const VALUE = 1 // PROBE_SILENT\n' }],
				test: { path: 'tests/src/server/held.test.ts', text: PASSING },
			})
			void held.catch(() => {})
			try {
				const served = await stage.inspect({
					files: [],
					test: { path: 'tests/src/server/served.test.ts', text: PASSING },
				})
				expect(served.stage).toBe('lint')
				expect(served.issues).toStrictEqual([])
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it('settles teardown after the language server dies by signal', { timeout: 20_000 }, async () => {
		const scratch = createScratch({ files: FIXTURE })
		try {
			const signalled = new LintStage(scratch.path)
			await signalled.inspect({
				files: [],
				test: { path: 'tests/src/server/lint-signal-teardown.test.ts', text: PASSING },
			})
			const owned = readFixtureServer(scratch)
			killFixtureServer(scratch)
			await waitForDelay(250)
			const killed = performance.now()
			await expect(signalled.destroy()).resolves.toBeUndefined()
			expect(performance.now() - killed).toBeLessThan(5_000)
			await expectReleased(signalled)
			expect(isProcessLive(owned)).toBe(false)

			// The control is the death the guard already handled. A teardown that settles only for a
			// signalled server would report the same pass as one that settles for neither.
			const closed = new LintStage(scratch.path)
			await closed.inspect({
				files: [],
				test: { path: 'tests/src/server/lint-clean-teardown.test.ts', text: PASSING },
			})
			const answering = readFixtureServer(scratch)
			const exited = performance.now()
			await expect(closed.destroy()).resolves.toBeUndefined()
			expect(performance.now() - exited).toBeLessThan(5_000)
			await expectReleased(closed)
			expect(isProcessLive(answering)).toBe(false)
		} finally {
			scratch.destroy()
		}
	})

	it(
		'settles teardown against a language server that never answers its warming exchange',
		{ timeout: 20_000 },
		async () => {
			const scratch = createScratch({ files: { ...FIXTURE, 'silent-initialize': '' } })
			try {
				// No inspection runs here: warming is what never returns, so the stage is torn down
				// while it is still waiting for the answer the server owes it.
				const silent = new LintStage(scratch.path)
				const owned = await waitForFixtureServer(scratch)
				expect(isProcessLive(owned)).toBe(true)
				const asked = performance.now()
				await expect(silent.destroy()).resolves.toBeUndefined()
				expect(performance.now() - asked).toBeLessThan(10_000)
				await expectReleased(silent)
				expect(isProcessLive(owned)).toBe(false)
			} finally {
				scratch.destroy()
			}
		},
	)

	it(
		'settles teardown when the language server exits without answering shutdown',
		{ timeout: 20_000 },
		async () => {
			const scratch = createScratch({ files: { ...FIXTURE, 'unanswered-shutdown': '' } })
			try {
				const unanswered = new LintStage(scratch.path)
				await unanswered.inspect({
					files: [],
					test: { path: 'tests/src/server/lint-unanswered-shutdown.test.ts', text: PASSING },
				})
				const owned = readFixtureServer(scratch)
				const asked = performance.now()
				await expect(unanswered.destroy()).resolves.toBeUndefined()
				expect(performance.now() - asked).toBeLessThan(5_000)
				await expectReleased(unanswered)
				expect(isProcessLive(owned)).toBe(false)
			} finally {
				scratch.destroy()
			}

			// The control is the same teardown against a server that answers. A stage that settled
			// only by abandoning the conversation would report the same pass as one that held it.
			const answering = createScratch({ files: FIXTURE })
			try {
				const stage = new LintStage(answering.path)
				await stage.inspect({
					files: [],
					test: { path: 'tests/src/server/lint-answered-shutdown.test.ts', text: PASSING },
				})
				const owned = readFixtureServer(answering)
				const asked = performance.now()
				await expect(stage.destroy()).resolves.toBeUndefined()
				expect(performance.now() - asked).toBeLessThan(5_000)
				await expectReleased(stage)
				expect(isProcessLive(owned)).toBe(false)
			} finally {
				answering.destroy()
			}
		},
	)

	it(
		'settles teardown against a language server that answers shutdown and ignores exit',
		{ timeout: 20_000 },
		async () => {
			const scratch = createScratch({ files: { ...FIXTURE, 'ignored-exit': '' } })
			try {
				const stage = new LintStage(scratch.path)
				await stage.inspect({
					files: [],
					test: { path: 'tests/src/server/lint-ignored-exit.test.ts', text: PASSING },
				})
				const owned = readFixtureServer(scratch)
				const asked = performance.now()
				await expect(stage.destroy()).resolves.toBeUndefined()
				// The conversation is the whole of the defect: the server answers `shutdown`, so
				// teardown believes it is ending, and then ignores `exit` and lives out the host's
				// life. A bounded wait plus a signal is what makes the child's death this stage's
				// decision rather than the server's.
				expect(performance.now() - asked).toBeLessThan(5_000)
				await expectReleased(stage)
				expect(isProcessLive(owned)).toBe(false)
			} finally {
				scratch.destroy()
			}
		},
	)

	it(
		'settles teardown when destroy interrupts a language server that never answers initialize',
		{ timeout: 20_000 },
		async () => {
			const scratch = createScratch({ files: { ...FIXTURE, 'unanswered-initialize': '' } })
			const stage = new LintStage(scratch.path)
			const inspection = stage.inspect({
				files: [],
				test: { path: 'tests/src/server/lint-unanswered-initialize.test.ts', text: PASSING },
			})
			void inspection.catch(() => {})
			try {
				// The server exits a quarter second after it reads `initialize`, so teardown starts
				// while the stage is still warming and the ending arrives with the request outstanding.
				await waitForDelay(50)
				const asked = performance.now()
				await expect(stage.destroy()).resolves.toBeUndefined()
				expect(performance.now() - asked).toBeLessThan(5_000)
				await expect(inspection).rejects.toThrow('The Oxlint language server exited with code 0')
				await expectReleased(stage)
			} finally {
				scratch.destroy()
			}
		},
	)

	it('settles teardown when the language server cannot spawn', { timeout: 20_000 }, async () => {
		const scratch = createScratch({ files: FIXTURE })
		try {
			// The workspace resolves its Oxlint binary from the parent directory, and naming a
			// directory that is not there is what makes the spawn itself fail. Such a child reports
			// `error` and `close` and never `exit`, so teardown has to read the ending off the child
			// rather than off an event it never receives.
			const stage = new LintStage(resolve(scratch.path, 'missing'))
			const failure: unknown = await stage
				.inspect({
					files: [],
					test: { path: 'tests/src/server/lint-unspawnable.test.ts', text: PASSING },
				})
				.catch((error: unknown) => error)
			expect(isProbeError(failure)).toBe(true)
			expect(failure).toMatchObject({
				origin: 'instrument',
				code: 'malformed',
				context: { stage: 'lint' },
				cause: expect.any(Error),
			})
			// The wait is load-bearing. `close` is what teardown would otherwise still be waiting
			// for, and letting it land first is what leaves the ending readable on the child alone.
			await waitForDelay(250)
			const asked = performance.now()
			await expect(stage.destroy()).resolves.toBeUndefined()
			expect(performance.now() - asked).toBeLessThan(5_000)
			await expectReleased(stage)
		} finally {
			scratch.destroy()
		}
	})

	it(
		'rejects a later inspection with the signal that killed the language server',
		{ timeout: 20_000 },
		async () => {
			const scratch = createScratch({ files: FIXTURE })
			const stage = new LintStage(scratch.path)
			try {
				await stage.inspect({
					files: [],
					test: { path: 'tests/src/server/lint-before-signal.test.ts', text: PASSING },
				})
				killFixtureServer(scratch)
				await waitForDelay(250)
				// The control comes first: a child this host never killed ends on its own code, so an
				// instrument returning the kill's phrase for it would be reading nothing about the kill.
				expect(await readHostEnding()).toBe('code 0')
				const ending = await readHostEnding('SIGKILL')
				await expect(
					stage.inspect({
						files: [],
						test: { path: 'tests/src/server/lint-after-signal.test.ts', text: PASSING },
					}),
				).rejects.toThrow(`The Oxlint language server exited with ${ending}`)
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it(
		'reports the exit code when the language server dies mid-inspection',
		{ timeout: 20_000 },
		async () => {
			const scratch = createScratch({ files: { ...FIXTURE, frail: '' } })
			const stage = new LintStage(scratch.path)
			try {
				await expect(
					stage.inspect({
						files: [],
						test: { path: 'tests/src/server/lint-frail.test.ts', text: PASSING },
					}),
				).rejects.toMatchObject({
					name: 'ProbeError',
					message: 'The Oxlint language server exited with code 7',
					origin: 'instrument',
					code: 'malformed',
					context: { stage: 'lint' },
				})
				// The ending is what releases the document the dead server can no longer answer, so a
				// later inspection of that same path is admitted and refused on its own terms rather
				// than colliding with one still registered.
				await expect(
					stage.inspect({
						files: [],
						test: { path: 'tests/src/server/lint-frail.test.ts', text: PASSING },
					}),
				).rejects.toThrow('The Oxlint language server exited with code 7')
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it(
		'reports the real language server ending when a candidate text ends it',
		{ timeout: 60_000 },
		async () => {
			const stage = new LintStage(ROOT)
			try {
				// A lone surrogate survives the stage's own framing as the escaped sequence
				// `JSON.stringify` writes, and oxlint 1.79.0 answers it by exiting 0. It is the only
				// candidate in this file that drives a real language server into a code exit, so it is
				// what establishes that a candidate's own text can reach that ending at all.
				await expect(
					stage.inspect({
						files: [],
						test: {
							path: 'tests/src/server/lint-surrogate.test.ts',
							text: `const VALUE = '${String.fromCharCode(0xd800)}'\n`,
						},
					}),
				).rejects.toThrow('The Oxlint language server exited with code 0')
				const asked = performance.now()
				await expect(stage.destroy()).resolves.toBeUndefined()
				expect(performance.now() - asked).toBeLessThan(5_000)
				await expectReleased(stage)
			} finally {
				await stage.destroy()
			}
		},
	)

	it(
		'refuses an inspection through a stage fault when the language server closes its input',
		{ timeout: 20_000 },
		async (context) => {
			// The control comes first: a write to a child this host killed is refused, so an
			// instrument returning nothing for that one would be reading nothing about a refusal.
			expect(await readInputRefusal('SIGKILL')).toBeDefined()
			// The fixture ends the server's input by closing the server's own descriptor 0, so a host
			// that accepts the next write to a child that did that leaves the broken pipe this proof
			// needs unbuildable. The skip records that the condition cannot be constructed here, and
			// it claims nothing about the stage: a host that breaks the writing end surfaces a dead
			// input through the failing write, and a host that does not gives the stage no signal on
			// that route, which leaves the stage's behaviour against a dead input unproven here.
			context.skip(
				(await readInputRefusal()) === undefined,
				'this host accepts a write to a child that closed its own standard input, so the fixture server cannot break the pipe the stage writes to',
			)
			const scratch = createScratch({ files: FIXTURE })
			const stage = new LintStage(scratch.path)
			try {
				// Closing this document is what makes the server close its input, so the write that
				// meets the broken pipe is the next inspection's rather than a timer's.
				await stage.inspect({
					files: [],
					test: {
						path: 'tests/src/server/lint-closes-input.test.ts',
						text: `${PASSING}// PROBE_CLOSES_INPUT\n`,
					},
				})
				await waitForDelay(250)
				await expect(
					stage.inspect({
						files: [],
						test: { path: 'tests/src/server/lint-refused.test.ts', text: PASSING },
					}),
				).rejects.toThrow('EPIPE')
				await expect(stage.destroy()).resolves.toBeUndefined()
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it(
		'tears down a stage whose language server died without ending the host process',
		{ timeout: 30_000 },
		async () => {
			const scratch = createScratch({ files: { ...FIXTURE, 'host.mjs': HOST } })
			try {
				// The host kills the language server through `process.kill`, so the ending it reports is
				// the one this host gives that door.
				const ending = await readHostEnding('SIGKILL')
				const host = spawn(
					process.execPath,
					[
						'--disable-warning=ExperimentalWarning',
						resolve(scratch.path, 'host.mjs'),
						STAGE,
						scratch.path,
					],
					{ cwd: scratch.path, stdio: 'pipe' },
				)
				const output: Buffer[] = []
				const errors: Buffer[] = []
				host.stdout.on('data', (chunk: Buffer) => output.push(chunk))
				host.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
				const status = await new Promise<number | null>((settle) => {
					host.on('exit', (code) => settle(code))
				})
				// A host that died of an unhandled rejection, and a host that never loaded the stage at
				// all, both report on standard error. Reading the whole stream rather than a phrase
				// inside it is what makes this assertion able to fail.
				const reported = Buffer.concat(errors).toString('utf8')
				expect(reported).toBe('')
				const said = Buffer.concat(output).toString('utf8')
				expect(said).toContain(`refused The Oxlint language server exited with ${ending}`)
				// The stage class still serves a live server after the failed inspection, which is the
				// observable a pruned document map produces.
				expect(said).toContain('settled lint 0')
				expect(status).toBe(0)
			} finally {
				scratch.destroy()
			}
		},
	)
})
