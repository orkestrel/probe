import type { Check, Finding, Toolchain, Verdict } from '@src/core'
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
			formatFinding({
				origin: 'code',
				path: 'src/core/greeting.ts',
				message: 'not assignable',
				line: 3,
			}),
		).toBe('src/core/greeting.ts:3 not assignable')
		expect(
			formatFinding({ origin: 'code', path: 'src/core/greeting.ts', message: 'not assignable' }),
		).toBe('src/core/greeting.ts not assignable')
	})

	it('renders zero, one, and multiple findings with correct summaries and order', () => {
		expect(formatCheck({ stage: 'lint', elapsed: 17, findings: [] })).toBe(
			'lint: 0 findings (17 ms)',
		)
		expect(
			formatCheck({
				stage: 'type',
				elapsed: 23,
				findings: [{ origin: 'code', path: 'src/core/first.ts', message: 'first', line: 4 }],
			}),
		).toBe('type: 1 finding (23 ms)\n  src/core/first.ts:4 first')
		expect(
			formatCheck({
				stage: 'runtime',
				elapsed: 31,
				findings: [
					{ origin: 'code', path: 'tests/src/core/first.test.ts', message: 'first failure' },
					{
						origin: 'code',
						path: 'tests/src/core/second.test.ts',
						message: 'second failure',
						line: 8,
					},
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
				findings: [
					{ origin: 'code', path: 'src/core/control.ts', message: 'not assignable', line: 1 },
				],
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
					findings: [{ origin: 'code', path: 'src/core/control.ts', message: 'not assignable' }],
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
		const finding: Finding = {
			origin: 'code',
			path: 'src/core/control.ts',
			message: 'not assignable',
		}
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

	it('decides a receipt on the control code findings and ignores its instrument ones', () => {
		const toolchain: Toolchain = {
			typescript: '6.0.3',
			oxlint: '1.78.0',
			vitest: '4.1.10',
		}
		const broke: Finding = {
			origin: 'code',
			path: 'tests/src/core/greeting.test.ts',
			message: 'expected 4 to be 5',
		}
		const unrun: Finding = {
			origin: 'instrument',
			path: 'tests/src/core/greeting.test.ts',
			message: 'Vitest did not run the test (greets)',
		}
		const base: Verdict = {
			id: '01J8Z0',
			toolchain,
			checks: PROBE_STAGES.map((stage) => ({ stage, elapsed: 1, findings: [] })),
			control: [{ stage: 'runtime', elapsed: 1, findings: [broke] }],
			elapsed: 7,
		}
		const token = 'probe:01J8Z0:runtime:typescript@6.0.3:oxlint@1.78.0:vitest@4.1.10'

		// Every verdict below differs from the one before it in the control's findings alone, so
		// the origin is the only thing deciding the outcome.
		expect(computeReceipt(base, 'runtime')).toBe(token)
		expect(
			computeReceipt(
				{ ...base, control: [{ stage: 'runtime', elapsed: 1, findings: [unrun] }] },
				'runtime',
			),
		).toBeUndefined()
		expect(
			computeReceipt(
				{ ...base, control: [{ stage: 'runtime', elapsed: 1, findings: [] }] },
				'runtime',
			),
		).toBeUndefined()
		// A control that broke and whose stage also faulted still broke where it said it would.
		expect(
			computeReceipt(
				{ ...base, control: [{ stage: 'runtime', elapsed: 1, findings: [unrun, broke] }] },
				'runtime',
			),
		).toBe(token)
	})

	it('refuses a receipt for a case whose stage reported a fault in its own instrument', () => {
		const toolchain: Toolchain = {
			typescript: '6.0.3',
			oxlint: '1.78.0',
			vitest: '4.1.10',
		}
		// The stage's own fault, not the candidate's: nothing here is a message about the code the
		// case supplied, and the case still cannot be certified clean.
		const fault: Finding = {
			origin: 'instrument',
			path: 'tests/src/core/greeting.probe-4f1a.test.ts',
			message:
				'The runtime stage could not delete the generated specification (EPERM: operation not permitted)',
		}
		const clean: readonly Check[] = PROBE_STAGES.map((stage) => ({
			stage,
			elapsed: 1,
			findings: [],
		}))
		const faulted: readonly Check[] = clean.map((check) =>
			check.stage === 'runtime' ? { ...check, findings: [fault] } : check,
		)
		const base: Verdict = {
			id: '01J8Z0',
			toolchain,
			checks: faulted,
			control: [
				{
					stage: 'runtime',
					elapsed: 1,
					findings: [
						{
							origin: 'code',
							path: 'tests/src/core/greeting.test.ts',
							message: 'expected 4 to be 5',
						},
					],
				},
			],
			elapsed: 7,
		}

		expect(computeReceipt(base, 'runtime')).toBeUndefined()
		expect(computeReceipt({ ...base, checks: clean }, 'runtime')).toBe(
			'probe:01J8Z0:runtime:typescript@6.0.3:oxlint@1.78.0:vitest@4.1.10',
		)
	})
})
