import type { Case, Check, Claim, Control, Finding, Source, Toolchain, Verdict } from '@src/core'
import { compileGuard } from '@orkestrel/contract'
import {
	CLAIM_SHAPE,
	PROBE_STAGES,
	isCase,
	isCheck,
	isClaim,
	isControl,
	isFinding,
	isSource,
	isStage,
	isToolchain,
	isVerdict,
} from '@src/core'
import { describe, expect, it } from 'vitest'

describe('core guards', () => {
	it('accepts valid guard values and rejects one-field violations', () => {
		const source: Source = { path: 'src/core/greeting.ts', text: '' }
		const subject: Case = { files: [source], test: source }
		const control: Control = {
			files: [source],
			test: source,
			stage: 'type',
			reason: 'must not compile',
		}
		const claim: Claim = { project: 'configs/src/tsconfig.core.json', case: subject, control }
		const finding: Finding = { path: '', message: '' }
		const check: Check = { stage: 'lint', elapsed: 17, findings: [finding] }
		const toolchain: Toolchain = {
			typescript: '6.0.3',
			oxlint: '1.78.0',
			vitest: '4.1.10',
		}
		const verdict: Verdict = {
			id: '01J8Z0',
			toolchain,
			checks: [check],
			control: [check],
			elapsed: 17,
		}

		expect(isStage('type')).toBe(true)
		expect(isStage('compile')).toBe(false)
		expect(isSource(source)).toBe(true)
		expect(isSource({ ...source, path: '' })).toBe(false)
		expect(isCase(subject)).toBe(true)
		expect(isCase({ ...subject, files: 'source' })).toBe(false)
		expect(isControl(control)).toBe(true)
		expect(isControl({ ...control, reason: '' })).toBe(false)
		expect(isClaim(claim)).toBe(true)
		expect(isClaim({ ...claim, project: '' })).toBe(false)
		expect(isFinding(finding)).toBe(true)
		expect(isFinding({ ...finding, line: '1' })).toBe(false)
		expect(isCheck(check)).toBe(true)
		expect(isCheck({ ...check, elapsed: '17' })).toBe(false)
		expect(isToolchain(toolchain)).toBe(true)
		expect(isToolchain({ ...toolchain, vitest: 4 })).toBe(false)
		expect(isVerdict(verdict)).toBe(true)
		expect(isVerdict({ ...verdict, receipt: 1 })).toBe(false)
	})

	it('agrees with the compiled claim shape for a named hostile population', () => {
		const source: Source = { path: 'src/core/greeting.ts', text: '' }
		const subject: Case = { files: [source], test: source }
		const control: Control = {
			files: [source],
			test: source,
			stage: 'type',
			reason: 'must not compile',
		}
		const claim: Claim = { project: 'configs/src/tsconfig.core.json', case: subject, control }
		const compiled = compileGuard(CLAIM_SHAPE)
		const nullPrototype = Object.assign(Object.create(null), claim)
		const throwingProxy = new Proxy({}, Object.create(WeakMap.prototype))

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
			isClaim({ ...claim, case: { ...subject, test: { ...source, path: '' } } }),
			'empty test path',
		).toBe(compiled({ ...claim, case: { ...subject, test: { ...source, path: '' } } }))
		expect(isClaim({ ...claim, case: { ...subject, files: 'source' } }), 'files not an array').toBe(
			compiled({ ...claim, case: { ...subject, files: 'source' } }),
		)
		expect(isClaim({ ...claim, case: { ...subject, files: [17] } }), 'file entry wrong').toBe(
			compiled({ ...claim, case: { ...subject, files: [17] } }),
		)
		expect(isClaim(null), 'null').toBe(compiled(null))
		expect(isClaim(undefined), 'undefined').toBe(compiled(undefined))
		expect(isClaim([]), 'array').toBe(compiled([]))
		expect(isClaim('claim'), 'string').toBe(compiled('claim'))
		expect(isClaim(nullPrototype), 'null-prototype object').toBe(compiled(nullPrototype))
		expect(isClaim(throwingProxy), 'throwing proxy').toBe(compiled(throwingProxy))
	})

	it('keeps the frozen stage sequence in execution order', () => {
		expect(PROBE_STAGES).toStrictEqual(['type', 'lint', 'runtime'])
		expect(Object.isFrozen(PROBE_STAGES)).toBe(true)
	})
})
