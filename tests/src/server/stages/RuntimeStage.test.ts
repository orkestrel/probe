import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RuntimeStage } from '@src/server'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

describe('runtime stage', () => {
	it(
		'reports a failing expectation and accepts a passing expectation',
		{ timeout: 60_000 },
		async () => {
			const stage = new RuntimeStage(ROOT)
			try {
				const passing = await stage.inspect({
					files: [],
					test: {
						path: 'tmp/probe/runtime-passing.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
					},
				})
				const failing = await stage.inspect({
					files: [],
					test: {
						path: 'tmp/probe/runtime-failing.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('fails', () => expect(2 + 2).toBe(5))\n",
					},
				})
				expect(passing.findings).toStrictEqual([])
				expect(failing.findings.length).toBeGreaterThan(0)
				expect(failing.findings[0]?.path).toBe('tmp/probe/runtime-failing.test.ts')
			} finally {
				await stage.destroy()
			}
		},
	)

	it('reports a finding when a test module executes nothing', { timeout: 60_000 }, async () => {
		const stage = new RuntimeStage(ROOT)
		try {
			const check = await stage.inspect({
				files: [],
				test: {
					path: 'tmp/probe/runtime-skipped.test.ts',
					text: "import { describe, expect, test } from 'vitest'\ntest.skip('skips', () => expect(1).toBe(2))\ntest.todo('defers')\ndescribe.skip('group', () => { test('skips with its group', () => expect(1).toBe(2)) })\n",
				},
			})
			expect(check.findings).toStrictEqual([
				{ path: 'tmp/probe/runtime-skipped.test.ts', message: 'Vitest ran no tests in the module' },
			])
		} finally {
			await stage.destroy()
		}
	})

	it(
		'changes its verdict after an imported dependency changes on disk',
		{ timeout: 60_000 },
		async () => {
			const id = randomUUID()
			const dependency = resolve(ROOT, `tmp/probe/runtime-dependency-${id}.ts`)
			mkdirSync(resolve(ROOT, 'tmp/probe'), { recursive: true })
			writeFileSync(dependency, "export const SIGNAL = 'before'\n", 'utf8')
			const stage = new RuntimeStage(ROOT)
			const subject = {
				files: [],
				test: {
					path: `tmp/probe/runtime-case-${id}.test.ts`,
					text: `import { SIGNAL } from './runtime-dependency-${id}.js'\nimport { expect, test } from 'vitest'\ntest('reads the dependency', () => expect(SIGNAL).toBe('before'))\n`,
				},
			}
			try {
				const before = await stage.inspect(subject)
				writeFileSync(dependency, "export const SIGNAL = 'after'\n", 'utf8')
				const after = await stage.inspect(subject)
				expect(before.findings).toStrictEqual([])
				expect(after.findings.length).toBeGreaterThan(0)
			} finally {
				await stage.destroy()
				rmSync(dependency, { force: true })
			}
		},
	)

	it(
		'reports a finding for a test path outside every real Vitest project',
		{ timeout: 60_000 },
		async () => {
			const stage = new RuntimeStage(ROOT)
			try {
				const check = await stage.inspect({
					files: [],
					test: {
						path: 'tests/unmapped.test.ts',
						text: "import { test } from 'vitest'\ntest('unmapped', () => {})\n",
					},
				})
				expect(check.findings).toStrictEqual([
					{
						path: 'tests/unmapped.test.ts',
						message: 'Vitest ran no tests because no configured project matches the test path',
					},
				])
			} finally {
				await stage.destroy()
			}
		},
	)

	it(
		'evicts every generated specification from resident and disk caches',
		{ timeout: 60_000 },
		async () => {
			const id = randomUUID()
			const path = `tmp/probe/runtime-retention-${id}.test.ts`
			const marker = `runtime-retention-${id}`
			const stage = new RuntimeStage(ROOT)
			try {
				for (let index = 1; index <= 15; index += 1) {
					const text =
						index === 15
							? "import { describe, expect, test } from 'vitest'\ndescribe('first', () => { test('a', () => expect(1).toBe(1)); test('b', () => expect(2).toBe(2)) })\ndescribe('second', () => { test('c', () => expect(3).toBe(3)) })\n"
							: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n"
					await expect(stage.inspect({ files: [], test: { path, text } })).resolves.toMatchObject({
						findings: [],
					})
				}
				const caches = readdirSync(resolve(ROOT, 'node_modules/.vite'), {
					recursive: true,
					encoding: 'utf8',
				}).filter((file) => file.endsWith('results.json'))
				const retained = caches.filter((file) =>
					readFileSync(resolve(ROOT, 'node_modules/.vite', file), 'utf8').includes(marker),
				)
				expect(retained).toStrictEqual([])
				expect(
					readdirSync(resolve(ROOT, 'tmp/probe')).filter((file) => file.includes(marker)),
				).toStrictEqual([])
			} finally {
				await stage.destroy()
			}
		},
	)

	it('abandons an inspection and destroys idempotently', { timeout: 60_000 }, async () => {
		const stage = new RuntimeStage(ROOT)
		const inspection = stage.inspect({
			files: [],
			test: {
				path: 'tmp/probe/runtime-destroy.test.ts',
				text: "import { test } from 'vitest'\ntest('waits', () => {})\n",
			},
		})
		void inspection.catch(() => {})
		await Promise.all([stage.destroy(), stage.destroy()])
		await expect(inspection).rejects.toThrow('The runtime stage has been destroyed')
		await expect(stage.destroy()).resolves.toBeUndefined()
	})
})
