import type { Guard } from '@orkestrel/contract'
import type {
	Case,
	Check,
	Claim,
	Control,
	Finding,
	FindingOrigin,
	Project,
	Source,
	Stage,
	Toolchain,
	Verdict,
} from './types.js'
import {
	andOf,
	arrayOf,
	isNonEmptyString,
	isNumber,
	isString,
	literalOf,
	recordOf,
} from '@orkestrel/contract'
import { FINDING_ORIGINS, PROBE_STAGES } from './constants.js'

/**
 * Checks whether a value names one of the three stages.
 *
 * @param value - The value to check
 * @returns True if the value is a stage name; false otherwise
 *
 * @example
 * ```ts
 * isStage('lint') // true
 * isStage('typecheck') // false
 * ```
 */
export const isStage: Guard<Stage> = literalOf(PROBE_STAGES)

/**
 * Checks whether a value carries a file's path and text.
 *
 * @remarks
 * Rejects an empty, absolute, or workspace-escaping path. A contained relative path may contain
 * `.` or may traverse to a parent that remains inside the workspace. Every stage resolves a file
 * by that path, so admitting an escape here would defer the refusal until a stage had already
 * accepted the source. A `Finding` carries no such minimum because this package produces findings
 * rather than admits them.
 *
 * @param value - The value to check
 * @returns True if the value is a source; false otherwise
 *
 * @example
 * ```ts
 * isSource({ path: 'src/core/greeting.ts', text: 'export const GREETING = "hi"\n' }) // true
 * isSource({ path: '../../etc/hosts', text: '' }) // false
 * isSource({ path: 'src/core/greeting.ts' }) // false
 * ```
 */
export const isSource: Guard<Source> = recordOf({
	path: andOf<string>(isNonEmptyString, (path) => {
		if (/^(?:[\\/]|[A-Za-z]:)/.test(path)) return false
		let depth = 0
		for (const segment of path.split(/[\\/]+/)) {
			if (segment === '' || segment === '.') continue
			if (segment !== '..') {
				depth += 1
				continue
			}
			if (depth === 0) return false
			depth -= 1
		}
		return true
	}),
	text: isString,
})

/**
 * Checks whether a value carries a claim's candidate files and its test.
 *
 * @param value - The value to check
 * @returns True if the value is a case; false otherwise
 *
 * @example
 * ```ts
 * const test = { path: 'tests/src/core/greeting.test.ts', text: 'test("greets", () => {})\n' }
 * isCase({ files: [], test }) // true
 * ```
 */
export const isCase: Guard<Case> = recordOf({ files: arrayOf(isSource), test: isSource })

/**
 * Checks whether a value carries a case plus the stage and reason it must fail for.
 *
 * @param value - The value to check
 * @returns True if the value is a control; false otherwise
 *
 * @example
 * ```ts
 * const test = { path: 'tests/src/core/greeting.test.ts', text: 'test("greets", () => {})\n' }
 * isControl({ files: [], test, stage: 'type', reason: 'must not compile' }) // true
 * isControl({ files: [], test }) // false
 * ```
 */
export const isControl: Guard<Control> = recordOf({
	files: arrayOf(isSource),
	test: isSource,
	stage: isStage,
	reason: isNonEmptyString,
})

/**
 * Checks whether a value carries a project, a case, and a control.
 *
 * @remarks
 * Exact rather than open: a claim is this package's own record, so an unknown member is a caller
 * sending a contract this service does not implement rather than a wider caller it must tolerate.
 *
 * `CLAIM_SHAPE` is the wire contract's shape and this is the admission rule the tool enforces, and
 * the rule is strictly narrower than the shape. They agree on every member but one: the shape
 * constrains `Source.path` to a non-empty string, while `isSource` also refuses an absolute path
 * and one that traverses out of the workspace, so `../../etc/hosts` satisfies
 * `compileGuard(CLAIM_SHAPE)` and is refused here. `ProbeServer` advertises the shape and enforces
 * this rule, so it names the refused member with `findRefusedPaths` rather than reporting only that
 * the claim was invalid.
 *
 * @param value - The value to check
 * @returns True if the value is a claim; false otherwise
 *
 * @example
 * ```ts
 * isClaim({ project: 'tsconfig.json', case: subject, control }) // true
 * isClaim({ project: 'tsconfig.json', case: subject }) // false
 * ```
 */
export const isClaim: Guard<Claim> = recordOf({
	project: isNonEmptyString,
	case: isCase,
	control: isControl,
})

/**
 * Checks whether a value names one of the two origins a finding carries.
 *
 * @param value - The value to check
 * @returns True if the value is an origin; false otherwise
 *
 * @example
 * ```ts
 * isOrigin('instrument') // true
 * isOrigin('stage') // false
 * ```
 */
export const isOrigin: Guard<FindingOrigin> = literalOf(FINDING_ORIGINS)

/**
 * Checks whether a value carries one message, its location, and the origin of the fault it names.
 *
 * @remarks
 * `origin` is required rather than optional. Every finding this package produces sets it, and a
 * receipt turns on it: a control's finding disproves the claim only when its origin says the
 * candidate's own code broke.
 *
 * @param value - The value to check
 * @returns True if the value is a finding; false otherwise
 *
 * @example
 * ```ts
 * isFinding({ origin: 'code', path: 'src/core/greeting.ts', message: 'not assignable' }) // true
 * isFinding({ path: 'src/core/greeting.ts', message: 'not assignable' }) // false
 * ```
 */
export const isFinding: Guard<Finding> = recordOf(
	{ origin: isOrigin, path: isString, message: isString, line: isNumber },
	['line'],
)

/**
 * Checks whether a value carries one stage's outcome.
 *
 * @param value - The value to check
 * @returns True if the value is a check; false otherwise
 *
 * @example
 * ```ts
 * isCheck({ stage: 'lint', elapsed: 17, findings: [] }) // true
 * ```
 */
export const isCheck: Guard<Check> = recordOf({
	stage: isStage,
	elapsed: isNumber,
	findings: arrayOf(isFinding),
})

/**
 * Checks whether a value names all three resolved tool versions.
 *
 * @param value - The value to check
 * @returns True if the value is a toolchain; false otherwise
 *
 * @example
 * ```ts
 * isToolchain({ typescript: '6.0.3', oxlint: '1.78.0', vitest: '4.1.10' }) // true
 * isToolchain({ typescript: '6.0.3' }) // false
 * ```
 */
export const isToolchain: Guard<Toolchain> = recordOf({
	typescript: isString,
	oxlint: isString,
	vitest: isString,
})

/**
 * Checks whether a value names one resolved TypeScript project and what it contained.
 *
 * @remarks
 * Rejects an empty path and an empty digest. A verdict names the project that judged it, so a
 * blank member here would report a project the type stage never applied.
 *
 * @param value - The value to check
 * @returns True if the value is a project; false otherwise
 *
 * @example
 * ```ts
 * isProject({ path: 'configs/src/tsconfig.core.json', digest: '3b674fdf121c85ef' }) // true
 * isProject({ path: 'configs/src/tsconfig.core.json', digest: '' }) // false
 * ```
 */
export const isProject: Guard<Project> = recordOf({
	path: isNonEmptyString,
	digest: isNonEmptyString,
})

/**
 * Checks whether a value carries a complete verdict.
 *
 * @remarks
 * Accepts any check count, because arity is the coordinator's obligation rather than this guard's:
 * a stage that could not start throws before a verdict is built, so a short list can only arrive
 * from a caller that assembled one by hand.
 *
 * @param value - The value to check
 * @returns True if the value is a verdict; false otherwise
 *
 * @example
 * ```ts
 * const basis = { id: '01J8Z0', digest: '6ca20c3b', toolchain, project, elapsed: 337 }
 * isVerdict({ ...basis, checks: [], control: [] }) // true
 * isVerdict({ ...basis, checks: [] }) // false
 * ```
 */
export const isVerdict: Guard<Verdict> = recordOf(
	{
		id: isString,
		digest: isString,
		toolchain: isToolchain,
		project: isProject,
		reason: isNonEmptyString,
		checks: arrayOf(isCheck),
		control: arrayOf(isCheck),
		elapsed: isNumber,
		receipt: isString,
	},
	['reason', 'receipt'],
)
