import type { Case, Check, Claim, Stage } from '@src/core'

/**
 * Carries one queued inspection: the case a stage reads and the claim it belongs to.
 *
 * @remarks
 * The coordinator admits one of these per stage at a time. Every stage reads `subject`; the type
 * stage also reads `claim.project`, and the runtime stage reports `claim` when its deadline fires.
 *
 * @example
 * ```ts
 * const inspection: Inspection = { subject: claim.case, claim }
 * ```
 */
export interface Inspection {
	/** The candidate sources and test one stage inspects. */
	readonly subject: Case
	/** The claim the subject belongs to. */
	readonly claim: Claim
}

/**
 * Inspects one case with a resident workspace tool.
 *
 * @remarks
 * Warming begins at construction. The `inspect` method awaits that one warm operation and reuses
 * the resulting tool across calls. A stage serves one inspection at a time and admits none itself.
 * Await an inspection before issuing the next one, or admit through one queue per stage the way
 * `Probe` does: a second concurrent call reaches the same resident tool and the same overlay,
 * document, and specification state the first is still using. A stage never holds a later
 * inspection behind an earlier one, so a caller that abandons an inspection at its own deadline
 * can still use the stage. The `destroy` method permanently tears the stage down and releases
 * every resource it owns.
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
	 * A stage abandons every inspection it holds rather than waiting behind one, so teardown never
	 * waits for an inspection to return. An abandoned inspection rejects, either at the stage's own
	 * guard or as the owned tool closes. The coordinator depends on that guarantee to replace a
	 * stage whose worker no longer returns.
	 *
	 * @returns A promise that settles after the resident tool releases its resources
	 */
	destroy(): Promise<void>
}

/**
 * Carries one parsed package manifest and the path it came from.
 *
 * @example
 * ```ts
 * const manifest: WorkspaceManifest = {
 * 	path: '/srv/checkout/node_modules/typescript/package.json',
 * 	contents: { version: '6.0.3' },
 * }
 * ```
 */
export interface WorkspaceManifest {
	/** Absolute path of the package manifest. */
	readonly path: string
	/** Parsed manifest record. */
	readonly contents: Readonly<Record<string, unknown>>
}

/**
 * Starts and stops the probe's Model Context Protocol stdio transport.
 *
 * @example
 * ```ts
 * const server = createProbeServer(probe)
 * server.start()
 * server.stop()
 * ```
 */
export interface ProbeServerInterface {
	/**
	 * Starts reading newline-delimited JSON requests from standard input.
	 *
	 * @returns Nothing
	 */
	start(): void
	/**
	 * Stops the standard-input pump.
	 *
	 * @returns Nothing
	 */
	stop(): void
}
