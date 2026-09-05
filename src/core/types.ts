import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'
import type { LSPRange } from '@orkestrel/lsp'
import type { PROBE_ERROR_CODES, PROBE_PARTIES, PROBE_STAGES } from './constants.js'

/**
 * Names an inspection a claim passes through, derived from {@link PROBE_STAGES}.
 *
 * @remarks
 * They are irreducible modes rather than labels: each reads a different tool, and a verdict that
 * omits one hides a defect the agent would then believe it had fixed.
 *
 * @example
 * ```ts
 * const stage: Stage = 'lint'
 * ```
 */
export type Stage = (typeof PROBE_STAGES)[number]

/**
 * Carries one proposed file's location and its contents.
 *
 * @remarks
 * A draft is a file as the claimant proposes it rather than as the workspace holds it. `path` is
 * contained within the workspace, relative to its root, and need not exist on disk. The type and
 * lint stages read the text from memory; only the runtime stage writes a file.
 *
 * @example
 * ```ts
 * const draft: Draft = { path: 'src/core/greeting.ts', text: "export const GREETING = 'hi'\n" }
 * ```
 */
export interface Draft {
	/** Names the workspace-relative path the stages resolve the text against. */
	readonly path: string
	/** Holds the file's full contents. */
	readonly text: string
}

/**
 * Carries the candidate drafts a claim asserts about and the test that exercises them.
 *
 * @remarks
 * `files` and `test` belong to different TypeScript projects. Each draft in `files` is checked
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
	/** Holds the candidate drafts the test imports, in the order the claim supplies them. */
	readonly files: readonly Draft[]
	/** Holds the test that exercises those drafts. */
	readonly test: Draft
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
	/** Names the stage this control must report issues at. */
	readonly stage: Stage
	/** Explains why the control fails there, in the claimant's own words. */
	readonly reason: string
}

/**
 * Carries everything the service needs to produce one verdict.
 *
 * @remarks
 * `project` names the TypeScript project the candidate drafts in both cases are checked against,
 * because the root project admits host globals the scoped projects remove and would report green
 * where the gate reports red. The test drafts remain on the root project for Vitest and Node globals.
 *
 * The control's case must differ from the claim's case by one byte at least: in a candidate draft,
 * in the test, or in each. A control that repeats the whole case cannot break, so it never produces
 * the `origin: 'claimant'` issue a receipt requires, and the claim is unprovable however correct
 * the case is. `reason` is the claimant's prose about the drafts rather than the drafts themselves,
 * so rewording it leaves the control the case again, and the `prove` method refuses it.
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
	/**
	 * Names the workspace-relative path of the TypeScript project the candidate drafts are checked
	 * against.
	 */
	readonly project: string
	/** Holds the drafts and test the claim asserts about. */
	readonly case: Case
	/** Holds the negative control that must break, and where. */
	readonly control: Control
}

/**
 * Names who must act on an issue or probe failure.
 *
 * @remarks
 * `claimant` is the caller who wrote the claim: its input, selections, candidate draft, and
 * lifecycle. `workspace` is the target tree probe borrows. `instrument` is this package.
 *
 * @example
 * ```ts
 * const party: Party = 'claimant'
 * ```
 */
export type Party = (typeof PROBE_PARTIES)[number]

/**
 * Carries one message a stage reported, where it reported it, and whose fault it names.
 *
 * @remarks
 * The stage is not repeated here. An issue always arrives inside the `Check` that names its
 * stage, so a second copy could only drift from the first.
 *
 * A `claimant` issue is a tool's diagnostic about a candidate draft, and nothing else. Every
 * other claimant fault is thrown. Without this invariant, a bad test path could satisfy the
 * receipt condition even though the test never ran.
 *
 * `path` is the workspace-relative path a reader can open, which is not always the path the tool
 * named. Each stage maps its tool's own spelling back: the type stage from the compiler's absolute
 * path, the lint stage from the document URI it opened, and the runtime stage from the generated
 * specification it wrote to the test path the case declared.
 *
 * `range` is a half-open span in the zero-based UTF-16 coordinates the Language Server Protocol
 * fixes, so one numbering carries every stage's location and each tool's own numbering is
 * converted where it is read rather than where it is rendered. It is absent when the stage's tool
 * reported no location, which happens for a whole-file diagnostic. A runtime failure is not one of
 * those: a failure Vitest reported at a stack frame carries that frame's position.
 *
 * Each stage supplies the extent its own tool gives it. The type stage spans the diagnostic's
 * reported length, and the lint stage carries the span the language server published. A tool that
 * reports a point rather than a span, as a stack frame does, produces a zero-width range at that
 * point, which is the same value a span of no width would carry.
 *
 * `formatIssue` renders `start.line` one-based, because that is the numbering an editor shows.
 *
 * @example
 * ```ts
 * const issue: Issue = {
 * 	origin: 'claimant',
 * 	path: 'src/core/greeting.ts',
 * 	message: "Type 'string' is not assignable to type 'number'.",
 * 	range: { start: { line: 0, character: 6 }, end: { line: 0, character: 13 } },
 * }
 * ```
 */
export interface Issue {
	/** Names the party that must act on this message. */
	readonly origin: Party
	/** Names the workspace-relative path this message is reported against. */
	readonly path: string
	/** Holds the diagnostic or failure message. */
	readonly message: string
	/**
	 * Holds the zero-based UTF-16 span the tool reported, or is absent when it reported no location.
	 */
	readonly range?: LSPRange
}

/**
 * Carries one stage's outcome: what it cost and what it reported.
 *
 * @remarks
 * An empty `issues` list is the clean result. There is no separate pass flag, because passing is
 * exactly the absence of issues and a stored flag could disagree with the list beside it.
 *
 * @example
 * ```ts
 * const check: Check = { stage: 'lint', elapsed: 17, issues: [] }
 * ```
 */
export interface Check {
	/** Names the stage that produced this outcome. */
	readonly stage: Stage
	/** Holds the milliseconds the stage took. */
	readonly elapsed: number
	/** Holds every message the stage's tool reported, in the tool's own order. */
	readonly issues: readonly Issue[]
}

/**
 * Names the version each tool's own installed manifest publishes in the target workspace.
 *
 * @remarks
 * A probe is worth running only when its verdict predicts the gate's verdict, which holds only
 * when the probe and the gate read one installed copy of each tool. Every member names the version
 * that tool's own manifest publishes in the target workspace, which is the install the gate runs
 * against, so the claim is checkable rather than assumed. A bridged workspace is the case that
 * reading has to be held against: its type stage runs the 6.x compiler `@typescript/typescript6`
 * republishes rather than the 7.x the workspace's own manifest names, so its type verdict predicts
 * that workspace's gate only where the two compilers agree.
 *
 * @example
 * ```ts
 * const toolchain: Toolchain = { typescript: '6.0.3', oxlint: '1.79.0', vitest: '4.1.11' }
 * ```
 */
export interface Toolchain {
	/** Names the `typescript` version that tool's own installed manifest publishes in the target workspace. */
	readonly typescript: string
	/** Names the `oxlint` version that tool's own installed manifest publishes in the target workspace. */
	readonly oxlint: string
	/** Names the `vitest` version that tool's own installed manifest publishes in the target workspace. */
	readonly vitest: string
}

/**
 * Names the TypeScript project that judged a verdict's candidate drafts.
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
	/** Names the resolved workspace-relative path of the project file the type stage applied. */
	readonly path: string
	/**
	 * Holds the digest of that project's resolved compiler options, workspace-relative and
	 * key-sorted.
	 */
	readonly digest: string
}

/**
 * Carries the full result of one claim: every stage, for both the case and its control.
 *
 * @remarks
 * A verdict exists only when every stage ran on both the case and the control, so `case`
 * and `control` each hold one entry per stage. A stage that cannot start throws instead, which is
 * why no member here models a missing stage. `receipt` is present only when the case reported no
 * issue, the control reported an `origin: 'claimant'` issue at the stage it declared,
 * every other control stage reported no claimant issue, and neither phase reported an
 * `origin: 'instrument'` issue.
 *
 * `id` identifies this call and `digest` identifies the claim it answered, so two calls over one
 * claim share a digest and differ in their identity. `digest` and `project` are required, because
 * the type stage always runs and a claim always names a project, so no verdict exists without
 * either value. A verdict returned by `Probe` also carries the control's claimant-authored
 * `reason` unchanged. A hand-built verdict may omit it because the receipt helper needs only the
 * recorded checks and declared stage.
 *
 * `digest` covers these things: the case bytes, the control bytes including this `reason`, and the
 * workspace they were read against. The reason is part of the control, so two claims differing only
 * in its prose are two claims and digest differently — a claimant who restates the falsifier has
 * answered a different question, and a digest that excluded it would describe less than the claim.
 * The workspace enters because every absolute string in a claim is rewritten relative to it before
 * hashing, so a claim carrying no absolute string digests the same in every workspace and one that
 * carries any digests per workspace. `receipt` carries this digest as a field, so the same inputs
 * reach the token.
 *
 * @example
 * ```ts
 * const broke: Issue = {
 * 	origin: 'claimant',
 * 	path: 'src/core/farewell.ts',
 * 	message: 'not assignable',
 * 	range: { start: { line: 0, character: 6 }, end: { line: 0, character: 13 } },
 * }
 * const verdict: Verdict = {
 * 	id: '88a5addc-7d33-40dc-9a5a-104b71f8787d',
 * 	digest: '6ca20c3bff623031d3955b9d1a76d71d',
 * 	toolchain: { typescript: '6.0.3', oxlint: '1.79.0', vitest: '4.1.11' },
 * 	project: {
 * 		path: 'configs/src/tsconfig.core.json',
 * 		digest: '3b674fdf121c85efb9ed1bab25ceeec8',
 * 	},
 * 	reason: 'a number annotation must reject the string literal beside it',
 * 	case: [
 * 		{ stage: 'type', elapsed: 61, issues: [] },
 * 		{ stage: 'lint', elapsed: 17, issues: [] },
 * 		{ stage: 'runtime', elapsed: 259, issues: [] },
 * 	],
 * 	control: [
 * 		{ stage: 'type', elapsed: 58, issues: [broke] },
 * 		{ stage: 'lint', elapsed: 16, issues: [] },
 * 		{ stage: 'runtime', elapsed: 254, issues: [] },
 * 	],
 * 	elapsed: 549,
 * 	receipt:
 * 		'probe:6ca20c3bff623031d3955b9d1a76d71d:type:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8',
 * }
 * ```
 */
export interface Verdict {
	/** Names the revision identity this verdict was produced for, fresh per call. */
	readonly id: string
	/** Holds the digest of the case and control this verdict answers. */
	readonly digest: string
	/** Names the tool versions that produced it. */
	readonly toolchain: Toolchain
	/** Names the TypeScript project the candidate drafts were judged against. */
	readonly project: Project
	/**
	 * Holds the claimant's explanation for the selected control, when the verdict came from a claim.
	 * Part of the control, so it enters `digest` and through it the receipt token.
	 */
	readonly reason?: string
	/** Holds one outcome per stage for the claim's case. */
	readonly case: readonly Check[]
	/** Holds one outcome per stage for the claim's control. */
	readonly control: readonly Check[]
	/** Holds the milliseconds the whole call took, including both the case and the control. */
	readonly elapsed: number
	/** Holds the proof token, absent when either phase reports an instrument failure. */
	readonly receipt?: string
}

/**
 * Reports what a probe observes while it serves.
 *
 * @remarks
 * `arm` fires when the boot control has reported red and the service will answer calls; a probe
 * arriving before it awaits that step rather than starting a second one. An arming attempt that
 * rejects fires `error` instead, as it rejects, so a host waiting on `arm` reads the refusal rather
 * than waiting on a state no event describes. The rejected attempt is still retained for retry, and
 * the next `prove` runs the boot controls again, so a workspace that cannot arm surfaces one `error`
 * per attempt. `expire` fires when the coordinator's own deadline destroyed a stage and a
 * replacement took its place, which is the only way a synchronous infinite loop is ever reported.
 *
 * @example
 * ```ts
 * const hooks: EmitterHooks<ProbeEventMap> = { prove: (verdict) => console.log(verdict.id) }
 * ```
 */
export type ProbeEventMap = {
	/** Fires when the boot control has reported red and the instrument has begun answering calls. */
	readonly arm: readonly [toolchain: Toolchain]
	/** Fires when a claim is answered. */
	readonly prove: readonly [verdict: Verdict]
	/** Fires after the coordinator's deadline fired at one stage and that stage was replaced. */
	readonly expire: readonly [claim: Claim]
	/**
	 * Fires when a fault surfaces for observation, once per fault, including a rejected arming
	 * attempt.
	 */
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
	/** Declares the initial listeners, wired at construction. */
	readonly on?: EmitterHooks<ProbeEventMap>
	/** Holds the handler for a listener throw. */
	readonly error?: EmitterErrorHandler
	/** Names the target workspace root. Default: the current working directory. */
	readonly workspace?: string
	/**
	 * Holds the milliseconds one active stage inspection may take; an expired stage is replaced.
	 * Default: 30,000 ms.
	 */
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
 * judged as it stands on disk rather than as a warm service remembers it. The resident readers key
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
	/** Publishes arming, answers, deadline expiry, and faults for observation. */
	readonly emitter: EmitterInterface<ProbeEventMap>
	/** Names the tool versions the target workspace's installed manifests publish, read at construction. */
	readonly toolchain: Toolchain
	/**
	 * Answers one claim with every stage's evidence.
	 *
	 * @remarks
	 * A control carrying the case's files and the case's test byte for byte is refused at admission,
	 * with `origin: 'claimant'` and `code: 'refused'`. No stage inspects such a claim: the refusal
	 * answers before the resident stages are awaited, so it reads the same in every workspace state.
	 * Such a control can only break by nondeterminism, so the receipt it would earn attests a
	 * falsification that never happened, and a flake-earned receipt is the worst answer this package
	 * can return. The refusal compares the bytes of each side's files and test rather than the digest
	 * a verdict carries, because that digest rewrites a workspace-contained absolute string to its
	 * relative form and so reads two drafts one byte apart as one. A control varying only its `stage`
	 * or its `reason` is refused, because neither is a draft.
	 *
	 * @param claim - The case, its control, and the project the candidate drafts in both cases
	 * are checked against
	 * @returns The verdict, carrying one check per stage for both the case and the control
	 * @throws When the control repeats the case byte for byte, or when a stage cannot start, so no
	 * verdict ever reports a stage that did not run
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
 * Names the condition that ended a probe operation, derived from {@link PROBE_ERROR_CODES}.
 *
 * @remarks
 * Each condition names a different repair. `refused` changes the rejected value. `missing` creates
 * or installs the named thing. `malformed` repairs the value read against a contract. `destroyed`
 * builds a replacement. `deadline` changes the budget or the work it bounds according to the
 * failure's {@link Party}.
 *
 * @example
 * ```ts
 * const code: ProbeErrorCode = 'missing'
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
	/** Names the stage the failure belongs to, when one stage owns it. */
	readonly stage?: Stage
	/**
	 * Names the path involved, spelled as the refusing operation named it: workspace-relative for an
	 * input a caller supplied, absolute for a file this package resolved.
	 */
	readonly path?: string
	/** Names the workspace-relative TypeScript project involved, for a project failure. */
	readonly project?: string
	/** Identifies the installed package involved, for a workspace toolchain failure. */
	readonly name?: string
	/** Holds the milliseconds the expired budget allowed, for a deadline failure. */
	readonly deadline?: number
	/** Holds the rejected value, for an input the guards refused. */
	readonly value?: unknown
}

/**
 * Configures one probe failure at construction.
 *
 * @remarks
 * `origin` and `code` are required, because a failure a consumer cannot branch on is the failure
 * this type exists to replace. `cause` carries the underlying fault where one ended the operation,
 * and reaches the native `Error` option of the same name.
 *
 * @example
 * ```ts
 * const options: ProbeErrorOptions = {
 * 	origin: 'claimant',
 * 	code: 'refused',
 * 	context: { path: '../secrets.env' },
 * }
 * ```
 */
export interface ProbeErrorOptions {
	/** Names the party that must act on this failure. */
	readonly origin: Party
	/** Names the condition that ended the operation. */
	readonly code: ProbeErrorCode
	/** Holds structured detail about the failure. */
	readonly context?: ProbeErrorContext
	/** Holds the underlying fault, when one ended the operation. */
	readonly cause?: unknown
}
