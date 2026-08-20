import type { Check, Finding, Project, Toolchain, Verdict } from '@src/core'
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

const TOOLCHAIN: Toolchain = { typescript: '6.0.3', oxlint: '1.79.0', vitest: '4.1.11' }
const PROJECT: Project = {
	path: 'configs/src/tsconfig.core.json',
	digest: '3b674fdf121c85efb9ed1bab25ceeec8',
}
// The token the package documents, reproduced here as a literal rather than rebuilt from the
// constants the source joins: a token assembled the way `computeReceipt` assembles it would match
// whatever `computeReceipt` returned.
const TOKEN =
	'probe:6ca20c3bff623031d3955b9d1a76d71d:type:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8'

describe('core formatting helpers', () => {
	// The two findings `formatFinding` documents, transcribed as the typed literals the contract
	// requires. `origin` is required on `Finding`, so a documented call that omitted it would fail
	// this file's typecheck before any assertion ran.
	it('renders both origins with and without a line', () => {
		const located: Finding = {
			origin: 'code',
			path: 'src/core/greeting.ts',
			message: 'not assignable',
			line: 1,
		}
		const whole: Finding = {
			origin: 'instrument',
			path: 'src/core/greeting.ts',
			message: 'not assignable',
		}

		expect(formatFinding(located)).toBe('[code] src/core/greeting.ts:1 not assignable')
		expect(formatFinding(whole)).toBe('[instrument] src/core/greeting.ts not assignable')
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
		).toBe('type: 1 finding (23 ms)\n  [code] src/core/first.ts:4 first')
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
				'  [code] tests/src/core/first.test.ts first failure\n' +
				'  [code] tests/src/core/second.test.ts:8 second failure',
		)
	})

	it('renders verdict sections in order with receipt and absence endings', () => {
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
			id: '88a5addc-7d33-40dc-9a5a-104b71f8787d',
			digest: '6ca20c3bff623031d3955b9d1a76d71d',
			toolchain: TOOLCHAIN,
			project: PROJECT,
			reason: 'a string literal assigned to a number must not compile',
			checks,
			control,
			elapsed: 81,
			receipt: 'proof-token',
		}
		const lines = [
			'probe 88a5addc-7d33-40dc-9a5a-104b71f8787d (81 ms)',
			'claim 6ca20c3bff623031d3955b9d1a76d71d',
			'toolchain typescript 6.0.3, oxlint 1.79.0, vitest 4.1.11',
			'project configs/src/tsconfig.core.json 3b674fdf121c85efb9ed1bab25ceeec8',
			'reason a string literal assigned to a number must not compile',
			'case type: 0 findings (11 ms)',
			'case lint: 0 findings (12 ms)',
			'case runtime: 0 findings (13 ms)',
			'control type: 1 finding (14 ms)',
			'  [code] src/core/control.ts:1 not assignable',
			'control lint: 0 findings (15 ms)',
			'control runtime: 0 findings (16 ms)',
			'receipt proof-token',
		]
		const { receipt: _, ...withoutReceipt } = verdict
		expect(formatVerdict(verdict)).toBe(lines.join('\n'))
		expect(formatVerdict(withoutReceipt).split('\n').at(-1)).toBe('no receipt')
	})

	it('places the claim and the project between the identity and the first case line', () => {
		const verdict: Verdict = {
			id: '88a5addc-7d33-40dc-9a5a-104b71f8787d',
			digest: '6ca20c3bff623031d3955b9d1a76d71d',
			toolchain: TOOLCHAIN,
			project: PROJECT,
			checks: [{ stage: 'type', elapsed: 61, findings: [] }],
			control: [{ stage: 'type', elapsed: 58, findings: [] }],
			elapsed: 337,
		}
		const rendered = formatVerdict(verdict).split('\n')

		// A reader compares two verdicts by reading down the heading block, so the four heading
		// lines are pinned by position rather than by membership.
		expect(rendered[0]).toBe('probe 88a5addc-7d33-40dc-9a5a-104b71f8787d (337 ms)')
		expect(rendered[1]).toBe('claim 6ca20c3bff623031d3955b9d1a76d71d')
		expect(rendered[2]).toBe('toolchain typescript 6.0.3, oxlint 1.79.0, vitest 4.1.11')
		expect(rendered[3]).toBe(
			'project configs/src/tsconfig.core.json 3b674fdf121c85efb9ed1bab25ceeec8',
		)
		expect(rendered[4]).toBe('case type: 0 findings (61 ms)')
	})
})

describe('core receipt helper', () => {
	it('binds the claim digest, the stage, the toolchain, and the project into one token', () => {
		const verdict: Verdict = {
			id: '88a5addc-7d33-40dc-9a5a-104b71f8787d',
			digest: '6ca20c3bff623031d3955b9d1a76d71d',
			toolchain: TOOLCHAIN,
			project: PROJECT,
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

		expect(computeReceipt(verdict, 'type')).toBe(TOKEN)
		// The call's identity is the one value on the verdict the token must not carry, because a
		// token carrying it cannot be reproduced by a second honest run of the same claim.
		expect(computeReceipt(verdict, 'type')).not.toContain(verdict.id)
		expect(computeReceipt({ ...verdict, id: 'a-different-call' }, 'type')).toBe(TOKEN)
	})

	it('keeps the field rule total for a project path carrying both token characters', () => {
		const project: Project = {
			path: 'configs/src/tsconfig.core@2:beta.json',
			digest: '3b674fdf121c85efb9ed1bab25ceeec8',
		}
		const verdict: Verdict = {
			id: '88a5addc-7d33-40dc-9a5a-104b71f8787d',
			digest: '6ca20c3bff623031d3955b9d1a76d71d',
			toolchain: TOOLCHAIN,
			project,
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
		const receipt = computeReceipt(verdict, 'type')
		if (receipt === undefined) throw new Error('The proven verdict issued no receipt')
		const fields = receipt.split(RECEIPT_SEPARATOR)
		const tail = fields.slice(6).join(RECEIPT_SEPARATOR)
		const boundary = tail.lastIndexOf('@')

		expect(fields[0]).toBe(RECEIPT_PREFIX)
		expect(fields.length).toBeGreaterThanOrEqual(7)
		expect(fields.slice(0, 6)).toStrictEqual([
			'probe',
			'6ca20c3bff623031d3955b9d1a76d71d',
			'type',
			'typescript@6.0.3',
			'oxlint@1.79.0',
			'vitest@4.1.11',
		])
		expect(tail.slice(0, boundary)).toBe(project.path)
		expect(tail.slice(boundary + 1)).toBe(project.digest)
	})

	it('refuses receipts for each incomplete or disproven verdict state', () => {
		const finding: Finding = {
			origin: 'code',
			path: 'src/core/control.ts',
			message: 'not assignable',
		}
		const checks: readonly Check[] = PROBE_STAGES.map((stage) => ({
			stage,
			elapsed: 1,
			findings: [],
		}))
		const base: Verdict = {
			id: '88a5addc-7d33-40dc-9a5a-104b71f8787d',
			digest: '6ca20c3bff623031d3955b9d1a76d71d',
			toolchain: TOOLCHAIN,
			project: PROJECT,
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
			id: '88a5addc-7d33-40dc-9a5a-104b71f8787d',
			digest: '6ca20c3bff623031d3955b9d1a76d71d',
			toolchain: TOOLCHAIN,
			project: PROJECT,
			checks: PROBE_STAGES.map((stage) => ({ stage, elapsed: 1, findings: [] })),
			control: [{ stage: 'runtime', elapsed: 1, findings: [broke] }],
			elapsed: 7,
		}
		const token =
			'probe:6ca20c3bff623031d3955b9d1a76d71d:runtime:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8'

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

	it('refuses a receipt when the control also breaks at an undeclared stage', () => {
		const base: Verdict = {
			id: '88a5addc-7d33-40dc-9a5a-104b71f8787d',
			digest: '6ca20c3bff623031d3955b9d1a76d71d',
			toolchain: TOOLCHAIN,
			project: PROJECT,
			checks: PROBE_STAGES.map((stage) => ({ stage, elapsed: 1, findings: [] })),
			control: [
				{
					stage: 'type',
					elapsed: 1,
					findings: [{ origin: 'code', path: 'src/core/control.ts', message: 'not assignable' }],
				},
				{
					stage: 'lint',
					elapsed: 1,
					findings: [{ origin: 'code', path: 'src/core/control.ts', message: 'lint failure' }],
				},
				{ stage: 'runtime', elapsed: 1, findings: [] },
			],
			elapsed: 7,
		}

		expect(computeReceipt(base, 'type')).toBeUndefined()
	})

	it('refuses a receipt for a case whose stage reported a fault in its own instrument', () => {
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
			id: '88a5addc-7d33-40dc-9a5a-104b71f8787d',
			digest: '6ca20c3bff623031d3955b9d1a76d71d',
			toolchain: TOOLCHAIN,
			project: PROJECT,
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
			'probe:6ca20c3bff623031d3955b9d1a76d71d:runtime:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8',
		)
	})
})
