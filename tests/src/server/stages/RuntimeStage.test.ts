import type { Check, Verdict } from '@src/core'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { waitForDelay } from '@orkestrel/test'
import { createScratch } from '@orkestrel/test/server'
import { computeReceipt } from '@src/core'
import { RuntimeStage } from '@src/server'
import { describe, expect, it } from 'vitest'
import { createVitest } from 'vitest/node'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

describe('runtime stage', () => {
	it('reports a missing workspace runner during construction', () => {
		const scratch = createScratch({ prefix: 'probe-runtime-resolution-' })
		try {
			scratch.write('package.json', '{"name":"probe-runtime-resolution","private":true}\n')
			expect(() => new RuntimeStage(scratch.path)).toThrow("Cannot find module 'vitest/node'")
		} finally {
			scratch.destroy()
		}
	})

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
				expect(failing.findings[0]).toMatchObject({
					origin: 'code',
					path: 'tmp/probe/runtime-failing.test.ts',
				})
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
				{
					origin: 'instrument',
					path: 'tmp/probe/runtime-skipped.test.ts',
					message: 'Vitest ran no tests in the module',
				},
			])
		} finally {
			await stage.destroy()
		}
	})

	it('reports a test that skips itself during execution', { timeout: 60_000 }, async () => {
		const stage = new RuntimeStage(ROOT)
		try {
			const check = await stage.inspect({
				files: [],
				test: {
					path: 'tmp/probe/runtime-context-skip.test.ts',
					text: "import { test } from 'vitest'\ntest('skips', (context) => { context.skip(); throw new Error('never reached') })\n",
				},
			})
			const control = await stage.inspect({
				files: [],
				test: {
					path: 'tmp/probe/runtime-context-skip-control.test.ts',
					text: "import { expect, test } from 'vitest'\ntest('fails', () => expect(1).toBe(2))\n",
				},
			})
			expect(check.findings).toStrictEqual([
				{
					origin: 'instrument',
					path: 'tmp/probe/runtime-context-skip.test.ts',
					message: 'Vitest did not run the test (skips)',
				},
			])
			const clean: readonly Check[] = [
				{ stage: 'type', elapsed: 0, findings: [] },
				{ stage: 'lint', elapsed: 0, findings: [] },
			]
			const verdict: Verdict = {
				id: 'context-skip',
				toolchain: { typescript: 'test', oxlint: 'test', vitest: 'test' },
				checks: [...clean, check],
				control: [control],
				elapsed: 0,
			}
			// Every other condition a receipt needs holds here, so the assertion turns on the skip
			// finding alone: remove it and the same verdict earns one.
			expect(computeReceipt(verdict, 'runtime')).toBeUndefined()
			expect(
				computeReceipt({ ...verdict, checks: [...clean, { ...check, findings: [] }] }, 'runtime'),
			).toBe('probe:context-skip:runtime:typescript@test:oxlint@test:vitest@test')
		} finally {
			await stage.destroy()
		}
	})

	it(
		'issues a receipt only for a control whose own code failed at the declared stage',
		{ timeout: 60_000 },
		async () => {
			const stage = new RuntimeStage(ROOT)
			try {
				const skipped = await stage.inspect({
					files: [],
					test: {
						path: 'tmp/probe/runtime-receipt-skipped.test.ts',
						text: "import { test } from 'vitest'\ntest('skips', (context) => { context.skip(); throw new Error('never reached') })\n",
					},
				})
				const failed = await stage.inspect({
					files: [],
					test: {
						path: 'tmp/probe/runtime-receipt-failed.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('fails', () => expect(2 + 2).toBe(5))\n",
					},
				})
				const passed = await stage.inspect({
					files: [],
					test: {
						path: 'tmp/probe/runtime-receipt-passed.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
					},
				})
				const base: Verdict = {
					id: 'receipt-origin',
					toolchain: { typescript: 'test', oxlint: 'test', vitest: 'test' },
					checks: [
						{ stage: 'type', elapsed: 0, findings: [] },
						{ stage: 'lint', elapsed: 0, findings: [] },
						passed,
					],
					control: [failed],
					elapsed: 0,
				}
				const token = 'probe:receipt-origin:runtime:typescript@test:oxlint@test:vitest@test'

				// The stage marks a test it never ran as its own fault and a failed expectation as
				// the candidate's, which is what the three outcomes below are read from.
				expect(skipped.findings).toStrictEqual([
					{
						origin: 'instrument',
						path: 'tmp/probe/runtime-receipt-skipped.test.ts',
						message: 'Vitest did not run the test (skips)',
					},
				])
				expect(failed.findings[0]?.origin).toBe('code')
				expect(passed.findings).toStrictEqual([])

				// The three controls reach this assertion through the real stage and differ only in
				// what it reported about them, so each verdict turns on that report alone.
				expect(computeReceipt({ ...base, control: [skipped] }, 'runtime')).toBeUndefined()
				expect(computeReceipt(base, 'runtime')).toBe(token)
				expect(computeReceipt({ ...base, control: [passed] }, 'runtime')).toBeUndefined()
			} finally {
				await stage.destroy()
			}
		},
	)

	it('reports an empty module when its project permits no tests', { timeout: 60_000 }, async () => {
		const scratch = createScratch()
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write(
			'vite.config.ts',
			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'], passWithNoTests: true } }] } })\n",
		)
		scratch.write('tmp/probe/.keep', '')
		const stage = new RuntimeStage(scratch.path)
		try {
			const check = await stage.inspect({
				files: [],
				test: { path: 'tmp/probe/empty.test.ts', text: '' },
			})
			expect(check.findings).toStrictEqual([
				{
					origin: 'instrument',
					path: 'tmp/probe/empty.test.ts',
					message: 'Vitest ran no tests in the module',
				},
			])
		} finally {
			await stage.destroy()
			scratch.destroy()
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
		'runs a directly imported candidate without changing its disk file',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch()
			const disk = "export const VALUE = 'disk'\n"
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'vite.config.ts',
				"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
			)
			scratch.write('src/value.ts', disk)
			scratch.write('tmp/probe/.keep', '')
			expect(scratch.read('src/value.ts')).toBe(disk)
			const stage = new RuntimeStage(scratch.path)
			try {
				const candidate = await stage.inspect({
					files: [{ path: 'src/value.ts', text: "export const VALUE = 'candidate'\n" }],
					test: {
						path: 'tmp/probe/direct.test.ts',
						text: "import { VALUE } from '../../src/value.js'\nimport { expect, test } from 'vitest'\ntest('reads the candidate', () => expect(VALUE).toBe('candidate'))\n",
					},
				})
				const restored = await stage.inspect({
					files: [],
					test: {
						path: 'tmp/probe/restored.test.ts',
						text: "import { VALUE } from '../../src/value.js'\nimport { expect, test } from 'vitest'\ntest('reads disk', () => expect(VALUE).toBe('disk'))\n",
					},
				})
				expect(candidate.findings).toStrictEqual([])
				expect(restored.findings).toStrictEqual([])
				expect(scratch.read('src/value.ts')).toBe(disk)
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it('instruments a function-declared project', { timeout: 60_000 }, async () => {
		const scratch = createScratch()
		const disk = "export const VALUE = 'disk'\n"
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write(
			'vite.config.ts',
			"import { defineConfig } from 'vitest/config'\nconst probe = () => ({ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } })\nexport default defineConfig({ test: { projects: [probe] } })\n",
		)
		scratch.write('src/value.ts', disk)
		scratch.write('tmp/probe/.keep', '')
		const stage = new RuntimeStage(scratch.path)
		try {
			const check = await stage.inspect({
				files: [{ path: 'src/value.ts', text: "export const VALUE = 'candidate'\n" }],
				test: {
					path: 'tmp/probe/function.test.ts',
					text: "import { VALUE } from '../../src/value.js'\nimport { expect, test } from 'vitest'\ntest('reads the candidate', () => expect(VALUE).toBe('candidate'))\n",
				},
			})
			expect(check.findings).toStrictEqual([])
			expect(scratch.read('src/value.ts')).toBe(disk)
		} finally {
			await stage.destroy()
			scratch.destroy()
		}
	})

	it('refuses a string-declared project without an overlay', { timeout: 60_000 }, async () => {
		const scratch = createScratch()
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write(
			'vite.config.ts',
			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: ['./vitest.probe.config.ts'] } })\n",
		)
		scratch.write(
			'vitest.probe.config.ts',
			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } })\n",
		)
		scratch.write('src/value.ts', "export const VALUE = 'disk'\n")
		scratch.write('tmp/probe/.keep', '')
		const stage = new RuntimeStage(scratch.path)
		try {
			const check = await stage.inspect({
				files: [{ path: 'src/value.ts', text: "export const VALUE = 'candidate'\n" }],
				test: {
					path: 'tmp/probe/string.test.ts',
					text: "import { VALUE } from '../../src/value.js'\nimport { expect, test } from 'vitest'\ntest('reads the candidate', () => expect(VALUE).toBe('candidate'))\n",
				},
			})
			expect(check.findings).toStrictEqual([
				{
					origin: 'instrument',
					path: 'tmp/probe/string.test.ts',
					message:
						'The runtime stage cannot instrument the string-declared Vitest project probe because its configuration carries no runtime overlay plugin',
				},
			])
		} finally {
			await stage.destroy()
			scratch.destroy()
		}
	})

	it(
		'preserves transform selectors while serving versioned candidates',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch()
			const disk = "export const VALUE = 'disk'\n"
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'vite.config.ts',
				"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
			)
			scratch.write('src/value.ts', disk)
			scratch.write('tmp/probe/.keep', '')
			const stage = new RuntimeStage(scratch.path)
			try {
				const check = await stage.inspect({
					files: [{ path: 'src/value.ts', text: "export const VALUE = 'candidate'\n" }],
					test: {
						path: 'tmp/probe/query.test.ts',
						text: "import RAW from '../../src/value.ts?raw'\nimport { VALUE } from '../../src/value.ts?v=123'\nimport { expect, test } from 'vitest'\ntest('preserves query semantics', () => { expect(RAW).toBe(\"export const VALUE = 'disk'\\n\"); expect(VALUE).toBe('candidate') })\n",
					},
				})
				expect(check.findings).toStrictEqual([])
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it('runs a candidate imported through a barrel', { timeout: 60_000 }, async () => {
		const scratch = createScratch()
		const disk = "export const VALUE = 'disk'\n"
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write(
			'vite.config.ts',
			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
		)
		scratch.write('src/value.ts', disk)
		scratch.write('src/index.ts', "export { VALUE } from './value.js'\n")
		scratch.write('tmp/probe/.keep', '')
		expect(scratch.read('src/value.ts')).toBe(disk)
		const stage = new RuntimeStage(scratch.path)
		try {
			const check = await stage.inspect({
				files: [{ path: 'src/value.ts', text: "export const VALUE = 'candidate'\n" }],
				test: {
					path: 'tmp/probe/barrel.test.ts',
					text: "import { VALUE } from '../../src/index.js'\nimport { expect, test } from 'vitest'\ntest('reads the candidate through the barrel', () => expect(VALUE).toBe('candidate'))\n",
				},
			})
			expect(check.findings).toStrictEqual([])
			expect(scratch.read('src/value.ts')).toBe(disk)
		} finally {
			await stage.destroy()
			scratch.destroy()
		}
	})

	it('runs each candidate revision for one resident path', { timeout: 60_000 }, async () => {
		const scratch = createScratch()
		const disk = "export const VALUE = 'disk'\n"
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write(
			'vite.config.ts',
			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
		)
		scratch.write('src/value.ts', disk)
		scratch.write('tmp/probe/.keep', '')
		expect(scratch.read('src/value.ts')).toBe(disk)
		const stage = new RuntimeStage(scratch.path)
		try {
			const first = await stage.inspect({
				files: [{ path: 'src/value.ts', text: "export const VALUE = 'first'\n" }],
				test: {
					path: 'tmp/probe/revision.test.ts',
					text: "import { VALUE } from '../../src/value.js'\nimport { expect, test } from 'vitest'\ntest('reads the first revision', () => expect(VALUE).toBe('first'))\n",
				},
			})
			const second = await stage.inspect({
				files: [{ path: 'src/value.ts', text: "export const VALUE = 'second'\n" }],
				test: {
					path: 'tmp/probe/revision.test.ts',
					text: "import { VALUE } from '../../src/value.js'\nimport { expect, test } from 'vitest'\ntest('reads the second revision', () => expect(VALUE).toBe('second'))\n",
				},
			})
			expect(first.findings).toStrictEqual([])
			expect(second.findings).toStrictEqual([])
			expect(scratch.read('src/value.ts')).toBe(disk)
		} finally {
			await stage.destroy()
			scratch.destroy()
		}
	})

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
						origin: 'instrument',
						path: 'tests/unmapped.test.ts',
						message: 'The runtime stage found no configured Vitest project matching the test path',
					},
				])
			} finally {
				await stage.destroy()
			}
		},
	)

	it('distinguishes a missing configured project', { timeout: 60_000 }, async () => {
		const scratch = createScratch()
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write(
			'vite.config.ts',
			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'other', include: ['tests/**/*.test.ts'] } }] } })\n",
		)
		scratch.write('tmp/probe/.keep', '')
		const stage = new RuntimeStage(scratch.path)
		try {
			const check = await stage.inspect({
				files: [],
				test: {
					path: 'tmp/probe/missing-project.test.ts',
					text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
				},
			})
			expect(check.findings).toStrictEqual([
				{
					origin: 'instrument',
					path: 'tmp/probe/missing-project.test.ts',
					message: 'The runtime stage found no configured Vitest project named probe',
				},
			])
		} finally {
			await stage.destroy()
			scratch.destroy()
		}
	})

	it(
		'gives a fresh Vitest generation the resident map sizes the first one had',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch()
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'vite.config.ts',
				"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
			)
			scratch.write('tmp/probe/.keep', '')
			const samples: Array<{ readonly unresolved: number; readonly files: number }> = []
			try {
				for (let generation = 1; generation <= 2; generation += 1) {
					const output = new PassThrough()
					output.resume()
					const vitest = await createVitest(
						'test',
						{
							root: scratch.path,
							config: resolve(scratch.path, 'vite.config.ts'),
							watch: false,
							run: true,
							pool: 'threads',
							reporters: [
								{
									onInit() {},
									onTestRunEnd() {},
								},
							],
						},
						undefined,
						{ stdout: output, stderr: output },
					)
					const project = vitest.projects.find((candidate) => candidate.name === 'probe')
					if (project === undefined) throw new Error('The probe project did not load')
					const file = resolve(scratch.path, `tmp/probe/map-${generation}.test.ts`)
					writeFileSync(
						file,
						"import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
						'utf8',
					)
					try {
						const specification = project.createSpecification(file, undefined, 'threads')
						const result = await vitest.runTestSpecifications([specification], false)
						expect(result.testModules[0]?.state()).toBe('passed')
						let unresolved = 0
						let files = 0
						for (const candidate of vitest.projects) {
							for (const environment of Object.values(candidate.vite.environments)) {
								const graph = environment.moduleGraph
								const retained: unknown = Reflect.get(graph, '_unresolvedUrlToModuleMap')
								if (!(retained instanceof Map)) {
									throw new Error('Vite exposes no unresolved-url map')
								}
								unresolved += retained.size
								graph.onFileDelete(file)
								graph.fileToModulesMap.delete(file)
								files += graph.fileToModulesMap.size
							}
						}
						samples.push({ unresolved, files })
					} finally {
						rmSync(file, { force: true })
						await vitest.close()
					}
				}
				expect(samples[1]?.unresolved).toBe(samples[0]?.unresolved)
				expect(samples[1]?.files).toBe(samples[0]?.files)
			} finally {
				scratch.destroy()
			}
		},
	)

	it(
		'recycles the resident runner after 64 written specifications and evicts disk caches',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch()
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'vite.config.ts',
				"import { appendFileSync } from 'node:fs'\nimport { fileURLToPath } from 'node:url'\nimport { defineConfig } from 'vitest/config'\nappendFileSync(fileURLToPath(new URL('runtime-warms.txt', import.meta.url)), 'warm\\n')\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
			)
			scratch.write('tmp/probe/.keep', '')
			const id = randomUUID()
			const path = `tmp/probe/runtime-retention-${id}.test.ts`
			const marker = `runtime-retention-${id}`
			const stage = new RuntimeStage(scratch.path)
			try {
				// An inspection that matches no project writes no specification, so it retains no URL
				// and must not advance the bound. Leading with one moves the replacement a call
				// earlier whenever the bound counts inspections instead.
				await expect(
					stage.inspect({
						files: [],
						test: {
							path: 'tests/unmapped.test.ts',
							text: "import { test } from 'vitest'\ntest('unmapped', () => {})\n",
						},
					}),
				).resolves.toMatchObject({
					findings: [
						{
							origin: 'instrument',
							path: 'tests/unmapped.test.ts',
							message:
								'The runtime stage found no configured Vitest project matching the test path',
						},
					],
				})
				for (let index = 1; index <= 64; index += 1) {
					const text = `import { expect, test } from 'vitest'\ntest('passes ${marker}-${index}', () => expect(1).toBe(1))\n`
					await expect(stage.inspect({ files: [], test: { path, text } })).resolves.toMatchObject({
						findings: [],
					})
				}
				expect(scratch.read('runtime-warms.txt')?.trim().split('\n')).toStrictEqual(['warm'])
				const last = `import { expect, test } from 'vitest'\ntest('passes ${marker}-65', () => expect(1).toBe(1))\n`
				await expect(
					stage.inspect({ files: [], test: { path, text: last } }),
				).resolves.toMatchObject({ findings: [] })
				expect(scratch.read('runtime-warms.txt')?.trim().split('\n')).toStrictEqual([
					'warm',
					'warm',
				])
				const caches = readdirSync(resolve(scratch.path, 'node_modules/.vite'), {
					recursive: true,
					encoding: 'utf8',
				}).filter((file) => file.endsWith('results.json'))
				const retained = caches.filter((file) =>
					readFileSync(resolve(scratch.path, 'node_modules/.vite', file), 'utf8').includes(marker),
				)
				expect(retained).toStrictEqual([])
				expect(
					readdirSync(resolve(scratch.path, 'tmp/probe')).filter((file) => file.includes(marker)),
				).toStrictEqual([])
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it(
		'reports a cleanup failure without rejecting the inspection',
		{ timeout: 60_000 },
		async () => {
			const id = randomUUID()
			const marker = `runtime-cleanup-${id}`
			const stage = new RuntimeStage(ROOT)
			try {
				const check = await stage.inspect({
					files: [],
					test: {
						path: `tmp/probe/${marker}.test.ts`,
						text: "import { mkdirSync, rmSync } from 'node:fs'\nimport { fileURLToPath } from 'node:url'\nimport { test } from 'vitest'\ntest('blocks deletion', () => { const file = fileURLToPath(import.meta.url); rmSync(file); mkdirSync(file) })\n",
					},
				})
				expect(check.findings).toHaveLength(1)
				expect(check.findings[0]?.origin).toBe('instrument')
				// The generated specification is the file that could not be deleted. The caller's
				// own path names a file the caller wrote and this stage never touched.
				expect(check.findings[0]?.path).toMatch(
					new RegExp(`^tmp/probe/${marker}\\.test\\.probe-[0-9a-f-]+\\.ts$`),
				)
				expect(check.findings[0]?.message).toContain(
					'The runtime stage could not delete the generated specification',
				)
			} finally {
				await stage.destroy()
				// A fresh clone has no `tmp/probe`, and an unguarded read throws there and replaces
				// whatever the inspection actually reported.
				const directory = resolve(ROOT, 'tmp/probe')
				if (existsSync(directory)) {
					for (const file of readdirSync(directory)) {
						if (file.includes(marker)) {
							rmSync(resolve(directory, file), { force: true, recursive: true })
						}
					}
				}
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

	it(
		'continues teardown when a generated specification cannot be unlinked',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch()
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'vite.config.ts',
				"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
			)
			scratch.write('tmp/probe/.keep', '')
			const stage = new RuntimeStage(scratch.path)
			const inspection = stage.inspect({
				files: [{ path: 'src/value.ts', text: "export const VALUE = 'candidate'\n" }],
				test: {
					path: 'tmp/probe/unlink.test.ts',
					text: "import { mkdirSync, rmSync, writeFileSync } from 'node:fs'\nimport { fileURLToPath } from 'node:url'\nimport { test } from 'vitest'\ntest('blocks teardown', async () => { const file = fileURLToPath(import.meta.url); rmSync(file); mkdirSync(file); writeFileSync(new URL('unlink-ready', import.meta.url), ''); await new Promise(() => {}) })\n",
				},
			})
			void inspection.catch(() => {})
			try {
				for (
					let attempt = 0;
					attempt < 500 && !existsSync(resolve(scratch.path, 'tmp/probe/unlink-ready'));
					attempt += 1
				) {
					await waitForDelay(10)
				}
				expect(existsSync(resolve(scratch.path, 'tmp/probe/unlink-ready'))).toBe(true)
				await expect(stage.destroy()).resolves.toBeUndefined()
			} finally {
				await stage.destroy().catch(() => {})
				await inspection.catch(() => {})
				scratch.destroy()
			}
		},
	)
})
