# PB8 — four contract rulings the campaign recorded and never took

## Role and engine

`sol` (GPT-5.6 Sol), through `codex exec`. Perform the assignment directly and spawn nothing.

Every row here is a semantic question about a published contract: what a guard admits, what a receipt
certifies, what a required member is for, what a renderer must distinguish. That is objective,
constraint-heavy work, so it routes to Sol. Nothing in it needs a grandchild process or a nested
install, so the bench limit in `.agents/orchestration.md` **Bench laws** rule 4 does not block the
work itself.

It does block the gates. `npm test` in this package spawns children that spawn children. Record every
gate result as an observation naming the exact command, and do not treat a gate failure inside the
sandbox as a finding about your change. The Orchestrator takes the authoritative run on the host.

## Prerequisite

Unit PB7 lands before this one starts. PB7 and this unit both edit `src/core/types.ts`,
`src/core/helpers.ts`, and `src/core/constants.ts`; running them together would be two writers in one
tree, which `.agents/orchestration.md` § Writing concurrency rule 1 forbids. PB7 corrects statements in
those files; you change what they declare. Read the tree as PB7 left it, not the tree the rows were
recorded against.

## Why these rows are one unit

Four rows where the campaign wrote down what the contract should say and then shipped the contract it
already had. Each is recorded with `NO CARRIER` in `pd-a-carry-check.md`.

They share one question: **what does this package refuse?** A guard that admits an escaping path, a
receipt that certifies a control it did not check, a required member nothing reads, and a renderer
that hides which of two origins produced a finding are four faces of it.

## Your first step

**Verify each row against this tree before ruling on it.** `pd-a-carry-check.md` was taken from
sources that predate unit PB4, which changed `Verdict`, `computeReceipt`, and the receipt token. Report
a row PB4 already closed as closed, with the `file:line` that closes it.

## The rows

### Row 32 — `Control.reason` is required, validated at three layers, and read by nothing

Recorded at `s5-brief.md:82`. S5's ruling was route-or-remove and was never applied.

Rule it: either carry `reason` onto `Verdict` so a consumer can read why the control was chosen, or
remove it from `src/core/types.ts`, its shape, its guard, and every writer. Do not leave a required
member whose only effect is to make a valid claim invalid.

State the ruling as `.claude/rules/quality.md` requires: the invariant the code will obey, the
constraint bounding it against over-correction, and the interface where a consumer meets the
obligation.

### Row 37 — `isSource` and `SOURCE_SHAPE` admit a workspace-escaping `path`

Recorded at `s5-brief.md:123`, and `readiness-grade.md:85` still states the guard admits those paths
while `resolveWorkspaceFile` throws on them. S4 deferred this half.

So a caller passing `../../etc/hosts` passes the guard and fails deep in a stage with an error that
does not name the guard that let it through. The guard must refuse it while still admitting a
contained relative path. Prove both directions.

### Row 39 — `computeReceipt` issues when the control broke at stages it did not declare

`src/core/helpers.ts:125-130` checks that the control's check at the **declared** stage carries a code
finding. It does not check that the control was otherwise clean. So a control that broke at every
stage earns a receipt naming any one of them.

The documentation and the boot control both state the strict reading. Rule it, and make the code and
the sentences agree. If the loose reading is correct, say why and correct the sentences instead —
`p4-receipt-ruling.md` is the governing ruling for the receipt and you may not contradict it; read it
first.

### Row 24 — `formatFinding` and `formatCheck` render both origins identically

Recorded at `receipt-defect-closed.md:70`, carried out of scope deliberately at the time. `Finding`
carries `origin` since that unit, so an agent reading `formatVerdict` output still cannot distinguish
a control failure from an instrument fault — which is the distinction the whole receipt mechanism
rests on.

Render the origin. Keep the output readable by a person and parseable by an agent; the format is
yours to choose and to state.

## Standing conditions

- The tree is clean at the commit the dispatch names.
- `tests/guides.test.ts` does not exist yet; unit PB6 creates it. Do not create it, and do not add a guide.
- Do not edit any file under `.agents/`, `.claude/`, or `configs/`. Those are vendored and `repair` reverts an edit there.
- `PROBE.md` is off-limits. It is dissolved by PB6.
- Unit PB7 has already landed when you start. Do not re-repair a row it closed; `src/server/Overlay.ts`, `src/server/stages/RuntimeStage.ts`, and `package.json` are its subject and stay off-limits to you.

## Scope

**Owned:** `src/core/types.ts`, `src/core/helpers.ts`, `src/core/validators.ts`,
`src/core/constants.ts`, `src/server/Probe.ts`, and the mirrored test files under `tests/src/core/`
and `tests/src/server/Probe.test.ts`.

**Off-limits:** everything else, including `PROBE.md`, every file in `.orkestrel/`, every vendored
path, and the three files PB7 owns.

**Tools:** read, write, and run commands inside `/workspace/probe`. Do not commit, push, install a
dependency, or run a destructive command.

## Execution

Perform this assignment directly. Spawn nothing.

Insert a failing proof before each repair: record the exact command and its failing count, implement,
then record the same command green. A guard that must refuse gets both directions proven, and the
admitting case is the control that makes the refusal worth reading.

## Acceptance criteria

Ordered so an unreachable criterion cannot hide the ones behind it.

1. Row 32 ends as a stated ruling with its invariant, its bound, and its interface — applied, not described.
2. Row 37: `isSource` refuses a workspace-escaping `path` and still admits a contained relative path, both proven.
3. Row 39: the code and every sentence about it state one reading, and a test distinguishes the two readings.
4. Row 24: `formatVerdict` output distinguishes a control failure from an instrument fault, proven by an assertion over the rendered text.
5. `npm run format:check`, `npm run lint:check`, and `npm run check` each exit 0. These are criteria.
6. `npm run build`, `npm test`, and `npm run test:distribution`: run them, record the bare exit code, and treat the result as an **observation**. They spawn children that spawn children, which this sandbox denies.

## Deviation contract

A conflict with the objective stops the unit: report expected, found, exact evidence, done or not done,
and at most one short hypothesis. A gate that fails on `EPERM` or on a denied nested operation is not a
deviation; record it as the observation criterion 6 asks for and carry on.

## Output

- Per row: what you found before changing anything, the ruling you took, and the `file:line`.
- The red-then-green command and both counts, per row.
- The gate table: command, bare exit code, criterion or observation.
- Files changed.

No process diary.
