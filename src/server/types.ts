import type { Case, Check, Claim, Project, Stage } from '@src/core'

/**
 * Carries one queued inspection: the case a stage reads and the claim it belongs to.
 *
 * @remarks
 * The coordinator admits one of these per stage at a time. Every stage reads `subject`; the type
 * stage also reads `claim.project`, and the runtime stage reports `claim` when its deadline fires.
 * A coordinator such as `Probe` mints an inspection when it admits a claim to a stage.
 *
 * @example
 * ```ts
 * const inspection: Inspection = { subject: claim.case, claim }
 * ```
 */
export interface Inspection {
	/** The candidate drafts and test one stage inspects. */
	readonly subject: Case
	/** The claim the subject belongs to. */
	readonly claim: Claim
}

/**
 * Holds the candidate drafts one inspection substitutes for the files a tool would read from disk.
 *
 * @remarks
 * A stage records every candidate the inspection carries before it reads any of them, and clears
 * the set when the inspection ends, whatever ended it. The entity names no tool: each stage adapts
 * one overlay to the host its own tool expects, so a language service, a document protocol, and a
 * module resolver read one candidate set through their own adapters rather than through one shared
 * filesystem. Paths are absolute and the stage resolves them, because only the stage knows the
 * workspace a candidate's declared path is relative to. `revision` identifies the set, so a
 * resident tool that caches by version reads fresh text for a path this overlay holds and reads
 * disk again after `clear`.
 *
 * Mint one overlay per inspection and release it when that inspection ends. An instance shared
 * across inspections keeps the identity a resident tool caches against, so the second inspection
 * reads the first one's answer as a fresh one. `Overlay` implements this contract.
 *
 * @example
 * ```ts
 * const overlay: OverlayInterface = new Overlay()
 * overlay.set('/srv/checkout/src/core/greeting.ts', "export const GREETING = 'hi'\n")
 * overlay.covers('/srv/checkout/src/core') // true
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
 * Await an inspection before starting the next one, or admit through one queue per stage the way
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
	 * Claimant-owned progress the coordinator compares with its inspection snapshot.
	 *
	 * @remarks
	 * When claimant-owned work is admitted, raise `progress` before awaiting its result. When this
	 * stage later performs stage-owned awaited work, return `progress` to its pre-inspection reading
	 * before that work starts. `RuntimeStage` does this before eviction and cleanup, so an expiry
	 * during that work reads level with the coordinator's snapshot and is attributed to the
	 * instrument rather than to the claimant.
	 */
	readonly progress: number
	/**
	 * Inspects one case.
	 *
	 * @param subject - The candidate drafts and test to inspect
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
	 * guard or as the owned tool closes. Teardown is bounded whatever the resident tool does: a tool
	 * that answers neither its warming exchange nor its ending is signalled and released at the
	 * stage's own deadline. A coordinator replaces a stage whose worker no longer returns because
	 * teardown neither waits for an inspection nor waits past that deadline.
	 *
	 * @returns A promise that settles after the resident tool releases its resources
	 */
	destroy(): Promise<void>
}

/**
 * Inspects TypeScript source against a caller-named project and reports what that project is.
 *
 * @remarks
 * The type stage carries members the shared stage contract cannot: the lint and runtime stages
 * read no project, so a project parameter and a project lookup belong here rather than on
 * `StageInterface`.
 *
 * @example
 * ```ts
 * const project = await stage.resolve('configs/src/tsconfig.core.json')
 * const check = await stage.inspect(subject, project.path)
 * ```
 */
export interface TypeStageInterface extends StageInterface {
	/**
	 * Inspects one case, against a caller-named project where the caller names one.
	 *
	 * @param subject - The candidate drafts and test to inspect
	 * @param project - The workspace-relative TypeScript project the candidate drafts are checked
	 * against. Default: the scoped project each candidate path infers
	 * @returns One outcome for this stage
	 * @throws When the resident compiler cannot start or the stage has already been destroyed
	 */
	inspect(subject: Case, project?: string): Promise<Check>
	/**
	 * Resolves one project to the path and digest the stage applies for it.
	 *
	 * @param project - The workspace-relative TypeScript project to resolve
	 * @returns The resolved workspace-relative path and the digest of its compiler options
	 * @throws When the project escapes the workspace, cannot be parsed, or the stage has already
	 * been destroyed
	 */
	resolve(project: string): Promise<Project>
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
 * Serves one probe over this process's Model Context Protocol stdio transport.
 *
 * @remarks
 * The server owns the process it runs in. `start` seizes standard input and standard output for
 * the transport and registers the termination handlers a harness signals, so a host that starts one
 * has already given the process to it. `destroy` reverses all of that and tears the probe down with
 * it, which is why there is no verb that stops serving and leaves the resident engines running: a
 * probe nothing is reading from holds its resident tools for nobody.
 *
 * @example
 * ```ts
 * const server = new ProbeServer({ workspace: process.cwd() })
 * server.start()
 * await server.destroy()
 * ```
 */
export interface ProbeServerInterface {
	/**
	 * Serves the probe over this process's standard input and output.
	 *
	 * @remarks
	 * Reads newline-delimited JSON requests from standard input, and answers a `SIGINT` or a
	 * `SIGTERM` by destroying the server. Calling this on a server already serving does nothing.
	 * Calling it after teardown begins throws a claimant-owned `destroyed` failure.
	 *
	 * @returns Nothing
	 * @throws When this call comes after teardown begins
	 */
	start(): void
	/**
	 * Releases the transport, the process listeners, and the probe behind them.
	 *
	 * @remarks
	 * Settling is idempotent: a call made while teardown is running joins it and returns the same
	 * promise, and a call made afterwards returns that settled promise. The server removes exactly the
	 * listeners it attached, holding each one as a field rather than choosing by absence from a
	 * capture, so a host that keeps running after this call reads its own standard input again and
	 * receives its own signals, and a listener the host registered while
	 * the server was serving is still attached and still fires. That covers the stream's flow as
	 * well as its listeners: standard input is left flowing when it was already flowing before
	 * `start` and when something else is reading it at release, and a stream nothing had read yet
	 * and nothing else reads is paused.
	 *
	 * @returns A promise that settles after the probe releases its resident engines
	 */
	destroy(): Promise<void>
}

/**
 * Holds the listeners one emitter carried for a set of events at the moment it was captured.
 *
 * @remarks
 * A capture is the before half of a listener diff. `captureListeners` takes one, and
 * `releaseListeners` removes whatever the emitter has gained since. Identity is what the pair
 * compares, so a listener a capture holds survives the release whatever it is named.
 *
 * The pair reads a gain as the callee's own, so it binds its caller to a window nothing else can
 * attach in. Where a caller cannot promise that window, hold each handler as a field and remove it
 * by reference instead.
 *
 * @example
 * ```ts
 * const capture: ListenerCapture = new Map([['SIGTERM', process.listeners('SIGTERM')]])
 * ```
 */
export type ListenerCapture = ReadonlyMap<string, readonly Function[]>
