import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureError, createTeardown, waitForDelay } from '@orkestrel/test'
import { createScratch } from '@orkestrel/test/server'
import { TypeStage, normalizePath } from '@src/server'
import { formatIssue, isProbeError } from '@src/core'
import { describe, expect, it } from 'vitest'
import { WORKSPACE_ROOT } from '../../../setup.js'

const ROOT = fileURLToPath(WORKSPACE_ROOT)
const DISPOSED_COMPILER = [
	"const compiler = require('typescript-real')",
	'function createLanguageService(host, registry, mode) {',
	'\tconst service = compiler.createLanguageService(host, registry, mode)',
	'\tqueueMicrotask(() => service.dispose())',
	'\treturn service',
	'}',
	'module.exports = new Proxy(compiler, {',
	'\tget(target, property) {',
	"\t\treturn property === 'createLanguageService' ? createLanguageService : Reflect.get(target, property)",
	'\t}',
	'})',
].join('\n')

describe('type stage', () => {
	it('translates a real disposed language-service fault', { timeout: 60_000 }, async () => {
		const scratch = createScratch({ prefix: 'probe-type-disposed-' })
		scratch.write('package.json', '{"type":"commonjs"}\n')
		scratch.write(
			'tsconfig.json',
			'{"compilerOptions":{"strict":true},"include":["src/**/*.ts"]}\n',
		)
		scratch.write('src/index.ts', 'export const VALUE = 1\n')
		scratch.write(
			'node_modules/typescript/package.json',
			'{"name":"typescript","version":"fixture","main":"index.cjs"}\n',
		)
		scratch.write('node_modules/typescript/index.cjs', DISPOSED_COMPILER)
		scratch.link('node_modules/typescript-real', resolve(ROOT, 'node_modules/typescript'))
		const stage = new TypeStage(scratch.path)
		try {
			const failure: unknown = await stage
				.inspect({
					files: [],
					test: {
						path: 'tests/src/core/type-disposed.test.ts',
						text: "import { test } from 'vitest'\ntest('loads', () => {})\n",
					},
				})
				.catch((error: unknown) => error)
			expect(isProbeError(failure)).toBe(true)
			expect(failure).toMatchObject({
				origin: 'instrument',
				code: 'malformed',
				context: { stage: 'type' },
				cause: expect.any(Error),
			})
		} finally {
			const teardown = createTeardown()
			teardown.add(() => scratch.destroy())
			teardown.add(() => stage.destroy())
			await teardown.destroy()
		}
	})

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
		const stage = new TypeStage(ROOT)
		const test = {
			path: 'tests/src/core/type-stage.test.ts',
			text: "import { test } from 'vitest'\ntest('loads', () => {})\n",
		}
		try {
			const clean = await stage.inspect({
				files: [{ path: 'src/core/type-stage.ts', text: "export const VALUE: string = 'ok'\n" }],
				test,
			})
			const broken = await stage.inspect({
				files: [{ path: 'src/core/type-stage.ts', text: "export const VALUE: number = 'bad'\n" }],
				test,
			})
			expect(clean.issues).toStrictEqual([])
			expect(broken.issues.length).toBeGreaterThan(0)
			expect(broken.issues).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ origin: 'claimant', path: 'src/core/type-stage.ts' }),
				]),
			)
			// A compiler diagnostic about the candidate is the candidate's fault, so every issue
			// this stage returns for one carries the origin that can disprove a claim.
			expect(broken.issues.every((issue) => issue.origin === 'claimant')).toBe(true)
		} finally {
			await stage.destroy()
		}
	})

	// The compiler already answers in the zero-based coordinates the issue stores, so the stored
	// line is the compiler's own. The offending declaration sits on the third line, which separates
	// a carried coordinate from a raised one and from a constant. The compiler also reports the
	// extent of this diagnostic, so the stored span has real width rather than collapsing onto its
	// start. The rendered line is read back through `formatIssue`, so the stored value and the
	// one-based number a reader opens are pinned by the same case.
	it(
		'stores a diagnostic zero-based with its reported extent and renders its line one-based',
		{ timeout: 60_000 },
		async () => {
			const stage = new TypeStage(ROOT)
			const text = ['// padding', '// padding', "export const VALUE: number = 'bad'", ''].join('\n')
			try {
				const broken = await stage.inspect({
					files: [{ path: 'src/core/type-coordinates.ts', text }],
					test: {
						path: 'tests/src/core/type-coordinates.test.ts',
						text: "import { test } from 'vitest'\ntest('loads', () => {})\n",
					},
				})

				const issue = broken.issues.find((row) => row.path === 'src/core/type-coordinates.ts')
				expect(issue).toBeDefined()
				expect(issue?.range?.start.line).toBe(2)
				expect(issue?.range?.end.line).toBe(2)
				// The diagnostic names a declaration rather than a point, so its span has width.
				expect(issue?.range?.end.character).toBeGreaterThan(issue?.range?.start.character ?? 0)
				expect(formatIssue(issue ?? { origin: 'claimant', path: '', message: '' })).toContain(
					'src/core/type-coordinates.ts:3 ',
				)
			} finally {
				await stage.destroy()
			}
		},
	)

	it(
		'changes its verdict after an imported dependency changes on disk',
		{ timeout: 60_000 },
		async () => {
			const id = randomUUID()
			const dependency = `tmp/probe/type-dependency-${id}.ts`
			const dependencyFile = resolve(ROOT, dependency)
			const stage = new TypeStage(ROOT)
			mkdirSync(resolve(ROOT, 'tmp/probe'), { recursive: true })
			writeFileSync(dependencyFile, "export const SIGNAL = 'before'\n", 'utf8')
			const subject = {
				files: [],
				test: {
					path: `tmp/probe/type-case-${id}.test.ts`,
					text: `import { SIGNAL } from './type-dependency-${id}.js'\nconst EXPECTED: 'before' = SIGNAL\nvoid EXPECTED\n`,
				},
			}
			try {
				const before = await stage.inspect(subject)
				await waitForDelay(20)
				writeFileSync(dependencyFile, "export const SIGNAL = 'after'\n", 'utf8')
				const after = await stage.inspect(subject)
				expect(before.issues).toStrictEqual([])
				expect(after.issues.length).toBeGreaterThan(0)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => rmSync(dependencyFile, { force: true }))
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	it(
		'uses a named project and otherwise infers one from the candidate path',
		{ timeout: 60_000 },
		async () => {
			const stage = new TypeStage(ROOT)
			const subject = {
				files: [
					{ path: 'src/core/project-choice.ts', text: 'export const VERSION = process.version\n' },
				],
				test: {
					path: 'tests/src/core/project-choice.test.ts',
					text: "import { test } from 'vitest'\ntest('loads', () => {})\n",
				},
			}
			try {
				const named = await stage.inspect(subject, 'tsconfig.json')
				const inferred = await stage.inspect(subject)
				expect(named.issues).toStrictEqual([])
				expect(inferred.issues.length).toBeGreaterThan(0)
				expect(inferred.issues[0]?.path).toBe('src/core/project-choice.ts')
			} finally {
				await stage.destroy()
			}
		},
	)

	it(
		'splits a fileless project diagnostic by who selected the project',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-fileless-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":[]},"files":["src/core/value.ts"]}\n',
			)
			scratch.write(
				'configs/src/tsconfig.core.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":["definitely-missing"]},"files":["../../src/core/value.ts"]}\n',
			)
			scratch.write('src/core/value.ts', 'export const VALUE = 1\n')
			const stage = new TypeStage(scratch.path)
			const subject = {
				files: [{ path: 'src/core/value.ts', text: 'export const VALUE = 1\n' }],
				test: { path: 'tmp/probe/value.test.ts', text: 'export {}\n' },
			}
			try {
				await expect(
					stage.inspect(subject, 'configs/src/tsconfig.core.json'),
				).rejects.toMatchObject({
					origin: 'claimant',
					code: 'refused',
					context: { stage: 'type', project: 'configs/src/tsconfig.core.json' },
				})
				// The inferred project is the workspace's own, so its configuration fault is the
				// workspace's to fix. Naming this package instead would refuse every receipt the
				// target could earn while the target holds the only file that can close it.
				const inferred = await stage.inspect(subject)
				expect(inferred.issues).toEqual([
					expect.objectContaining({
						origin: 'workspace',
						path: 'configs/src/tsconfig.core.json',
						message: expect.stringContaining(
							"Cannot find type definition file for 'definitely-missing'",
						),
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
		'infers one project for equivalent spellings of a resolved candidate',
		{ timeout: 60_000 },
		async () => {
			const stage = new TypeStage(ROOT)
			const test = {
				path: 'tmp/probe/project-spelling.test.ts',
				text: "import { test } from 'vitest'\ntest('loads', () => {})\n",
			}
			try {
				const indirect = await stage.inspect({
					files: [
						{
							path: 'src/core/../server/project-spelling.ts',
							text: 'export const VERSION = process.version\n',
						},
					],
					test,
				})
				const direct = await stage.inspect({
					files: [
						{
							path: 'src/server/project-spelling.ts',
							text: 'export const VERSION = process.version\n',
						},
					],
					test,
				})
				expect(indirect.issues).toStrictEqual(direct.issues)
				expect(direct.issues).toStrictEqual([])
			} finally {
				await stage.destroy()
			}
		},
	)

	it('imports a candidate that exists only as overlay text', { timeout: 60_000 }, async () => {
		const id = randomUUID()
		const candidate = `src/core/overlay-only-${id}.ts`
		const stage = new TypeStage(ROOT)
		try {
			const check = await stage.inspect(
				{
					files: [{ path: candidate, text: "export const SIGNAL = 'overlay'\n" }],
					test: {
						path: `tmp/probe/overlay-only-${id}.test.ts`,
						text: `import { SIGNAL } from '../../src/core/overlay-only-${id}.js'\nconst VALUE: 'overlay' = SIGNAL\nvoid VALUE\n`,
					},
				},
				'tsconfig.json',
			)
			expect(check.issues).toStrictEqual([])
			// The candidate is text the agent supplied, so importing it must never put it on disk.
			expect(existsSync(resolve(ROOT, candidate))).toBe(false)
		} finally {
			await stage.destroy()
		}
	})

	it('imports a candidate whose directory does not exist', { timeout: 60_000 }, async () => {
		const id = randomUUID()
		const directory = `src/overlay-absent-${id}`
		const stage = new TypeStage(ROOT)
		try {
			const check = await stage.inspect(
				{
					files: [{ path: `${directory}/signal.ts`, text: "export const SIGNAL = 'overlay'\n" }],
					test: {
						path: `tmp/probe/overlay-absent-${id}.test.ts`,
						text: `import { SIGNAL } from '../../${directory}/signal.js'\nconst VALUE: 'overlay' = SIGNAL\nvoid VALUE\n`,
					},
				},
				'tsconfig.json',
			)
			expect(check.issues).toStrictEqual([])
			expect(existsSync(resolve(ROOT, directory))).toBe(false)
		} finally {
			await stage.destroy()
		}
	})

	it(
		'reads the agent text where a candidate shadows a disk file',
		{ timeout: 60_000 },
		async () => {
			const id = randomUUID()
			const candidate = `tmp/probe/overlay-shadow-${id}.ts`
			const candidateFile = resolve(ROOT, candidate)
			const disk = "export const SIGNAL = 'disk'\n"
			const stage = new TypeStage(ROOT)
			mkdirSync(resolve(ROOT, 'tmp/probe'), { recursive: true })
			writeFileSync(candidateFile, disk, 'utf8')
			try {
				const check = await stage.inspect(
					{
						files: [{ path: candidate, text: "export const SIGNAL = 'overlay'\n" }],
						test: {
							path: `tmp/probe/overlay-shadow-${id}.test.ts`,
							text: `import { SIGNAL } from './overlay-shadow-${id}.js'\nconst VALUE: 'overlay' = SIGNAL\nvoid VALUE\n`,
						},
					},
					'tsconfig.json',
				)
				expect(check.issues).toStrictEqual([])
				expect(readFileSync(candidateFile, 'utf8')).toBe(disk)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => rmSync(candidateFile, { force: true }))
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	// A case-folding volume resolves a draft's spelling and the disk spelling to one file, so the
	// compiler keeps the spelling its root file list already holds — the disk one — and asks the host
	// for that. An overlay matching its keys exactly never answers there, and the inspection reports
	// the committed file: the broken draft passes and the clean draft carries the disk file's error.
	// The matching-case pair runs first as this case's control, so a run that reddens shows the
	// difference is the file-name case rather than the assertion.
	it(
		'reads the candidate text where a draft and its disk file differ in file-name case',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-type-case-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":[],"strict":true},"include":["src/**/*.ts"]}\n',
			)
			scratch.write('src/signal.ts', "export const SIGNAL: string = 'disk'\n")
			scratch.write('src/reading.ts', 'export const READING: string = MISSING\n')
			// Case folding is the volume's property, so it is read from the volume this scratch
			// workspace sits on rather than assumed from the platform name. Where the volume folds, the
			// compiler reports the diagnostic against the disk spelling it kept.
			const folding = existsSync(resolve(scratch.path, 'src/Signal.ts'))
			const test = { path: 'tmp/probe/case.test.ts', text: 'export {}\n' }
			const broken = "export const SIGNAL: number = 'draft'\n"
			const clean = "export const READING: string = 'draft'\n"
			const stage = new TypeStage(scratch.path)
			try {
				const matched = await stage.inspect(
					{
						files: [
							{ path: 'src/signal.ts', text: broken },
							{ path: 'src/reading.ts', text: clean },
						],
						test,
					},
					'tsconfig.json',
				)
				const diverged = await stage.inspect(
					{
						files: [
							{ path: 'src/Signal.ts', text: broken },
							{ path: 'src/Reading.ts', text: clean },
						],
						test,
					},
					'tsconfig.json',
				)

				expect(matched.issues).toStrictEqual([
					{
						origin: 'claimant',
						path: 'src/signal.ts',
						message: expect.stringContaining("not assignable to type 'number'"),
						range: expect.anything(),
					},
				])
				// The broken draft's own error is reported and the broken disk file the clean draft
				// stands in for is not, so the overlay answered for both spellings of both files.
				expect(diverged.issues).toStrictEqual([
					{
						origin: 'claimant',
						path: folding ? 'src/signal.ts' : 'src/Signal.ts',
						message: expect.stringContaining("not assignable to type 'number'"),
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

	it.each(['first', 'middle', 'last'])(
		'removes every applied overlay when an escaping source is %s',
		{ timeout: 60_000 },
		async (position) => {
			const id = randomUUID()
			const stem = `type-overlay-${position}-${id}`
			const testPath = `tmp/probe/${stem}.ts`
			const firstPath = `tmp/probe/${stem}-first.ts`
			const secondPath = `tmp/probe/${stem}-second.ts`
			const laterPath = `tmp/probe/${stem}-later.test.ts`
			const testFile = resolve(ROOT, testPath)
			const firstFile = resolve(ROOT, firstPath)
			const secondFile = resolve(ROOT, secondPath)
			const diskTest = "export const TEST_SIGNAL = 'disk'\n"
			const diskFirst = "export const FIRST_SIGNAL = 'disk'\n"
			const diskSecond = "export const SECOND_SIGNAL = 'disk'\n"
			const first = { path: firstPath, text: "export const FIRST_SIGNAL = 'overlay'\n" }
			const second = { path: secondPath, text: "export const SECOND_SIGNAL = 'overlay'\n" }
			const escaping = { path: '../outside.ts', text: 'export {}\n' }
			const files =
				position === 'first'
					? [escaping, first, second]
					: position === 'middle'
						? [first, escaping, second]
						: [first, second, escaping]
			const stage = new TypeStage(ROOT)
			mkdirSync(resolve(ROOT, 'tmp/probe'), { recursive: true })
			writeFileSync(testFile, diskTest, 'utf8')
			writeFileSync(firstFile, diskFirst, 'utf8')
			writeFileSync(secondFile, diskSecond, 'utf8')
			try {
				await expect(
					stage.inspect({
						files,
						test: { path: testPath, text: "export const TEST_SIGNAL = 'overlay'\n" },
					}),
				).rejects.toThrow('Path escapes the workspace: ../outside.ts')
				const later = await stage.inspect({
					files: [],
					test: {
						path: laterPath,
						text: `import { TEST_SIGNAL } from './${stem}.js'\nimport { FIRST_SIGNAL } from './${stem}-first.js'\nimport { SECOND_SIGNAL } from './${stem}-second.js'\nconst TEST: 'disk' = TEST_SIGNAL\nconst FIRST: 'disk' = FIRST_SIGNAL\nconst SECOND: 'disk' = SECOND_SIGNAL\nvoid TEST\nvoid FIRST\nvoid SECOND\n`,
					},
				})
				expect(readFileSync(testFile, 'utf8')).toBe(diskTest)
				expect(readFileSync(firstFile, 'utf8')).toBe(diskFirst)
				expect(readFileSync(secondFile, 'utf8')).toBe(diskSecond)
				expect(later.issues).toStrictEqual([])
			} finally {
				const teardown = createTeardown()
				teardown.add(() => rmSync(secondFile, { force: true }))
				teardown.add(() => rmSync(firstFile, { force: true }))
				teardown.add(() => rmSync(testFile, { force: true }))
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	it(
		'reads disk again after the inspection that overlaid a path ends',
		{ timeout: 60_000 },
		async () => {
			const id = randomUUID()
			const candidate = `tmp/probe/overlay-release-${id}.ts`
			const candidateFile = resolve(ROOT, candidate)
			const stage = new TypeStage(ROOT)
			mkdirSync(resolve(ROOT, 'tmp/probe'), { recursive: true })
			writeFileSync(candidateFile, "export const SIGNAL = 'disk'\n", 'utf8')
			try {
				const overlaid = await stage.inspect(
					{
						files: [{ path: candidate, text: "export const SIGNAL = 'overlay'\n" }],
						test: {
							path: `tmp/probe/overlay-release-${id}-overlaid.test.ts`,
							text: `import { SIGNAL } from './overlay-release-${id}.js'\nconst VALUE: 'overlay' = SIGNAL\nvoid VALUE\n`,
						},
					},
					'tsconfig.json',
				)
				// The same import in the next inspection reads the disk text, so nothing the first
				// inspection recorded survives it: neither the text nor the version that served it.
				const subject = {
					files: [],
					test: {
						path: `tmp/probe/overlay-release-${id}-released.test.ts`,
						text: `import { SIGNAL } from './overlay-release-${id}.js'\nconst VALUE: 'disk' = SIGNAL\nvoid VALUE\n`,
					},
				}
				const released = await stage.inspect(subject)
				expect(overlaid.issues).toStrictEqual([])
				expect(released.issues).toStrictEqual([])
				await stage.destroy()
				await expect(stage.inspect(subject)).rejects.toThrow('The type stage has been destroyed')
			} finally {
				const teardown = createTeardown()
				teardown.add(() => rmSync(candidateFile, { force: true }))
				teardown.add(() => stage.destroy())
				await teardown.destroy()
			}
		},
	)

	it('bounds equivalent and caller-named project services', { timeout: 60_000 }, async () => {
		const id = randomUUID()
		const first = `tmp/probe/type-project-first-${id}.json`
		const second = `tmp/probe/type-project-second-${id}.json`
		const firstFile = resolve(ROOT, first)
		const secondFile = resolve(ROOT, second)
		const strict =
			'{"compilerOptions":{"noImplicitAny":true},"files":["../../src/core/index.ts"]}\n'
		const lenient =
			'{"compilerOptions":{"noImplicitAny":false},"files":["../../src/core/index.ts"]}\n'
		mkdirSync(resolve(ROOT, 'tmp/probe'), { recursive: true })
		writeFileSync(firstFile, strict, 'utf8')
		writeFileSync(secondFile, strict, 'utf8')
		const stage = new TypeStage(ROOT)
		const subject = {
			files: [
				{
					path: `tmp/probe/type-project-${id}.ts`,
					text: 'export function identity(value) {\n\treturn value\n}\n',
				},
			],
			test: {
				path: `tmp/probe/type-project-${id}.test.ts`,
				text: "import { test } from 'vitest'\ntest('loads', () => {})\n",
			},
		}
		try {
			const named = await stage.inspect(subject, first)
			for (const project of [
				'configs/src/tsconfig.core.json',
				'./configs/src/tsconfig.core.json',
				'configs/src/../src/tsconfig.core.json',
			]) {
				await stage.inspect(subject, project)
			}
			// A service the stage keeps answers from the settings it was created with, so the
			// rewritten configuration is what distinguishes a retained service from a rebuilt one.
			writeFileSync(firstFile, lenient, 'utf8')
			const retained = await stage.inspect(subject, first)
			await stage.inspect(subject, second)
			const recycled = await stage.inspect(subject, first)
			// Each spelling of one resident project reaches one service and takes no recycled
			// slot, so the first caller-named project survives them.
			expect(named.issues.length).toBeGreaterThan(0)
			expect(retained.issues.length).toBeGreaterThan(0)
			// A second caller-named project takes the one slot the first held, so the stage reads
			// the rewritten configuration and cannot grow past that slot.
			expect(recycled.issues).toStrictEqual([])
		} finally {
			const teardown = createTeardown()
			teardown.add(() => rmSync(secondFile, { force: true }))
			teardown.add(() => rmSync(firstFile, { force: true }))
			teardown.add(() => stage.destroy())
			await teardown.destroy()
		}
	})

	it('abandons an inspection and destroys idempotently', { timeout: 60_000 }, async () => {
		const stage = new TypeStage(ROOT)
		const inspection = stage.inspect({
			files: [{ path: 'src/core/type-destroy.ts', text: "export const VALUE = 'ok'\n" }],
			test: {
				path: 'tests/src/core/type-destroy.test.ts',
				text: "import { test } from 'vitest'\ntest('loads', () => {})\n",
			},
		})
		void inspection.catch(() => {})
		await Promise.all([stage.destroy(), stage.destroy()])
		await expect(inspection).rejects.toThrow('The type stage has been destroyed')
		await expect(stage.destroy()).resolves.toBeUndefined()
	})
})

describe('type stage project resolution', () => {
	it('yields after resolving a caller-named project', async () => {
		const stage = new TypeStage(ROOT)
		let yielded = false
		try {
			const turn = waitForDelay().then(() => {
				yielded = true
			})
			const resolving = stage.resolve('configs/src/tsconfig.core.json')
			await resolving
			expect(yielded).toBe(true)
			await turn
		} finally {
			await stage.destroy()
		}
	})

	it('resolves every spelling of one project to one path and one digest', async () => {
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
	})

	it('moves the digest with the extends chain under a byte-identical project file', async () => {
		const id = randomUUID()
		const directory = `tmp/probe/type-extends-${id}`
		const child = '{"extends":"./base.json","files":["../../../../src/core/index.ts"]}\n'
		const strict = '{"compilerOptions":{"strict":true,"skipLibCheck":true,"types":[]}}\n'
		const lenient = '{"compilerOptions":{"strict":false,"skipLibCheck":true,"types":[]}}\n'
		for (const [name, parent] of [
			['first', strict],
			['second', lenient],
		] as const) {
			mkdirSync(resolve(ROOT, directory, name), { recursive: true })
			writeFileSync(resolve(ROOT, directory, name, 'base.json'), parent, 'utf8')
			writeFileSync(resolve(ROOT, directory, name, 'tsconfig.json'), child, 'utf8')
		}
		const stage = new TypeStage(ROOT)
		try {
			const first = await stage.resolve(`${directory}/first/tsconfig.json`)
			const second = await stage.resolve(`${directory}/second/tsconfig.json`)

			expect(readFileSync(resolve(ROOT, directory, 'first/tsconfig.json'), 'utf8')).toBe(
				readFileSync(resolve(ROOT, directory, 'second/tsconfig.json'), 'utf8'),
			)
			expect(first.digest).not.toBe(second.digest)

			// The preceding pair sits at two paths, and a parsed project carries its own file path, so
			// that inequality alone cannot say the parent moved it. Realign the second parent and
			// read the same path again on a stage holding no parse of it: the project file and its
			// path are fixed, and its parent's `strict` is the only thing that moved.
			writeFileSync(resolve(ROOT, directory, 'second/base.json'), strict, 'utf8')
			const replacement = new TypeStage(ROOT)
			try {
				const realigned = await replacement.resolve(`${directory}/second/tsconfig.json`)
				expect(realigned.path).toBe(second.path)
				expect(realigned.digest).not.toBe(second.digest)
			} finally {
				await replacement.destroy()
			}
		} finally {
			const teardown = createTeardown()
			teardown.add(() => rmSync(resolve(ROOT, directory), { recursive: true, force: true }))
			teardown.add(() => stage.destroy())
			await teardown.destroy()
		}
	})

	it('refuses to resolve a project that escapes the workspace or has been torn down', async () => {
		const stage = new TypeStage(ROOT)
		await expect(stage.resolve('../outside/tsconfig.json')).rejects.toThrow(
			'Path escapes the workspace: ../outside/tsconfig.json',
		)
		await stage.destroy()
		await expect(stage.resolve('configs/src/tsconfig.core.json')).rejects.toThrow(
			'The type stage has been destroyed',
		)
	})

	it('refuses a project whose JSON the compiler cannot parse', { timeout: 60_000 }, async () => {
		const project = 'projects/tsconfig.broken.json'
		const scratch = createScratch({ prefix: 'probe-type-broken-' })
		try {
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":[]},"files":["src/core/value.ts"]}\n',
			)
			scratch.write('src/core/value.ts', 'export const VALUE = 1\n')
			// The colon this project omits is a syntax fault the compiler reports against the project
			// file itself, and a diagnostic naming a file is what makes the compiler compare its own
			// spelling of that file against the path it was handed.
			scratch.write(project, '{"compilerOptions" {"strict":true}}\n')
			const stage = new TypeStage(scratch.path)
			try {
				const failure: unknown = await stage.resolve(project).catch((error: unknown) => error)
				expect(failure).toMatchObject({
					origin: 'workspace',
					code: 'malformed',
					context: { stage: 'type', project },
					message: expect.stringContaining("':' expected."),
				})
				expect(isProbeError(failure)).toBe(true)
				const message = failure instanceof Error ? failure.message : String(failure)
				// A `Debug Failure` is the compiler's own assertion escaping this package's failure
				// contract, and a backslash is this host's directory layout rather than anything the
				// caller named.
				expect(message).not.toContain('Debug Failure')
				expect(message).not.toContain('\\')
			} finally {
				await stage.destroy()
			}
		} finally {
			scratch.destroy()
		}
	})

	it('names the caller-named project in its own diagnostic', { timeout: 60_000 }, async () => {
		const project = 'projects/tsconfig.empty.json'
		const scratch = createScratch({ prefix: 'probe-type-empty-' })
		try {
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":[]},"files":["src/core/value.ts"]}\n',
			)
			scratch.write('src/core/value.ts', 'export const VALUE = 1\n')
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
				const message = failure instanceof Error ? failure.message : String(failure)
				// The workspace-relative spelling is a substring of the absolute one, so the preceding
				// assertion passes for an untranslated message too. This is what separates them.
				expect(message).not.toContain(normalizePath(scratch.path))
				expect(message).not.toContain('\\')
			} finally {
				await stage.destroy()
			}
		} finally {
			scratch.destroy()
		}
	})
})
