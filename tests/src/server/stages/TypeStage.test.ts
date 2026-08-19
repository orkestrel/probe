import { Session } from 'node:inspector/promises'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isRecord } from '@orkestrel/contract'
import { waitForDelay } from '@orkestrel/test'
import { TypeStage } from '@src/server'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

describe('type stage', () => {
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

	it('releases candidate versions after every inspection', { timeout: 60_000 }, async () => {
		const id = randomUUID()
		const stage = new TypeStage(ROOT)
		const session = new Session()
		try {
			for (const sequence of [1, 2, 3]) {
				await stage.inspect({
					files: [
						{
							path: `src/core/version-release-${id}-${sequence}.ts`,
							text: `export const VALUE = ${sequence}\n`,
						},
					],
					test: {
						path: `tests/src/core/version-release-${id}-${sequence}.test.ts`,
						text: "import { test } from 'vitest'\ntest('loads', () => {})\n",
					},
				})
			}
			Reflect.set(globalThis, '__probeTypeStage', stage)
			session.connect()
			await session.post('Runtime.enable')
			const evaluated = await session.post('Runtime.evaluate', {
				expression: 'globalThis.__probeTypeStage',
			})
			const stageId = evaluated.result.objectId
			if (stageId === undefined) throw new Error('The debugger did not expose the type stage')
			const properties: unknown = await session.post('Runtime.getProperties', {
				objectId: stageId,
				ownProperties: true,
			})
			if (!isRecord(properties) || !Array.isArray(properties.privateProperties)) {
				throw new Error('The debugger did not expose private properties')
			}
			const versions = properties.privateProperties.find(
				(property: unknown) => isRecord(property) && property.name === '#versions',
			)
			if (!isRecord(versions) || !isRecord(versions.value)) {
				throw new Error('The debugger did not expose the type stage version map')
			}
			const versionsId = versions.value.objectId
			if (typeof versionsId !== 'string') {
				throw new Error('The debugger exposed an invalid version map identity')
			}
			const size = await session.post('Runtime.callFunctionOn', {
				objectId: versionsId,
				functionDeclaration: 'function () { return this.size }',
				returnByValue: true,
			})
			expect(size.result.value).toBe(0)
		} finally {
			session.disconnect()
			Reflect.deleteProperty(globalThis, '__probeTypeStage')
			await stage.destroy()
		}
	})

	it('bounds equivalent and caller-named project services', { timeout: 60_000 }, async () => {
		const id = randomUUID()
		const firstProject = `tmp/probe/type-project-first-${id}.json`
		const secondProject = `tmp/probe/type-project-second-${id}.json`
		mkdirSync(resolve(ROOT, 'tmp/probe'), { recursive: true })
		writeFileSync(
			resolve(ROOT, firstProject),
			'{"compilerOptions":{"strict":true},"files":["../../src/core/index.ts"]}\n',
		)
		writeFileSync(
			resolve(ROOT, secondProject),
			'{"compilerOptions":{"strict":true},"files":["../../src/core/index.ts"]}\n',
		)
		const stage = new TypeStage(ROOT)
		const session = new Session()
		const subject = {
			files: [{ path: 'src/core/cache-choice.ts', text: "export const VALUE = 'ok'\n" }],
			test: {
				path: 'tests/src/core/cache-choice.test.ts',
				text: "import { test } from 'vitest'\ntest('loads', () => {})\n",
			},
		}
		try {
			for (const project of [
				'configs/src/tsconfig.core.json',
				'./configs/src/tsconfig.core.json',
				'configs/src/../src/tsconfig.core.json',
			]) {
				await stage.inspect(subject, project)
			}
			Reflect.set(globalThis, '__probeTypeStage', stage)
			session.connect()
			await session.post('Runtime.enable')
			const evaluated = await session.post('Runtime.evaluate', {
				expression: 'globalThis.__probeTypeStage',
			})
			const stageId = evaluated.result.objectId
			if (stageId === undefined) throw new Error('The debugger did not expose the type stage')
			const properties: unknown = await session.post('Runtime.getProperties', {
				objectId: stageId,
				ownProperties: true,
			})
			if (!isRecord(properties) || !Array.isArray(properties.privateProperties)) {
				throw new Error('The debugger did not expose private properties')
			}
			const services = properties.privateProperties.find(
				(property: unknown) => isRecord(property) && property.name === '#services',
			)
			const residentProperty = properties.privateProperties.find(
				(property: unknown) => isRecord(property) && property.name === '#resident',
			)
			if (!isRecord(services) || !isRecord(services.value)) {
				throw new Error('The debugger did not expose the type stage service map')
			}
			if (!isRecord(residentProperty) || !isRecord(residentProperty.value)) {
				throw new Error('The debugger did not expose the type stage resident set')
			}
			const servicesId = services.value.objectId
			const residentId = residentProperty.value.objectId
			if (servicesId === undefined || residentId === undefined) {
				throw new Error('The debugger did not expose the type stage service collections')
			}
			if (typeof servicesId !== 'string' || typeof residentId !== 'string') {
				throw new Error('The debugger exposed invalid service collection identities')
			}
			const resident = await session.post('Runtime.callFunctionOn', {
				objectId: residentId,
				functionDeclaration: 'function () { return this.size }',
				returnByValue: true,
			})
			const equivalent = await session.post('Runtime.callFunctionOn', {
				objectId: servicesId,
				functionDeclaration: 'function () { return this.size }',
				returnByValue: true,
			})
			if (typeof resident.result.value !== 'number') {
				throw new Error('The debugger did not report the resident service count')
			}
			expect(equivalent.result.value).toBe(resident.result.value)
			await stage.inspect(subject, firstProject)
			await stage.inspect(subject, secondProject)
			const bounded = await session.post('Runtime.callFunctionOn', {
				objectId: servicesId,
				functionDeclaration: 'function () { return this.size }',
				returnByValue: true,
			})
			expect(bounded.result.value).toBe(resident.result.value + 1)
		} finally {
			session.disconnect()
			Reflect.deleteProperty(globalThis, '__probeTypeStage')
			await stage.destroy()
			rmSync(resolve(ROOT, firstProject), { force: true })
			rmSync(resolve(ROOT, secondProject), { force: true })
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
