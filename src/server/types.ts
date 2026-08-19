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
 * Holds the candidate sources one inspection substitutes for the files a tool would read from disk.
 *
 * @remarks
 * A stage records every candidate the inspection carries before it reads any of them, and clears
 * the set when the inspection ends, whatever ended it. The entity names no tool: each stage adapts
 * one overlay to the host its own tool expects, so a language service, a document protocol, and a
 * module resolver read one candidate set through three adapters rather than through one shared
 * filesystem. Paths are absolute and the stage resolves them, because only the stage knows the
 * workspace a candidate's declared path is relative to. `revision` identifies the set, so a
 * resident tool that caches by version reads fresh text for a path this overlay holds and reads
 * disk again after `clear`.
 *
 * @example
 * ```ts
 * const overlay = new Overlay()
 * overlay.set('/srv/checkout/src/core/greeting.ts', "export const GREETING = 'hi'\n")
 * console.log(overlay.text('/srv/checkout/src/core/greeting.ts'))
 * overlay.clear()
 * ```
 */
export interface OverlayInterface {
	/** Identity of the candidate set this overlay holds. */
	readonly revision: string
	/** Absolute path of every candidate this overlay holds. */
	readonly paths: readonly string[]
	/**
	 * Records one candidate's text against the absolute path it stands in for.
	 *
	 * @param path - The absolute path the candidate replaces
	 * @param text - The candidate's full contents
	 * @returns Nothing
	 */
	set(path: string, text: string): void
	/**
	 * Reads the candidate text recorded for one absolute path.
	 *
	 * @param path - The absolute path to read
	 * @returns The recorded text, or `undefined` when this overlay holds no candidate there
	 */
	text(path: string): string | undefined
	/**
	 * Checks whether a candidate sits beneath one directory.
	 *
	 * @remarks
	 * A tool asking whether a directory exists is answered from disk first, so this reports only
	 * the directories the candidate set adds. A directory listing is a separate question and stays
	 * on disk: a candidate that entered one would outlive the inspection that declared it.
	 *
	 * @param directory - The absolute directory path to check
	 * @returns True if a candidate path sits beneath the directory; false otherwise
	 */
	covers(directory: string): boolean
	/**
	 * Releases every candidate.
	 *
	 * @returns Nothing
	 */
	clear(): void
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
