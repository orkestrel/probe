import type { Case, Check, Claim, Project, Stage } from '@src/core'
import type { LSPRange } from '@orkestrel/lsp'

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
	/** Holds the candidate drafts and test one stage inspects. */
	readonly subject: Case
	/** Holds the claim the subject belongs to. */
	readonly claim: Claim
}

/**
 * Carries the bound a caller holds over one stage inspection.
 *
 * @remarks
 * `LintStageInterface.inspect` is the only inspection in this package that reads the signal. Its
 * wait is a foreign language server's silence, and abandoning that wait would leave the client
 * holding a pending diagnostics request. The type and runtime stages accept no options and honor no
 * cancellation: a coordinator abandons an overrunning one and replaces it, which is what `Probe`
 * does when its own deadline expires.
 *
 * Supply the signal a coordinator already armed rather than minting a second bound here. A bound
 * minted beside the coordinator's races it, and which one answers then depends on scheduling.
 *
 * @example
 * ```ts
 * const options: InspectionOptions = { signal: AbortSignal.timeout(30_000) }
 * ```
 */
export interface InspectionOptions {
	/** Aborts the inspection's wait for the resident tool's answer. */
	readonly signal: AbortSignal
}

/**
 * Carries one diagnostic line a compiler run reported, in this package's own coordinates.
 *
 * @remarks
 * `path` and `range` are absent together, because a diagnostic the compiler reports about a
 * project rather than about a file carries no location. `path` is spelled as the compiler printed
 * it, relative to the directory the run started in. `range` holds the zero-based UTF-16 point the
 * compiler reported: the plain-text output carries a start position and no extent, so `end` equals
 * `start`. `message` is the diagnostic text, elaboration lines joined by newlines.
 *
 * @example
 * ```ts
 * const diagnostic: Diagnostic = {
 * 	path: 'src/core/greeting.ts',
 * 	range: { start: { line: 0, character: 13 }, end: { line: 0, character: 13 } },
 * 	message: "Type 'string' is not assignable to type 'number'.",
 * }
 * ```
 */
export interface Diagnostic {
	/** Names the file the compiler reported against, or is absent for a project diagnostic. */
	readonly path?: string
	/** Holds the zero-based UTF-16 point the compiler reported, or is absent with `path`. */
	readonly range?: LSPRange
	/** Holds the diagnostic text, with every elaboration line joined by a newline. */
	readonly message: string
}

/**
 * Carries what one TypeScript project resolved to, as the compiler itself printed it.
 *
 * @remarks
 * The type stage reads this from `tsc --showConfig`, which prints the resolved options beside the
 * project's own file selection. `compilerOptions` is the compiler's record and is carried
 * unvalidated, because this package digests it rather than reading a member out of it. `files` is
 * the selection the project resolved to, spelled relative to the project file, and `include` is
 * present only where the project or a project it extends declares one. Every path is the
 * compiler's own spelling, so a copy of the project file placed beside the original reads them
 * unchanged.
 *
 * @example
 * ```ts
 * const config: ProjectConfig = {
 * 	compilerOptions: { strict: true, rootDir: '../../src/core' },
 * 	files: ['../../src/core/index.ts'],
 * }
 * ```
 */
export interface ProjectConfig {
	/** Holds the compiler options the project resolved to, unvalidated. */
	readonly compilerOptions: unknown
	/** Holds the files the project resolved to, or is absent when the compiler printed none. */
	readonly files?: readonly string[]
	/** Holds the file patterns the project declares, or is absent when it declares none. */
	readonly include?: readonly string[]
}

/**
 * Carries what one spawned workspace command reported when it closed.
 *
 * @remarks
 * `stdout` and `stderr` mirror the POSIX stream names the child wrote to. `status` is the exit
 * code, and it is absent when a signal ended the child, which is what teardown does to a run it
 * abandons. A compiler's exit code is not its verdict — the majors this package supports disagree
 * on it — so read the diagnostics the streams carry rather than this number.
 *
 * @example
 * ```ts
 * const execution: Execution = { status: 0, stdout: '{}\n', stderr: '' }
 * ```
 */
export interface Execution {
	/** Holds the exit code, or is absent when a signal ended the child. */
	readonly status?: number
	/** Holds everything the child wrote to its standard output. */
	readonly stdout: string
	/** Holds everything the child wrote to its standard error. */
	readonly stderr: string
}

/**
 * Holds the candidate drafts one inspection substitutes for the files a tool would read from disk.
 *
 * @remarks
 * A stage records every candidate the inspection carries before it reads any of them, and clears
 * the set when the inspection ends, whatever ended it. The runtime stage's module resolver reads
 * one candidate set through its adapter and is the stage that holds an overlay; the type stage
 * writes each draft into its mirror and the lint stage opens each draft as a document, so neither
 * holds one. Paths are absolute and the stage resolves them, because only the stage knows the
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
 * const path = '/srv/checkout/src/core/factories.ts'
 * overlay.set(path, "export function createGreeting(): string {\n\treturn 'hi'\n}\n")
 * overlay.covers('/srv/checkout/src/core') // true
 * overlay.clear()
 * ```
 */
export interface OverlayInterface {
	/** Identifies the candidate set this overlay holds. */
	readonly revision: string
	/** Names the absolute path of every candidate this overlay holds. */
	readonly paths: readonly string[]
	/**
	 * Records one candidate's text against the absolute path it stands in for.
	 *
	 * @param path - The absolute path the candidate replaces
	 * @param text - The candidate's full contents
	 * @returns Nothing
	 *
	 * @example
	 * ```ts
	 * const path = '/srv/checkout/src/core/factories.ts'
	 * overlay.set(path, "export function createGreeting(): string {\n\treturn 'hi'\n}\n")
	 * ```
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
	 *
	 * @example
	 * ```ts
	 * const path = '/srv/checkout/src/core/factories.ts'
	 * overlay.set(path, "export function createGreeting(): string {\n\treturn 'hi'\n}\n")
	 * overlay.covers('/srv/checkout/src/core') // true
	 * ```
	 */
	covers(directory: string): boolean
	/**
	 * Releases every candidate.
	 *
	 * @returns Nothing
	 *
	 * @example
	 * ```ts
	 * overlay.clear()
	 * overlay.paths // []
	 * ```
	 */
	clear(): void
}

/**
 * Inspects one case with the workspace's own tool.
 *
 * @remarks
 * Warming begins at construction. The `inspect` method awaits that one warm operation, which
 * builds the resident tool or the mirror it reuses across calls. A stage serves one inspection at
 * a time and admits none itself. Await an inspection before starting the next one, or admit
 * through one queue per stage the way `Probe` does: a second concurrent call reaches the same
 * resident tool or mirror and the same overlay, document, and specification state the first is
 * still using. A stage never holds a later inspection behind an earlier one, so a caller that
 * abandons an inspection at its own deadline can still use the stage. The `destroy` method
 * permanently tears the stage down and releases every resource it owns.
 *
 * @example
 * ```ts
 * const check = await stage.inspect(subject)
 * console.log(check.stage)
 * await stage.destroy()
 * ```
 */
export interface StageInterface {
	/** Names the inspection this stage performs. */
	readonly stage: Stage
	/**
	 * Reports claimant-owned progress the coordinator compares with its inspection snapshot.
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
	 * @throws When the workspace's own tool cannot start or has already been destroyed
	 *
	 * @example
	 * ```ts
	 * const check = await stage.inspect(subject)
	 * console.log(check.stage, check.elapsed, check.issues.length)
	 * ```
	 */
	inspect(subject: Case): Promise<Check>
	/**
	 * Tears down the resident tool or the mirror and releases its resources.
	 *
	 * @remarks
	 * A stage abandons every inspection it holds rather than waiting behind one, so teardown never
	 * waits for an inspection to return. An abandoned inspection rejects, either at the stage's own
	 * guard or as the owned tool closes. Teardown is bounded whatever the stage's own tool does: a
	 * tool that answers neither its warming exchange nor its ending is signalled and released at the
	 * stage's own deadline. A coordinator replaces a stage whose worker no longer returns because
	 * teardown neither waits for an inspection nor waits past that deadline.
	 *
	 * @returns A promise that settles after the resident tool or the mirror releases its resources
	 */
	destroy(): Promise<void>
}

/**
 * Inspects TypeScript source against a caller-named project and reports what that project is.
 *
 * @remarks
 * The type stage carries members the shared stage contract cannot: the lint and runtime stages
 * read no project, so a project parameter and a project lookup belong here rather than on
 * `StageInterface`. `resolve` reads the compiler's own printed configuration for the workspace's
 * copy of the project, so a claim's drafts never move the digest it reports.
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
	 * @throws When the workspace refuses the mirror, when a project the run reads is malformed, or
	 * when the stage has already been destroyed
	 *
	 * @example
	 * ```ts
	 * const check = await stage.inspect(subject, 'configs/src/tsconfig.core.json')
	 * ```
	 */
	inspect(subject: Case, project?: string): Promise<Check>
	/**
	 * Resolves one project to the path and digest the stage applies for it.
	 *
	 * @param project - The workspace-relative TypeScript project to resolve
	 * @returns The resolved workspace-relative path and the digest of its compiler options
	 * @throws When the project escapes the workspace, when the compiler refuses it, or when the
	 * stage has already been destroyed
	 *
	 * @example
	 * ```ts
	 * const project = await stage.resolve('configs/src/tsconfig.core.json')
	 * console.log(project.path, project.digest)
	 * ```
	 */
	resolve(project: string): Promise<Project>
}

/**
 * Inspects one case under a bound the caller supplies.
 *
 * @remarks
 * The lint stage carries a member the shared stage contract cannot. Its inspection waits for a
 * foreign language server to publish, and only the caller knows how long that wait may run, so the
 * bound belongs here rather than on `StageInterface`. The type and runtime stages read no signal
 * and keep the shared one-argument `inspect`.
 *
 * `options` is optional because `StageInterface.inspect` accepts one argument and this contract
 * extends it. An inspection that omits `options` is refused rather than served: a bound this stage
 * minted for itself would race the coordinator's, and the client's own `timeout` covers the
 * lifecycle exchanges alone.
 *
 * @example
 * ```ts
 * const check = await stage.inspect(subject, { signal: AbortSignal.timeout(30_000) })
 * ```
 */
export interface LintStageInterface extends StageInterface {
	/**
	 * Inspects one case, under the bound the caller supplies.
	 *
	 * @param subject - The candidate drafts and test to inspect
	 * @param options - The bound this inspection waits under
	 * @returns One outcome for this stage
	 * @throws When the caller supplies no bound, when the resident language server cannot start, or
	 * when the stage has already been destroyed
	 *
	 * @example
	 * ```ts
	 * const check = await stage.inspect(subject, { signal: AbortSignal.timeout(30_000) })
	 * ```
	 */
	inspect(subject: Case, options?: InspectionOptions): Promise<Check>
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
	/** Names the absolute path of the package manifest. */
	readonly path: string
	/** Holds the parsed manifest record. */
	readonly contents: Readonly<Record<string, unknown>>
}

/**
 * Serves one probe over this process's Model Context Protocol stdio transport.
 *
 * @remarks
 * The server owns the process it runs in. `start` seizes standard input and standard output for
 * the transport and registers the termination handlers a harness signals, so a host that starts one
 * has already given the process to it. `destroy` reverses all of that and tears the probe down with
 * it, which is why there is no verb that stops serving and leaves the stages standing: a probe
 * nothing is reading from holds its tools and its mirror for nobody.
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
	 *
	 * @example
	 * ```ts
	 * const server = new ProbeServer({ workspace: process.cwd() })
	 * server.start()
	 * ```
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
	 * @returns A promise that settles after the probe releases every stage's tool and mirror
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
