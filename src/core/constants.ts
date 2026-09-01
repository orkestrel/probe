/**
 * Lists the stages a claim passes through, in the order a verdict reports them.
 *
 * @remarks
 * One list feeds the `Stage` type, the wire shape, the stage guard, and the receipt computation, so
 * a stage cannot be admitted by one and refused by another. The type derives from this list rather
 * than standing beside it, so a stage the list omits is a stage no member of the union names.
 *
 * @example
 * ```ts
 * PROBE_STAGES // ['type', 'lint', 'runtime']
 * ```
 */
export const PROBE_STAGES = Object.freeze(['type', 'lint', 'runtime'] as const)

/**
 * Lists the parties that can own action on an issue or probe failure.
 *
 * @remarks
 * One list feeds the `Party` type and its guard, so a party cannot be admitted by one and refused
 * by another.
 *
 * @example
 * ```ts
 * PROBE_PARTIES // ['claimant', 'workspace', 'instrument']
 * ```
 */
export const PROBE_PARTIES = Object.freeze(['claimant', 'workspace', 'instrument'] as const)

/**
 * Lists the conditions that can end a probe operation.
 *
 * @remarks
 * One list feeds the code union and the error guard, so a condition cannot be constructed by one
 * and refused by the other. The guard reads this list rather than the class, which is what lets it
 * refuse a lookalike carrying a condition this package never declared.
 *
 * @example
 * ```ts
 * PROBE_ERROR_CODES // ['refused', 'missing', 'malformed', 'destroyed', 'deadline']
 * ```
 */
export const PROBE_ERROR_CODES = Object.freeze([
	'refused',
	'missing',
	'malformed',
	'destroyed',
	'deadline',
] as const)

/**
 * Names the leading token every receipt carries.
 *
 * @remarks
 * A receipt travels away from the verdict that minted it — an agent pastes it into the promotion
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
 * Names the character joining a receipt's tokens.
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

/**
 * Names the default inspection deadline a `Probe` applies when its construction omits one.
 *
 * @remarks
 * `ProbeOptions.deadline` overrides this value per instance.
 *
 * @example
 * ```ts
 * PROBE_DEADLINE // 30_000
 * ```
 */
export const PROBE_DEADLINE = 30_000

/**
 * Names the bound the lint stage holds over the lifecycle exchanges the protocol leaves to the
 * server: the `initialize` reply warming waits for and the `shutdown` reply ending waits for.
 *
 * @remarks
 * It does not reach the diagnostics an inspection waits for, which the caller's own signal bounds.
 * The transport's cooperative window is half of it, so a child that ignores its ending is
 * signalled and released inside the same bound rather than outliving the client's own wait for
 * the close. Measured 2026-08-27: the workspace `oxlint --lsp` answers `initialize` in 155 ms, so
 * this bound is more than ten times that reply.
 *
 * @example
 * ```ts
 * LINT_DEADLINE // 2_000
 * ```
 */
export const LINT_DEADLINE = 2_000

/**
 * Names the total enumerable key bound `ProbeServer` applies to inbound metadata and to produced
 * tool content alike.
 *
 * @remarks
 * `@orkestrel/mcp`'s default leaf is sized for metadata: a verdict costs 38 keys empty and 11 more
 * for each issue a stage reports, so the default carries a verdict whose control refuses one
 * declaration and stops carrying the next one. A whole tool-call result carrying the record beside
 * its rendering costs 44 keys plus 11 for each issue, so this bound carries a record reporting up
 * to 368 issues. Past that the reply falls back to the rendered text, and past the 4 MiB content
 * bound to the receipt block.
 *
 * @example
 * ```ts
 * PROBE_KEYS // 4096
 * ```
 */
export const PROBE_KEYS = 4096

/**
 * Names the specification lifetime the runtime stage replaces its resident Vitest service at.
 *
 * @remarks
 * Vite retains one unresolved URL for every fresh specification path, so an inspection that writes
 * a specification grows a map the resident service never releases. The stage replaces that service
 * rather than deleting from each map it owns, and this is the count of specifications one service
 * carries before the replacement. Any bound holds the retention flat, because the replacement
 * releases everything the instance held; this value trades the cost of the replacement against how
 * far the map grows between them. On 2026-08-20, over this package's own workspace on the host
 * `guides/probe.md` § Cost names, two runs of 66 inspections put the crossing inspection at 480 ms
 * and 269 ms against median inspections of 156 ms and 155 ms.
 *
 * @example
 * ```ts
 * PROBE_SPECIFICATIONS // 64
 * ```
 */
export const PROBE_SPECIFICATIONS = 64

/**
 * Names the Vite plugin the runtime stage installs into a target workspace's Vitest configuration.
 *
 * @remarks
 * The stage declares the plugin under this name and reads a configured project's plugin list for
 * the same name to decide whether that project carries the overlay. One name feeds both, so a
 * project the stage instrumented is never reported as a workspace project it could not reach.
 *
 * @example
 * ```ts
 * RUNTIME_PLUGIN // 'orkestrel-runtime-overlay'
 * ```
 */
export const RUNTIME_PLUGIN = 'orkestrel-runtime-overlay'
