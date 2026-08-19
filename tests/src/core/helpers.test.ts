import type { Check, Toolchain, Verdict } from '@src/core'
import {
	PROBE_STAGES,
	RECEIPT_PREFIX,
	RECEIPT_SEPARATOR,
	computeReceipt,
	formatCheck,
	formatFinding,
	formatVerdict,
} from '@src/core'
import { describe, expect, it } from 'vitest'

describe('core formatting helpers', () => {
	it('renders findings with and without a line', () => {
		expect(
			formatFinding({ path: 'src/core/greeting.ts', message: 'not assignable', line: 3 }),
		).toBe('src/core/greeting.ts:3 not assignable')
		expect(formatFinding({ path: 'src/core/greeting.ts', message: 'not assignable' })).toBe(
			'src/core/greeting.ts not assignable',
		)
	})

	it('renders zero, one, and multiple findings with correct summaries and order', () => {
		expect(formatCheck({ stage: 'lint', elapsed: 17, findings: [] })).toBe(
			'lint: 0 findings (17 ms)',
		)
		expect(
			formatCheck({
				stage: 'type',
				elapsed: 23,
				findings: [{ path: 'src/core/first.ts', message: 'first', line: 4 }],
			}),
		).toBe('type: 1 finding (23 ms)\n  src/core/first.ts:4 first')
		expect(
			formatCheck({
				stage: 'runtime',
				elapsed: 31,
				findings: [
					{ path: 'tests/src/core/first.test.ts', message: 'first failure' },
					{ path: 'tests/src/core/second.test.ts', message: 'second failure', line: 8 },
				],
			}),
		).toBe(
			'runtime: 2 findings (31 ms)\n' +
				'  tests/src/core/first.test.ts first failure\n' +
				'  tests/src/core/second.test.ts:8 second failure',
		)
	})

	it('renders verdict sections in order with receipt and absence endings', () => {
		const toolchain: Toolchain = {
			typescript: '6.0.3',
			oxlint: '1.78.0',
			vitest: '4.1.10',
		}
		const checks: readonly Check[] = [
			{ stage: 'type', elapsed: 11, findings: [] },
			{ stage: 'lint', elapsed: 12, findings: [] },
			{ stage: 'runtime', elapsed: 13, findings: [] },
		]
		const control: readonly Check[] = [
			{
				stage: 'type',
				elapsed: 14,
				findings: [{ path: 'src/core/control.ts', message: 'not assignable', line: 1 }],
			},
			{ stage: 'lint', elapsed: 15, findings: [] },
			{ stage: 'runtime', elapsed: 16, findings: [] },
		]
		const verdict: Verdict = {
			id: '01J8Z0',
			toolchain,
			checks,
			control,
			elapsed: 81,
			receipt: 'proof-token',
		}
		const lines = [
			'probe 01J8Z0 (81 ms)',
			'toolchain typescript 6.0.3, oxlint 1.78.0, vitest 4.1.10',
			'case type: 0 findings (11 ms)',
			'case lint: 0 findings (12 ms)',
			'case runtime: 0 findings (13 ms)',
			'control type: 1 finding (14 ms)',
			'  src/core/control.ts:1 not assignable',
			'control lint: 0 findings (15 ms)',
			'control runtime: 0 findings (16 ms)',
			'receipt proof-token',
		]
		const { receipt: _, ...withoutReceipt } = verdict
		expect(formatVerdict(verdict)).toBe(lines.join('\n'))
		expect(formatVerdict(withoutReceipt).split('\n').at(-1)).toBe('no receipt')
	})
})

describe('core receipt helper', () => {
	it('builds a receipt from exported token constants and toolchain versions', () => {
		const toolchain: Toolchain = {
			typescript: '6.0.3',
			oxlint: '1.78.0',
			vitest: '4.1.10',
		}
		const verdict: Verdict = {
			id: '01J8Z0',
			toolchain,
			checks: PROBE_STAGES.map((stage) => ({ stage, elapsed: 1, findings: [] })),
			control: [
				{
					stage: 'type',
					elapsed: 1,
					findings: [{ path: 'src/core/control.ts', message: 'not assignable' }],
				},
			],
			elapsed: 7,
		}
		const expected = [
			RECEIPT_PREFIX,
			verdict.id,
			'type',
			`typescript@${toolchain.typescript}`,
			`oxlint@${toolchain.oxlint}`,
			`vitest@${toolchain.vitest}`,
		].join(RECEIPT_SEPARATOR)

		expect(computeReceipt(verdict, 'type')).toBe(expected)
	})

	it('refuses receipts for each incomplete or disproven verdict state', () => {
		const finding = { path: 'src/core/control.ts', message: 'not assignable' }
		const toolchain: Toolchain = {
			typescript: '6.0.3',
			oxlint: '1.78.0',
			vitest: '4.1.10',
		}
		const checks: readonly Check[] = PROBE_STAGES.map((stage) => ({
			stage,
			elapsed: 1,
			findings: [],
		}))
		const base: Verdict = {
			id: '01J8Z0',
			toolchain,
			checks,
			control: [{ stage: 'type', elapsed: 1, findings: [finding] }],
			elapsed: 7,
		}

		expect(computeReceipt({ ...base, checks: checks.slice(0, -1) }, 'type')).toBeUndefined()
		expect(
			computeReceipt(
				{
					...base,
					checks: checks.map((check) =>
						check.stage === 'lint' ? { ...check, findings: [finding] } : check,
					),
				},
				'type',
			),
		).toBeUndefined()
		expect(
			computeReceipt(
				{ ...base, control: [{ stage: 'lint', elapsed: 1, findings: [finding] }] },
				'type',
			),
		).toBeUndefined()
		expect(
			computeReceipt({ ...base, control: [{ stage: 'type', elapsed: 1, findings: [] }] }, 'type'),
		).toBeUndefined()
	})
})
