import type {
	Case,
	Check,
	Claim,
	Control,
	Draft,
	Issue,
	Project,
	Toolchain,
	Verdict,
} from '@src/core'
import { compileGuard } from '@orkestrel/contract'
import {
	CLAIM_SHAPE,
	PROBE_STAGES,
	isCase,
	isCheck,
	isClaim,
	isControl,
	isIssue,
	isParty,
	isDraft,
	isProject,
	isStage,
	isToolchain,
	isVerdict,
} from '@src/core'
import { createHostileValues } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'

describe('core guards', () => {
	it('accepts valid guard values and rejects one-field violations', () => {
		const draft: Draft = { path: 'src/core/greeting.ts', text: '' }
		const subject: Case = { files: [draft], test: draft }
		const control: Control = {
			files: [draft],
			test: draft,
			stage: 'type',
			reason: 'must not compile',
		}
		const claim: Claim = { project: 'configs/src/tsconfig.core.json', case: subject, control }
		const issue: Issue = { origin: 'claimant', path: '', message: '' }
		const check: Check = { stage: 'lint', elapsed: 17, issues: [issue] }
		const toolchain: Toolchain = {
			typescript: '6.0.3',
			oxlint: '1.79.0',
			vitest: '4.1.11',
		}
		const project: Project = {
			path: 'configs/src/tsconfig.core.json',
			digest: '3b674fdf121c85efb9ed1bab25ceeec8',
		}
		const verdict: Verdict = {
			id: '88a5addc-7d33-40dc-9a5a-104b71f8787d',
			digest: '6ca20c3bff623031d3955b9d1a76d71d',
			toolchain,
			project,
			case: [check],
			control: [check],
			elapsed: 17,
		}

		expect(isStage('type')).toBe(true)
		expect(isStage('compile')).toBe(false)
		expect(isDraft(draft)).toBe(true)
		expect(isDraft({ ...draft, path: '' })).toBe(false)
		expect(isCase(subject)).toBe(true)
		expect(isCase({ ...subject, files: 'draft' })).toBe(false)
		expect(isControl(control)).toBe(true)
		expect(isControl({ ...control, reason: '' })).toBe(false)
		expect(isClaim(claim)).toBe(true)
		expect(isClaim({ ...claim, project: '' })).toBe(false)
		expect(isIssue(issue)).toBe(true)
		// The optional member is a span rather than a number, so a bare number, a half-built span,
		// and a span carrying a non-numeric coordinate are each refused, while a whole span and an
		// absent one are each admitted.
		expect(
			isIssue({
				...issue,
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
			}),
		).toBe(true)
		expect(isIssue({ ...issue, range: 1 })).toBe(false)
		expect(isIssue({ ...issue, range: { start: { line: 0, character: 0 } } })).toBe(false)
		expect(
			isIssue({
				...issue,
				range: { start: { line: '0', character: 0 }, end: { line: 0, character: 4 } },
			}),
		).toBe(false)
		expect(isCheck(check)).toBe(true)
		expect(isCheck({ ...check, elapsed: '17' })).toBe(false)
		expect(isToolchain(toolchain)).toBe(true)
		expect(isToolchain({ ...toolchain, vitest: 4 })).toBe(false)
		expect(isProject(project)).toBe(true)
		expect(isProject({ ...project, digest: '' })).toBe(false)
		expect(isVerdict(verdict)).toBe(true)
		expect(isVerdict({ ...verdict, reason: 'must not compile' })).toBe(true)
		expect(isVerdict({ ...verdict, reason: '' })).toBe(false)
		expect(isVerdict({ ...verdict, receipt: 1 })).toBe(false)
	})

	it('admits a contained relative draft path and refuses an absolute or escaping one', () => {
		expect(isDraft({ path: 'src/../tests/greeting.test.ts', text: '' })).toBe(true)
		expect(isDraft({ path: '../../etc/hosts', text: '' })).toBe(false)
		// Both absolute forms, on every host. The rule reads the string rather than the filesystem,
		// so a Windows drive letter is refused on Linux and a POSIX root is refused on Windows.
		expect(isDraft({ path: '/etc/hosts', text: '' })).toBe(false)
		expect(isDraft({ path: 'C:\\Windows\\System32\\drivers\\etc\\hosts', text: '' })).toBe(false)
	})

	it('admits an issue that names its origin and refuses one that does not', () => {
		const issue: Issue = {
			origin: 'claimant',
			path: 'src/core/greeting.ts',
			message: 'not assignable',
		}
		const { origin: _, ...anonymous } = issue
		const check: Check = { stage: 'runtime', elapsed: 1, issues: [issue] }
		const verdict: Verdict = {
			id: '88a5addc-7d33-40dc-9a5a-104b71f8787d',
			digest: '6ca20c3bff623031d3955b9d1a76d71d',
			toolchain: { typescript: '6.0.3', oxlint: '1.79.0', vitest: '4.1.11' },
			project: {
				path: 'configs/src/tsconfig.core.json',
				digest: '3b674fdf121c85efb9ed1bab25ceeec8',
			},
			case: [check],
			control: [check],
			elapsed: 17,
		}

		expect(isParty('claimant')).toBe(true)
		expect(isParty('workspace')).toBe(true)
		expect(isParty('instrument')).toBe(true)
		expect(isParty('stage')).toBe(false)
		expect(isIssue(issue)).toBe(true)
		expect(isIssue({ ...issue, origin: 'stage' })).toBe(false)
		expect(isIssue(anonymous)).toBe(false)
		// The server applies `isVerdict` to every verdict the prove tool returns, so a guard that
		// refused the origin the stages now produce would throw on every call rather than fail
		// only here.
		expect(isVerdict(verdict)).toBe(true)
	})

	it('agrees with the compiled claim shape for a named hostile population', () => {
		const draft: Draft = { path: 'src/core/greeting.ts', text: '' }
		const subject: Case = { files: [draft], test: draft }
		const control: Control = {
			files: [draft],
			test: draft,
			stage: 'type',
			reason: 'must not compile',
		}
		const claim: Claim = { project: 'configs/src/tsconfig.core.json', case: subject, control }
		const compiled = compileGuard(CLAIM_SHAPE)
		const nullPrototype = Object.assign(Object.create(null), claim)
		const hostileValues = createHostileValues()

		expect(isClaim(claim), 'valid claim').toBe(compiled(claim))
		expect(isClaim({ ...claim, project: '' }), 'empty project').toBe(
			compiled({ ...claim, project: '' }),
		)
		expect(isClaim({ case: subject, control }), 'missing project').toBe(
			compiled({ case: subject, control }),
		)
		expect(isClaim({ ...claim, control: { ...control, reason: '' } }), 'empty control reason').toBe(
			compiled({ ...claim, control: { ...control, reason: '' } }),
		)
		expect(isClaim({ ...claim, control: { ...control, stage: 'compile' } }), 'bad stage').toBe(
			compiled({ ...claim, control: { ...control, stage: 'compile' } }),
		)
		expect(
			isClaim({
				...claim,
				control: { files: control.files, test: control.test, reason: control.reason },
			}),
			'missing stage',
		).toBe(
			compiled({
				...claim,
				control: { files: control.files, test: control.test, reason: control.reason },
			}),
		)
		expect(isClaim({ ...claim, extra: true }), 'extra key').toBe(
			compiled({ ...claim, extra: true }),
		)
		expect(
			isClaim({ ...claim, case: { ...subject, test: { ...draft, path: '' } } }),
			'empty test path',
		).toBe(compiled({ ...claim, case: { ...subject, test: { ...draft, path: '' } } }))
		expect(isClaim({ ...claim, case: { ...subject, files: 'draft' } }), 'files not an array').toBe(
			compiled({ ...claim, case: { ...subject, files: 'draft' } }),
		)
		expect(isClaim({ ...claim, case: { ...subject, files: [17] } }), 'file entry wrong').toBe(
			compiled({ ...claim, case: { ...subject, files: [17] } }),
		)
		expect(isClaim(null), 'null').toBe(compiled(null))
		expect(isClaim(undefined), 'undefined').toBe(compiled(undefined))
		expect(isClaim([]), 'array').toBe(compiled([]))
		expect(isClaim('claim'), 'string').toBe(compiled('claim'))
		expect(isClaim(nullPrototype), 'null-prototype object').toBe(compiled(nullPrototype))
		for (const [index, value] of hostileValues.entries()) {
			expect(isClaim(value), `hostile value ${index}`).toBe(compiled(value))
		}
	})

	it('refuses a draft path the published claim schema admits', () => {
		const draft: Draft = { path: 'src/core/greeting.ts', text: '' }
		const control: Control = {
			files: [],
			test: draft,
			stage: 'type',
			reason: 'must not compile',
		}
		const escaping: Claim = {
			project: 'configs/src/tsconfig.core.json',
			case: { files: [{ path: '../../etc/hosts', text: '' }], test: draft },
			control,
		}
		const absolute: Claim = {
			project: 'configs/src/tsconfig.core.json',
			case: { files: [{ path: '/etc/hosts', text: '' }], test: draft },
			control,
		}
		const compiled = compileGuard(CLAIM_SHAPE)

		// The one place the guard is narrower than the advertised schema. Every other member the
		// preceding population covers, and the two agree on all of it.
		for (const claim of [escaping, absolute]) {
			expect(compiled(claim), `schema admits ${claim.case.files[0]?.path ?? ''}`).toBe(true)
			expect(isClaim(claim), `guard refuses ${claim.case.files[0]?.path ?? ''}`).toBe(false)
		}
	})

	it('refuses a verdict that omits what judged it or names it blankly', () => {
		const check: Check = { stage: 'lint', elapsed: 17, issues: [] }
		const project: Project = {
			path: 'configs/src/tsconfig.core.json',
			digest: '3b674fdf121c85efb9ed1bab25ceeec8',
		}
		const verdict: Verdict = {
			id: '88a5addc-7d33-40dc-9a5a-104b71f8787d',
			digest: '6ca20c3bff623031d3955b9d1a76d71d',
			toolchain: { typescript: '6.0.3', oxlint: '1.79.0', vitest: '4.1.11' },
			project,
			case: [check],
			control: [check],
			elapsed: 17,
		}
		const { digest: _digest, ...withoutDigest } = verdict
		const { project: _project, ...withoutProject } = verdict

		expect(isProject(project)).toBe(true)
		expect(isProject({ ...project, path: '' })).toBe(false)
		expect(isProject({ ...project, digest: '' })).toBe(false)
		expect(isProject({ path: project.path })).toBe(false)
		// The verdict guards the server's own output, so a verdict that cannot say what judged it
		// must be refused at the boundary rather than shipped to a reader who trusts the token.
		expect(isVerdict(verdict)).toBe(true)
		expect(isVerdict(withoutDigest)).toBe(false)
		expect(isVerdict(withoutProject)).toBe(false)
		expect(isVerdict({ ...verdict, project: { ...project, path: '' } })).toBe(false)
		expect(isVerdict({ ...verdict, project: { ...project, digest: '' } })).toBe(false)
		expect(isVerdict({ ...verdict, digest: 17 })).toBe(false)
	})

	it('keeps the frozen stage sequence in execution order', () => {
		expect(PROBE_STAGES).toStrictEqual(['type', 'lint', 'runtime'])
		expect(Object.isFrozen(PROBE_STAGES)).toBe(true)
	})
})
