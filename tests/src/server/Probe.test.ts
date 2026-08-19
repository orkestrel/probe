import type { Claim } from '@src/core'
import { mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRecorder } from '@orkestrel/test'
import { Probe, readWorkspaceManifest } from '@src/server'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

describe.sequential('probe', () => {
	it(
		'issues receipts only when every stage executes cleanly and returns admitted path findings',
		{ timeout: 60_000 },
		async () => {
			const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
			const test = {
				path: 'tmp/probe/probe-receipt.test.ts',
				text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
			}
			const clean = { path: 'src/core/probe-receipt.ts', text: "export const VALUE = 'ok'\n" }
			const broken = {
				path: 'src/core/probe-receipt.ts',
				text: "export const VALUE: number = 'bad'\n",
			}
			const skipped = {
				path: 'tmp/probe/probe-skipped.test.ts',
				text: "import { describe, expect, test } from 'vitest'\ntest.skip('skips', () => expect(1).toBe(2))\ntest.todo('defers')\ndescribe.skip('group', () => { test('skips with its group', () => expect(1).toBe(2)) })\n",
			}
			const unmapped = {
				path: 'tests/unmapped.test.ts',
				text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
			}
			try {
				const issued = await probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: { files: [clean], test },
					control: {
						files: [broken],
						test,
						stage: 'type',
						reason: 'the source assigns a string to a number',
					},
				})
				const refused = await probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: { files: [clean], test },
					control: {
						files: [clean],
						test,
						stage: 'type',
						reason: 'this control is deliberately clean',
					},
				})
				const unexecuted = await probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: { files: [clean], test: skipped },
					control: {
						files: [broken],
						test: skipped,
						stage: 'type',
						reason: 'the source assigns a string to a number',
					},
				})
				const admitted = await probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: { files: [clean], test: unmapped },
					control: {
						files: [broken],
						test: unmapped,
						stage: 'type',
						reason: 'the source assigns a string to a number',
					},
				})
				expect(issued.receipt).toMatch(/^probe:/)
				expect(refused.receipt).toBeUndefined()
				expect(unexecuted.receipt).toBeUndefined()
				expect(unexecuted.checks.find((check) => check.stage === 'runtime')?.findings).toEqual([
					expect.objectContaining({ message: 'Vitest ran no tests in the module' }),
				])
				expect(admitted.receipt).toBeUndefined()
				expect(admitted.checks.find((check) => check.stage === 'runtime')?.findings).toEqual([
					expect.objectContaining({
						message: 'Vitest ran no tests because no configured project matches the test path',
					}),
				])
			} finally {
				await probe.destroy()
			}
		},
	)

	it('carries the installed toolchain on every verdict', { timeout: 60_000 }, async () => {
		const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
		try {
			const verdict = await probe.prove({
				project: 'configs/src/tsconfig.core.json',
				case: {
					files: [{ path: 'src/core/toolchain.ts', text: "export const VALUE = 'ok'\n" }],
					test: {
						path: 'tmp/probe/toolchain.test.ts',
						text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
					},
				},
				control: {
					files: [{ path: 'src/core/toolchain.ts', text: "export const VALUE: number = 'bad'\n" }],
					test: {
						path: 'tmp/probe/toolchain.test.ts',
						text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
					},
					stage: 'type',
					reason: 'the source assigns a string to a number',
				},
			})
			expect(verdict.toolchain).toStrictEqual({
				typescript: readWorkspaceManifest(ROOT, 'typescript').contents.version,
				oxlint: readWorkspaceManifest(ROOT, 'oxlint').contents.version,
				vitest: readWorkspaceManifest(ROOT, 'vitest').contents.version,
			})
		} finally {
			await probe.destroy()
		}
	})

	it(
		'preserves the host exit code through arming and every proof',
		{ timeout: 60_000 },
		async () => {
			const inherited = process.exitCode
			process.exitCode = undefined
			const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
			const claim: Claim = {
				project: 'configs/src/tsconfig.core.json',
				case: {
					files: [{ path: 'src/core/exit-code.ts', text: "export const VALUE = 'ok'\n" }],
					test: {
						path: 'tmp/probe/exit-code.test.ts',
						text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
					},
				},
				control: {
					files: [{ path: 'src/core/exit-code.ts', text: "export const VALUE: number = 'bad'\n" }],
					test: {
						path: 'tmp/probe/exit-code.test.ts',
						text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
					},
					stage: 'type',
					reason: 'the source assigns a string to a number',
				},
			}
			try {
				await probe.prove(claim)
				expect(process.exitCode).toBeUndefined()
				process.exitCode = 23
				await probe.prove(claim)
				expect(process.exitCode).toBe(23)
			} finally {
				await probe.destroy()
				process.exitCode = inherited
			}
		},
	)

	it(
		'expires a synchronous loop, cleans its revision, and serves the next claim',
		{ timeout: 60_000 },
		async () => {
			const expirations = createRecorder<[Claim]>()
			const probe = new Probe({
				workspace: ROOT,
				deadline: 6_000,
				on: { expire: expirations.handler },
			})
			const hanging: Claim = {
				project: 'configs/src/tsconfig.core.json',
				case: {
					files: [],
					test: {
						path: 'tmp/probe/expiry.test.ts',
						text: "import { test } from 'vitest'\ntest('never returns', () => { while (true) {} })\n",
					},
				},
				control: {
					files: [],
					test: {
						path: 'tmp/probe/expiry.test.ts',
						text: "import { test } from 'vitest'\ntest('never returns', () => { while (true) {} })\n",
					},
					stage: 'runtime',
					reason: 'the synchronous loop never returns',
				},
			}
			const ordinary: Claim = {
				project: 'configs/src/tsconfig.core.json',
				case: {
					files: [{ path: 'src/core/after-expiry.ts', text: "export const VALUE = 'ok'\n" }],
					test: {
						path: 'tmp/probe/after-expiry.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
					},
				},
				control: {
					files: [
						{ path: 'src/core/after-expiry.ts', text: "export const VALUE: number = 'bad'\n" },
					],
					test: {
						path: 'tmp/probe/after-expiry.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
					},
					stage: 'type',
					reason: 'the source assigns a string to a number',
				},
			}
			mkdirSync(fileURLToPath(new URL('../../../tmp/probe/', import.meta.url)), { recursive: true })
			try {
				await expect(probe.prove(hanging)).rejects.toThrow('The runtime stage exceeded 6000 ms')
				expect(expirations.calls).toStrictEqual([[hanging]])
				expect(
					readdirSync(fileURLToPath(new URL('../../../tmp/probe/', import.meta.url))).filter(
						(name) => name.startsWith('expiry.test.probe-'),
					),
				).toStrictEqual([])
				await expect(probe.prove(ordinary)).resolves.toMatchObject({ receipt: expect.any(String) })
			} finally {
				await probe.destroy()
			}
		},
	)

	it(
		'keeps arming failures handled and rejects callers with the same failure',
		{ timeout: 60_000 },
		async () => {
			const failures = createRecorder<[unknown]>()
			const probe = new Probe({ workspace: ROOT, deadline: 1, on: { error: failures.handler } })
			try {
				await expect(
					probe.prove({
						project: 'configs/src/tsconfig.core.json',
						case: {
							files: [],
							test: {
								path: 'tmp/probe/arming-failure.test.ts',
								text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
							},
						},
						control: {
							files: [],
							test: {
								path: 'tmp/probe/arming-failure.test.ts',
								text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
							},
							stage: 'runtime',
							reason: 'the deadline expires before the runtime host can answer',
						},
					}),
				).rejects.toThrow(/runtime stage exceeded 1 ms/i)
				expect(failures.count).toBeGreaterThan(0)
			} finally {
				await probe.destroy()
			}
		},
	)

	it(
		'destroys idempotently, refuses later proofs, and leaves no probe files',
		{ timeout: 60_000 },
		async () => {
			const directory = fileURLToPath(new URL('../../../tmp/probe/', import.meta.url))
			mkdirSync(directory, { recursive: true })
			const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
			await Promise.all([probe.destroy(), probe.destroy()])
			await expect(
				probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: {
						files: [],
						test: {
							path: 'tmp/probe/after-destroy.test.ts',
							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
						},
					},
					control: {
						files: [],
						test: {
							path: 'tmp/probe/after-destroy.test.ts',
							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
						},
						stage: 'runtime',
						reason: 'the probe is destroyed',
					},
				}),
			).rejects.toThrow('The probe has been destroyed')
			expect(
				readdirSync(directory).filter(
					(name) => name.startsWith('arm-') || name.includes('.probe-'),
				),
			).toStrictEqual([])
		},
	)
})
