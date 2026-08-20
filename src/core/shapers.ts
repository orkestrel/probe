import { arrayShape, literalShape, objectShape, stringShape } from '@orkestrel/contract'
import { PROBE_STAGES } from './constants.js'

/**
 * Describes one proposed file a claim carries.
 *
 * @remarks
 * `path` is constrained to a non-empty string because every stage resolves a file by it, so an
 * empty path names no file. That minimum is the whole of the constraint here, and it is the one
 * place the wire contract is wider than what this package admits: `isDraft` enforces the same
 * minimum and also refuses an absolute path and one that traverses out of the workspace, which no
 * JSON Schema keyword can express. A caller that satisfies this shape can still be refused, and
 * `ProbeServer` names the member when it is.
 *
 * @example
 * ```ts
 * compileGuard(DRAFT_SHAPE)({ path: 'src/core/greeting.ts', text: '' }) // true
 * ```
 */
export const DRAFT_SHAPE = objectShape(
	{
		path: stringShape({ min: 1, description: 'Workspace-relative path, which need not exist.' }),
		text: stringShape({ description: "The file's full contents." }),
	},
	{ description: 'One proposed file a claim carries.' },
)

/**
 * Describes the drafts a claim asserts about and the test that exercises them.
 *
 * @example
 * ```ts
 * const test = { path: 'tests/src/core/greeting.test.ts', text: '' }
 * compileGuard(CASE_SHAPE)({ files: [], test }) // true
 * ```
 */
export const CASE_SHAPE = objectShape(
	{
		files: arrayShape(DRAFT_SHAPE, { description: 'The candidate drafts the test imports.' }),
		test: DRAFT_SHAPE,
	},
	{ description: 'The drafts a claim asserts about, and the test that exercises them.' },
)

/**
 * Describes the negative control, which is a case plus where and why it must break.
 *
 * @remarks
 * Built from `CASE_SHAPE`'s own properties rather than a second copy of them, so the control and
 * the case cannot describe a draft differently.
 *
 * @example
 * ```ts
 * const test = { path: 'tests/src/core/greeting.test.ts', text: '' }
 * compileGuard(CONTROL_SHAPE)({ files: [], test, stage: 'type', reason: 'must not compile' }) // true
 * ```
 */
export const CONTROL_SHAPE = objectShape(
	{
		...CASE_SHAPE.properties,
		stage: literalShape(PROBE_STAGES, { description: 'The stage this control must fail at.' }),
		reason: stringShape({ min: 1, description: 'Why the control fails at that stage.' }),
	},
	{ description: 'A case that must fail, naming the stage where it must fail and why.' },
)

/**
 * Describes one claim and is the sole source of both the published tool schema and the guard
 * applied to an arriving claim.
 *
 * @remarks
 * The Model Context Protocol tool publishes `compileSchema(CLAIM_SHAPE)` and admits a call with
 * `isClaim`. Deriving the advertised schema from this one value is what stops the two from drifting
 * apart across a release on any member either can express. `isClaim` is narrower on the one member
 * neither a schema keyword nor this shape can carry — the containment rule on `Draft.path` — and
 * `validators.ts` names where.
 *
 * @example
 * ```ts
 * const schema = compileSchema(CLAIM_SHAPE)
 * const admits = compileGuard(CLAIM_SHAPE)
 * schema.type // 'object'
 * admits({ project: 'tsconfig.json' }) // false
 * ```
 */
export const CLAIM_SHAPE = objectShape(
	{
		project: stringShape({
			min: 1,
			description:
				'Workspace-relative TypeScript project the candidate drafts are checked against.',
		}),
		case: CASE_SHAPE,
		control: CONTROL_SHAPE,
	},
	{ description: 'One claim: the project, the case, and the control that must break.' },
)
