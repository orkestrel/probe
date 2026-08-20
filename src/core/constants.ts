import type { FindingOrigin, Stage } from './types.js'

/**
 * The three stages a claim passes through, in the order a verdict reports them.
 *
 * @remarks
 * One list feeds the wire shape, the stage guard, and the receipt computation, so a stage cannot
 * be admitted by one and refused by another.
 *
 * @example
 * ```ts
 * PROBE_STAGES // ['type', 'lint', 'runtime']
 * ```
 */
export const PROBE_STAGES: readonly Stage[] = Object.freeze(['type', 'lint', 'runtime'])

/**
 * The two origins a finding carries, naming where the fault it reports lives.
 *
 * @remarks
 * One list feeds the origin guard and the wire shape the stages produce, so an origin cannot be
 * admitted by one and refused by another.
 *
 * @example
 * ```ts
 * FINDING_ORIGINS // ['code', 'instrument']
 * ```
 */
export const FINDING_ORIGINS: readonly FindingOrigin[] = Object.freeze(['code', 'instrument'])

/**
 * The leading token every receipt carries.
 *
 * @remarks
 * A receipt travels away from the verdict that issued it — an agent pastes it into the promotion
 * action — so it names itself rather than relying on where it was found.
 *
 * @example
 * ```ts
 * const receipt =
 * 	'probe:6ca20c3bff623031d3955b9d1a76d71d:type:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8'
 * receipt.startsWith(RECEIPT_PREFIX) // true
 * ```
 */
export const RECEIPT_PREFIX = 'probe'

/**
 * The character joining a receipt's tokens.
 *
 * @remarks
 * A project path can contain this character, so the project field goes last and a reader rejoins
 * every field from index 6 onward with this separator rather than expecting a fixed count.
 *
 * @example
 * ```ts
 * const receipt =
 * 	'probe:6ca20c3bff623031d3955b9d1a76d71d:type:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8'
 * receipt.split(RECEIPT_SEPARATOR).length // 7
 * ```
 */
export const RECEIPT_SEPARATOR = ':'
