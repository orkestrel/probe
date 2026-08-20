import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { waitForDelay } from '@orkestrel/test'
import { createScratch } from '@orkestrel/test/server'
import { TypeStage } from '@src/server'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

describe('type stage', () => {
	it('reports a missing workspace compiler during construction', () => {
		const scratch = createScratch({ prefix: 'probe-type-resolution-' })
		try {
			scratch.write('package.json', '{"name":"probe-type-resolution","private":true}\n')
			expect(() => new TypeStage(scratch.path)).toThrow("Cannot find module 'typescript'")
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
			expect(clean.findings).toStrictEqual([])
			expect(broken.findings.length).toBeGreaterThan(0)
			expect(broken.findings).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ origin: 'code', path: 'src/core/type-stage.ts' }),
				]),
			)
			// A compiler diagnostic about the candidate is the candidate's fault, so every finding
			// this stage returns for one carries the origin that can disprove a claim.
			expect(broken.findings.every((finding) => finding.origin === 'code')).toBe(true)
		} finally {
			await stage.destroy()
		}
	})

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
				expect(before.findings).toStrictEqual([])
				expect(after.findings.length).toBeGreaterThan(0)
			} finally {
				await stage.destroy()
				rmSync(dependencyFile, { force: true })
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
				expect(named.findings).toStrictEqual([])
				expect(inferred.findings.length).toBeGreaterThan(0)
				expect(inferred.findings[0]?.path).toBe('src/core/project-choice.ts')
			} finally {
				await stage.destroy()
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
				expect(indirect.findings).toStrictEqual(direct.findings)
				expect(direct.findings).toStrictEqual([])
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
			expect(check.findings).toStrictEqual([])
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
			expect(check.findings).toStrictEqual([])
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
				expect(check.findings).toStrictEqual([])
				expect(readFileSync(candidateFile, 'utf8')).toBe(disk)
			} finally {
				await stage.destroy()
				rmSync(candidateFile, { force: true })
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
				expect(later.findings).toStrictEqual([])
			} finally {
				await stage.destroy()
				rmSync(testFile, { force: true })
				rmSync(firstFile, { force: true })
				rmSync(secondFile, { force: true })
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
				expect(overlaid.findings).toStrictEqual([])
				expect(released.findings).toStrictEqual([])
				await stage.destroy()
				await expect(stage.inspect(subject)).rejects.toThrow('The type stage has been destroyed')
			} finally {
				await stage.destroy()
				rmSync(candidateFile, { force: true })
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
			expect(named.findings.length).toBeGreaterThan(0)
			expect(retained.findings.length).toBeGreaterThan(0)
			// A second caller-named project takes the one slot the first held, so the stage reads
			// the rewritten configuration and cannot grow past that slot.
			expect(recycled.findings).toStrictEqual([])
		} finally {
			await stage.destroy()
			rmSync(firstFile, { force: true })
			rmSync(secondFile, { force: true })
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
	it('resolves every spelling of one project to one path and one digest', async () => {
		const stage = new TypeStage(ROOT)
		try {
			const declared = await stage.resolve('configs/src/tsconfig.core.json')
			const spelled = await stage.resolve('./configs/src/../src/tsconfig.core.json')
			const root = await stage.resolve('tsconfig.json')

			expect(declared.path).toBe('configs/src/tsconfig.core.json')
			expect(declared.digest).toMatch(/^[0-9a-f]{32}$/)
			expect(spelled).toStrictEqual(declared)
			// Without this the pair above passes for a digest that reads nothing at all, because
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

			// The pair above sits at two paths, and a parsed project carries its own file path, so
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
			await stage.destroy()
			rmSync(resolve(ROOT, directory), { recursive: true, force: true })
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
})
