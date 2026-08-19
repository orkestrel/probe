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
 * formatFinding({ path: 'src/core/greeting.ts', message: 'not assignable', line: 1 })
 * // 'src/core/greeting.ts:1 not assignable'
 * formatFinding({ path: 'src/core/greeting.ts', message: 'not assignable' })
 * // 'src/core/greeting.ts not assignable'
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
 * @param verdict - The verdict to render
 * @returns The identity and toolchain, then every case and control stage, then the receipt line
 *
 * @example
 * ```ts
 * formatVerdict(verdict).split('\n')[0] // 'probe 01J8Z0 (337 ms)'
 * ```
 */
export function formatVerdict(verdict: Verdict): string {
	const { typescript, oxlint, vitest } = verdict.toolchain
	const tools = `toolchain typescript ${typescript}, oxlint ${oxlint}, vitest ${vitest}`
	const proof = verdict.receipt === undefined ? 'no receipt' : `receipt ${verdict.receipt}`
	return [
		`probe ${verdict.id} (${verdict.elapsed} ms)`,
		tools,
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
 * control reported at least one finding at the stage it declared. A control that fails somewhere
 * else has falsified the instrument rather than the claim, so no receipt is issued for it. The
 * token names the toolchain that produced it, so a receipt read away from its verdict still says
 * which compiler, linter, and runner stood behind it.
 *
 * @param verdict - The verdict whose case and control checks decide the outcome
 * @param stage - The stage the claim's control declared it must fail at
 * @returns The receipt token, or `undefined` when either condition fails
 *
 * @example
 * ```ts
 * computeReceipt(proven, 'type')
 * // 'probe:01J8Z0:type:typescript@6.0.3:oxlint@1.78.0:vitest@4.1.10'
 * computeReceipt(proven, 'lint') // undefined
 * ```
 */
export function computeReceipt(verdict: Verdict, stage: Stage): string | undefined {
	const ran = PROBE_STAGES.every((name) => verdict.checks.some((check) => check.stage === name))
	const clean = verdict.checks.every((check) => check.findings.length === 0)
	const broke = verdict.control.find((check) => check.stage === stage)
	if (!ran || !clean || broke === undefined || broke.findings.length === 0) return undefined
	const { typescript, oxlint, vitest } = verdict.toolchain
	return [
		RECEIPT_PREFIX,
		verdict.id,
		stage,
		`typescript@${typescript}`,
		`oxlint@${oxlint}`,
		`vitest@${vitest}`,
	].join(RECEIPT_SEPARATOR)
}
