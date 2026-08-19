import type { Case, Check, Stage } from '@src/core'

/**
 * Inspects one case with a resident workspace tool.
 *
 * @remarks
 * Warming begins at construction. The `inspect` method awaits that one warm operation and reuses
 * the resulting tool across calls. The `destroy` method permanently tears the stage down and
 * releases every resource it owns.
 *
 * @example
 * ```ts
 * const check = await stage.inspect(subject)
 * console.log(check.stage)
 * await stage.destroy()
 * ```
 */
export interface StageInterface {
	/** The inspection this resident stage performs. */
	readonly stage: Stage
	/**
	 * Inspects one case.
	 *
	 * @param subject - The candidate sources and test to inspect
	 * @returns One outcome for this stage
	 * @throws When the resident tool cannot start or has already been destroyed
	 */
	inspect(subject: Case): Promise<Check>
	/**
	 * Tears down the resident tool and releases its resources.
	 *
	 * @remarks
	 * A stage may abandon an in-flight inspection rather than waiting behind it. The inspection may
	 * reject as the owned tool closes.
	 *
	 * @returns A promise that settles after the resident tool releases its resources
	 */
	destroy(): Promise<void>
}
