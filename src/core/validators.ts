import type { Guard } from '@orkestrel/contract'
import type {
	Case,
	Check,
	Claim,
	Control,
	Draft,
	Issue,
	Party,
	Project,
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
import { isLSPRange } from '@orkestrel/lsp'
import { PROBE_PARTIES, PROBE_STAGES } from './constants.js'

/**
 * Checks whether a value names a stage.
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
 * Checks whether a value carries a proposed file's path and text.
 *
 * @remarks
 * Rejects an empty, absolute, or workspace-escaping path. A contained relative path may contain
 * `.` or may traverse to a parent that remains inside the workspace. Every stage resolves a file
 * by that path, so admitting an escape here would defer the refusal until a stage had already
 * accepted the draft. An `Issue` carries no such minimum because this package produces issues
 * rather than admits them.
 *
 * @param value - The value to check
 * @returns True if the value is a draft; false otherwise
 *
 * @example
 * ```ts
 * isDraft({ path: 'src/core/greeting.ts', text: 'export const GREETING = "hi"\n' }) // true
 * isDraft({ path: '../../etc/hosts', text: '' }) // false
 * isDraft({ path: 'src/core/greeting.ts' }) // false
 * ```
 */
export const isDraft: Guard<Draft> = recordOf({
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
 * Checks whether a value carries a claim's candidate drafts and its test.
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
export const isCase: Guard<Case> = recordOf({ files: arrayOf(isDraft), test: isDraft })

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
	files: arrayOf(isDraft),
	test: isDraft,
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
 * the rule is strictly narrower than the shape. They agree on every member but `Draft.path`: the
 * shape constrains it to a non-empty string, while `isDraft` also refuses an absolute path
 * and one that traverses out of the workspace, so `../../etc/hosts` satisfies
 * `compileGuard(CLAIM_SHAPE)` and is refused here. `ProbeServer` advertises the shape and enforces
 * this rule, so it names the refused member rather than reporting only that the claim was invalid.
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
 * Checks whether a value names a party an issue carries.
 *
 * @param value - The value to check
 * @returns True if the value is a party; false otherwise
 *
 * @example
 * ```ts
 * isParty('claimant') // true
 * isParty('workspace') // true
 * isParty('instrument') // true
 * isParty('stage') // false
 * ```
 */
export const isParty: Guard<Party> = literalOf(PROBE_PARTIES)

/**
 * Checks whether a value carries one message, its location, and the origin of the fault it names.
 *
 * @remarks
 * `origin` is required rather than optional. Every issue this package produces sets it, and a
 * receipt turns on it: a control's issue disproves the claim only when its origin names the
 * claimant.
 *
 * @param value - The value to check
 * @returns True if the value is an issue; false otherwise
 *
 * @example
 * ```ts
 * isIssue({ origin: 'claimant', path: 'src/core/greeting.ts', message: 'not assignable' }) // true
 * isIssue({ path: 'src/core/greeting.ts', message: 'not assignable' }) // false
 * ```
 */
export const isIssue: Guard<Issue> = recordOf(
	{ origin: isParty, path: isString, message: isString, range: isLSPRange },
	['range'],
)

/**
 * Checks whether a value carries one stage's outcome.
 *
 * @param value - The value to check
 * @returns True if the value is a check; false otherwise
 *
 * @example
 * ```ts
 * isCheck({ stage: 'lint', elapsed: 17, issues: [] }) // true
 * ```
 */
export const isCheck: Guard<Check> = recordOf({
	stage: isStage,
	elapsed: isNumber,
	issues: arrayOf(isIssue),
})

/**
 * Checks whether a value names every tool version the target workspace's installed manifests publish.
 *
 * @param value - The value to check
 * @returns True if the value is a toolchain; false otherwise
 *
 * @example
 * ```ts
 * isToolchain({ typescript: '6.0.3', oxlint: '1.79.0', vitest: '4.1.11' }) // true
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
 * isVerdict({ ...basis, case: [], control: [] }) // true
 * isVerdict({ ...basis, case: [] }) // false
 * ```
 */
export const isVerdict: Guard<Verdict> = recordOf(
	{
		id: isString,
		digest: isString,
		toolchain: isToolchain,
		project: isProject,
		reason: isNonEmptyString,
		case: arrayOf(isCheck),
		control: arrayOf(isCheck),
		elapsed: isNumber,
		receipt: isString,
	},
	['reason', 'receipt'],
)
