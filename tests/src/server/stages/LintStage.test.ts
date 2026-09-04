import type { ScratchInterface } from '@orkestrel/test/server'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { createTeardown, waitForCondition, waitForDelay } from '@orkestrel/test'
import { createScratch, isRunning } from '@orkestrel/test/server'
import { LINT_DEADLINE, formatIssue, isProbeError } from '@src/core'
import { LintStage, resolveWorkspaceBinary } from '@src/server'
import { describe, expect, it } from 'vitest'
import {
	createLintFixture,
	describeEnding,
	killFixtureServer,
	readFixtureServer,
	readHostEnding,
	waitForFixtureServer,
} from '../../../setupServer.js'
import { WORKSPACE_ROOT } from '../../../setup.js'

const ROOT = fileURLToPath(WORKSPACE_ROOT)
const STAGE = resolve(ROOT, 'src/server/stages/LintStage.ts')

// The stage inspects only under a bound its caller supplies, and most rows here measure something
// other than that bound. Each of those supplies a signal that never aborts, so the row reads the
// stage's own answer rather than a deadline of its own making. A row whose subject is the bound
// arms its own signal instead.
const UNBOUNDED: AbortSignal = new AbortController().signal

// The close notification the client writes for one document, rounded up from its framing, its
// method, and a scratch-directory URI. The stall reading uses it as the follow-up write, so the
// size it searches for is the size that holds exactly this write.
const CLOSE_WRITE = 200

// The workspace every row here drives the stage against, carrying the shared protocol-faithful
// Oxlint language server. `createLintFixture` states which marker selects which conversation.
const FIXTURE = createLintFixture().files

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
	"const owned = new URL('src/', root).href",
	'registerHooks({',
	'\tresolve(specifier, context, next) {',
	'\t\tconst inside = context.parentURL !== undefined && context.parentURL.startsWith(owned)',
	"\t\tif (inside && specifier.startsWith('.') && specifier.endsWith('.js')) {",
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
	// The host arms nothing: every inspection here is measured by the ending its server takes, so the
	// bound each one carries must never be what ends it.
	'const open = { signal: new AbortController().signal }',
	"await dead.inspect({ files: [], test: { path: 'tests/src/server/host-warm.test.ts', text } }, open)",
	"const announced = readFileSync(workspace + '/server.pid', 'utf8')",
	"process.kill(Number.parseInt(announced, 10), 'SIGKILL')",
	'await new Promise((settle) => setTimeout(settle, 250))',
	'const refused = await dead',
	"\t.inspect({ files: [], test: { path: 'tests/src/server/host-dead.test.ts', text } }, open)",
	'\t.then(() => undefined, (error) => error.message)',
	"if (refused === undefined) throw new Error('the inspection resolved against a dead server')",
	'await dead.destroy()',
	'const live = new LintStage(workspace)',
	"const check = await live.inspect({ files: [], test: { path: 'tests/src/server/host-live.test.ts', text } }, open)",
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

// Reads whether each of two sized writes reaches the standard input of a child that never reads it.
// A write settles when the host has taken every byte, so a write into a pipe already holding all the
// host will hold never settles at all. The pair is what separates the two states: how much a host
// takes is its own decision, and only a reading where the first write settled says anything about
// the second.
async function readPipeWrites(first: number, second: number): Promise<readonly [boolean, boolean]> {
	const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)'], {
		stdio: ['pipe', 'ignore', 'ignore'],
	})
	child.stdin.on('error', () => {})
	let settled = false
	let following = false
	child.stdin.write(Buffer.alloc(first, 0x61), () => {
		settled = true
	})
	await waitForDelay(200)
	child.stdin.write(Buffer.alloc(second, 0x62), () => {
		following = true
	})
	await waitForDelay(200)
	child.kill('SIGKILL')
	return [settled, following]
}

// Reads the payload size that leaves this host's pipe with room for the document open and none for
// the close that follows it. The search walks the one size the reading turns on — below it a later
// close-sized write still settles, above it that write is held — and returns a size a little past
// the turn so a host whose reading drifts by a few hundred bytes stays inside the band. Returns
// `undefined` when the returned size does not reproduce the reading, which is how a host that takes
// every write reports that this condition cannot be built on it.
async function readStallPayload(): Promise<number | undefined> {
	let low = 4_096
	let high = 4_194_304
	while (high - low > 1_024) {
		const middle = low + Math.floor((high - low) / 2)
		const [, following] = await readPipeWrites(middle, CLOSE_WRITE)
		if (following) low = middle
		else high = middle
	}
	const payload = high + 8_192
	const [settled, following] = await readPipeWrites(payload, CLOSE_WRITE)
	return settled && !following ? payload : undefined
}

// Everything a settled teardown owes a consumer, read through the public surface alone: teardown
// resolves again without doing more work, and every later inspection is refused rather than left
// waiting on a server that is gone.
async function expectReleased(stage: LintStage): Promise<void> {
	await expect(stage.destroy()).resolves.toBeUndefined()
	await expect(
		stage.inspect(
			{
				files: [],
				test: { path: 'tests/src/server/lint-released.test.ts', text: PASSING },
			},
			{ signal: UNBOUNDED },
		),
	).rejects.toThrow('The lint stage has been destroyed')
}

// Allocates a workspace that runs the target's own Oxlint binary against a configuration this file
// owns, so every override under test is one the workspace's gate really applies. The overrides
// are the selection shapes a candidate's declared path has to preserve: a whole directory, a file
// name inside a directory, and one exact path.
function createLintWorkspace(): ScratchInterface {
	return createScratch({
		files: {
			...createLintFixture({ binary: resolveWorkspaceBinary(ROOT, 'oxlint') }).files,
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
			const check = await stage.inspect(
				{
					files: [],
					test: { path: 'tests/src/server/lint-candidate.test.ts', text: 'debugger\n' },
				},
				{ signal: UNBOUNDED },
			)
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

	// The language server publishes the zero-based span the issue stores, so the stored coordinates
	// are the server's own. The offending statement sits on the third line, which separates a
	// carried coordinate from a raised one and from a constant. The rendered line is read back
	// through `formatIssue`, so the stored value and the one-based number a reader opens are pinned
	// by the same case.
	it(
		'stores a published span zero-based and renders its line one-based',
		{ timeout: 60_000 },
		async () => {
			const stage = new LintStage(ROOT)
			const text = ['// padding', '// padding', 'debugger', ''].join('\n')
			try {
				const check = await stage.inspect(
					{
						files: [],
						test: { path: 'tests/src/server/lint-coordinates.test.ts', text },
					},
					{ signal: UNBOUNDED },
				)

				const issue = check.issues.find((row) => row.message.includes('debugger'))
				expect(issue).toBeDefined()
				expect(issue?.range?.start.line).toBe(2)
				expect(issue?.range?.start.character).toBe(0)
				expect(issue?.range?.end.line).toBe(2)
				// The published span covers the statement, so it ends past where it starts.
				expect(issue?.range?.end.character).toBeGreaterThan(0)
				expect(formatIssue(issue ?? { origin: 'claimant', path: '', message: '' })).toContain(
					'tests/src/server/lint-coordinates.test.ts:3 ',
				)
			} finally {
				await stage.destroy()
			}
		},
	)

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
				const first = await stage.inspect(
					{ files: [], test: { path, text: 'debugger\n' } },
					{ signal: UNBOUNDED },
				)
				const second = await stage.inspect(
					{ files: [], test: { path, text: 'export const VALUE = 1\n' } },
					{ signal: UNBOUNDED },
				)
				const third = await stage.inspect(
					{ files: [], test: { path, text: 'debugger\ndebugger\n' } },
					{ signal: UNBOUNDED },
				)
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
		const held = stage.inspect({ files: [], test: source }, { signal: UNBOUNDED })
		void held.catch(() => {})
		try {
			// The fixture records the silenced document as it admits it, so the second inspection
			// arrives against a registration the server has taken rather than against a handshake
			// this host was slow to finish.
			await waitForCondition(
				'the lint fixture to admit the first document',
				() => scratch.read('admitted') !== undefined,
				{ budget: 10_000, interval: 20 },
			)
			await expect(
				stage.inspect({ files: [], test: source }, { signal: UNBOUNDED }),
			).rejects.toThrow(
				'The lint stage is already inspecting tests/src/server/lint-collision.test.ts',
			)
			await stage.destroy()
			await expect(held).rejects.toThrow('The lint stage has been destroyed')
		} finally {
			const teardown = createTeardown()
			teardown.add(() => scratch.destroy())
			teardown.add(() => stage.destroy())
			await teardown.destroy()
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
			const held = stage.inspect({ files: [], test: source }, { signal: UNBOUNDED })
			void held.catch(() => {})
			try {
				await waitForCondition(
					'the lint fixture to admit the progress document',
					() => scratch.read('admitted') !== undefined,
					{ budget: 10_000, interval: 20 },
				)
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
		'restores progress to its pre-inspection reading while its close cleanup is still pending',
		{ timeout: 120_000 },
		async (context) => {
			// The control comes first: a small pair of writes both settle into a child that never
			// reads its own standard input, so a later reading where the second write is held is
			// evidence about a pipe this host has filled rather than about writes it refuses at all.
			expect(await readPipeWrites(4_096, CLOSE_WRITE)).toStrictEqual([true, true])
			const payload = await readStallPayload()
			if (payload === undefined) {
				context.skip(
					true,
					'this host settles a close-sized write into a child that never reads whatever came before it, so the pipe the stage writes its close into cannot be filled here',
				)
				return
			}
			const scratch = createScratch({ files: FIXTURE })
			const path = 'tests/src/server/lint-stall.test.ts'
			// The fixture reads its own standard input only until the handshake is framed, so it
			// answers the document from the URI seeded here rather than from the one it was sent.
			scratch.write('stall', pathToFileURL(resolve(scratch.path, path)).href)
			const stage = new LintStage(scratch.path)
			const baseline = stage.progress
			const source = { path, text: `${PASSING}${'x'.repeat(payload - 512)}\n` }
			let settled = false
			const held = stage.inspect({ files: [], test: source }, { signal: UNBOUNDED })
			void held.then(
				() => {
					settled = true
				},
				() => {
					settled = true
				},
			)
			try {
				// A raised gauge here is this row's own control: the same reading taken after the
				// diagnostics arrive measures the restore rather than a document never admitted.
				await waitForCondition(
					'the lint stage to admit the document whose close the pipe holds',
					() => stage.progress > baseline,
					{ budget: 10_000, interval: 20 },
				)
				await waitForCondition(
					'the lint fixture to publish the diagnostics it answers that document with',
					() => scratch.read('published') !== undefined,
					{ budget: 10_000, interval: 20 },
				)
				await waitForDelay(500)
				// The document open filled the pipe, so the `didClose` this stage owes its own
				// instrument is still waiting for room, and the inspection has not returned. The
				// gauge a coordinator compares with its snapshot reads level with it, so an expiry
				// landing in this window names the instrument rather than the claimant.
				expect(settled).toBe(false)
				expect(stage.progress).toBe(baseline)
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it(
		'raises the document version it puts on the wire across consecutive inspections',
		{ timeout: 20_000 },
		async () => {
			const scratch = createScratch({ files: FIXTURE })
			const stage = new LintStage(scratch.path)
			const path = 'tests/src/server/lint-version.test.ts'
			try {
				await stage.inspect({ files: [], test: { path, text: PASSING } }, { signal: UNBOUNDED })
				await stage.inspect(
					{ files: [], test: { path, text: `${PASSING}export const VALUE = 1\n` } },
					{ signal: UNBOUNDED },
				)
				// One URI carries one document, and a server reads a version that failed to rise as
				// text no older than the text it replaced. The fixture records what the client wrote,
				// so this reads the wire rather than the gauge the version used to be taken from.
				const versions = (scratch.read('versions') ?? '').trim().split('\n')
				expect(versions.length).toBe(2)
				expect(Number(versions[1])).toBeGreaterThan(Number(versions[0]))
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	it('refuses an inspection its caller supplies no bound for', { timeout: 20_000 }, async () => {
		const scratch = createScratch({ files: FIXTURE })
		const stage = new LintStage(scratch.path)
		const source = {
			files: [],
			test: { path: 'tests/src/server/lint-unbounded.test.ts', text: PASSING },
		}
		try {
			// The shared stage contract takes one argument, so the type admits this call and the stage
			// refuses it. Serving it would mean minting a bound beside the caller's own, and the two
			// would race for the answer.
			await expect(stage.inspect(source)).rejects.toMatchObject({
				name: 'ProbeError',
				message: 'The lint stage inspects only under a bound its caller supplies',
				origin: 'claimant',
				code: 'refused',
				context: { stage: 'lint' },
			})
			// The control is the same case under a bound. Without it a stage that refused every
			// inspection would pass the preceding assertion.
			const served = await stage.inspect(source, { signal: UNBOUNDED })
			expect(served.issues).toStrictEqual([])
		} finally {
			const teardown = createTeardown()
			teardown.add(() => scratch.destroy())
			teardown.add(() => stage.destroy())
			await teardown.destroy()
		}
	})

	it(
		"waits for diagnostics past the bound its client holds over the server's lifecycle",
		{ timeout: 30_000 },
		async () => {
			const scratch = createScratch({ files: FIXTURE })
			const stage = new LintStage(scratch.path)
			try {
				// The control comes first: a document this server answers at once returns well inside
				// the client's own `LINT_DEADLINE` bound, so the reading that follows measures the diagnostics wait
				// rather than the warm that precedes it.
				const prompt = await stage.inspect(
					{
						files: [],
						test: { path: 'tests/src/server/lint-prompt.test.ts', text: PASSING },
					},
					{ signal: UNBOUNDED },
				)
				expect(prompt.issues).toStrictEqual([])
				// This server publishes after 3 s. The client's `timeout` is `LINT_DEADLINE` and reaches the
				// `initialize` and `shutdown` exchanges alone, so the caller's signal is the only thing
				// that could end this wait, and it permits the wait to run.
				const started = performance.now()
				const served = await stage.inspect(
					{
						files: [],
						test: {
							path: 'tests/src/server/lint-slow.test.ts',
							text: `${PASSING}// PROBE_SLOW\n`,
						},
					},
					{ signal: UNBOUNDED },
				)
				expect(performance.now() - started).toBeGreaterThan(LINT_DEADLINE)
				expect(served.issues).toStrictEqual([])
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	it(
		'stops the diagnostics wait at the bound its caller supplied',
		{ timeout: 30_000 },
		async () => {
			const scratch = createScratch({ files: FIXTURE })
			const stage = new LintStage(scratch.path)
			const path = 'tests/src/server/lint-abandoned.test.ts'
			try {
				// This server admits the document and publishes nothing, so nothing but the caller's own
				// signal can end the wait. The refusal names the caller rather than the instrument,
				// because the instrument was told to stop rather than failing.
				const started = performance.now()
				await expect(
					stage.inspect(
						{ files: [], test: { path, text: `${PASSING}// PROBE_SILENT\n` } },
						{ signal: AbortSignal.timeout(500) },
					),
				).rejects.toMatchObject({
					name: 'ProbeError',
					message: 'The lint stage inspection stopped at the bound its caller supplied',
					origin: 'claimant',
					code: 'deadline',
					context: { stage: 'lint', path },
				})
				// The interval separates the caller's bound from the client's `LINT_DEADLINE` one: a wait that
				// timeout still governed would have run past it before answering.
				const elapsed = performance.now() - started
				expect(elapsed).toBeGreaterThan(300)
				expect(elapsed).toBeLessThan(LINT_DEADLINE)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
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
				const excluded = await stage.inspect(
					{
						files: [],
						test: { path: 'tmp/probe/lint-excluded.test.ts', text: 'debugger\n' },
					},
					{ signal: UNBOUNDED },
				)
				expect(excluded.issues).toStrictEqual([])
				// The control is the same text under a path the gate does lint. Without it a stage that
				// reported nothing at all would pass the preceding assertion.
				const reported = await stage.inspect(
					{
						files: [],
						test: { path: 'tests/src/server/lint-excluded.test.ts', text: 'debugger\n' },
					},
					{ signal: UNBOUNDED },
				)
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
				const exempt = await stage.inspect(
					{
						files: [],
						test: { path: 'tests/src/server/lint-override.config.ts', text },
					},
					{ signal: UNBOUNDED },
				)
				expect(exempt.issues).toStrictEqual([])
				// The control is the same text under a path the exemption does not reach. Without it a
				// stage that reported nothing at all would pass the preceding assertion.
				const reported = await stage.inspect(
					{
						files: [],
						test: { path: 'tests/src/server/lint-override.ts', text },
					},
					{ signal: UNBOUNDED },
				)
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
				const exempt = await stage.inspect(
					{
						files: [],
						test: { path: 'configs/candidate.ts', text: 'debugger\n' },
					},
					{ signal: UNBOUNDED },
				)
				expect(exempt.issues).toStrictEqual([])
				// The control is the same text under a directory the override does not reach. Both
				// candidates carry one declared directory and one declared name, so the only thing that
				// can separate these two answers is the directory the stage kept.
				const reported = await stage.inspect(
					{
						files: [],
						test: { path: 'lib/candidate.ts', text: 'debugger\n' },
					},
					{ signal: UNBOUNDED },
				)
				expect(reported.issues).toEqual([
					expect.objectContaining({
						origin: 'claimant',
						path: 'lib/candidate.ts',
						message: expect.stringContaining('debugger'),
					}),
				])
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
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
				const exempt = await stage.inspect(
					{
						files: [],
						test: { path: 'guides/candidate.ts', text: 'debugger\n' },
					},
					{ signal: UNBOUNDED },
				)
				expect(exempt.issues).toStrictEqual([])
				// The control is a different name in the same directory, so the directory cannot be
				// what separates these two answers.
				const reported = await stage.inspect(
					{
						files: [],
						test: { path: 'guides/other.ts', text: 'debugger\n' },
					},
					{ signal: UNBOUNDED },
				)
				expect(reported.issues).toEqual([
					expect.objectContaining({
						origin: 'claimant',
						path: 'guides/other.ts',
						message: expect.stringContaining('debugger'),
					}),
				])
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
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
				const exempt = await stage.inspect(
					{
						files: [],
						test: { path: 'lib/exempt.ts', text: 'debugger\n' },
					},
					{ signal: UNBOUNDED },
				)
				expect(exempt.issues).toStrictEqual([])
				// The control is the same text in the same directory under a path the override does not
				// name, so the directory cannot be what separates these two answers.
				const reported = await stage.inspect(
					{
						files: [],
						test: { path: 'lib/reported.ts', text: 'debugger\n' },
					},
					{ signal: UNBOUNDED },
				)
				expect(reported.issues).toEqual([
					expect.objectContaining({
						origin: 'claimant',
						path: 'lib/reported.ts',
						message: expect.stringContaining('debugger'),
					}),
				])
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
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
					...createLintFixture({ binary: resolveWorkspaceBinary(ROOT, 'oxlint') }).files,
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
				const violating = await stage.inspect(
					{ files: [], test: { path, text: violation } },
					{ signal: UNBOUNDED },
				)
				expect(violating.issues).toEqual([
					expect.objectContaining({
						origin: 'claimant',
						path,
						message: expect.stringContaining('debugger'),
					}),
				])
				// The `clean` control is the boot control's own clean text at the same path. Without it a
				// stage that reported an issue for everything would pass the preceding assertion.
				const clean = await stage.inspect(
					{ files: [], test: { path, text: PASSING } },
					{ signal: UNBOUNDED },
				)
				expect(clean.issues).toStrictEqual([])
				// The `elsewhere` control is the same violation under the same file name outside that
				// directory, where the workspace leaves the rule off. It makes the preceding issue
				// evidence that the declared directory selected the rule set.
				const elsewhere = await stage.inspect(
					{
						files: [],
						test: { path: 'lib/arm-runtime-89ab.test.ts', text: violation },
					},
					{ signal: UNBOUNDED },
				)
				expect(elsewhere.issues).toStrictEqual([])
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	it('abandons an inspection and destroys idempotently', { timeout: 60_000 }, async () => {
		const stage = new LintStage(ROOT)
		const inspection = stage.inspect(
			{
				files: [],
				test: { path: 'tests/src/server/lint-destroy.test.ts', text: 'debugger\n' },
			},
			{ signal: UNBOUNDED },
		)
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
			const held = stage.inspect(
				{
					files: [{ path: 'src/core/held.ts', text: 'export const VALUE = 1 // PROBE_SILENT\n' }],
					test: { path: 'tests/src/server/held.test.ts', text: PASSING },
				},
				{ signal: UNBOUNDED },
			)
			void held.catch(() => {})
			try {
				const served = await stage.inspect(
					{
						files: [],
						test: { path: 'tests/src/server/served.test.ts', text: PASSING },
					},
					{ signal: UNBOUNDED },
				)
				expect(served.stage).toBe('lint')
				expect(served.issues).toStrictEqual([])
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	it(
		'ends the language server process it owns when teardown settles',
		{ timeout: 20_000 },
		async (context) => {
			const scratch = createScratch({ files: FIXTURE })
			try {
				const stage = new LintStage(scratch.path)
				await stage.inspect(
					{
						files: [],
						test: { path: 'tests/src/server/lint-owned-process.test.ts', text: PASSING },
					},
					{ signal: UNBOUNDED },
				)
				// The stage keeps its child private, so the fixture announces the process id the
				// stage actually spawned and this row reads the real child rather than a handle
				// the stage handed out.
				const owned = readFixtureServer(scratch)
				await context.annotate(`the lint stage owns language server process ${owned}`)
				// The control comes first: signal zero reaches that process while the stage still
				// holds it, so a refusal afterwards is evidence about the teardown rather than
				// about a process id nothing could ever reach.
				expect(isRunning(owned)).toBe(true)
				await expect(stage.destroy()).resolves.toBeUndefined()
				// Signal zero is refused for a process the host has reaped, which is what separates
				// a released child from an orphan the stage abandoned to the host's lifetime.
				expect(isRunning(owned)).toBe(false)
				await expectReleased(stage)
			} finally {
				scratch.destroy()
			}
		},
	)

	it('settles teardown after the language server dies by signal', { timeout: 20_000 }, async () => {
		const scratch = createScratch({ files: FIXTURE })
		try {
			const signalled = new LintStage(scratch.path)
			await signalled.inspect(
				{
					files: [],
					test: { path: 'tests/src/server/lint-signal-teardown.test.ts', text: PASSING },
				},
				{ signal: UNBOUNDED },
			)
			const owned = readFixtureServer(scratch)
			killFixtureServer(scratch)
			// Teardown is measured against a server that is already gone, so this waits for the death
			// itself rather than for a delay chosen to outlast it.
			await waitForCondition(
				'the killed language server to leave this host',
				() => !isRunning(owned),
				{ budget: 10_000, interval: 20 },
			)
			const killed = performance.now()
			await expect(signalled.destroy()).resolves.toBeUndefined()
			expect(performance.now() - killed).toBeLessThan(5_000)
			await expectReleased(signalled)
			expect(isRunning(owned)).toBe(false)

			// The control is the death the guard already handled. A teardown that settles only for a
			// signalled server would report the same pass as one that settles for neither.
			const closed = new LintStage(scratch.path)
			await closed.inspect(
				{
					files: [],
					test: { path: 'tests/src/server/lint-clean-teardown.test.ts', text: PASSING },
				},
				{ signal: UNBOUNDED },
			)
			const answering = readFixtureServer(scratch)
			const exited = performance.now()
			await expect(closed.destroy()).resolves.toBeUndefined()
			expect(performance.now() - exited).toBeLessThan(5_000)
			await expectReleased(closed)
			expect(isRunning(answering)).toBe(false)
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
				expect(isRunning(owned)).toBe(true)
				const asked = performance.now()
				await expect(silent.destroy()).resolves.toBeUndefined()
				expect(performance.now() - asked).toBeLessThan(10_000)
				await expectReleased(silent)
				expect(isRunning(owned)).toBe(false)
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
				await unanswered.inspect(
					{
						files: [],
						test: { path: 'tests/src/server/lint-unanswered-shutdown.test.ts', text: PASSING },
					},
					{ signal: UNBOUNDED },
				)
				const owned = readFixtureServer(scratch)
				const asked = performance.now()
				await expect(unanswered.destroy()).resolves.toBeUndefined()
				expect(performance.now() - asked).toBeLessThan(5_000)
				await expectReleased(unanswered)
				expect(isRunning(owned)).toBe(false)
			} finally {
				scratch.destroy()
			}

			// The control is the same teardown against a server that answers. A stage that settled
			// only by abandoning the conversation would report the same pass as one that held it.
			const answering = createScratch({ files: FIXTURE })
			try {
				const stage = new LintStage(answering.path)
				await stage.inspect(
					{
						files: [],
						test: { path: 'tests/src/server/lint-answered-shutdown.test.ts', text: PASSING },
					},
					{ signal: UNBOUNDED },
				)
				const owned = readFixtureServer(answering)
				const asked = performance.now()
				await expect(stage.destroy()).resolves.toBeUndefined()
				expect(performance.now() - asked).toBeLessThan(5_000)
				await expectReleased(stage)
				expect(isRunning(owned)).toBe(false)
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
				await stage.inspect(
					{
						files: [],
						test: { path: 'tests/src/server/lint-ignored-exit.test.ts', text: PASSING },
					},
					{ signal: UNBOUNDED },
				)
				const owned = readFixtureServer(scratch)
				const asked = performance.now()
				await expect(stage.destroy()).resolves.toBeUndefined()
				// The conversation is the whole of the defect: the server answers `shutdown`, so
				// teardown believes it is ending, and then ignores `exit` and lives out the host's
				// life. A bounded wait plus a signal is what makes the child's death this stage's
				// decision rather than the server's.
				expect(performance.now() - asked).toBeLessThan(5_000)
				await expectReleased(stage)
				expect(isRunning(owned)).toBe(false)
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
			const inspection = stage.inspect(
				{
					files: [],
					test: { path: 'tests/src/server/lint-unanswered-initialize.test.ts', text: PASSING },
				},
				{ signal: UNBOUNDED },
			)
			void inspection.catch(() => {})
			try {
				// The server records that it read `initialize` and exits a quarter second later, so
				// waiting for that record starts teardown inside the warming window: the stage is
				// still waiting for its answer and the ending arrives with the request outstanding.
				await waitForCondition(
					'the lint fixture to record the initialize it never answers',
					() => scratch.read('initialized') !== undefined,
					{ budget: 10_000, interval: 10 },
				)
				const asked = performance.now()
				await expect(stage.destroy()).resolves.toBeUndefined()
				expect(performance.now() - asked).toBeLessThan(5_000)
				// Teardown settles the outstanding `initialize` itself rather than leaving it for
				// the ending the server takes a moment later, so the inspection parked on warming
				// is refused on the stage's own terms.
				await expect(inspection).rejects.toThrow('The lint stage has been destroyed')
				// The gauge is what separates that refusal from one raised at the entry guard: this
				// inspection was admitted before teardown and never reached a document, so nothing
				// but the interrupted warming can have settled it.
				expect(stage.progress).toBe(0)
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
				.inspect(
					{
						files: [],
						test: { path: 'tests/src/server/lint-unspawnable.test.ts', text: PASSING },
					},
					{ signal: UNBOUNDED },
				)
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
				await stage.inspect(
					{
						files: [],
						test: { path: 'tests/src/server/lint-before-signal.test.ts', text: PASSING },
					},
					{ signal: UNBOUNDED },
				)
				const owned = readFixtureServer(scratch)
				killFixtureServer(scratch)
				// The later inspection is answered by the ending the stage read, so this waits for the
				// death that produces that ending rather than for a delay chosen to outlast it.
				await waitForCondition(
					'the killed language server to leave this host',
					() => !isRunning(owned),
					{ budget: 10_000, interval: 20 },
				)
				// The control comes first: a child this host never killed ends on its own code, so an
				// instrument returning the kill's phrase for it would be reading nothing about the kill.
				expect(describeEnding(await readHostEnding())).toBe('code 0')
				const ending = describeEnding(await readHostEnding('SIGKILL'))
				await expect(
					stage.inspect(
						{
							files: [],
							test: { path: 'tests/src/server/lint-after-signal.test.ts', text: PASSING },
						},
						{ signal: UNBOUNDED },
					),
				).rejects.toThrow(`The Oxlint language server exited with ${ending}`)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
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
					stage.inspect(
						{
							files: [],
							test: { path: 'tests/src/server/lint-frail.test.ts', text: PASSING },
						},
						{ signal: UNBOUNDED },
					),
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
					stage.inspect(
						{
							files: [],
							test: { path: 'tests/src/server/lint-frail.test.ts', text: PASSING },
						},
						{ signal: UNBOUNDED },
					),
				).rejects.toThrow('The Oxlint language server exited with code 7')
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
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
					stage.inspect(
						{
							files: [],
							test: {
								path: 'tests/src/server/lint-surrogate.test.ts',
								text: `const VALUE = '${String.fromCharCode(0xd800)}'\n`,
							},
						},
						{ signal: UNBOUNDED },
					),
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
				await stage.inspect(
					{
						files: [],
						test: {
							path: 'tests/src/server/lint-closes-input.test.ts',
							text: `${PASSING}// PROBE_CLOSES_INPUT\n`,
						},
					},
					{ signal: UNBOUNDED },
				)
				// The fixture opens the record before it closes its own descriptor and writes the URI
				// into it afterwards, so the record's contents land after the close. The write that
				// follows this wait therefore meets a pipe that is already broken rather than one this
				// host was slow to break.
				await waitForCondition(
					'the lint fixture to record the standard input it closed',
					() => (scratch.read('closed') ?? '') !== '',
					{ budget: 10_000, interval: 20 },
				)
				// The client owns the write, so the refusal reaches the caller as the notification
				// that could not be delivered rather than as the host's own pipe code. What the row
				// proves is unchanged: the inspection is refused as a stage fault instead of
				// waiting for a reply a dead input can never carry.
				await expect(
					stage.inspect(
						{
							files: [],
							test: { path: 'tests/src/server/lint-refused.test.ts', text: PASSING },
						},
						{ signal: UNBOUNDED },
					),
				).rejects.toMatchObject({
					name: 'ProbeError',
					origin: 'instrument',
					code: 'malformed',
					context: { stage: 'lint' },
					message: expect.stringContaining(
						"The LSP notification 'textDocument/didOpen' could not be written",
					),
				})
				await expect(stage.destroy()).resolves.toBeUndefined()
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
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
				const ending = describeEnding(await readHostEnding('SIGKILL'))
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
