import type { ScratchInterface } from '@orkestrel/test/server'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { Session } from 'node:inspector/promises'
import { isRecord } from '@orkestrel/contract'
import { waitForDelay } from '@orkestrel/test'
import { createScratch } from '@orkestrel/test/server'
import { LintStage, resolveWorkspaceBinary } from '@src/server'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const STAGE = resolve(ROOT, 'src/server/stages/LintStage.ts')

// A protocol-faithful Oxlint language server. It announces its own process id, so a test can kill
// the real child the stage owns privately. Three marker files select how it ends: `frail` exits
// with a code on the first document, `unanswered-shutdown` exits without replying to `shutdown`,
// and `unanswered-initialize` exits without replying to `initialize`. Two markers in a document's
// own text select how it answers that document: `PROBE_SILENT` publishes nothing, and
// `PROBE_CLOSES_INPUT` closes the server's own standard input when that document is closed. The
// text carries those markers rather than the document URI, so no test's routing depends on the
// path the stage synthesizes.
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
	"\t\t\tsend({ jsonrpc: '2.0', id: message.id, result: { capabilities: {} } })",
	'\t\t}',
	"\t\tif (message.method === 'textDocument/didOpen') {",
	"\t\t\tif (existsSync('frail')) process.exit(7)",
	'\t\t\tconst uri = message.params.textDocument.uri',
	'\t\t\tconst text = message.params.textDocument.text',
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
	"\t\tif (message.method === 'exit') process.exit(0)",
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

// The global the inspector session reads a stage back through. `Runtime.evaluate` runs in the
// worker's own context, so the census reaches a local only by way of a global it removes again.
const CENSUS = 'probeLintStageCensus'

// The five maps the stage registers work in. A settled teardown leaves every one of them empty.
const RELEASED = {
	'#responses': 0,
	'#failures': 0,
	'#documents': 0,
	'#publishes': 0,
	'#refusals': 0,
}

// A resident host that drives the real stage outside Vitest, so an unhandled rejection ends a
// process whose exit code a test can read. Node stops at the `.js` specifiers the source compiles
// against, so the host registers the one resolution rule that maps them onto the TypeScript files
// beside them; it replaces no project behaviour.
const HOST = [
	"import { readFileSync } from 'node:fs'",
	"import { registerHooks } from 'node:module'",
	"import { pathToFileURL } from 'node:url'",
	'registerHooks({',
	'\tresolve(specifier, context, next) {',
	"\t\tif (specifier.startsWith('.') && specifier.endsWith('.js')) {",
	"\t\t\treturn next(specifier.slice(0, -3) + '.ts', context)",
	'\t\t}',
	'\t\treturn next(specifier, context)',
	'\t},',
	'})',
	'const [, , stage, workspace] = process.argv',
	'const { LintStage } = await import(pathToFileURL(stage).href)',
	"const text = \"import { test } from 'vitest'\\ntest('passes', () => {})\\n\"",
	'const dead = new LintStage(workspace)',
	"await dead.inspect({ files: [], test: { path: 'tmp/probe/host-warm.test.ts', text } })",
	"const announced = readFileSync(workspace + '/server.pid', 'utf8')",
	"process.kill(Number.parseInt(announced, 10), 'SIGKILL')",
	'await new Promise((settle) => setTimeout(settle, 250))',
	'const refused = await dead',
	"\t.inspect({ files: [], test: { path: 'tmp/probe/host-dead.test.ts', text } })",
	'\t.then(() => undefined, (error) => error.message)',
	"if (refused === undefined) throw new Error('the inspection resolved against a dead server')",
	'await dead.destroy()',
	'const live = new LintStage(workspace)',
	"const check = await live.inspect({ files: [], test: { path: 'tmp/probe/host-live.test.ts', text } })",
	'await live.destroy()',
	'await new Promise((settle) => setTimeout(settle, 300))',
	"console.log('refused ' + refused)",
	"console.log('settled ' + check.stage + ' ' + check.findings.length)",
].join('\n')

// Kills the language server the stage spawned, by the process id the fixture announced. The stage
// owns its child privately, so this is the door a real failure comes through rather than an
// accessor added to serve a test.
function killFixtureServer(scratch: ScratchInterface): void {
	const announced = scratch.read('server.pid')
	if (announced === undefined) throw new Error('The fixture server never announced its process id')
	process.kill(Number.parseInt(announced, 10), 'SIGKILL')
}

// Allocates a workspace that runs the target's own Oxlint binary against a configuration this file
// owns, so the override under test is one the workspace's gate really applies. `configs/**` anchors
// the exemption to a directory, which is the selection a synthesized path has to preserve.
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
				overrides: [{ files: ['configs/**'], rules: { 'no-debugger': 'off' } }],
			})}\n`,
		},
	})
}

// Reads the `Map(n)` sizes out of the private properties V8 reported. `@types/node` declares no
// `privateProperties` field, so every value here is narrowed from `unknown` rather than trusted.
function readMapSizes(properties: object): Readonly<Record<string, number>> {
	const census: Record<string, number> = {}
	if (!('privateProperties' in properties) || !Array.isArray(properties.privateProperties)) {
		return census
	}
	const held: readonly unknown[] = properties.privateProperties
	for (const property of held) {
		if (!isRecord(property) || typeof property.name !== 'string') continue
		if (!isRecord(property.value) || typeof property.value.description !== 'string') continue
		const size = /^Map\((\d+)\)$/.exec(property.value.description)?.[1]
		if (size !== undefined) census[property.name] = Number.parseInt(size, 10)
	}
	return census
}

// Counts the entries each private map of a stage still holds. The maps are unreachable from
// outside the class, so this asks V8 for them the way a debugger does. It reads the real object
// and replaces nothing on it.
async function censusStage(subject: LintStage): Promise<Readonly<Record<string, number>>> {
	const session = new Session()
	session.connect()
	Object.assign(globalThis, { [CENSUS]: subject })
	try {
		const evaluated = await session.post('Runtime.evaluate', {
			expression: `globalThis.${CENSUS}`,
		})
		const objectId = evaluated.result.objectId
		if (objectId === undefined) throw new Error('The inspector session could not reach the stage')
		const properties = await session.post('Runtime.getProperties', {
			objectId,
			ownProperties: true,
		})
		return readMapSizes(properties)
	} finally {
		session.disconnect()
		Reflect.deleteProperty(globalThis, CENSUS)
	}
}

describe('lint stage', () => {
	it(
		'reports a workspace lint finding for a gitignored test path',
		{ timeout: 60_000 },
		async () => {
			const stage = new LintStage(ROOT)
			try {
				const check = await stage.inspect({
					files: [],
					test: { path: 'tmp/probe/lint-stage.test.ts', text: 'debugger\n' },
				})
				expect(check.findings.length).toBeGreaterThan(0)
				expect(check.findings).toEqual(
					expect.arrayContaining([
						expect.objectContaining({ origin: 'code', path: 'tmp/probe/lint-stage.test.ts' }),
					]),
				)
				// Oxlint publishes diagnostics about the supplied text and nothing else, so every
				// finding this stage returns carries the origin that can disprove a claim.
				expect(check.findings.every((finding) => finding.origin === 'code')).toBe(true)
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
					test: { path: 'tmp/probe/lint-override.config.ts', text },
				})
				expect(exempt.findings).toStrictEqual([])
				// The control is the same text under a path the exemption does not reach. Without it a
				// stage that reported nothing at all would pass the assertion above.
				const reported = await stage.inspect({
					files: [],
					test: { path: 'tmp/probe/lint-override.ts', text },
				})
				expect(reported.findings).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							origin: 'code',
							path: 'tmp/probe/lint-override.ts',
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
				expect(exempt.findings).toStrictEqual([])
				// The control is the same text under a directory the override does not reach. Both
				// candidates carry one declared directory and one declared name, so the only thing that
				// can separate these two answers is the directory the stage kept.
				const reported = await stage.inspect({
					files: [],
					test: { path: 'lib/candidate.ts', text: 'debugger\n' },
				})
				expect(reported.findings).toEqual([
					expect.objectContaining({
						origin: 'code',
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

	it('abandons an inspection and destroys idempotently', { timeout: 60_000 }, async () => {
		const stage = new LintStage(ROOT)
		const inspection = stage.inspect({
			files: [],
			test: { path: 'tmp/probe/lint-destroy.test.ts', text: 'debugger\n' },
		})
		void inspection.catch(() => {})
		await Promise.all([stage.destroy(), stage.destroy()])
		await expect(inspection).rejects.toThrow('The lint stage has been destroyed')
		await expect(stage.destroy()).resolves.toBeUndefined()
		expect(await censusStage(stage)).toStrictEqual(RELEASED)
	})

	it(
		'serves a later inspection after an earlier one is abandoned',
		{ timeout: 20_000 },
		async () => {
			const scratch = createScratch({ files: FIXTURE })
			const stage = new LintStage(scratch.path)
			const held = stage.inspect({
				files: [{ path: 'src/core/held.ts', text: 'export const VALUE = 1 // PROBE_SILENT\n' }],
				test: { path: 'tmp/probe/held.test.ts', text: PASSING },
			})
			void held.catch(() => {})
			try {
				const served = await stage.inspect({
					files: [],
					test: { path: 'tmp/probe/served.test.ts', text: PASSING },
				})
				expect(served.stage).toBe('lint')
				expect(served.findings).toStrictEqual([])
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
				test: { path: 'tmp/probe/lint-signal-teardown.test.ts', text: PASSING },
			})
			killFixtureServer(scratch)
			await waitForDelay(250)
			const killed = performance.now()
			await expect(signalled.destroy()).resolves.toBeUndefined()
			expect(performance.now() - killed).toBeLessThan(5_000)
			expect(await censusStage(signalled)).toStrictEqual(RELEASED)

			// The control is the death the guard already handled. A teardown that settles only for a
			// signalled server would report the same pass as one that settles for neither.
			const closed = new LintStage(scratch.path)
			await closed.inspect({
				files: [],
				test: { path: 'tmp/probe/lint-clean-teardown.test.ts', text: PASSING },
			})
			const exited = performance.now()
			await expect(closed.destroy()).resolves.toBeUndefined()
			expect(performance.now() - exited).toBeLessThan(5_000)
		} finally {
			scratch.destroy()
		}
	})

	it(
		'settles teardown when the language server exits without answering shutdown',
		{ timeout: 20_000 },
		async () => {
			const scratch = createScratch({ files: { ...FIXTURE, 'unanswered-shutdown': '' } })
			try {
				const unanswered = new LintStage(scratch.path)
				await unanswered.inspect({
					files: [],
					test: { path: 'tmp/probe/lint-unanswered-shutdown.test.ts', text: PASSING },
				})
				const asked = performance.now()
				await expect(unanswered.destroy()).resolves.toBeUndefined()
				expect(performance.now() - asked).toBeLessThan(5_000)
				expect(await censusStage(unanswered)).toStrictEqual(RELEASED)
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
					test: { path: 'tmp/probe/lint-answered-shutdown.test.ts', text: PASSING },
				})
				const asked = performance.now()
				await expect(stage.destroy()).resolves.toBeUndefined()
				expect(performance.now() - asked).toBeLessThan(5_000)
				expect(await censusStage(stage)).toStrictEqual(RELEASED)
			} finally {
				answering.destroy()
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
				test: { path: 'tmp/probe/lint-unanswered-initialize.test.ts', text: PASSING },
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
				expect(await censusStage(stage)).toStrictEqual(RELEASED)
			} finally {
				scratch.destroy()
			}
		},
	)

	it('settles teardown when the language server cannot spawn', { timeout: 20_000 }, async () => {
		const scratch = createScratch({ files: FIXTURE })
		try {
			// The workspace resolves its Oxlint binary from the directory above, and naming a
			// directory that is not there is what makes the spawn itself fail. Such a child reports
			// `error` and `close` and never `exit`, so teardown has to read the ending off the child
			// rather than off an event it never receives.
			const stage = new LintStage(resolve(scratch.path, 'missing'))
			await expect(
				stage.inspect({
					files: [],
					test: { path: 'tmp/probe/lint-unspawnable.test.ts', text: PASSING },
				}),
			).rejects.toThrow('ENOENT')
			// The wait is load-bearing. `close` is what teardown would otherwise still be waiting
			// for, and letting it land first is what leaves the ending readable on the child alone.
			await waitForDelay(250)
			const asked = performance.now()
			await expect(stage.destroy()).resolves.toBeUndefined()
			expect(performance.now() - asked).toBeLessThan(5_000)
			expect(await censusStage(stage)).toStrictEqual(RELEASED)
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
					test: { path: 'tmp/probe/lint-before-signal.test.ts', text: PASSING },
				})
				killFixtureServer(scratch)
				await waitForDelay(250)
				await expect(
					stage.inspect({
						files: [],
						test: { path: 'tmp/probe/lint-after-signal.test.ts', text: PASSING },
					}),
				).rejects.toThrow('signal SIGKILL')
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
						test: { path: 'tmp/probe/lint-frail.test.ts', text: PASSING },
					}),
				).rejects.toThrow('The Oxlint language server exited with code 7')
				// The ending is what releases the document the dead server can no longer answer, so
				// nothing is left registered against it.
				expect(await censusStage(stage)).toStrictEqual(RELEASED)
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it(
		'rejects an inspection whose candidate text ends the real language server',
		{ timeout: 60_000 },
		async () => {
			const stage = new LintStage(ROOT)
			try {
				// A lone surrogate survives the stage's own framing as the escaped sequence
				// `JSON.stringify` writes, and oxlint 1.79.0 answers it by exiting 0. It is the only
				// candidate in this file that drives a real language server into a code exit, which is
				// the ending a stage under teardown has to settle rather than swallow.
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
				expect(await censusStage(stage)).toStrictEqual(RELEASED)
			} finally {
				await stage.destroy()
			}
		},
	)

	it(
		'refuses an inspection through a stage fault when the language server closes its input',
		{ timeout: 20_000 },
		async () => {
			const scratch = createScratch({ files: FIXTURE })
			const stage = new LintStage(scratch.path)
			try {
				// Closing this document is what makes the server close its input, so the write that
				// meets the broken pipe is the next inspection's rather than a timer's.
				await stage.inspect({
					files: [],
					test: {
						path: 'tmp/probe/lint-closes-input.test.ts',
						text: `${PASSING}// PROBE_CLOSES_INPUT\n`,
					},
				})
				await waitForDelay(250)
				await expect(
					stage.inspect({
						files: [],
						test: { path: 'tmp/probe/lint-refused.test.ts', text: PASSING },
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
				expect(said).toContain('refused The Oxlint language server exited with signal SIGKILL')
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
