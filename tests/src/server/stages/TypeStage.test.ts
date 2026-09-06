import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureError, createTeardown, waitForCondition } from '@orkestrel/test'
import { createScratch } from '@orkestrel/test/server'
import { TypeStage } from '@src/server'
import { TYPE_MIRROR, formatIssue, formatSpecification, isProbeError } from '@src/core'
import { describe, expect, it } from 'vitest'
import { WORKSPACE_ROOT } from '../../../setup.js'

const ROOT = fileURLToPath(WORKSPACE_ROOT)
// A workspace the compiler accepts and this suite can write drafts into. Every scratch below
// declares its own project, so a case reads the configuration it names rather than this package's.
const STRICT =
	'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":[],"strict":true},"include":["src/**/*.ts"]}\n'

// A host that refuses `symlinkSync` with `EPERM` cannot hold the tree the symbolic-link case below
// needs, so that case is skipped there rather than reported red for an environment limit.
const LINKS = (() => {
	const scratch = createScratch({ prefix: 'probe-type-links-probe-' })
	try {
		scratch.write('real.ts', 'export const REAL = 1\n')
		symlinkSync(resolve(scratch.path, 'real.ts'), resolve(scratch.path, 'linked.ts'))
		return true
	} catch {
		return false
	} finally {
		scratch.destroy()
	}
})()

describe('type stage', () => {
	it('reports a missing workspace compiler during construction', () => {
		const scratch = createScratch({ prefix: 'probe-type-resolution-' })
		try {
			scratch.write('package.json', '{"name":"probe-type-resolution","private":true}\n')
			const error = captureError(() => new TypeStage(scratch.path))
			expect(isProbeError(error)).toBe(true)
			expect(error).toMatchObject({
				origin: 'workspace',
				code: 'missing',
				context: { name: 'typescript' },
				cause: expect.any(Error),
			})
		} finally {
			scratch.destroy()
		}
	})

	it('reports a real type error and accepts clean source', { timeout: 60_000 }, async () => {
		const scratch = createScratch({ prefix: 'probe-type-real-' })
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write('tsconfig.json', STRICT)
		scratch.write('src/value.ts', 'export const VALUE = 1\n')
		const stage = new TypeStage(scratch.path)
		const test = { path: 'tmp/probe/real.test.ts', text: 'export {}\n' }
		try {
			const clean = await stage.inspect(
				{
					files: [{ path: 'src/reading.ts', text: "export const READING: string = 'ok'\n" }],
					test,
				},
				'tsconfig.json',
			)
			const broken = await stage.inspect(
				{
					files: [{ path: 'src/reading.ts', text: "export const READING: number = 'bad'\n" }],
					test,
				},
				'tsconfig.json',
			)
			expect(clean.issues).toStrictEqual([])
			expect(broken.issues).toStrictEqual([
				{
					origin: 'claimant',
					path: 'src/reading.ts',
					message: "Type 'string' is not assignable to type 'number'.",
					range: expect.anything(),
				},
			])
		} finally {
			const teardown = createTeardown()
			teardown.add(() => scratch.destroy())
			teardown.add(() => stage.destroy())
			await teardown.destroy()
		}
	})

	// The compiler's plain-text output carries a start position and no extent, so every range this
	// stage stores is the point that position names. The offending declaration sits on the third
	// line, which separates a carried coordinate from a raised one and from a constant. The rendered
	// line is read back through `formatIssue`, so the stored value and the one-based number a reader
	// opens are pinned by the same case.
	it(
		'stores a diagnostic zero-based as a point and renders its line one-based',
		{
			timeout: 60_000,
		},
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-point-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write('tsconfig.json', STRICT)
			scratch.write('src/value.ts', 'export const VALUE = 1\n')
			const stage = new TypeStage(scratch.path)
			const text = ['// padding', '// padding', "export const READING: number = 'bad'", ''].join(
				'\n',
			)
			try {
				const broken = await stage.inspect(
					{
						files: [{ path: 'src/reading.ts', text }],
						test: { path: 'tmp/probe/point.test.ts', text: 'export {}\n' },
					},
					'tsconfig.json',
				)

				const issue = broken.issues.find((row) => row.path === 'src/reading.ts')
				expect(issue).toBeDefined()
				expect(issue?.range?.start).toStrictEqual({ line: 2, character: 13 })
				// The point, not a span: `end` carries the value `start` carries, because the output this
				// stage reads reports no extent.
				expect(issue?.range?.end).toStrictEqual(issue?.range?.start)
				expect(formatIssue(issue ?? { origin: 'claimant', path: '', message: '' })).toContain(
					'src/reading.ts:3 ',
				)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	// The mirror exists for this: a draft replaces the file it names, so the files that import that
	// path are checked against the draft's text. A revision written beside the original would be
	// checked as a second module while every importer still read the original, which is the false
	// green this case refuses.
	it(
		'reports a consumer broken by the draft that shadows its import',
		{
			timeout: 60_000,
		},
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-shadow-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write('tsconfig.json', STRICT)
			scratch.write('src/signal.ts', "export const SIGNAL = 'disk'\n")
			scratch.write(
				'src/reader.ts',
				"import { SIGNAL } from './signal.js'\nexport const READING: string = SIGNAL\n",
			)
			const stage = new TypeStage(scratch.path)
			const test = { path: 'tmp/probe/shadow.test.ts', text: 'export {}\n' }
			try {
				// The control: the workspace as it stands compiles, so the reading below is the draft's
				// doing rather than a tree that was already red.
				const clean = await stage.inspect({ files: [], test }, 'tsconfig.json')
				const shadowed = await stage.inspect(
					{
						files: [{ path: 'src/signal.ts', text: 'export const SIGNAL = 1\n' }],
						test,
					},
					'tsconfig.json',
				)

				expect(clean.issues).toStrictEqual([])
				expect(shadowed.issues).toStrictEqual([
					{
						origin: 'claimant',
						path: 'src/reader.ts',
						message: "Type 'number' is not assignable to type 'string'.",
						range: expect.anything(),
					},
				])
				// The workspace's own copy never moves, whatever the draft said.
				expect(readFileSync(resolve(scratch.path, 'src/signal.ts'), 'utf8')).toBe(
					"export const SIGNAL = 'disk'\n",
				)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	// A claim that proposes several files proposes them together, so one draft importing another
	// must read the sibling draft rather than the file that sibling replaces.
	it(
		'resolves a draft importing a sibling draft to the sibling draft',
		{
			timeout: 60_000,
		},
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-sibling-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write('tsconfig.json', STRICT)
			scratch.write('src/first.ts', "export const FIRST = 'disk'\n")
			const stage = new TypeStage(scratch.path)
			const second = {
				path: 'src/second.ts',
				text: "import { FIRST } from './first.js'\nconst VALUE: 'draft' = FIRST\nvoid VALUE\n",
			}
			const test = { path: 'tmp/probe/sibling.test.ts', text: 'export {}\n' }
			try {
				const paired = await stage.inspect(
					{
						files: [{ path: 'src/first.ts', text: "export const FIRST = 'draft'\n" }, second],
						test,
					},
					'tsconfig.json',
				)
				// The control: the same importing draft alone reads the disk file, which carries the other
				// literal, so this assertion fails exactly when the sibling draft is what served it.
				const alone = await stage.inspect({ files: [second], test }, 'tsconfig.json')

				expect(paired.issues).toStrictEqual([])
				expect(alone.issues).toStrictEqual([
					{
						origin: 'claimant',
						path: 'src/second.ts',
						message: 'Type \'"disk"\' is not assignable to type \'"draft"\'.',
						range: expect.anything(),
					},
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
		'changes its verdict after an imported dependency changes on disk',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-fresh-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write('tsconfig.json', STRICT)
			scratch.write('src/signal.ts', "export const SIGNAL = 'before'\n")
			const stage = new TypeStage(scratch.path)
			const subject = {
				files: [],
				test: {
					path: 'src/case.ts',
					text: "import { SIGNAL } from './signal.js'\nconst EXPECTED: 'before' = SIGNAL\nvoid EXPECTED\n",
				},
			}
			try {
				const before = await stage.inspect(subject)
				scratch.write('src/signal.ts', "export const SIGNAL = 'after'\n")
				const after = await stage.inspect(subject)
				expect(before.issues).toStrictEqual([])
				expect(after.issues.length).toBeGreaterThan(0)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	// A file the workspace deleted must stop shadowing, or the mirror would answer for a module the
	// target no longer holds.
	it('stops serving a file the workspace deleted', { timeout: 60_000 }, async () => {
		const scratch = createScratch({ prefix: 'probe-type-deleted-' })
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write('tsconfig.json', STRICT)
		scratch.write('src/signal.ts', "export const SIGNAL = 'disk'\n")
		const stage = new TypeStage(scratch.path)
		const subject = {
			files: [],
			test: {
				path: 'src/case.ts',
				text: "import { SIGNAL } from './signal.js'\nvoid SIGNAL\n",
			},
		}
		try {
			const present = await stage.inspect(subject)
			scratch.remove('src/signal.ts')
			const absent = await stage.inspect(subject)
			expect(present.issues).toStrictEqual([])
			expect(absent.issues).toStrictEqual([
				{
					origin: 'claimant',
					path: 'src/case.ts',
					message: "Cannot find module './signal.js' or its corresponding type declarations.",
					range: expect.anything(),
				},
			])
		} finally {
			const teardown = createTeardown()
			teardown.add(() => scratch.destroy())
			teardown.add(() => stage.destroy())
			await teardown.destroy()
		}
	})

	// The mirror carries a regular file, never a symbolic link, so a file reached only through one is
	// absent from the mirror and the compiler reports what its absence causes.
	it.runIf(LINKS)(
		'reports a claimant issue for an import reachable only through a symbolic link',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-linked-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write('tsconfig.json', STRICT)
			scratch.write('src/core/real.ts', 'export const REAL = 1\n')
			symlinkSync(
				resolve(scratch.path, 'src/core/real.ts'),
				resolve(scratch.path, 'src/core/linked.ts'),
			)
			const stage = new TypeStage(scratch.path)
			try {
				const check = await stage.inspect(
					{
						files: [
							{
								path: 'src/core/reader.ts',
								text: "import { REAL } from './linked.js'\nvoid REAL\n",
							},
						],
						test: { path: 'tmp/probe/linked.test.ts', text: 'export {}\n' },
					},
					'tsconfig.json',
				)
				expect(check.issues).toHaveLength(1)
				expect(check.issues[0]).toMatchObject({
					origin: 'claimant',
					path: 'src/core/reader.ts',
					message: expect.stringContaining("Cannot find module './linked.js'"),
				})
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	it(
		'uses a named project and otherwise infers one from the candidate path',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-project-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":["node"],"strict":true},"include":["src/**/*.ts"]}\n',
			)
			// The scoped project removes the host globals the root project admits, which is the whole
			// reason a claim names a project: the same draft is clean under one and red under the other.
			scratch.write(
				'configs/src/tsconfig.core.json',
				'{"extends":"../../tsconfig.json","compilerOptions":{"types":[]},"include":["../../src/core/**/*.ts"]}\n',
			)
			scratch.write('src/core/value.ts', 'export const VALUE = 1\n')
			const stage = new TypeStage(scratch.path)
			const subject = {
				files: [{ path: 'src/core/version.ts', text: 'export const VERSION = process.version\n' }],
				test: { path: 'tmp/probe/project.test.ts', text: 'export {}\n' },
			}
			try {
				const named = await stage.inspect(subject, 'tsconfig.json')
				const inferred = await stage.inspect(subject)
				expect(named.issues).toStrictEqual([])
				expect(inferred.issues.length).toBeGreaterThan(0)
				expect(inferred.issues[0]?.path).toBe('src/core/version.ts')
				expect(inferred.issues[0]?.message).toContain("Cannot find name 'process'")
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	it(
		'infers one project for equivalent spellings of a resolved candidate',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-spelling-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write('tsconfig.json', STRICT)
			scratch.write(
				'configs/src/tsconfig.core.json',
				'{"extends":"../../tsconfig.json","include":["../../src/core/**/*.ts"]}\n',
			)
			scratch.write('src/core/value.ts', 'export const VALUE = 1\n')
			const stage = new TypeStage(scratch.path)
			const test = { path: 'tmp/probe/spelling.test.ts', text: 'export {}\n' }
			try {
				const indirect = await stage.inspect({
					files: [{ path: 'src/server/../core/reading.ts', text: 'export const READING = 1\n' }],
					test,
				})
				const direct = await stage.inspect({
					files: [{ path: 'src/core/reading.ts', text: 'export const READING = 1\n' }],
					test,
				})
				expect(indirect.issues).toStrictEqual(direct.issues)
				expect(direct.issues).toStrictEqual([])
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	it('checks a candidate that exists only as draft text', { timeout: 60_000 }, async () => {
		const scratch = createScratch({ prefix: 'probe-type-absent-' })
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write('tsconfig.json', STRICT)
		scratch.write('src/value.ts', 'export const VALUE = 1\n')
		const stage = new TypeStage(scratch.path)
		try {
			const check = await stage.inspect(
				{
					files: [{ path: 'src/absent/signal.ts', text: "export const SIGNAL = 'draft'\n" }],
					test: {
						path: 'src/case.ts',
						text: "import { SIGNAL } from './absent/signal.js'\nconst VALUE: 'draft' = SIGNAL\nvoid VALUE\n",
					},
				},
				'tsconfig.json',
			)
			expect(check.issues).toStrictEqual([])
			// A candidate is text the agent supplied, so checking it never puts it in the target tree.
			expect(existsSync(resolve(scratch.path, 'src/absent'))).toBe(false)
			expect(existsSync(resolve(scratch.path, 'src/case.ts'))).toBe(false)
		} finally {
			const teardown = createTeardown()
			teardown.add(() => scratch.destroy())
			teardown.add(() => stage.destroy())
			await teardown.destroy()
		}
	})

	it.each(['first', 'middle', 'last'])(
		'writes nothing when an escaping source is %s',
		{ timeout: 60_000 },
		async (position) => {
			const scratch = createScratch({ prefix: `probe-type-escape-${position}-` })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write('tsconfig.json', STRICT)
			scratch.write('src/first.ts', "export const FIRST_SIGNAL = 'disk'\n")
			scratch.write('src/second.ts', "export const SECOND_SIGNAL = 'disk'\n")
			const first = { path: 'src/first.ts', text: "export const FIRST_SIGNAL = 'draft'\n" }
			const second = { path: 'src/second.ts', text: "export const SECOND_SIGNAL = 'draft'\n" }
			const escaping = { path: '../outside.ts', text: 'export {}\n' }
			const files =
				position === 'first'
					? [escaping, first, second]
					: position === 'middle'
						? [first, escaping, second]
						: [first, second, escaping]
			const stage = new TypeStage(scratch.path)
			try {
				await expect(
					stage.inspect(
						{ files, test: { path: 'tmp/probe/escape.test.ts', text: 'export {}\n' } },
						'tsconfig.json',
					),
				).rejects.toThrow('Path escapes the workspace: ../outside.ts')
				// Nothing the refused inspection carried reached the next one, so the disk text is what
				// the following case reads.
				const later = await stage.inspect(
					{
						files: [],
						test: {
							path: 'src/case.ts',
							text: "import { FIRST_SIGNAL } from './first.js'\nimport { SECOND_SIGNAL } from './second.js'\nconst FIRST: 'disk' = FIRST_SIGNAL\nconst SECOND: 'disk' = SECOND_SIGNAL\nvoid FIRST\nvoid SECOND\n",
						},
					},
					'tsconfig.json',
				)
				expect(readFileSync(resolve(scratch.path, 'src/first.ts'), 'utf8')).toBe(
					"export const FIRST_SIGNAL = 'disk'\n",
				)
				expect(existsSync(resolve(scratch.path, '../outside.ts'))).toBe(false)
				expect(later.issues).toStrictEqual([])
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	it(
		'reads disk again after the inspection that drafted a path ends',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-release-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write('tsconfig.json', STRICT)
			scratch.write('src/signal.ts', "export const SIGNAL = 'disk'\n")
			const stage = new TypeStage(scratch.path)
			const subject = {
				files: [],
				test: {
					path: 'src/released.ts',
					text: "import { SIGNAL } from './signal.js'\nconst VALUE: 'disk' = SIGNAL\nvoid VALUE\n",
				},
			}
			try {
				const drafted = await stage.inspect(
					{
						files: [{ path: 'src/signal.ts', text: "export const SIGNAL = 'draft'\n" }],
						test: {
							path: 'src/drafted.ts',
							text: "import { SIGNAL } from './signal.js'\nconst VALUE: 'draft' = SIGNAL\nvoid VALUE\n",
						},
					},
					'tsconfig.json',
				)
				const released = await stage.inspect(subject)
				expect(drafted.issues).toStrictEqual([])
				expect(released.issues).toStrictEqual([])
				await stage.destroy()
				await expect(stage.inspect(subject)).rejects.toThrow('The type stage has been destroyed')
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	// Configuration is read once per stage rather than per claim, which is the same rule the resident
	// lint and runtime tools follow. A stage built afterwards reads the rewritten project, so the
	// pair separates a cached reading from a constant.
	it('reads one project configuration for the life of the stage', { timeout: 60_000 }, async () => {
		const scratch = createScratch({ prefix: 'probe-type-cached-' })
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write('tsconfig.json', STRICT)
		scratch.write('src/value.ts', 'export const VALUE = 1\n')
		const stage = new TypeStage(scratch.path)
		try {
			const before = await stage.resolve('tsconfig.json')
			scratch.write(
				'tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":[],"strict":false},"include":["src/**/*.ts"]}\n',
			)
			const retained = await stage.resolve('tsconfig.json')
			const replacement = new TypeStage(scratch.path)
			try {
				const rebuilt = await replacement.resolve('tsconfig.json')
				expect(retained.digest).toBe(before.digest)
				expect(rebuilt.digest).not.toBe(before.digest)
				expect(rebuilt.path).toBe(before.path)
			} finally {
				await replacement.destroy()
			}
		} finally {
			const teardown = createTeardown()
			teardown.add(() => scratch.destroy())
			teardown.add(() => stage.destroy())
			await teardown.destroy()
		}
	})

	it('abandons an inspection and destroys idempotently', { timeout: 60_000 }, async () => {
		const scratch = createScratch({ prefix: 'probe-type-abandon-' })
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write('tsconfig.json', STRICT)
		scratch.write('src/value.ts', 'export const VALUE = 1\n')
		const before = readdirSync(scratch.path).sort()
		const stage = new TypeStage(scratch.path)
		try {
			const inspection = stage.inspect(
				{
					files: [{ path: 'src/reading.ts', text: "export const READING = 'ok'\n" }],
					test: { path: 'tmp/probe/abandon.test.ts', text: 'export {}\n' },
				},
				'tsconfig.json',
			)
			void inspection.catch(() => {})
			await Promise.all([stage.destroy(), stage.destroy()])
			await expect(inspection).rejects.toThrow('The type stage has been destroyed')
			await expect(stage.destroy()).resolves.toBeUndefined()

			// The abandoned inspection wrote inside `tmp/` and nowhere else, and its mirror went with
			// the teardown that abandoned it.
			expect(readdirSync(scratch.path).sort()).toStrictEqual([...before, 'tmp'].sort())
			expect(existsSync(resolve(scratch.path, 'src/reading.ts'))).toBe(false)
			expect(readdirSync(resolve(scratch.path, TYPE_MIRROR))).toStrictEqual([])
		} finally {
			scratch.destroy()
		}
	})

	// Every mirror carries the writing host's process id and the marker that attributes it, and a
	// sweep needs all of it: a directory a live host owns, and one this package cannot attribute,
	// both stay where they are.
	it('sweeps only a mirror its own dead host left behind', { timeout: 60_000 }, async () => {
		const scratch = createScratch({ prefix: 'probe-type-sweep-' })
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write('tsconfig.json', STRICT)
		scratch.write('src/value.ts', 'export const VALUE = 1\n')
		// A real process, run to completion, so the identity below names a host that is genuinely gone
		// rather than one this test guessed was.
		const departed = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' }).pid
		expect(departed).toBeTypeOf('number')
		const dead = `${String(departed)}-${randomUUID()}`
		const live = `${process.pid}-${randomUUID()}`
		const unmarked = `${String(departed)}-${randomUUID()}`
		const foreign = 'notes'
		for (const [name, marker] of [
			[dead, dead],
			[live, live],
			[unmarked, randomUUID()],
		] as const) {
			mkdirSync(resolve(scratch.path, TYPE_MIRROR, name, '.probe'), { recursive: true })
			writeFileSync(
				resolve(scratch.path, TYPE_MIRROR, name, '.probe/mirror.txt'),
				formatSpecification('', marker),
				'utf8',
			)
		}
		mkdirSync(resolve(scratch.path, TYPE_MIRROR, foreign), { recursive: true })
		const stage = new TypeStage(scratch.path)
		try {
			await waitForCondition(
				'the stage to sweep the mirror its dead host left',
				() => !existsSync(resolve(scratch.path, TYPE_MIRROR, dead)),
				{ budget: 30_000, interval: 20 },
			)
			expect(existsSync(resolve(scratch.path, TYPE_MIRROR, live))).toBe(true)
			expect(existsSync(resolve(scratch.path, TYPE_MIRROR, unmarked))).toBe(true)
			expect(existsSync(resolve(scratch.path, TYPE_MIRROR, foreign))).toBe(true)
		} finally {
			const teardown = createTeardown()
			teardown.add(() => scratch.destroy())
			teardown.add(() => stage.destroy())
			await teardown.destroy()
		}
	})
})

describe('type stage project resolution', () => {
	it(
		'resolves every spelling of one project to one path and one digest',
		{
			timeout: 60_000,
		},
		async () => {
			const stage = new TypeStage(ROOT)
			try {
				const declared = await stage.resolve('configs/src/tsconfig.core.json')
				const spelled = await stage.resolve('./configs/src/../src/tsconfig.core.json')
				const root = await stage.resolve('tsconfig.json')

				expect(declared.path).toBe('configs/src/tsconfig.core.json')
				expect(declared.digest).toMatch(/^[0-9a-f]{32}$/)
				expect(spelled).toStrictEqual(declared)
				// Without this the preceding pair passes for a digest that reads nothing at all, because
				// two spellings of one file would agree under any constant.
				expect(root.digest).not.toBe(declared.digest)
				expect(root.path).toBe('tsconfig.json')
			} finally {
				await stage.destroy()
			}
		},
	)

	it(
		'moves the digest with the extends chain under a byte-identical project file',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-extends-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write('tsconfig.json', STRICT)
			scratch.write('src/value.ts', 'export const VALUE = 1\n')
			const child = '{"extends":"./base.json","files":["../../src/value.ts"]}\n'
			const strict = '{"compilerOptions":{"strict":true,"types":[]}}\n'
			const lenient = '{"compilerOptions":{"strict":false,"types":[]}}\n'
			for (const [name, parent] of [
				['first', strict],
				['second', lenient],
			] as const) {
				scratch.write(`projects/${name}/base.json`, parent)
				scratch.write(`projects/${name}/tsconfig.json`, child)
			}
			const stage = new TypeStage(scratch.path)
			try {
				const first = await stage.resolve('projects/first/tsconfig.json')
				const second = await stage.resolve('projects/second/tsconfig.json')

				expect(scratch.read('projects/first/tsconfig.json')).toBe(
					scratch.read('projects/second/tsconfig.json'),
				)
				expect(first.digest).not.toBe(second.digest)

				// The preceding pair sits at two paths, and a resolved project carries its own paths, so
				// that inequality alone cannot say the parent moved it. Realign the second parent and
				// read the same path again on a stage holding no reading of it: the project file and its
				// path are fixed, and its parent's `strict` is the only thing that moved.
				scratch.write('projects/second/base.json', strict)
				const replacement = new TypeStage(scratch.path)
				try {
					const realigned = await replacement.resolve('projects/second/tsconfig.json')
					expect(realigned.path).toBe(second.path)
					expect(realigned.digest).not.toBe(second.digest)
				} finally {
					await replacement.destroy()
				}
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	// `#inspect` reads every selected project's configuration before it places any draft, so a claim
	// drafting the very project file it is checked against cannot move the digest that project
	// resolves to.
	it(
		"resolves a project's digest before an inspection's own draft of that project can move it",
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-digest-order-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write('tsconfig.json', STRICT)
			scratch.write('src/value.ts', 'export const VALUE = 1\n')
			const project = 'projects/tsconfig.extra.json'
			scratch.write(project, '{"compilerOptions":{"strict":true}}\n')
			scratch.write('projects/value.ts', 'export const VALUE = 1\n')
			const first = new TypeStage(scratch.path)
			let digest: string
			try {
				digest = (await first.resolve(project)).digest
			} finally {
				await first.destroy()
			}
			const second = new TypeStage(scratch.path)
			try {
				await second.inspect(
					{
						files: [
							{ path: project, text: '{"compilerOptions":{"strict":false}}\n' },
							{ path: 'projects/value.ts', text: 'export const VALUE = 1\n' },
						],
						test: { path: 'tmp/probe/digest-order.test.ts', text: 'export {}\n' },
					},
					project,
				)
				const after = await second.resolve(project)
				expect(after.digest).toBe(digest)
			} finally {
				await second.destroy()
			}
		},
	)

	it(
		'refuses to resolve a project that escapes the workspace or has been torn down',
		{
			timeout: 60_000,
		},
		async () => {
			const stage = new TypeStage(ROOT)
			await expect(stage.resolve('../outside/tsconfig.json')).rejects.toThrow(
				'Path escapes the workspace: ../outside/tsconfig.json',
			)
			await stage.destroy()
			await expect(stage.resolve('configs/src/tsconfig.core.json')).rejects.toThrow(
				'The type stage has been destroyed',
			)
		},
	)

	it('names the caller-named project in its own diagnostic', { timeout: 60_000 }, async () => {
		const project = 'projects/tsconfig.empty.json'
		const scratch = createScratch({ prefix: 'probe-type-empty-' })
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write('tsconfig.json', STRICT)
		scratch.write('src/value.ts', 'export const VALUE = 1\n')
		// This project parses and matches no input, and the diagnostic that reports it quotes the
		// absolute path the stage handed the compiler.
		scratch.write(project, '{}\n')
		const stage = new TypeStage(scratch.path)
		try {
			const failure: unknown = await stage.resolve(project).catch((error: unknown) => error)
			expect(failure).toMatchObject({
				origin: 'workspace',
				code: 'malformed',
				context: { stage: 'type', project },
				message: expect.stringContaining(`No inputs were found in config file '${project}'`),
			})
			expect(isProbeError(failure)).toBe(true)
			const message = failure instanceof Error ? failure.message : String(failure)
			// The workspace-relative spelling is a substring of the absolute one, so the preceding
			// assertion passes for an untranslated message too. This is what separates them.
			expect(message).not.toContain(scratch.path)
			expect(message).not.toContain('\\')
		} finally {
			const teardown = createTeardown()
			teardown.add(() => scratch.destroy())
			teardown.add(() => stage.destroy())
			await teardown.destroy()
		}
	})
})

describe('type stage workspace faults', () => {
	// The compiler reports a project's own fault against the project file, and a candidate's fault
	// against the candidate. Both runs exit non-zero, so the exit code separates nothing; the
	// diagnostic's own path is what says whose fault it is.
	it(
		'separates a malformed project from a candidate type error by the diagnostic, not the exit',
		{ timeout: 60_000 },
		async () => {
			const project = 'projects/tsconfig.broken.json'
			const scratch = createScratch({ prefix: 'probe-type-broken-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write('tsconfig.json', STRICT)
			scratch.write('src/value.ts', 'export const VALUE = 1\n')
			// The colon this project omits is a syntax fault the compiler reports against the project
			// file itself. It sits outside `configs/`, so the stage reads it only when a claim names it.
			scratch.write(project, '{"compilerOptions" {"strict":true}}\n')
			// The recovered default project matches this file, so `--showConfig` prints a configuration
			// and the run that reads the project for real is where the syntax fault surfaces.
			scratch.write('projects/value.ts', 'export const VALUE = 1\n')
			const stage = new TypeStage(scratch.path)
			const test = { path: 'tmp/probe/broken.test.ts', text: 'export {}\n' }
			try {
				const failure: unknown = await stage
					.inspect(
						{ files: [{ path: 'src/reading.ts', text: 'export const READING = 1\n' }], test },
						project,
					)
					.catch((error: unknown) => error)
				expect(isProbeError(failure)).toBe(true)
				expect(failure).toMatchObject({
					origin: 'workspace',
					code: 'malformed',
					context: { stage: 'type', project },
					message: expect.stringContaining("':' expected."),
				})
				const message = failure instanceof Error ? failure.message : String(failure)
				// A `Debug Failure` is the compiler's own assertion escaping this package's failure
				// contract, and a backslash is this host's directory layout rather than anything the
				// caller named.
				expect(message).not.toContain('Debug Failure')
				expect(message).not.toContain(scratch.path)

				// The same stage, the same non-zero exit, a diagnostic naming a candidate: reported as
				// the claimant's rather than raised as the workspace's.
				const reported = await stage.inspect(
					{
						files: [{ path: 'src/reading.ts', text: "export const READING: number = 'bad'\n" }],
						test,
					},
					'tsconfig.json',
				)
				expect(reported.issues).toStrictEqual([
					{
						origin: 'claimant',
						path: 'src/reading.ts',
						message: "Type 'string' is not assignable to type 'number'.",
						range: expect.anything(),
					},
				])
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	// A drafted `.json` file is the claimant's like any other draft, so a diagnostic against it is
	// reported rather than raised as the target tree's own fault.
	it(
		'reports a malformed drafted json file as the claimants own issue',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-drafted-json-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":[],"strict":true,"resolveJsonModule":true},"include":["src/**/*.ts"]}\n',
			)
			scratch.write('src/value.ts', 'export const VALUE = 1\n')
			const stage = new TypeStage(scratch.path)
			try {
				const check = await stage.inspect(
					{
						files: [
							{ path: 'src/settings.json', text: '{ "name": \n' },
							{ path: 'src/reader.ts', text: 'export const READING = 1\n' },
						],
						test: { path: 'tmp/probe/drafted-json.test.ts', text: 'export {}\n' },
					},
					'tsconfig.json',
				)
				expect(check.issues.length).toBeGreaterThan(0)
				expect(
					check.issues.every(
						(issue) => issue.origin === 'claimant' && issue.path === 'src/settings.json',
					),
				).toBe(true)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	it(
		'raises a project fault the compiler reports against no file',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-missing-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write('tsconfig.json', STRICT)
			scratch.write('src/value.ts', 'export const VALUE = 1\n')
			scratch.write('projects/tsconfig.detached.json', '{"extends":"./absent.json"}\n')
			const stage = new TypeStage(scratch.path)
			try {
				// A claim carrying no candidate draft never reads the project it names, because only a
				// draft is checked against that project, so this claim carries one.
				const failure: unknown = await stage
					.inspect(
						{
							files: [{ path: 'src/reading.ts', text: 'export const READING = 1\n' }],
							test: { path: 'tmp/probe/missing.test.ts', text: 'export {}\n' },
						},
						'projects/tsconfig.detached.json',
					)
					.catch((error: unknown) => error)
				expect(isProbeError(failure)).toBe(true)
				expect(failure).toMatchObject({
					origin: 'workspace',
					code: 'malformed',
					context: { stage: 'type', project: 'projects/tsconfig.detached.json' },
					message: expect.stringContaining('projects/absent.json'),
				})
				const message = failure instanceof Error ? failure.message : String(failure)
				expect(message).not.toContain(scratch.path)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	// A workspace whose own declared project cannot be read refuses every claim, because the stage
	// builds each declared project's state before it answers one.
	it(
		'refuses every inspection while a declared project is malformed',
		{
			timeout: 60_000,
		},
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-declared-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write('tsconfig.json', STRICT)
			scratch.write('src/value.ts', 'export const VALUE = 1\n')
			scratch.write('configs/src/tsconfig.core.json', '{"compilerOptions":{"bogus":true}}\n')
			const stage = new TypeStage(scratch.path)
			try {
				const failure: unknown = await stage
					.inspect({ files: [], test: { path: 'tmp/probe/declared.test.ts', text: 'export {}\n' } })
					.catch((error: unknown) => error)
				expect(isProbeError(failure)).toBe(true)
				expect(failure).toMatchObject({
					origin: 'workspace',
					code: 'malformed',
					context: { stage: 'type', project: 'configs/src/tsconfig.core.json' },
					message: expect.stringContaining("Unknown compiler option 'bogus'"),
				})
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	// `#check`'s reading: no diagnostic and a non-zero or absent status is the instrument's own
	// fault, whatever the reason, so a compiler stub that exits without printing one is reported
	// as `origin: 'instrument'` rather than as a claimant or workspace fault.
	it(
		'reports a non-zero exit with no diagnostic as an instrument fault',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-instrument-exit-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.write(
				'node_modules/typescript/package.json',
				'{"name":"typescript","version":"6.0.3","bin":{"tsc":"bin/tsc"}}\n',
			)
			scratch.write(
				'node_modules/typescript/bin/tsc',
				[
					'const args = process.argv.slice(2)',
					"if (args.includes('--showConfig')) {",
					'\tprocess.stdout.write(JSON.stringify({ compilerOptions: { strict: true }, files: [] }))',
					'\tprocess.exit(0)',
					'}',
					'process.exit(3)',
					'',
				].join('\n'),
			)
			scratch.write('tsconfig.json', STRICT)
			scratch.write('src/value.ts', 'export const VALUE = 1\n')
			const stage = new TypeStage(scratch.path)
			try {
				const failure: unknown = await stage
					.inspect({
						files: [],
						test: { path: 'tmp/probe/instrument-exit.test.ts', text: 'export {}\n' },
					})
					.catch((error: unknown) => error)
				expect(isProbeError(failure)).toBe(true)
				expect(failure).toMatchObject({
					origin: 'instrument',
					code: 'malformed',
					message: 'The compiler reported no diagnostic and exited 3',
				})
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	it(
		'reports a signal-ended check run with no diagnostic as an instrument fault',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-instrument-signal-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.write(
				'node_modules/typescript/package.json',
				'{"name":"typescript","version":"6.0.3","bin":{"tsc":"bin/tsc"}}\n',
			)
			scratch.write(
				'node_modules/typescript/bin/tsc',
				[
					'const args = process.argv.slice(2)',
					"if (args.includes('--showConfig')) {",
					'\tprocess.stdout.write(JSON.stringify({ compilerOptions: { strict: true }, files: [] }))',
					'\tprocess.exit(0)',
					'}',
					"process.kill(process.pid, 'SIGTERM')",
					'',
				].join('\n'),
			)
			scratch.write('tsconfig.json', STRICT)
			scratch.write('src/value.ts', 'export const VALUE = 1\n')
			const stage = new TypeStage(scratch.path)
			try {
				const failure: unknown = await stage
					.inspect({
						files: [],
						test: { path: 'tmp/probe/instrument-signal.test.ts', text: 'export {}\n' },
					})
					.catch((error: unknown) => error)
				expect(isProbeError(failure)).toBe(true)
				expect(failure).toMatchObject({
					origin: 'instrument',
					code: 'malformed',
					message: 'The compiler reported no diagnostic and was ended by a signal',
				})
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)
})
