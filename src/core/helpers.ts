import type { Check, Finding, Stage, Verdict } from './types.js'
import { PROBE_STAGES, RECEIPT_PREFIX, RECEIPT_SEPARATOR } from './constants.js'

/**
 * Renders one tool message as a single line an agent can read and locate.
 *
 * @param finding - The message and location a stage reported
 * @returns The location and the message, separated by a space
 *
 * @example
 * ```ts
 * const located: Finding = {
 * 	origin: 'code',
 * 	path: 'src/core/greeting.ts',
 * 	message: 'not assignable',
 * 	line: 1,
 * }
 * const whole: Finding = {
 * 	origin: 'code',
 * 	path: 'src/core/greeting.ts',
 * 	message: 'not assignable',
 * }
 * formatFinding(located) // 'src/core/greeting.ts:1 not assignable'
 * formatFinding(whole) // 'src/core/greeting.ts not assignable'
 * ```
 */
export function formatFinding(finding: Finding): string {
	const where = finding.line === undefined ? finding.path : `${finding.path}:${finding.line}`
	return `${where} ${finding.message}`
}

/**
 * Renders one stage's outcome as its summary line followed by every message it reported.
 *
 * @remarks
 * A clean stage renders one line. The count appears even when it is zero, because that line is
 * what shows a reader the stage ran; a silent stage and a skipped stage read the same.
 *
 * @param check - The stage outcome to render
 * @returns The summary line, then one indented line per finding
 *
 * @example
 * ```ts
 * formatCheck({ stage: 'lint', elapsed: 17, findings: [] })
 * // 'lint: 0 findings (17 ms)'
 * ```
 */
export function formatCheck(check: Check): string {
	const count = check.findings.length
	const noun = count === 1 ? 'finding' : 'findings'
	const summary = `${check.stage}: ${count} ${noun} (${check.elapsed} ms)`
	const lines = check.findings.map((finding) => `  ${formatFinding(finding)}`)
	return [summary, ...lines].join('\n')
}

/**
 * Renders a whole verdict as the text an agent reads.
 *
 * @remarks
 * Every stage appears for both the case and the control, so no failing stage can be masked by an
 * earlier one. The last line always states the receipt or its absence, so a reader never has to
 * infer from silence whether the claim was proven.
 *
 * The four heading lines carry everything the receipt binds, each in the name-then-value form the
 * toolchain line established: the call's identity, the claim it answered, the tools that ran, and
 * the project that judged the candidates. A reader comparing two verdicts therefore reads what
 * differed without recomputing anything.
 *
 * @param verdict - The verdict to render
 * @returns The identity, claim, toolchain, and project, then every case and control stage, then
 * the receipt line
 *
 * @example
 * ```ts
 * formatVerdict(verdict).split('\n')[1] // 'claim 6ca20c3bff623031d3955b9d1a76d71d'
 * ```
 */
export function formatVerdict(verdict: Verdict): string {
	const { typescript, oxlint, vitest } = verdict.toolchain
	const tools = `toolchain typescript ${typescript}, oxlint ${oxlint}, vitest ${vitest}`
	const project = `project ${verdict.project.path} ${verdict.project.digest}`
	const proof = verdict.receipt === undefined ? 'no receipt' : `receipt ${verdict.receipt}`
	return [
		`probe ${verdict.id} (${verdict.elapsed} ms)`,
		`claim ${verdict.digest}`,
		tools,
		project,
		...verdict.checks.map((check) => `case ${formatCheck(check)}`),
		...verdict.control.map((check) => `control ${formatCheck(check)}`),
		proof,
	].join('\n')
}

/**
 * Computes the proof token a verdict carries, or returns nothing when the claim was not proven.
 *
 * @remarks
 * A receipt is issued on two conditions together: every stage ran clean on the case, and the
 * control produced at least one `origin: 'code'` finding at the stage it declared. A control that
 * fails somewhere else has falsified the instrument rather than the claim, so no receipt is issued
 * for it.
 *
 * The token names every condition the verdict was reached under, so a receipt read away from its
 * verdict still says what was judged and what judged it: the claim's digest, the stage the control
 * broke at, the three tool versions, and the project the candidate sources were checked against.
 * The call's identity is deliberately absent. It carries no integrity and it is the only value
 * stopping two honest runs of one claim from producing one comparable string, so leaving it out is
 * what makes "re-run `prove` and compare tokens" a verification a reader can perform.
 *
 * The project goes last, and its own path and digest are joined by `@`. Split the token on
 * `RECEIPT_SEPARATOR`, take fields 0 through 5, and rejoin the remainder with that separator to
 * read the project field; inside it the digest is everything after the final `@`. That rule stays
 * total for a workspace-relative project path containing either character.
 *
 * The two conditions count findings differently. The control's condition counts `origin: 'code'`
 * findings alone, because a control whose test never ran and a control whose specification could
 * not be deleted have each disproved nothing, and a receipt issued for either certifies an
 * inspection that did not happen. The case's condition counts every finding, `origin: 'instrument'`
 * included, because a case the stage could not inspect end to end is not a clean case. The case
 * therefore fails on a fault of either origin, and the control passes only on a fault in the
 * candidate's own code.
 *
 * @param verdict - The verdict whose case and control checks decide the outcome
 * @param stage - The stage the claim's control declared it must fail at
 * @returns The receipt token, or `undefined` when either condition fails
 *
 * @example
 * ```ts
 * computeReceipt(proven, 'type')
 * // 'probe:6ca20c3bff623031d3955b9d1a76d71d:type:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8'
 * computeReceipt(proven, 'lint') // undefined
 * ```
 */
export function computeReceipt(verdict: Verdict, stage: Stage): string | undefined {
	const ran = PROBE_STAGES.every((name) => verdict.checks.some((check) => check.stage === name))
	const clean = verdict.checks.every((check) => check.findings.length === 0)
	const declared = verdict.control.find((check) => check.stage === stage)
	const broke = declared?.findings.some((finding) => finding.origin === 'code') ?? false
	if (!ran || !clean || !broke) return undefined
	const { typescript, oxlint, vitest } = verdict.toolchain
	return [
		RECEIPT_PREFIX,
		verdict.digest,
		stage,
		`typescript@${typescript}`,
		`oxlint@${oxlint}`,
		`vitest@${vitest}`,
		`${verdict.project.path}@${verdict.project.digest}`,
	].join(RECEIPT_SEPARATOR)
}
