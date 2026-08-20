import type { Check, Issue, Stage, Verdict } from './types.js'
import { compileGuard } from '@orkestrel/contract'
import { PROBE_STAGES, RECEIPT_PREFIX, RECEIPT_SEPARATOR } from './constants.js'
import { CLAIM_SHAPE } from './shapers.js'
import { isSource } from './validators.js'

/**
 * Renders one tool message as a single line an agent can classify and locate.
 *
 * @param issue - The message and location a stage reported
 * @returns The bracketed origin, location, and message, separated by spaces
 *
 * @example
 * ```ts
 * const located: Issue = {
 * 	origin: 'claimant',
 * 	path: 'src/core/greeting.ts',
 * 	message: 'not assignable',
 * 	line: 1,
 * }
 * const whole: Issue = {
 * 	origin: 'claimant',
 * 	path: 'src/core/greeting.ts',
 * 	message: 'not assignable',
 * }
 * formatIssue(located) // '[claimant] src/core/greeting.ts:1 not assignable'
 * formatIssue(whole) // '[claimant] src/core/greeting.ts not assignable'
 * ```
 */
export function formatIssue(issue: Issue): string {
	const where = issue.line === undefined ? issue.path : `${issue.path}:${issue.line}`
	return `[${issue.origin}] ${where} ${issue.message}`
}

/**
 * Renders one stage's outcome as its summary line followed by every message it reported.
 *
 * @remarks
 * A clean stage renders one line. The count appears even when it is zero, because that line is
 * what shows a reader the stage ran; a silent stage and a skipped stage read the same.
 *
 * @param check - The stage outcome to render
 * @returns The summary line, then one indented line per issue
 *
 * @example
 * ```ts
 * formatCheck({ stage: 'lint', elapsed: 17, issues: [] })
 * // 'lint: 0 issues (17 ms)'
 * ```
 */
export function formatCheck(check: Check): string {
	const count = check.issues.length
	const noun = count === 1 ? 'issue' : 'issues'
	const summary = `${check.stage}: ${count} ${noun} (${check.elapsed} ms)`
	const lines = check.issues.map((issue) => `  ${formatIssue(issue)}`)
	return [summary, ...lines].join('\n')
}

/**
 * Renders a whole verdict as the text an agent reads.
 *
 * @remarks
 * Every stage appears for both the case and the control, so no failing stage can be masked by an
 * earlier one. The closing line always states the receipt or its absence, so a reader never has to
 * infer from silence whether the claim was proven.
 *
 * The heading lines carry everything the receipt binds, each in the name-then-value form the
 * toolchain line established: the call's identity, the claim it answered, the tools that ran, and
 * the project that judged the candidates. A verdict carrying the control's reason renders it next,
 * before either phase's checks. A reader comparing two verdicts therefore reads what differed
 * without recomputing anything.
 *
 * @param verdict - The verdict to render
 * @returns The identity, claim, toolchain, project, and reason when present, then every case and
 * control stage, then the receipt line
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
	const reason = verdict.reason === undefined ? [] : [`reason ${verdict.reason}`]
	const proof = verdict.receipt === undefined ? 'no receipt' : `receipt ${verdict.receipt}`
	return [
		`probe ${verdict.id} (${verdict.elapsed} ms)`,
		`claim ${verdict.digest}`,
		tools,
		project,
		...reason,
		...verdict.checks.map((check) => `case ${formatCheck(check)}`),
		...verdict.control.map((check) => `control ${formatCheck(check)}`),
		proof,
	].join('\n')
}

/**
 * Computes the proof token a verdict carries, or returns nothing when the claim was not proven.
 *
 * @remarks
 * A receipt is minted on these conditions together: both phases report one check per stage, the
 * case carries no issue, the control carries at least one `origin: 'claimant'` issue
 * at the stage it declared, and every other control stage carries no claimant issue. A control
 * that fails somewhere else has falsified the instrument rather than the claim, so no receipt is
 * minted for it.
 *
 * Both phases owe every stage, not the case alone. `strayed` reads the control entries a verdict
 * carries, so a control that omits a stage entirely would otherwise read as a stage that stayed
 * clean, and the receipt would certify an inspection that never ran. `prove` records every stage
 * for both phases, so this condition refuses only a verdict a caller assembled by hand.
 *
 * The token names every condition the verdict was reached under, so a receipt read away from its
 * verdict still says what was judged and what judged it: the claim's digest, the stage the control
 * broke at, the tool versions, and the project the candidate sources were checked against.
 * The call's identity is deliberately absent. It carries no integrity and it is the only value
 * stopping two honest runs of one claim from producing one comparable string, so leaving it out is
 * what makes "re-run `prove` and compare tokens" a verification a reader can perform.
 *
 * The project goes last, and its own path and digest are joined by `@`. Split the token on
 * `RECEIPT_SEPARATOR`, take fields 0 through 5, and rejoin the remainder with that separator to
 * read the project field; inside it the digest is everything after the final `@`. That rule stays
 * total for a workspace-relative project path containing either character.
 *
 * An `origin: 'instrument'` issue in either phase means the inspection did not complete and
 * refuses the receipt. A workspace issue in the control does not decide whether the claimant's
 * candidate broke, while one in the case still means that the case did not run clean.
 *
 * @param verdict - The verdict whose case and control checks decide the outcome
 * @param stage - The stage the claim's control declared it must fail at
 * @returns The receipt token, or `undefined` when any condition fails
 *
 * @example
 * ```ts
 * computeReceipt(proven, 'type')
 * // 'probe:6ca20c3bff623031d3955b9d1a76d71d:type:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8'
 * computeReceipt(proven, 'lint') // undefined
 * ```
 */
export function computeReceipt(verdict: Verdict, stage: Stage): string | undefined {
	const ran = PROBE_STAGES.every(
		(name) =>
			verdict.checks.filter((check) => check.stage === name).length === 1 &&
			verdict.control.filter((check) => check.stage === name).length === 1,
	)
	const clean = verdict.checks.every((check) => check.issues.length === 0)
	const declared = verdict.control.find((check) => check.stage === stage)
	const broke = declared?.issues.some((issue) => issue.origin === 'claimant') ?? false
	const faulted =
		verdict.checks.some((check) => check.issues.some((issue) => issue.origin === 'instrument')) ||
		verdict.control.some((check) => check.issues.some((issue) => issue.origin === 'instrument'))
	const stayed = verdict.control.every(
		(check) => check.stage === stage || check.issues.every((issue) => issue.origin !== 'claimant'),
	)
	if (!ran || !clean || !broke || faulted || !stayed) return undefined
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

/**
 * Renders one generated specification: the caller's own test text, then the marker naming the
 * revision that wrote it.
 *
 * @remarks
 * The marker is what makes a file in a target workspace attributable to this package. A generated
 * specification carries text the caller supplied, so its name alone cannot separate it from a
 * developer's own file, and a sweep reading the name alone deletes that file. The marker goes last
 * so every line of the caller's text keeps the number a reported stack frame gives it, and the text
 * gains a terminating newline first so the marker is never appended to a line of the test.
 *
 * @param text - The caller's own test text
 * @param revision - The writing host's process id and a fresh UUID, joined by `-`
 * @returns The bytes the runtime stage writes for that revision
 *
 * @example
 * ```ts
 * formatSpecification("test('greets', () => {})\n", '4821-9f0c')
 * // "test('greets', () => {})\n// @orkestrel/probe generated specification 4821-9f0c\n"
 * ```
 */
export function formatSpecification(text: string, revision: string): string {
	const body = text === '' || text.endsWith('\n') ? text : `${text}\n`
	return `${body}// @orkestrel/probe generated specification ${revision}\n`
}

/**
 * Checks whether one file's text is the generated specification written for one revision.
 *
 * @remarks
 * Reads the marker `formatSpecification` writes, taken from that function rather than restated, so
 * the writer and the reader cannot drift apart. An empty body renders the marker alone, which is
 * why the comparison is built from a call rather than from a second copy of the text.
 *
 * @param text - The file's full contents
 * @param revision - The revision the file's name declares
 * @returns True if the text ends with this package's marker for that revision; false otherwise
 *
 * @example
 * ```ts
 * matchesSpecification(formatSpecification('', '4821-9f0c'), '4821-9f0c') // true
 * matchesSpecification('export const NOTE = 1\n', '4821-9f0c') // false
 * ```
 */
export function matchesSpecification(text: string, revision: string): boolean {
	return text.endsWith(formatSpecification('', revision))
}

/**
 * Names every source member of a claim-shaped value whose `path` this package's guard refuses.
 *
 * @remarks
 * The published claim schema constrains `Source.path` to a non-empty string and nothing else, while
 * `isSource` also refuses an absolute path and one that escapes the workspace. That one member is
 * the whole of the difference between the advertised contract and the enforced one, so a caller
 * refused after satisfying the schema is refused here and nowhere else. The whole input must first
 * satisfy that schema. Each source is then tested with `isSource` itself rather than with a second
 * copy of its rule. Reports nothing for a value carrying no source member, including one refused for
 * a member this contract does not declare.
 *
 * @param value - The rejected tool input
 * @returns The dotted member names, in `case` then `control` order, or an empty list
 *
 * @example
 * ```ts
 * const test = { path: 'tmp/probe/greeting.test.ts', text: '' }
 * findRefusedPaths({
 * 	project: 'tsconfig.json',
 * 	case: { files: [{ path: '../../etc/hosts', text: '' }], test },
 * 	control: { files: [], test, stage: 'type', reason: 'must not compile' },
 * })
 * // ['case.files.0.path']
 * ```
 */
export function findRefusedPaths(value: unknown): readonly string[] {
	if (!compileGuard(CLAIM_SHAPE)(value)) return []
	const members: string[] = []
	for (const phase of ['case', 'control'] as const) {
		const subject = value[phase]
		const sources = new Map<string, unknown>([[`${phase}.test`, subject.test]])
		for (const [index, file] of subject.files.entries()) {
			sources.set(`${phase}.files.${index}`, file)
		}
		for (const [member, source] of sources) {
			if (isSource(source)) continue
			members.push(`${member}.path`)
		}
	}
	return members
}
