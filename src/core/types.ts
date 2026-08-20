import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'
import type { PROBE_ERROR_CODES } from './constants.js'

/**
 * Names one of the three inspections a claim passes through.
 *
 * @remarks
 * The three are irreducible modes rather than labels: each reads a different tool, and a verdict
 * that omits one hides a defect the agent would then believe it had fixed.
 *
 * @example
 * ```ts
 * const stage: Stage = 'lint'
 * ```
 */
export type Stage = 'type' | 'lint' | 'runtime'

/**
 * Carries one file's location and its contents.
 *
 * @remarks
 * `path` is contained within the workspace, relative to its root, and need not exist on disk. The
 * type and lint stages read the text from memory; only the runtime stage writes a file.
 *
 * @example
 * ```ts
 * const source: Source = { path: 'src/core/greeting.ts', text: "export const GREETING = 'hi'\n" }
 * ```
 */
export interface Source {
	/** Workspace-relative path the stages resolve the text against. */
	readonly path: string
	/** The file's full contents. */
	readonly text: string
}

/**
 * Carries the candidate files a claim asserts about and the test that exercises them.
 *
 * @remarks
 * `files` and `test` belong to different TypeScript projects. Each file in `files` is checked
 * against the project its claim names, and `test` is checked against the root project, because a
 * test needs the Vitest and Node globals the scoped projects remove. A direct type-stage call that
 * supplies no project infers one from each candidate path.
 *
 * @example
 * ```ts
 * const subject: Case = {
 * 	files: [{ path: 'src/core/greeting.ts', text: "export const GREETING = 'hi'\n" }],
 * 	test: {
 * 		path: 'tmp/probe/greeting.test.ts',
 * 		text: "import { expect, test } from 'vitest'\nimport { GREETING } from '../../src/core/greeting.js'\ntest('greets', () => expect(GREETING).toBe('hi'))\n",
 * 	},
 * }
 * ```
 */
export interface Case {
	/** The candidate sources the test imports, in the order the claim supplies them. */
	readonly files: readonly Source[]
	/** The test that exercises those sources. */
	readonly test: Source
}

/**
 * Extends a case with the stage it must fail at and the reason it must fail there.
 *
 * @remarks
 * A claim that cannot state what would falsify it cannot be proven, so the control is required
 * rather than optional. `stage` is the axis the control varies: a control that fails at a stage
 * other than the one it names has falsified the instrument, not the claim.
 *
 * @example
 * ```ts
 * const control: Control = {
 * 	files: [{ path: 'src/core/greeting.ts', text: "export const GREETING: number = 'hi'\n" }],
 * 	test: {
 * 		path: 'tmp/probe/greeting.test.ts',
 * 		text: "import { expect, test } from 'vitest'\nimport { GREETING } from '../../src/core/greeting.js'\ntest('greets', () => expect(GREETING).toBe('hi'))\n",
 * 	},
 * 	stage: 'type',
 * 	reason: 'a string literal assigned to a number must not compile',
 * }
 * ```
 */
export interface Control extends Case {
	/** The stage this control must report findings at. */
	readonly stage: Stage
	/** Why the control fails there, in the claimant's own words. */
	readonly reason: string
}

/**
 * Carries everything the service needs to produce one verdict.
 *
 * @remarks
 * `project` names the TypeScript project the candidate sources in both cases are checked against,
 * because the root project admits host globals the scoped projects remove and would report green
 * where the gate reports red. The test files remain on the root project for Vitest and Node globals.
 *
 * The control's candidate sources must differ from the case's. A control byte-identical to its case
 * cannot break, so it never produces the `origin: 'code'` finding a receipt requires, and the claim
 * is unprovable however correct the case is.
 *
 * @example
 * ```ts
 * const claim: Claim = {
 * 	project: 'configs/src/tsconfig.core.json',
 * 	case: {
 * 		files: [{ path: 'src/core/greeting.ts', text: "export const GREETING = 'hi'\n" }],
 * 		test: {
 * 			path: 'tmp/probe/greeting.test.ts',
 * 			text: "import { expect, test } from 'vitest'\nimport { GREETING } from '../../src/core/greeting.js'\ntest('greets', () => expect(GREETING).toBe('hi'))\n",
 * 		},
 * 	},
 * 	control: {
 * 		files: [{ path: 'src/core/greeting.ts', text: "export const GREETING: number = 'hi'\n" }],
 * 		test: {
 * 			path: 'tmp/probe/greeting.test.ts',
 * 			text: "import { expect, test } from 'vitest'\nimport { GREETING } from '../../src/core/greeting.js'\ntest('greets', () => expect(GREETING).toBe('hi'))\n",
 * 		},
 * 		stage: 'type',
 * 		reason: 'a string literal assigned to a number must not compile',
 * 	},
 * }
 * ```
 */
export interface Claim {
	/** Workspace-relative path of the TypeScript project the candidate sources are checked against. */
	readonly project: string
	/** The files and test the claim asserts about. */
	readonly case: Case
	/** The negative control that must break, and where. */
	readonly control: Control
}

/**
 * Names where the fault one finding reports lives.
 *
 * @remarks
 * `code` is a diagnostic the stage's tool reported about the candidate's source. `instrument` is
 * the stage's own report that its inspection did not complete over that source — a specification
 * it could not delete, a project it could not select, a module that ran no test. The two are
 * irreducible modes rather than labels, because only a `code` finding disproves a claim: a control
 * whose test never ran has produced no evidence about the code it was written to break.
 *
 * @example
 * ```ts
 * const origin: FindingOrigin = 'code'
 * ```
 */
export type FindingOrigin = 'code' | 'instrument'

/**
 * Carries one message a stage reported, where it reported it, and whose fault it names.
 *
 * @remarks
 * The stage is not repeated here. A finding always arrives inside the `Check` that names its
 * stage, so a second copy could only drift from the first.
 *
 * `origin` decides what `message` means. A `code` finding carries the tool's own message,
 * unedited. An `instrument` finding carries the stage's own message, in the stage's own voice, so
 * a reader is never told a tool said something it never said.
 *
 * `path` is the workspace-relative path a reader can open, which is not always the path the tool
 * named. Each stage maps its tool's own spelling back: the type stage from the compiler's absolute
 * path, the lint stage from the document URI it opened, and the runtime stage from the generated
 * specification it wrote to the test path the case declared.
 *
 * `line` is absent when the stage's tool reported no line, which happens for a whole-file
 * diagnostic. A runtime failure is not one of those: a failure Vitest reported at a stack frame
 * carries that frame's line.
 *
 * @example
 * ```ts
 * const finding: Finding = {
 * 	origin: 'code',
 * 	path: 'src/core/greeting.ts',
 * 	message: "Type 'string' is not assignable to type 'number'.",
 * 	line: 1,
 * }
 * ```
 */
export interface Finding {
	/** Whether this message names a fault in the candidate's code or in the stage that ran. */
	readonly origin: FindingOrigin
	/** Workspace-relative path this message is reported against. */
	readonly path: string
	/** The tool's own message for a `code` finding, or the stage's own for an `instrument` one. */
	readonly message: string
	/** One-based line the tool reported, or absent when it reported none. */
	readonly line?: number
}

/**
 * Carries one stage's outcome: what it cost and what it reported.
 *
 * @remarks
 * An empty `findings` list is the clean result. There is no separate pass flag, because passing is
 * exactly the absence of findings and a stored flag could disagree with the list beside it.
 *
 * @example
 * ```ts
 * const check: Check = { stage: 'lint', elapsed: 17, findings: [] }
 * ```
 */
export interface Check {
	/** The stage that produced this outcome. */
	readonly stage: Stage
	/** Milliseconds the stage took. */
	readonly elapsed: number
	/** Every message the stage's tool reported, in the tool's own order. */
	readonly findings: readonly Finding[]
}

/**
 * Names the three tool versions a verdict was produced with.
 *
 * @remarks
 * A probe is worth running only when its verdict predicts the gate's verdict, which holds only
 * when both read one installed copy of each tool. Carrying the resolved versions on the verdict
 * makes that claim checkable rather than assumed.
 *
 * @example
 * ```ts
 * const toolchain: Toolchain = { typescript: '6.0.3', oxlint: '1.78.0', vitest: '4.1.10' }
 * ```
 */
export interface Toolchain {
	/** Resolved `typescript` version the type stage ran. */
	readonly typescript: string
	/** Resolved `oxlint` version the lint stage ran. */
	readonly oxlint: string
	/** Resolved `vitest` version the runtime stage ran. */
	readonly vitest: string
}

/**
 * Names the TypeScript project that judged a verdict's candidate sources.
 *
 * @remarks
 * A verdict is an assertion about code under one compiler configuration, and the same code passes
 * under one project and fails under another, so a verdict that omits the project states less than
 * it appears to. `path` names which project file, in the resolved workspace-relative spelling
 * rather than the caller's. `digest` names what that project contained, because a receipt travels
 * away from the workspace that minted it and a path alone is a claim about a name.
 *
 * @example
 * ```ts
 * const project: Project = {
 * 	path: 'configs/src/tsconfig.core.json',
 * 	digest: '3b674fdf121c85efb9ed1bab25ceeec8',
 * }
 * ```
 */
export interface Project {
	/** Resolved workspace-relative path of the project file the type stage applied. */
	readonly path: string
	/** Digest of that project's resolved compiler options, workspace-relative and key-sorted. */
	readonly digest: string
}

/**
 * Carries the full result of one claim: every stage, for both the case and its control.
 *
 * @remarks
 * A verdict exists only when all three stages ran on both the case and the control, so `checks`
 * and `control` each hold one entry per stage. A stage that cannot start throws instead, which is
 * why no member here models a missing stage. `receipt` is present only when every stage ran clean
 * on the case, the control reported at least one `origin: 'code'` finding at the stage it declared,
 * and every other control stage stayed clean.
 *
 * `id` identifies this call and `digest` identifies the claim it answered, so two calls over one
 * claim share a digest and differ in their identity. `digest` and `project` are required, because
 * the type stage always runs and a claim always names a project, so no verdict exists without
 * either value. A verdict returned by `Probe` also carries the control's claimant-authored
 * `reason` unchanged. A hand-built verdict may omit it because the receipt helper needs only the
 * recorded checks and declared stage.
 *
 * @example
 * ```ts
 * const broke: Finding = {
 * 	origin: 'code',
 * 	path: 'src/core/greeting.ts',
 * 	message: 'not assignable',
 * 	line: 1,
 * }
 * const verdict: Verdict = {
 * 	id: '88a5addc-7d33-40dc-9a5a-104b71f8787d',
 * 	digest: '6ca20c3bff623031d3955b9d1a76d71d',
 * 	toolchain: { typescript: '6.0.3', oxlint: '1.79.0', vitest: '4.1.11' },
 * 	project: {
 * 		path: 'configs/src/tsconfig.core.json',
 * 		digest: '3b674fdf121c85efb9ed1bab25ceeec8',
 * 	},
 * 	reason: 'a string literal assigned to a number must not compile',
 * 	checks: [
 * 		{ stage: 'type', elapsed: 61, findings: [] },
 * 		{ stage: 'lint', elapsed: 17, findings: [] },
 * 		{ stage: 'runtime', elapsed: 259, findings: [] },
 * 	],
 * 	control: [
 * 		{ stage: 'type', elapsed: 58, findings: [broke] },
 * 		{ stage: 'lint', elapsed: 16, findings: [] },
 * 		{ stage: 'runtime', elapsed: 254, findings: [] },
 * 	],
 * 	elapsed: 549,
 * 	receipt:
 * 		'probe:6ca20c3bff623031d3955b9d1a76d71d:type:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8',
 * }
 * ```
 */
export interface Verdict {
	/** The revision identity this verdict was produced for, fresh per call. */
	readonly id: string
	/** Digest of the case and control this verdict answers. */
	readonly digest: string
	/** The tool versions that produced it. */
	readonly toolchain: Toolchain
	/** The TypeScript project the candidate sources were judged against. */
	readonly project: Project
	/** The claimant's explanation for the selected control, when the verdict came from a claim. */
	readonly reason?: string
	/** One outcome per stage for the claim's case. */
	readonly checks: readonly Check[]
	/** One outcome per stage for the claim's control. */
	readonly control: readonly Check[]
	/** Milliseconds the whole call took, including both the case and the control. */
	readonly elapsed: number
	/** The proof token, present only when the case ran clean and the control broke only where it said. */
	readonly receipt?: string
}

/**
 * Reports what a probe observes while it serves.
 *
 * @remarks
 * `arm` fires when the boot control has reported red and the service will answer calls; a probe
 * arriving before it awaits that step rather than starting a second one. `expire` fires when the
 * coordinator's own deadline destroyed a stage and a replacement took its place, which is the only
 * way a synchronous infinite loop is ever reported.
 *
 * @example
 * ```ts
 * const hooks: EmitterHooks<ProbeEventMap> = { prove: (verdict) => console.log(verdict.id) }
 * ```
 */
export type ProbeEventMap = {
	/** The boot control reported red and the instrument now serves. */
	readonly arm: readonly [toolchain: Toolchain]
	/** A claim was answered. */
	readonly prove: readonly [verdict: Verdict]
	/** The coordinator's deadline fired at one stage and that stage was replaced before this event. */
	readonly expire: readonly [claim: Claim]
	/** A fault surfaced for observation. */
	readonly error: readonly [error: unknown]
}

/**
 * Configures a probe.
 *
 * @remarks
 * `workspace` is the target root whose installed `typescript`, `oxlint`, and `vitest` the stages
 * resolve, and whose files each stage re-reads before it answers. Default: the current working
 * directory. `deadline` is the coordinator's milliseconds budget for one active stage inspection.
 * Queue wait is not charged to that inspection; the inspections and runtime recoveries ahead of it
 * carry their own bounds. The runtime deadline lives outside the worker because a test timeout
 * expressed in worker configuration cannot fire while that worker spins. One runtime inspection in
 * every 64 also pays the resident runner's replacement, so budget `deadline` against that
 * inspection rather than the common one.
 *
 * @example
 * ```ts
 * const options: ProbeOptions = { workspace: '/srv/checkout', deadline: 30_000 }
 * ```
 */
export interface ProbeOptions {
	/** Initial listeners, wired at construction. */
	readonly on?: EmitterHooks<ProbeEventMap>
	/** Handler for a listener throw. */
	readonly error?: EmitterErrorHandler
	/** Target workspace root. Default: the current working directory. */
	readonly workspace?: string
	/** Milliseconds one active stage inspection may take; an expired stage is replaced. */
	readonly deadline?: number
}

/**
 * Answers a claim with type, lint, and runtime evidence in one call.
 *
 * @remarks
 * Warming begins at construction and `prove` awaits it, so there is no `start`: the harness owns
 * the process and a restart is a new process rather than a second lifecycle.
 *
 * `prove` re-reads the target workspace before it answers, so a file edited since the last call is
 * judged as it now stands rather than as a warm service remembers it. The two resident readers key
 * that sweep differently: the runtime stage compares each workspace module's contents, and the type
 * stage versions a disk file by its modification time.
 *
 * @example
 * ```ts
 * const verdict = await probe.prove(claim)
 * console.log(formatVerdict(verdict))
 * await probe.destroy()
 * ```
 */
export interface ProbeInterface {
	/** Observation surface for arming, answers, deadline expiry, and faults. */
	readonly emitter: EmitterInterface<ProbeEventMap>
	/** The tool versions resolved from the workspace at construction. */
	readonly toolchain: Toolchain
	/**
	 * Answers one claim with every stage's evidence.
	 *
	 * @param claim - The case, its control, and the project the candidate sources in both cases
	 * are checked against
	 * @returns The verdict, carrying one check per stage for both the case and the control
	 * @throws When a stage cannot start, so no verdict ever reports a stage that did not run
	 */
	prove(claim: Claim): Promise<Verdict>
	/**
	 * Tears down the resident engines and releases the processes they hold.
	 *
	 * @returns A promise that settles when every engine has released its resources
	 */
	destroy(): Promise<void>
}

/**
 * Names the category one probe failure belongs to, derived from {@link PROBE_ERROR_CODES}.
 *
 * @remarks
 * The five are irreducible modes rather than labels, because each one names a different party as
 * the one that must act. `invalid` is the caller's input. `destroyed` is an instrument the caller
 * already tore down. `deadline` is the coordinator's budget, and the stage behind it was replaced.
 * `workspace` is the target tree: a tool it does not install, a manifest it does not publish, a
 * project its compiler cannot parse. `instrument` is this package's own tooling reporting that it
 * could not serve, and it carries the same meaning here as it does on {@link FindingOrigin}.
 *
 * @example
 * ```ts
 * const code: ProbeErrorCode = 'workspace'
 * ```
 */
export type ProbeErrorCode = (typeof PROBE_ERROR_CODES)[number]

/**
 * Carries the structured detail one probe failure reports beside its message.
 *
 * @remarks
 * Every member is absent unless the failure has that value to report, so a reader branches on
 * presence rather than on a sentinel. `value` is the rejected input itself, carried unchanged, so
 * treat it as untrusted when rendering it.
 *
 * @example
 * ```ts
 * const context: ProbeErrorContext = { stage: 'runtime', deadline: 30_000 }
 * ```
 */
export interface ProbeErrorContext {
	/** The stage the failure belongs to, when one stage owns it. */
	readonly stage?: Stage
	/**
	 * The path involved, spelled as the refusing operation named it: workspace-relative for an
	 * input a caller supplied, absolute for a file this package resolved.
	 */
	readonly path?: string
	/** The workspace-relative TypeScript project involved, for a project failure. */
	readonly project?: string
	/** The installed package name involved, for a workspace toolchain failure. */
	readonly name?: string
	/** Milliseconds the expired budget allowed, for a deadline failure. */
	readonly deadline?: number
	/** The rejected value, for an input the guards refused. */
	readonly value?: unknown
}

/**
 * Configures one probe failure at construction.
 *
 * @remarks
 * `code` is required, because a failure a consumer cannot branch on is the failure this type
 * exists to replace. `cause` carries the underlying fault where one ended the operation, and
 * reaches the native `Error` option of the same name.
 *
 * @example
 * ```ts
 * const options: ProbeErrorOptions = {
 * 	code: 'invalid',
 * 	context: { path: '../secrets.env' },
 * }
 * ```
 */
export interface ProbeErrorOptions {
	/** The machine-readable category this failure belongs to. */
	readonly code: ProbeErrorCode
	/** Structured detail about the failure. */
	readonly context?: ProbeErrorContext
	/** The underlying fault, when one ended the operation. */
	readonly cause?: unknown
}
