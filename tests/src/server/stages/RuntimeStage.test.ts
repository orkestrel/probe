import type { Check, Verdict } from '@src/core'
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { open } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { captureError, waitForDelay } from '@orkestrel/test'
import { createScratch } from '@orkestrel/test/server'
import { computeReceipt, formatSpecification, isProbeError } from '@src/core'
import { RuntimeStage, createRevisionFile } from '@src/server'
import { describe, expect, it } from 'vitest'
import { createVitest } from 'vitest/node'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

describe('runtime stage', () => {
	// The revision marker lands between the stem and the extension, so a specification generated
	// from a `.test.ts` path is not itself a `.test.ts` file. Every project's include pattern ends
	// at that suffix, which is what keeps an abandoned specification out of every suite while
	// leaving it in the tree the type and lint gates read.
	it('writes a generated specification no Vitest project collects', () => {
		const file = createRevisionFile(
			ROOT,
			'tmp/probe/greeting.test.ts',
			`${process.pid}-${randomUUID()}`,
		)
		const name = relative(ROOT, file).replaceAll('\\', '/')
		expect(name.startsWith('tmp/probe/greeting.test.probe-')).toBe(true)
		expect(name.endsWith('.test.ts')).toBe(false)
		const config = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf8')
		const includes = [...config.matchAll(/include: \['([^']+)'\]/g)].map((match) => match[1] ?? '')
		expect(includes.length).toBeGreaterThan(0)
		for (const include of includes) expect(include.endsWith('.test.ts')).toBe(true)
	})

	it('reports a missing workspace runner during construction', () => {
		const scratch = createScratch({ prefix: 'probe-runtime-resolution-' })
		try {
			scratch.write('package.json', '{"name":"probe-runtime-resolution","private":true}\n')
			const error = captureError(() => new RuntimeStage(scratch.path))
			expect(isProbeError(error)).toBe(true)
			expect(error).toMatchObject({
				origin: 'workspace',
				code: 'missing',
				context: { name: 'vitest/node' },
				cause: expect.any(Error),
			})
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
				expect(passing.issues).toStrictEqual([])
				expect(failing.issues.length).toBeGreaterThan(0)
				// Vitest reported the generated specification, at the frame inside it. The issue names
				// the test path the case declared and keeps that frame's line, so a runtime failure whose
				// stack carries a frame arrives with `line` set.
				expect(failing.issues[0]).toMatchObject({
					origin: 'claimant',
					path: 'tmp/probe/runtime-failing.test.ts',
					line: expect.any(Number),
				})
			} finally {
				await stage.destroy()
			}
		},
	)

	it(
		'names the declared test path when the workspace is reached through a symbolic link',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-runtime-symlink-' })
			scratch.write('real/package.json', '{"type":"module"}\n')
			scratch.link('real/node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'real/vite.config.ts',
				"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
			)
			scratch.write('real/tmp/probe/.keep', '')
			// The stage is handed the link rather than its target, which is what a consumer running
			// under a symlinked checkout supplies. Vitest reports every stack frame at the real path,
			// so the generated specification only maps back to the declared test path when both sides
			// are compared through their real form.
			const alias = resolve(scratch.path, 'alias')
			symlinkSync(resolve(scratch.path, 'real'), alias, 'dir')
			const stage = new RuntimeStage(alias)
			try {
				const check = await stage.inspect({
					files: [],
					test: {
						path: 'tmp/probe/symlinked.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('fails', () => expect(2 + 2).toBe(5))\n",
					},
				})

				expect(check.issues).toHaveLength(1)
				expect(check.issues[0]).toMatchObject({
					origin: 'claimant',
					path: 'tmp/probe/symlinked.test.ts',
					line: expect.any(Number),
				})
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it('refuses a generated specification beneath a symbolic link', { timeout: 60_000 }, async () => {
		const scratch = createScratch({ prefix: 'probe-runtime-containment-' })
		const outside = createScratch({ prefix: 'probe-runtime-outside-' })
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write(
			'vite.config.ts',
			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
		)
		mkdirSync(resolve(scratch.path, 'tmp'), { recursive: true })
		symlinkSync(outside.path, resolve(scratch.path, 'tmp/probe'), 'dir')
		const stage = new RuntimeStage(scratch.path)
		try {
			const check = await stage.inspect({
				files: [],
				test: {
					path: 'tmp/probe/escape.test.ts',
					text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
				},
			})

			expect(check.issues).toEqual([
				expect.objectContaining({
					origin: 'workspace',
					path: 'tmp/probe/escape.test.ts',
					message: expect.stringContaining('symbolic link'),
				}),
			])
			expect(readdirSync(outside.path)).toStrictEqual([])
		} finally {
			await stage.destroy()
			scratch.destroy()
			outside.destroy()
		}
	})

	it('reports an issue when a test module executes nothing', { timeout: 60_000 }, async () => {
		const stage = new RuntimeStage(ROOT)
		try {
			const check = await stage.inspect({
				files: [],
				test: {
					path: 'tmp/probe/runtime-skipped.test.ts',
					text: "import { describe, expect, test } from 'vitest'\ntest.skip('skips', () => expect(1).toBe(2))\ntest.todo('defers')\ndescribe.skip('group', () => { test('skips with its group', () => expect(1).toBe(2)) })\n",
				},
			})
			expect(check.issues).toStrictEqual([
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
			expect(check.issues).toStrictEqual([
				{
					origin: 'instrument',
					path: 'tmp/probe/runtime-context-skip.test.ts',
					message: 'Vitest did not run the test (skips)',
				},
			])
			const clean: readonly Check[] = [
				{ stage: 'type', elapsed: 0, issues: [] },
				{ stage: 'lint', elapsed: 0, issues: [] },
			]
			const verdict: Verdict = {
				id: 'context-skip',
				digest: 'context-skip-claim',
				toolchain: { typescript: 'test', oxlint: 'test', vitest: 'test' },
				project: { path: 'tsconfig.json', digest: 'context-skip-project' },
				case: [...clean, check],
				control: [...clean, control],
				elapsed: 0,
			}
			// Every other condition a receipt needs holds here, so the assertion turns on the skip
			// issue alone: remove it and the same verdict earns one.
			expect(computeReceipt(verdict, 'runtime')).toBeUndefined()
			expect(
				computeReceipt({ ...verdict, case: [...clean, { ...check, issues: [] }] }, 'runtime'),
			).toBe(
				'probe:context-skip-claim:runtime:typescript@test:oxlint@test:vitest@test:tsconfig.json@context-skip-project',
			)
		} finally {
			await stage.destroy()
		}
	})

	it(
		'mints a receipt only for a control whose own code failed at the declared stage',
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
				// A verdict `prove` really produces names every stage in both phases, so the stages
				// this test does not drive are recorded clean rather than omitted.
				const clean: readonly Check[] = [
					{ stage: 'type', elapsed: 0, issues: [] },
					{ stage: 'lint', elapsed: 0, issues: [] },
				]
				const base: Verdict = {
					id: 'receipt-origin',
					digest: 'receipt-origin-claim',
					toolchain: { typescript: 'test', oxlint: 'test', vitest: 'test' },
					project: { path: 'tsconfig.json', digest: 'receipt-origin-project' },
					case: [...clean, passed],
					control: [...clean, failed],
					elapsed: 0,
				}
				const token =
					'probe:receipt-origin-claim:runtime:typescript@test:oxlint@test:vitest@test:tsconfig.json@receipt-origin-project'

				// The stage marks a test it never ran as its own fault and a failed expectation as
				// the candidate's, which is what the outcomes below are read from.
				expect(skipped.issues).toStrictEqual([
					{
						origin: 'instrument',
						path: 'tmp/probe/runtime-receipt-skipped.test.ts',
						message: 'Vitest did not run the test (skips)',
					},
				])
				expect(failed.issues[0]?.origin).toBe('claimant')
				expect(passed.issues).toStrictEqual([])

				// The controls reach this assertion through the real stage and differ only in
				// what it reported about them, so each verdict turns on that report alone.
				expect(computeReceipt({ ...base, control: [...clean, skipped] }, 'runtime')).toBeUndefined()
				expect(computeReceipt(base, 'runtime')).toBe(token)
				expect(computeReceipt({ ...base, control: [...clean, passed] }, 'runtime')).toBeUndefined()
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
			expect(check.issues).toStrictEqual([
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
				expect(before.issues).toStrictEqual([])
				expect(after.issues.length).toBeGreaterThan(0)
			} finally {
				await stage.destroy()
				rmSync(dependency, { force: true })
			}
		},
	)

	it(
		'revalidates a dependency whose contents changed under an unchanged modification time',
		{ timeout: 60_000 },
		async () => {
			const id = randomUUID()
			const dependency = resolve(ROOT, `tmp/probe/runtime-content-${id}.ts`)
			mkdirSync(resolve(ROOT, 'tmp/probe'), { recursive: true })
			// One fixed instant, written back after each edit, so both inspections read the same
			// modification time to the millisecond. A sweep keyed on that time has nothing to
			// invalidate at the second inspection and reports the stale pass; a sweep keyed on the
			// file's contents sees the new bytes.
			const stamp = new Date(Date.now() - 60_000)
			writeFileSync(dependency, "export const SIGNAL = 'before'\n", 'utf8')
			utimesSync(dependency, stamp, stamp)
			const stale = statSync(dependency).mtimeMs
			const stage = new RuntimeStage(ROOT)
			const subject = {
				files: [],
				test: {
					path: `tmp/probe/runtime-content-${id}.test.ts`,
					text: `import { SIGNAL } from './runtime-content-${id}.js'\nimport { expect, test } from 'vitest'\ntest('reads the dependency', () => expect(SIGNAL).toBe('before'))\n`,
				},
			}
			try {
				const before = await stage.inspect(subject)
				writeFileSync(dependency, "export const SIGNAL = 'after'\n", 'utf8')
				utimesSync(dependency, stamp, stamp)
				const after = await stage.inspect(subject)

				expect(statSync(dependency).mtimeMs).toBe(stale)
				expect(before.issues).toStrictEqual([])
				expect(after.issues.length).toBeGreaterThan(0)
			} finally {
				await stage.destroy()
				rmSync(dependency, { force: true })
			}
		},
	)

	it.each(['.js', '.ts', ''])(
		'runs a text-only candidate imported with the %s spelling',
		{ timeout: 60_000 },
		async (extension) => {
			const scratch = createScratch()
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'vite.config.ts',
				"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
			)
			scratch.write('src/.keep', '')
			scratch.write('tmp/probe/.keep', '')
			const stage = new RuntimeStage(scratch.path)
			try {
				const check = await stage.inspect({
					files: [{ path: 'src/value.ts', text: "export const VALUE = 'candidate'\n" }],
					test: {
						path: `tmp/probe/text-only-${extension || 'extensionless'}.test.ts`,
						text: `import { VALUE } from '../../src/value${extension}'\nimport { expect, test } from 'vitest'\ntest('reads the candidate', () => expect(VALUE).toBe('candidate'))\n`,
					},
				})
				expect(check.issues).toStrictEqual([])
				expect(existsSync(resolve(scratch.path, 'src/value.ts'))).toBe(false)
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it(
		'does not resolve a bare package specifier from the candidate overlay',
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
			try {
				const check = await stage.inspect({
					files: [
						{
							path: 'node_modules/overlay-package/index.ts',
							text: "export const VALUE = 'candidate'\n",
						},
					],
					test: {
						path: 'tmp/probe/bare-package.test.ts',
						text: "import { VALUE } from 'overlay-package'\nimport { expect, test } from 'vitest'\ntest('does not load the candidate', () => expect(VALUE).toBe('candidate'))\n",
					},
				})
				expect(check.issues).toEqual([
					expect.objectContaining({
						origin: 'claimant',
						message: expect.stringContaining("Cannot find package 'overlay-package'"),
					}),
				])
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	// `tmp` is ignored by version control and the coordinator's boot tidies away the workbench it
	// created, so the directory the convention names is absent in a fresh checkout of a target. A
	// claim declares where its test lives, and this stage writes its specification there.
	it('creates the directory the declared test path names', { timeout: 60_000 }, async () => {
		const marker = `runtime-directory-${randomUUID()}`
		const directory = resolve(ROOT, 'tmp/probe', marker)
		const stage = new RuntimeStage(ROOT)
		try {
			expect(existsSync(directory)).toBe(false)
			const check = await stage.inspect({
				files: [],
				test: {
					path: `tmp/probe/${marker}/deep/runtime.test.ts`,
					text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
				},
			})
			expect(check.issues).toStrictEqual([])
			// Both levels, because a single non-recursive `mkdir` serves only a parent that already
			// exists, and the path a claim declares can be as deep as the claim likes.
			expect(existsSync(resolve(directory, 'deep'))).toBe(true)
		} finally {
			await stage.destroy()
			rmSync(directory, { force: true, recursive: true })
		}
	})

	it('reports a directory it cannot create as a workspace issue', { timeout: 60_000 }, async () => {
		const marker = `runtime-blocked-${randomUUID()}`
		const path = `tmp/probe/${marker}/deep/runtime.test.ts`
		const blocker = resolve(ROOT, 'tmp/probe', marker)
		mkdirSync(resolve(ROOT, 'tmp/probe'), { recursive: true })
		// A file where the declared test's directory belongs. Creating the directory is what the
		// caller's declaration implies, and a host that refuses it leaves the inspection with
		// nowhere to write, so the stage reports that refusal rather than a clean check.
		writeFileSync(blocker, '', 'utf8')
		const stage = new RuntimeStage(ROOT)
		try {
			const check = await stage.inspect({
				files: [],
				test: {
					path,
					text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
				},
			})
			expect(check.issues).toEqual([
				expect.objectContaining({
					origin: 'workspace',
					path,
					message: expect.stringContaining(
						'The runtime stage could not write the generated specification',
					),
				}),
			])
			// The host's own failure carries the operation that failed, which is what separates a
			// directory this stage could not create from a file it could not write.
			expect(check.issues[0]?.message).toContain('mkdir')
		} finally {
			await stage.destroy()
			rmSync(blocker, { force: true })
		}
	})

	it("refuses a caller's unacceptable target path", { timeout: 60_000 }, async () => {
		const path = `tmp/probe/${'x'.repeat(300)}.test.ts`
		const stage = new RuntimeStage(ROOT)
		try {
			await expect(
				stage.inspect({
					files: [],
					test: {
						path,
						text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
					},
				}),
			).rejects.toMatchObject({
				origin: 'claimant',
				code: 'refused',
				context: { path },
			})
		} finally {
			await stage.destroy()
		}
	})

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
				expect(candidate.issues).toStrictEqual([])
				expect(restored.issues).toStrictEqual([])
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
			expect(check.issues).toStrictEqual([])
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
			expect(check.issues).toStrictEqual([
				{
					origin: 'workspace',
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
				expect(check.issues).toStrictEqual([])
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
			expect(check.issues).toStrictEqual([])
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
			expect(first.issues).toStrictEqual([])
			expect(second.issues).toStrictEqual([])
			expect(scratch.read('src/value.ts')).toBe(disk)
		} finally {
			await stage.destroy()
			scratch.destroy()
		}
	})

	it(
		'refuses a test path outside every configured Vitest project',
		{ timeout: 60_000 },
		async () => {
			const stage = new RuntimeStage(ROOT)
			try {
				await expect(
					stage.inspect({
						files: [],
						test: {
							path: 'tests/unmapped.test.ts',
							text: "import { test } from 'vitest'\ntest('unmapped', () => {})\n",
						},
					}),
				).rejects.toMatchObject({
					origin: 'claimant',
					code: 'missing',
					context: { stage: 'runtime', path: 'tests/unmapped.test.ts' },
				})
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
			await expect(
				stage.inspect({
					files: [],
					test: {
						path: 'tmp/probe/missing-project.test.ts',
						text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
					},
				}),
			).rejects.toMatchObject({
				origin: 'claimant',
				code: 'missing',
				context: { stage: 'runtime', path: 'tmp/probe/missing-project.test.ts' },
			})
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
		"raises progress for the caller's run and lowers it before the stage's cleanup",
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch()
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","strict":true,"types":["vitest/globals"]},"include":["src/**/*.ts","tmp/**/*.ts"]}\n',
			)
			scratch.write(
				'configs/src/tsconfig.core.json',
				'{"extends":"../../tsconfig.json","compilerOptions":{"types":[]},"include":["../../src/core/**/*.ts"]}\n',
			)
			scratch.write('src/core/index.ts', 'export const READY = true\n')
			scratch.write(
				'vite.config.ts',
				"import { defineConfig } from 'vitest/config'\nconst project = { test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'], environment: 'node' } }\nexport default defineConfig({ cacheDir: '.probe-cache', test: { projects: [project] } })\n",
			)
			const stage = new RuntimeStage(scratch.path)
			let cache: string | undefined
			const subject = {
				files: [],
				test: {
					path: 'tmp/probe/progress.test.ts',
					text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
				},
			}
			try {
				await expect(stage.inspect(subject)).resolves.toMatchObject({ issues: [] })
				const cacheRoot = resolve(scratch.path, '.probe-cache')
				const result = readdirSync(cacheRoot, {
					recursive: true,
					encoding: 'utf8',
				}).find((entry) => entry.endsWith('results.json'))
				if (result === undefined) throw new Error('Vitest wrote no results cache')
				cache = resolve(cacheRoot, result)
				rmSync(cache, { force: true })
				const fifo = spawnSync('mkfifo', [cache])
				if (fifo.status !== 0) throw new Error('The host cannot create a FIFO for the cache gate')
				const cleanupGate = `${cache}.cleanup`
				const cleanupFifo = spawnSync('mkfifo', [cleanupGate])
				if (cleanupFifo.status !== 0) {
					throw new Error('The host cannot create a second FIFO for the cache gate')
				}

				const baseline = stage.progress
				const running = stage.inspect(subject)
				const buffer = Buffer.alloc(65_536)
				const claimantReader = await open(cache, 'r')
				const claimant = stage.progress
				await claimantReader.read(buffer, 0, buffer.length, null)
				// Each rendezvous owns one FIFO inode. Replace the cache path atomically while the
				// claimant reader still holds the first inode, so the cleanup reader can attach only
				// to the second inode and cannot sample the caller's still-open writer.
				renameSync(cleanupGate, cache)
				await claimantReader.close()
				const cleanupReader = await open(cache, 'r')
				const cleanup = stage.progress
				// Drain the cleanup inode to end of file before closing its reader, so the stage's
				// cache write completes rather than racing this proof's teardown.
				await cleanupReader.readFile()
				await cleanupReader.close()

				expect(claimant).toBeGreaterThan(baseline)
				expect(cleanup).toBe(baseline)
				await expect(running).resolves.toMatchObject({ issues: [] })
			} finally {
				if (cache !== undefined) rmSync(cache, { force: true })
				await stage.destroy()
				scratch.destroy()
			}
		},
	)

	it(
		"recycles the resident runner after 64 written specifications, evicts disk caches, and strips the replacement warm's termination listeners",
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
			const signals = {
				SIGINT: process.listenerCount('SIGINT'),
				SIGTERM: process.listenerCount('SIGTERM'),
			}
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
				).rejects.toMatchObject({
					origin: 'claimant',
					code: 'missing',
					context: { stage: 'runtime', path: 'tests/unmapped.test.ts' },
				})
				for (let index = 1; index <= 64; index += 1) {
					const text = `import { expect, test } from 'vitest'\ntest('passes ${marker}-${index}', () => expect(1).toBe(1))\n`
					await expect(stage.inspect({ files: [], test: { path, text } })).resolves.toMatchObject({
						issues: [],
					})
				}
				expect(scratch.read('runtime-warms.txt')?.trim().split('\n')).toStrictEqual(['warm'])
				const last = `import { expect, test } from 'vitest'\ntest('passes ${marker}-65', () => expect(1).toBe(1))\n`
				await expect(
					stage.inspect({ files: [], test: { path, text: last } }),
				).resolves.toMatchObject({ issues: [] })
				expect(scratch.read('runtime-warms.txt')?.trim().split('\n')).toStrictEqual([
					'warm',
					'warm',
				])
				// The replacement warm calls `createVitest` again, so the strip that cleared the
				// first warm's termination listeners has to run on this one too.
				expect({
					SIGINT: process.listenerCount('SIGINT'),
					SIGTERM: process.listenerCount('SIGTERM'),
				}).toStrictEqual(signals)
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
				expect(check.issues).toHaveLength(1)
				expect(check.issues[0]?.origin).toBe('instrument')
				// The generated specification is the file that could not be deleted. The caller's
				// own path names a file the caller wrote and this stage never touched.
				expect(check.issues[0]?.path).toMatch(
					new RegExp(`^tmp/probe/${marker}\\.test\\.probe-[0-9a-f-]+\\.ts$`),
				)
				expect(check.issues[0]?.message).toContain(
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

	it(
		'preserves workspace classification when cleanup crosses a symbolic link',
		{ timeout: 60_000 },
		async () => {
			const marker = `runtime-cleanup-link-${randomUUID()}`
			const stage = new RuntimeStage(ROOT)
			try {
				const check = await stage.inspect({
					files: [],
					test: {
						path: `tmp/probe/${marker}.test.ts`,
						text: "import { rmSync, symlinkSync } from 'node:fs'\nimport { fileURLToPath } from 'node:url'\nimport { test } from 'vitest'\ntest('replaces the specification', () => { const file = fileURLToPath(import.meta.url); rmSync(file); symlinkSync('.', file, 'dir') })\n",
					},
				})
				expect(check.issues).toEqual([
					expect.objectContaining({
						origin: 'workspace',
						message: expect.stringContaining(
							'The runtime stage could not delete the generated specification',
						),
					}),
				])
			} finally {
				await stage.destroy()
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

	it(
		'strips the termination listeners each Vitest warm installs',
		{ timeout: 60_000 },
		async () => {
			// Vitest registers a `SIGINT` and `SIGTERM` handler per `createVitest` call that force
			// exits this process about a millisecond after the signal. A host tearing down on that
			// signal loses the race by three orders of magnitude, so the stage removes what its own
			// warm installed. The counts are read as a delta, because a sibling test in this file
			// may hold listeners of its own.
			const before = {
				SIGINT: process.listenerCount('SIGINT'),
				SIGTERM: process.listenerCount('SIGTERM'),
			}
			const marker = `runtime-listeners-${randomUUID()}`
			const first = new RuntimeStage(ROOT)
			// Read synchronously, before anything is awaited. Vitest registers its handlers before
			// its own first await, so a strip that waits for the warm to settle leaves the whole
			// boot exposed — which is the window a harness signals a starting process in.
			expect({
				SIGINT: process.listenerCount('SIGINT'),
				SIGTERM: process.listenerCount('SIGTERM'),
			}).toStrictEqual(before)
			const second = new RuntimeStage(ROOT)
			try {
				const subject = {
					files: [],
					test: {
						path: `tmp/probe/${marker}.test.ts`,
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
					},
				}
				await expect(first.inspect(subject)).resolves.toMatchObject({ issues: [] })
				expect({
					SIGINT: process.listenerCount('SIGINT'),
					SIGTERM: process.listenerCount('SIGTERM'),
				}).toStrictEqual(before)
				// A second warm is the recycle path in miniature: a strip performed once at boot
				// stops working the moment the coordinator replaces a stage.
				await expect(second.inspect(subject)).resolves.toMatchObject({ issues: [] })
				expect({
					SIGINT: process.listenerCount('SIGINT'),
					SIGTERM: process.listenerCount('SIGTERM'),
				}).toStrictEqual(before)
			} finally {
				await first.destroy()
				await second.destroy()
			}
		},
	)

	it('removes the files a dead host left behind, at construction', async () => {
		const scratch = createScratch()
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write(
			'vite.config.ts',
			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
		)
		// A real process that has already exited, so the identity in the orphan's name is dead on
		// this host rather than assumed dead. A host killed mid-inspection leaves exactly this file,
		// and it then matches the consumer's own workbench glob and fails their gates.
		const departed = spawnSync(process.execPath, ['--version'])
		expect(departed.status).toBe(0)
		const orphanRevision = `${departed.pid}-${randomUUID()}`
		const orphan = createRevisionFile(scratch.path, 'tmp/probe/orphan.test.ts', orphanRevision)
		const specification = "import { test } from 'vitest'\ntest('leaks', () => {})\n"
		scratch.write(
			relative(scratch.path, orphan),
			formatSpecification(specification, orphanRevision),
		)
		// Controls the sweep must leave alone. The live one and the developer's own file are
		// the load-bearing pair: several hosts share one workspace routinely, so a sweep reading the
		// name deletes a neighbour's specification while its run is reading it, and a consumer's own
		// file that happens to carry the same name shape is theirs rather than this package's.
		const live = createRevisionFile(
			scratch.path,
			'tmp/probe/live.test.ts',
			`${process.pid}-${randomUUID()}`,
		)
		scratch.write(relative(scratch.path, live), specification)
		scratch.write('tmp/probe/keeper.test.ts', specification)
		scratch.write('tmp/probe/notes.probe-draft.ts', 'export const NOTE = 1\n')
		// A developer's own file, named exactly as this package names its own and carrying a dead
		// identity, in a directory this package writes to only when a claim declares a test there.
		const authored = createRevisionFile(
			scratch.path,
			'src/core/notes.ts',
			`${departed.pid}-${randomUUID()}`,
		)
		scratch.write(relative(scratch.path, authored), 'export const NOTE = 1\n')
		// The same file inside the workbench directory, so the rule is the marker rather than the
		// location the flagship claim happens to use.
		const drafted = createRevisionFile(
			scratch.path,
			'tmp/probe/draft.test.ts',
			`${departed.pid}-${randomUUID()}`,
		)
		scratch.write(relative(scratch.path, drafted), specification)
		// A boot the host did not survive leaves its arming dependencies in the same directory.
		// They are ordinary TypeScript in the consumer's tree, so they carry the same identity and
		// the sweep reads them the same way.
		const arming = createRevisionFile(
			scratch.path,
			'tmp/probe/arm-type.ts',
			`${departed.pid}-${randomUUID()}`,
		)
		scratch.write(relative(scratch.path, arming), 'export type Signal = string\n')
		const dependencyRevision = `${departed.pid}-${randomUUID()}`
		const specificationRevision = `${departed.pid}-${randomUUID()}`
		const boot = createRevisionFile(
			scratch.path,
			`tmp/probe/arm-runtime.probe-${dependencyRevision}.test.ts`,
			specificationRevision,
		)
		scratch.write(
			relative(scratch.path, boot),
			formatSpecification("export const SIGNAL = 'before'\n", specificationRevision),
		)
		const adjacentRevision = `${departed.pid}-${randomUUID()}`
		const adjacent = createRevisionFile(
			scratch.path,
			`tmp/probe/adjacent.probe-${dependencyRevision}.ts`,
			adjacentRevision,
		)
		scratch.write(
			relative(scratch.path, adjacent),
			formatSpecification("export const SIGNAL = 'before'\n", adjacentRevision),
		)
		const serving = createRevisionFile(
			scratch.path,
			'tmp/probe/arm-runtime.ts',
			`${process.pid}-${randomUUID()}`,
		)
		scratch.write(relative(scratch.path, serving), "export const SIGNAL = 'before'\n")
		const stage = new RuntimeStage(scratch.path)
		try {
			expect(existsSync(orphan), 'a marked specification whose writer is gone').toBe(false)
			expect(existsSync(live), "a live neighbour's specification").toBe(true)
			expect(existsSync(arming), "a caller's unmarked file at a boot path").toBe(true)
			expect(existsSync(boot), 'a marked boot-derived specification whose writer is gone').toBe(
				false,
			)
			expect(existsSync(adjacent), 'a marked specification beside a caller-declared marker').toBe(
				false,
			)
			expect(existsSync(serving), "a live neighbour's boot dependency").toBe(true)
			expect(existsSync(authored), "a developer's own file outside the workbench").toBe(true)
			expect(existsSync(drafted), "a developer's own file inside the workbench").toBe(true)
			expect(existsSync(resolve(scratch.path, 'tmp/probe/keeper.test.ts'))).toBe(true)
			expect(existsSync(resolve(scratch.path, 'tmp/probe/notes.probe-draft.ts'))).toBe(true)
		} finally {
			await stage.destroy()
			scratch.destroy()
		}
	})
})
