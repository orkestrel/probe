import type { Check, Finding, Project, Source, Stage, Toolchain, Verdict } from '@src/core'
import {
	PROBE_STAGES,
	RECEIPT_PREFIX,
	RECEIPT_SEPARATOR,
	computeReceipt,
	findRefusedPaths,
	formatCheck,
	formatFinding,
	formatSpecification,
	formatVerdict,
	matchesSpecification,
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

// The control shape `prove` really produces: one check per stage, in the order a verdict reports
// them, with the findings under test at the one stage that carries them. A shorter array is a
// verdict this package never returns, and a receipt decided from one certifies a stage that never
// reported.
function buildControl(stage: Stage, findings: readonly Finding[]): readonly Check[] {
	return PROBE_STAGES.map((name) => ({
		stage: name,
		elapsed: 1,
		findings: name === stage ? findings : [],
	}))
}

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
			control: buildControl('type', [
				{ origin: 'code', path: 'src/core/control.ts', message: 'not assignable' },
			]),
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
			control: buildControl('type', [
				{ origin: 'code', path: 'src/core/control.ts', message: 'not assignable' },
			]),
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
			control: buildControl('type', [finding]),
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
			computeReceipt({ ...base, control: buildControl('lint', [finding]) }, 'type'),
		).toBeUndefined()
		expect(computeReceipt({ ...base, control: buildControl('type', []) }, 'type')).toBeUndefined()
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
			control: buildControl('runtime', [broke]),
			elapsed: 7,
		}
		const token =
			'probe:6ca20c3bff623031d3955b9d1a76d71d:runtime:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8'

		// Every verdict below differs from the one before it in the control's findings alone, so
		// the origin is the only thing deciding the outcome.
		expect(computeReceipt(base, 'runtime')).toBe(token)
		expect(
			computeReceipt({ ...base, control: buildControl('runtime', [unrun]) }, 'runtime'),
		).toBeUndefined()
		expect(
			computeReceipt({ ...base, control: buildControl('runtime', []) }, 'runtime'),
		).toBeUndefined()
		// A control that broke and whose stage also faulted still broke where it said it would.
		expect(
			computeReceipt({ ...base, control: buildControl('runtime', [unrun, broke]) }, 'runtime'),
		).toBe(token)
	})

	it('refuses a receipt when the control does not name every stage', () => {
		// `prove` runs the control through every stage, so a verdict whose control omits one was
		// assembled by hand. The omitted stage never reported, and reading its absence as clean
		// certifies an inspection that did not happen.
		const broke: Finding = {
			origin: 'code',
			path: 'src/core/control.ts',
			message: 'not assignable',
		}
		const control = buildControl('type', [broke])
		const base: Verdict = {
			id: '88a5addc-7d33-40dc-9a5a-104b71f8787d',
			digest: '6ca20c3bff623031d3955b9d1a76d71d',
			toolchain: TOOLCHAIN,
			project: PROJECT,
			checks: PROBE_STAGES.map((stage) => ({ stage, elapsed: 1, findings: [] })),
			control,
			elapsed: 7,
		}

		expect(computeReceipt(base, 'type')).toBe(TOKEN)
		for (const missing of PROBE_STAGES) {
			expect(
				computeReceipt(
					{ ...base, control: control.filter((check) => check.stage !== missing) },
					'type',
				),
				`a control missing ${missing} earned a receipt`,
			).toBeUndefined()
		}
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
			control: buildControl('runtime', [
				{ origin: 'code', path: 'tests/src/core/greeting.test.ts', message: 'expected 4 to be 5' },
			]),
			elapsed: 7,
		}

		expect(computeReceipt(base, 'runtime')).toBeUndefined()
		expect(computeReceipt({ ...base, checks: clean }, 'runtime')).toBe(
			'probe:6ca20c3bff623031d3955b9d1a76d71d:runtime:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8',
		)
	})
})

describe('core specification marker', () => {
	// The marker text, written here as a literal rather than rebuilt from the helper: a comparison
	// assembled the way `formatSpecification` assembles it would match whatever it returned.
	const MARKER = '// @orkestrel/probe generated specification 4821-9f0c\n'

	it('appends the marker without moving a line of the text it follows', () => {
		const text = "import { test } from 'vitest'\ntest('greets', () => {})\n"

		expect(formatSpecification(text, '4821-9f0c')).toBe(`${text}${MARKER}`)
		// A reported stack frame names a line of the caller's own test, so every line it can name
		// keeps the number it had.
		expect(formatSpecification(text, '4821-9f0c').split('\n').slice(0, 2)).toStrictEqual(
			text.split('\n').slice(0, 2),
		)
		// A text with no terminating newline gains one, so the marker is never appended to a line
		// of the test.
		expect(formatSpecification('const value = 1', '4821-9f0c')).toBe(`const value = 1\n${MARKER}`)
		expect(formatSpecification('', '4821-9f0c')).toBe(MARKER)
	})

	it('attributes a file only to the revision its own marker names', () => {
		const text = "import { test } from 'vitest'\ntest('greets', () => {})\n"
		const marked = formatSpecification(text, '4821-9f0c')

		expect(matchesSpecification(marked, '4821-9f0c')).toBe(true)
		// A different revision, an unmarked file, and a file that carries the marker somewhere other
		// than at its end are all files this package did not write for that revision.
		expect(matchesSpecification(marked, '4821-0000')).toBe(false)
		expect(matchesSpecification(text, '4821-9f0c')).toBe(false)
		expect(matchesSpecification(`${marked}export const NOTE = 1\n`, '4821-9f0c')).toBe(false)
		expect(matchesSpecification('', '4821-9f0c')).toBe(false)
	})
})

describe('core claim refusal', () => {
	const source: Source = { path: 'src/core/greeting.ts', text: '' }
	const control = { files: [], test: source, stage: 'type', reason: 'must not compile' }

	it('names every source member whose path the guard refuses', () => {
		expect(
			findRefusedPaths({
				project: 'configs/src/tsconfig.core.json',
				case: { files: [source], test: source },
				control,
			}),
		).toStrictEqual([])
		expect(
			findRefusedPaths({
				project: 'configs/src/tsconfig.core.json',
				case: {
					files: [source, { path: '../../etc/hosts', text: '' }],
					test: { path: '/etc/hosts', text: '' },
				},
				control: { ...control, files: [{ path: 'C:\\Windows\\hosts', text: '' }] },
			}),
		).toStrictEqual(['case.test.path', 'case.files.1.path', 'control.files.0.path'])
	})

	it('reports nothing for a refusal the advertised schema already explains', () => {
		// A missing text, a member this contract does not declare, and a value that is no claim at
		// all are all refusals the schema itself reports, so blaming a path for one would name the
		// wrong member.
		expect(
			findRefusedPaths({
				project: 'configs/src/tsconfig.core.json',
				case: { files: [{ path: 'src/core/greeting.ts' }], test: source },
				control,
			}),
		).toStrictEqual([])
		expect(
			findRefusedPaths({
				project: 'configs/src/tsconfig.core.json',
				case: { files: [], test: source },
				control,
				surplus: true,
			}),
		).toStrictEqual([])
		expect(findRefusedPaths(undefined)).toStrictEqual([])
		expect(findRefusedPaths([source])).toStrictEqual([])
		expect(findRefusedPaths({ case: 17, control: 'control' })).toStrictEqual([])
	})
})
