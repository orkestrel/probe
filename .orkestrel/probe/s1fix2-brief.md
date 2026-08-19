# Unit S1 fix round 2 — a receipt must mean the control's code broke

## Role and engine

`implementer` — Claude Opus 5, high reasoning effort. This round adds a discriminant to a published
type and rewrites documentation, which is API-shape and documentation-voice work. Two engines have
audited this file; a third round on the same subject is close to the budget, so read the ruling in
**What ends this seam** before starting.

## Objective

Make a receipt mean what `src/core/types.ts:223` says it means: the case was clean and the control
**failed where it said it would**. Today a control that never ran earns one.

## Context

Read before acting, in this order: `AGENTS.md`; `.claude/rules/names.md`, `typescript.md`,
`architecture.md`, `patterns.md`, `documentation.md`, `tests.md`, `quality.md`, `writing.md`; then
`/home/user/scaffold/.orkestrel/probe/s1fix-audit-verdict.md`; then this brief.

Governing guide: `PROBE.md` at `/home/user/scaffold/PROBE.md` — the orchestrator's repository, not
yours. `guides/probe.md` does not exist; `guides/README.md` records it as "Not created", so the TSDoc
you are about to fix is the package's only human documentation of these types.

**Everything the previous two rounds closed stays closed.** All eight claims of the last round were
confirmed by an independent lane. Do not revisit skip detection on the case side, runner recycling,
stdout draining, stderr routing, the ungated specification directory, or the distinct project messages.

## The defect, measured

`computeReceipt` (`src/core/helpers.ts:98-101`) asks whether the control's check at its declared stage
carries **a** finding. It never asks whether that finding is about the control's **code**.

The previous round enlarged the set of findings that are about nobody's code by five: runtime skip,
empty module, missing configured project, eviction failure, and deletion failure. So its own repair
inverted — a `ctx.skip()` control used to return `[]` and mint nothing, and now returns
`Vitest did not run the test (…)`, which reads as "the control broke as promised".

Measured against a real `Probe.prove`:

```text
SKIPPED-CONTROL receipt : "probe:204337f2-…:runtime:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11"
CONTROL-A real failure  : "probe:a3a84d5a-…:runtime:…"
CONTROL-B passing ctrl  : undefined
```

The two controls are what make this a defect rather than a broken probe: a genuine runtime failure
still earns a receipt, and a passing control still earns none.

## The repair

Give `Finding` a **named discriminant** for the axis that actually varies: whether the message is about
the candidate's code, or about the stage's own instrument. Have `computeReceipt` count only the first
when deciding whether the control broke. Keep the `clean` term counting **both**, so a case carrying an
instrument fault still fails closed.

**The name is your decision and it is the unit's main design call.** `.claude/rules/names.md` requires
you to name the axis that varies, never `kind` or `type`. `AGENTS.md` § Design laws also says a binary
behavioural switch is a boolean rather than a two-literal union, while a genuine discriminant stays a
union. Rule on which this is, and say which law you ruled on. The auditor proposed
`origin: 'code' | 'stage'`; adopt it or better it, and if you better it, say why.

Whatever you choose, set it at every construction site in all three stages, not only the runtime one.
A finding the type stage or lint stage raises about its own instrument is the same defect through a
different door, and the next round will find it there.

## Also yours, from the same audit

- **`#project`'s tuple forces an impossible branch that returns a clean check.** It returns two
  independent optionals for one outcome that is always exactly one of two, so the caller writes
  `findings: projectFinding === undefined ? [] : [projectFinding]` — a clean check for a case whose
  test never ran, unreachable today only because the three returns happen to be total. Return
  `TestProject | Finding`, or a shape whose findings arm carries a non-empty list, so that branch
  becomes unwritable rather than merely unwritten.
- **The claim-1 receipt assertion cannot fail.** The test passes one check, so `computeReceipt`'s
  first term is already false and it returns `undefined` whatever the findings are. Delete the whole
  skip-detection block and it still passes. Supply all three stages with type and lint clean, and add
  the inverse control in the same test: the same three checks with the runtime finding removed must
  produce a receipt.
- **Three messages breach the `Finding` contract.** `types.ts:113-137` defines it as the tool's own
  message against the path the tool reported. A deletion failure, an eviction failure, and a missing
  project are the stage's own faults wearing a `Vitest` prefix, and the deletion one reports the
  caller's path for a file the caller never wrote. The discriminant lets these drop the false
  attribution and name the real path.
- **The class TSDoc no longer describes the class.** `RuntimeStage.ts:19-33` omits the recycling
  entirely. Add one sentence to `@remarks` naming the retention bound, what triggers it, and that the
  replacement is paid synchronously by the inspection that triggers it.
- **The recycle is paid inside the caller's deadline.** 1.15 s as reported, since corrected to 260-285 ms by measurement lands on the 65th call — 3.8% of the
  default 30 s budget, and at a tuned deadline it triggers `Probe`'s own expiry-and-recycle recovery,
  so the recycling mechanism triggers the recovery mechanism. Either move the replacement off the
  critical path so it falls between calls, or document the stall where a caller budgeting latency will
  read it. Say which and why.
- **The counter counts the wrong thing.** `#inspections` increments on the early return that writes no
  specification, while its own comment justifies the bound by specifications written.
- **The map test is named for something it does not do.** It never constructs a `RuntimeStage`; it
  compares two independent Vitest instances. The measurement is right and the name claims coverage the
  body lacks. Rename it for what it proves.
- **A `finally` reads `tmp/probe` unguarded.** On a fresh clone that throws `ENOENT` and replaces the
  real failure — the same masking class this file just repaired. Guard with `existsSync`.

## What ends this seam

`.claude/rules/quality.md` budgets three rounds at one seam, and this is the third against the runtime
stage's verdict path. This round is the ruling, not a fourth repair, so state the invariant plainly in
the code and its documentation:

**A receipt is issued only when every stage ran clean on the case AND the control produced at least one
finding about its own code at the stage it declared.**

Name the constraint that bounds it against over-correction — an instrument fault on the CASE must still
refuse the receipt, so the `clean` term keeps counting every finding — and name the interface where a
consumer meets the obligation, which is `Finding`'s discriminant and the TSDoc on `computeReceipt` and
`Verdict.receipt`.

## Scope

- **Owned**: `src/core/types.ts`, `src/core/helpers.ts`, `src/server/stages/RuntimeStage.ts`,
  `src/server/stages/TypeStage.ts`, `src/server/stages/LintStage.ts`,
  `tests/src/core/helpers.test.ts`, `tests/src/server/stages/RuntimeStage.test.ts`, and any other
  mirrored test your change reddens.
- In `TypeStage.ts` and `LintStage.ts` you own the `Finding` construction sites and nothing else.
  Later units repair other defects in those files; do not touch them.
- **Instruments**: write every throwaway instrument under `tmp/scratch/`, and delete it before you
  return. `tmp` is gitignored; a bare `scratch/` or a loose file at the repository root is NOT.
- **Off-limits**: `src/core/validators.ts`, `src/core/shapers.ts`, `src/server/Probe.ts`,
  `src/server/factories.ts`, `src/bin/main.ts`, `guides/**`, `PROBE.md`, `package.json`,
  `vite.config.ts`, `configs/**`, and every dotfile. If the discriminant must appear in the wire
  guard or shape, stop and report — that is a contract question for the Orchestrator.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: no commit, push, tag, publish, dependency install, or destructive command. Add no
  npm package. Add no type assertion and no suppression of any kind.

## Criteria

Each owes a committed test, red before the fix and green after, with the exact command and both counts.

1. A control whose test calls `ctx.skip()` earns NO receipt.
2. A control that genuinely fails at its declared stage still earns a receipt.
3. A control that passes still earns none.
4. A case carrying an instrument fault — an eviction or deletion failure — still refuses the receipt.
   This is the over-correction guard and it must be a separate test.
5. A control that fails at a stage OTHER than the one it declared still earns none.
6. The receipt assertion for the skip path turns on the finding: supplying all three stages, removing
   the runtime finding produces a receipt and restoring it does not.
7. `#project` cannot return a clean check for a case whose test never ran, by shape rather than by
   accident.
8. Every `Finding` the three stages construct carries the discriminant, set correctly.

## Execution

Perform this assignment directly. Spawn no subagent.

## Host facts

- Working directory `/workspace/probe`. Nested spawns permitted. `npm test` takes roughly three minutes.
- `npm test` exits 1 in your sandbox at `tests/config.test.ts` with `spawnSync EPERM`. That file is
  off-limits and the failure is the sandbox; it passes outside. Report it and move on.
- The `probe` Vitest project collects `tmp/probe/**/*.test.ts` and no gate selects it.

## Deviation contract

Stop and report when a fix needs an off-limits file, when the discriminant appears to require the wire
guard or shape, when two criteria contradict, or when a gate reddens for a reason your change does not
explain. Report expected, found, the exact command and output, whether the work is done, and at most
one short hypothesis.

Ancillary conflicts — a test's placement, a message's wording, the order of two assertions — you decide,
record, and carry on.

## Output

Return exactly: **Files written**, **Validation**, **Acceptance evidence**, **Deviation**, **Decisions**.

Under **Decisions**, lead with the discriminant's name and the law you ruled it on.
