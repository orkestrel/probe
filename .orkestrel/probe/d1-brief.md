# D1 — the two doc-truth highs criterion 3 left unapplied

## Role and engine

`implementer`, Claude Opus 5, native subagent. You perform this assignment directly and spawn
nothing. Documentation voice and TSDoc are the judgment this unit carries, which is why it routes
here rather than to a mechanical builder.

## Objective

Close rows 9 and 10 of `.orkestrel/probe/criterion-3-verification.md`: make the flagship `Claim`
@example a claim that can actually earn a receipt, and make the `CLAIM_SHAPE` remark describe the
guard the server calls. Land one executable proof for the first.

## Context

Working directory `/workspace/probe`, branch `claude/probe-package`. Read, in order: `AGENTS.md`,
`.claude/rules/typescript.md` (TSDoc form), `.claude/rules/documentation.md` (parity and prose),
`.claude/rules/writing.md`, `.claude/rules/tests.md`. No skill is named for this unit.

Both findings come from the six-lens seam sweep and were confirmed by inspection. Their full text is
in `.orkestrel/probe/high-finding-verification.md` at lines 124 and 168; you do not need that file,
because everything settled is restated here.

### Row 9 — the `Claim` @example declares a control that cannot fail

The current text, read today:

```text
$ sed -n '93,102p' src/core/types.ts
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
```

`case.files` and `control.files` are the same binding, and its text compiles. The control declares
`stage: 'type'`, so it cannot fail where it says it must. `computeReceipt` issues only when every case
check is clean AND the control failed at its declared stage, so this claim can never earn a receipt.

This is the flagship example on the package's central type — the shape a first consumer copies — and a
consumer who copies it gets a refusal with no indication that the example rather than their code is
wrong.

The correct control text already exists in the same file, twenty lines earlier, on `Control`:

```text
$ sed -n '68,76p' src/core/types.ts
```

Read it yourself and use what it uses. Give the `Claim` example its own control source rather than
reusing the `greeting` binding.

### Row 10 — the `CLAIM_SHAPE` remark describes a call path the server does not take

```text
$ sed -n '63,71p' src/core/shapers.ts
/**
 * Blueprint for one claim, and the sole source of both the published tool schema and the guard
 * applied to an arriving claim.
 *
 * @remarks
 * The Model Context Protocol tool publishes `compileSchema(CLAIM_SHAPE)` and admits a call with
 * `compileGuard(CLAIM_SHAPE)`. Deriving both from this one value is what stops the advertised
 * contract and the enforced contract from drifting apart across a release.
 */
```

The server admits with `isClaim`:

```text
$ sed -n '64,66p' src/server/factories.ts
			execute: async (input) => {
				if (!isClaim(input)) throw new Error('The prove tool requires a valid claim')
				return probe.prove(input)
```

Every `compileGuard` occurrence under `src/` is inside a doc comment:

```text
$ grep -rn 'compileGuard' src/ | cut -c1-120
src/core/shapers.ts:13: * compileGuard(SOURCE_SHAPE)({ path: 'src/core/greeting.ts', text: '' }) // true
src/core/shapers.ts:30: * compileGuard(CASE_SHAPE)({ files: [], test }) // true
src/core/shapers.ts:51: * compileGuard(CONTROL_SHAPE)({ files: [], test, stage: 'type', reason: 'must not compile' }) //
src/core/shapers.ts:69: * `compileGuard(CLAIM_SHAPE)`. Deriving both from this one value is what stops the advertised
src/core/shapers.ts:75: * const admits = compileGuard(CLAIM_SHAPE)
src/core/validators.ts:99: * Admits and refuses exactly what `compileGuard(CLAIM_SHAPE)` does, so the in-process guard a
```

The anti-drift guarantee the remark exists for is real and is now proven: unit 4a landed
`tests/src/core/validators.test.ts:74`, which calls `compileGuard(CLAIM_SHAPE)` and asserts `isClaim`
agrees with it over a named hostile population. Rewrite the remark to state that guarantee — the tool
publishes `compileSchema(CLAIM_SHAPE)` and admits with `isClaim`, which a test holds to
`compileGuard(CLAIM_SHAPE)`'s exact behavior — and stop claiming a call the server does not make.

The `@example` at lines 73-77 of the same file calls `compileGuard(CLAIM_SHAPE)` directly. That
example is fine and stays: it demonstrates the shape's own API, and it makes no claim about the
server.

## Unknowns

**Whether the repaired example can earn a receipt today.** Neither of the example's paths is on disk:

```text
$ ls src/core/greeting.ts tests/src/core/greeting.test.ts
ls: cannot access 'src/core/greeting.ts': No such file or directory
ls: cannot access 'tests/src/core/greeting.test.ts': No such file or directory
```

So the example is a pure off-disk-candidate claim, which is the O9 defect's own subject — the type
stage could not resolve a candidate that is not already on disk. O9-U1 gave the type stage an
`Overlay`; O9-U2 does the same for the runtime stage and lands before you start. Whether that is
enough for this specific claim is not settled, and you are better placed to measure it than I am.

**Make the measurement your first step.** Before editing anything, drive `Probe.prove` with the
example's exact claim as it stands and record what comes back — the verdict, every finding, and
whether a receipt was issued. Then repair, and drive it again. Report both readings verbatim.

If the repaired claim still cannot earn a receipt for a reason that is not the control, stop and
report under the deviation contract with both readings. Do not repair a second defect to make your
test green, and do not weaken the test to match what you got.

## A standing condition of this tree

`tests/src/server/Probe.test.ts` is one of four server test files that contend over the shared
`tmp/probe` directory, and it is one of the two that time out under whole-suite load. Unit O9-U2 saw
11 such timeouts in `Probe` and `LintStage` in its own final gate, and every one passed on an isolated
re-run.

Your proof drives real stages with a real resident host, so it adds to that pressure.

- Give the new test an explicit timeout in the shape the neighbouring tests use, sized from an
  isolated run you take yourself rather than from a number in this brief.
- When `npm test` reports a timing failure in `Probe.test.ts` or `LintStage.test.ts`, re-run that file
  alone before believing it, and report both readings.
- A timing failure in a file you do not own is not yours to fix. Report it with both readings and
  carry on.

## Scope

Owned files:

- `src/core/types.ts`
- `src/core/shapers.ts`
- `tests/src/server/Probe.test.ts`

Report-only: `tests/src/core/validators.test.ts` (unit 4a's, and it is row 10's standing guard — read
it, cite it, change nothing in it).

Off-limits: everything else, and specifically `src/server/stages/RuntimeStage.ts`, `vite.config.ts`,
and `src/server/Overlay.ts`. O9-U2 owns those and lands before you; do not touch them even if you can
see a reason to.

Tools: Read, Grep, Glob, Edit, Write, Bash. You are the sole writer in the tree for the duration.

## Execution

Perform this assignment directly. Spawn no subagent and delegate no part of it.

## Output

A report with these sections and nothing else:

1. The two readings from the Unknowns measurement, verbatim.
2. The exact diff of every owned file.
3. The proof's red output before the fix and green output after, with the exact command that produced
   each and its reported counts.
4. The five gates in order — `npm run format:check`, `npm run lint:check`, `npm run check`,
   `npm run build`, `npm test` — each with its exact command and exit code, and the failing excerpt
   for any that did not pass.
5. Anything you found and did not change, one line each.

No process diary.

## Deviation contract

Stop and report — expected, found, exact evidence, done or not done, at most one short hypothesis —
if the repaired example cannot earn a receipt, if a gate fails for a cause outside your owned files,
or if closing either row requires editing a file you do not own. Where a paragraph sits, which
sentence order a remark takes, and how the new control source is named are yours to decide, record,
and carry on from.

## Acceptance criteria

Each closes using owned and report-only files alone.

1. The `Claim` @example in `src/core/types.ts` declares a control whose file text fails at the stage
   the control names, and no binding is shared between `case.files` and `control.files`.
2. `tests/src/server/Probe.test.ts` contains a test that drives `Probe.prove` with the example's exact
   claim and asserts a receipt is issued. It fails against the pre-repair example text and passes
   after.
3. The `@remarks` on `CLAIM_SHAPE` in `src/core/shapers.ts` states what the server actually does, and
   the words `compileGuard` appear there only in a sentence about the test that holds `isClaim` to it.
4. `grep -rn 'compileGuard' src/` returns no line asserting that the **tool** admits a call with it.
   Three lines survive this criterion and are correct as they stand:
   - `src/core/shapers.ts:13,30,51` — the `SOURCE_SHAPE`, `CASE_SHAPE`, and `CONTROL_SHAPE` examples
     call `compileGuard` to demonstrate each shape's own API. They make no claim about the server.
   - `src/core/validators.ts:99` — "Admits and refuses exactly what `compileGuard(CLAIM_SHAPE)` does"
     is a statement about the guard `isClaim`, not about the tool, and unit 4a's test proves it. That
     file is **off-limits** and this line is not a defect. Do not stop over it.
5. `npm run format:check`, `npm run lint:check`, and `npm run check` each exit 0.

**`npm run build` and `npm test` are observations, not criteria.** Run them and report each command
and its exit code. Your own exec is load, so a whole-suite timing failure read from inside it is a
question rather than an answer, and the Orchestrator takes the authoritative run after you exit.

## Review evidence

This unit is a code change, so its review input is the actual diff and the actual gate output. Both
are required sections above.
