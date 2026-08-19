import { arrayShape, literalShape, objectShape, stringShape } from '@orkestrel/contract'
import { PROBE_STAGES } from './constants.js'

/**
 * Blueprint for one file a claim carries.
 *
 * @remarks
 * `path` is constrained to a non-empty string because every stage resolves a file by it, so an
 * empty path names no file. `isSource` enforces the same minimum.
 *
 * @example
 * ```ts
 * compileGuard(SOURCE_SHAPE)({ path: 'src/core/greeting.ts', text: '' }) // true
 * ```
 */
export const SOURCE_SHAPE = objectShape(
	{
		path: stringShape({ min: 1, description: 'Workspace-relative path, which need not exist.' }),
		text: stringShape({ description: "The file's full contents." }),
	},
	{ description: 'One file a claim carries.' },
)

/**
 * Blueprint for the files a claim asserts about and the test that exercises them.
 *
 * @example
 * ```ts
 * const test = { path: 'tests/src/core/greeting.test.ts', text: '' }
 * compileGuard(CASE_SHAPE)({ files: [], test }) // true
 * ```
 */
export const CASE_SHAPE = objectShape(
	{
		files: arrayShape(SOURCE_SHAPE, { description: 'The candidate sources the test imports.' }),
		test: SOURCE_SHAPE,
	},
	{ description: 'The files a claim asserts about, and the test that exercises them.' },
)

/**
 * Blueprint for the negative control, which is a case plus where and why it must break.
 *
 * @remarks
 * Built from `CASE_SHAPE`'s own properties rather than a second copy of them, so the control and
 * the case cannot describe a file differently.
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
 * Blueprint for one claim, and the sole source of both the published tool schema and the guard
 * applied to an arriving claim.
 *
 * @remarks
 * The Model Context Protocol tool publishes `compileSchema(CLAIM_SHAPE)` and admits a call with
 * `compileGuard(CLAIM_SHAPE)`. Deriving both from this one value is what stops the advertised
 * contract and the enforced contract from drifting apart across a release.
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
				'Workspace-relative TypeScript project the candidate sources are checked against.',
		}),
		case: CASE_SHAPE,
		control: CONTROL_SHAPE,
	},
	{ description: 'One claim: the project, the case, and the control that must break.' },
)
