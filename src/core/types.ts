import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'

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
 * `path` is workspace-relative and need not exist on disk. The type and lint stages read the text
 * from memory; only the runtime stage writes a file.
 *
 * @example
 * ```ts
 * const source: Source = { path: 'src/core/greeting.ts', text: 'export const GREETING = "hi"\n' }
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
 * 	files: [{ path: 'src/core/greeting.ts', text: 'export const GREETING = "hi"\n' }],
 * 	test: { path: 'tests/src/core/greeting.test.ts', text: 'test("greets", () => {})\n' },
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
 * 	files: [{ path: 'src/core/greeting.ts', text: 'export const GREETING: number = "hi"\n' }],
 * 	test: { path: 'tests/src/core/greeting.test.ts', text: 'test("greets", () => {})\n' },
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
 * @example
 * ```ts
 * const greeting: Source = { path: 'src/core/greeting.ts', text: 'export const GREETING = "hi"\n' }
 * const test: Source = { path: 'tests/src/core/greeting.test.ts', text: 'test("greets", () => {})\n' }
 * const claim: Claim = {
 * 	project: 'configs/src/tsconfig.core.json',
 * 	case: { files: [greeting], test },
 * 	control: { files: [greeting], test, stage: 'type', reason: 'the control must not compile' },
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
 * Carries one message a tool reported and where it reported it.
 *
 * @remarks
 * The stage is not repeated here. A finding always arrives inside the `Check` that names its
 * stage, so a second copy could only drift from the first. `line` is absent when the tool
 * reported no line, which happens for a whole-file diagnostic and for a runtime failure.
 *
 * @example
 * ```ts
 * const finding: Finding = {
 * 	path: 'src/core/greeting.ts',
 * 	message: "Type 'string' is not assignable to type 'number'.",
 * 	line: 1,
 * }
 * ```
 */
export interface Finding {
	/** Workspace-relative path the tool reported against. */
	readonly path: string
	/** The tool's own message, unedited. */
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
 * Carries the full result of one claim: every stage, for both the case and its control.
 *
 * @remarks
 * A verdict exists only when all three stages ran on both the case and the control, so `checks`
 * and `control` each hold one entry per stage. A stage that cannot start throws instead, which is
 * why no member here models a missing stage. `receipt` is present only when the case is clean and
 * the control failed at its declared stage.
 *
 * @example
 * ```ts
 * const broke: Finding = { path: 'src/core/greeting.ts', message: 'not assignable', line: 1 }
 * const verdict: Verdict = {
 * 	id: '01J8Z0',
 * 	toolchain: { typescript: '6.0.3', oxlint: '1.78.0', vitest: '4.1.10' },
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
 * 	elapsed: 337,
 * 	receipt: 'probe:01J8Z0:type:typescript@6.0.3:oxlint@1.78.0:vitest@4.1.10',
 * }
 * ```
 */
export interface Verdict {
	/** The revision identity this verdict was produced for, fresh per call. */
	readonly id: string
	/** The tool versions that produced it. */
	readonly toolchain: Toolchain
	/** One outcome per stage for the claim's case. */
	readonly checks: readonly Check[]
	/** One outcome per stage for the claim's control. */
	readonly control: readonly Check[]
	/** Milliseconds the whole call took, including both the case and the control. */
	readonly elapsed: number
	/** The proof token, present only when the case is clean and the control failed where it said. */
	readonly receipt?: string
}

/**
 * Reports what a probe observes while it serves.
 *
 * @remarks
 * `arm` fires when the boot control has reported red and the service will answer calls; a probe
 * arriving before it awaits that step rather than starting a second one. `expire` fires when the
 * coordinator's own deadline killed a worker, which is the only way a synchronous infinite loop is
 * ever reported.
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
	/** The coordinator's deadline fired and the runtime worker was recycled. */
	readonly expire: readonly [claim: Claim]
	/** A fault surfaced for observation. */
	readonly error: readonly [error: unknown]
}

/**
 * Configures a probe.
 *
 * @remarks
 * `workspace` is the target root whose installed `typescript`, `oxlint`, and `vitest` the stages
 * resolve, and whose modification times the revalidation sweep reads. Default: the current
 * working directory. `deadline` is the coordinator's own milliseconds budget for one runtime
 * stage; it lives outside the worker because a test timeout expressed in worker configuration
 * cannot fire while that worker spins.
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
	/** Milliseconds one runtime stage may take before the coordinator recycles its worker. */
	readonly deadline?: number
}

/**
 * Answers a claim with type, lint, and runtime evidence in one call.
 *
 * @remarks
 * Warming begins at construction and `prove` awaits it, so there is no `start`: the harness owns
 * the process and a restart is a new process rather than a second lifecycle. `prove` revalidates
 * every workspace file whose modification time moved before it answers, because a warm service
 * otherwise returns a confident wrong answer about freshly edited source.
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
