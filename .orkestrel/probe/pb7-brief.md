# PB7 — make every documented statement true of the code that shipped

## Role and engine

`implementer` (Claude Opus 5, native). Perform the assignment directly and spawn nothing.

This unit is prose against code. Its judgment load is which contract each sentence should state, so it
routes to the subjective engine. The writer is on the Orchestrator's engine, so this unit's audit lane
is **Sol**.

## Why these rows are one unit

Unit S5 was briefed and never shipped. Its subject was a set of TSDoc statements that describe
behaviour `@orkestrel/probe` does not have. Every one of them still ships, and each reaches a consumer
who reads the declaration and believes it.

`.claude/rules/documentation.md`: a prose ruling survives because nothing tries to break it. That is
what happened here — S5's brief named these, S5 never ran, and no later unit picked them up. The carry
check `pd-a-carry-check.md` lists each with `NO CARRIER`.

## Your first step

**Verify each row against this tree before repairing it.** `pd-a-carry-check.md` was taken from
`readiness-grade.md` and `s5-brief.md`, both of which predate unit PB4. PB4 changed `Verdict`,
`computeReceipt`, `TypeStage`, and the receipt token. A row PB4 already closed must be reported closed,
not repaired twice.

State, per row, what you found before you changed anything.

## The rows

Each cites `pd-a-carry-check.md` by its row number and the source that recorded it.

| Row | The statement, and what the code does | Source |
| --- | ------------------------------------ | ------ |
| 33 | `ProbeInterface` and `ProbeOptions` document mtime-keyed revalidation. The sweep hashes contents, and covers only module extensions. | `s5-brief.md:105` |
| 34 | `inferTestProject` `@returns` documents a root-project fallback the implementation does not have. | `s5-brief.md:107` |
| 35 | The `expire` event's documentation says the runtime worker was recycled. The event fires before recycling, and recycling is conditional. | `s5-brief.md:115` |
| 36 | The `Verdict` `@example` sets `elapsed` below `max(case) + max(control) = 513`, copied at three sites. | `s5-brief.md:118` |
| 38 | `Finding.line` is documented absent for a runtime failure. `RuntimeStage` sets it when the stack carries one. | `critic-findings-routing.md:35` |
| 40 | `Finding.path` documentation says "the path the tool reported". All three stages substitute a different path. | `critic-findings-routing.md:86` |
| 23 | `formatFinding`'s `@example` omits the required `origin`, so one extracted block does not compile. | `readiness-grade.md:51` |
| 46 | `Probe.test.ts` asserts emptiness over the generic `arm-` and `.probe-` prefixes, so it can fail on a file another test created. | `seam-sweep-triage.md:304` |
| 44 | `Overlay.covers` and the runtime stage each carry their own path normalization; the shared helper was never promoted. | `o9-u2-audit-reconciliation.md:103` |
| 42 | Stack remapping compares paths by exact string, so a workspace reached through a symlink leaks `probe-<uuid>` into `Finding.path`. | `o9-u2-audit-reconciliation.md:97` |

## How to fix a row

For rows 33, 34, 35, 36, 38, and 40: **correct the statement to the implemented contract.** Do not
change behaviour to match the sentence. Each of these behaviours is deliberate and tested; the sentence
is what drifted. Where you judge the behaviour itself wrong, stop and report rather than changing it —
that is a design ruling, not a documentation repair.

Row 23 is a compile defect: add `origin` to the example and prove the examples compile.

Row 21 is struck. Unit PB1 already closed it: `package.json` reads
`"engines": {"node": "^22.12.0 || >=24.0.0"}`, which is exactly the range the row asked for. It is
recorded here so the carry check's row 21 does not read as dropped.

Row 46 is a test defect: assert only files the test itself created, identified by a token unique to it.

Row 44 is a consolidation: one exported `normalizePath` in `src/server/helpers.ts` consumed by both
callers, tested once, per `AGENTS.md` § Design laws.

Row 42 is a defect in that same normalization, so take it with row 44 rather than beside it: resolve
both sides through their real path before comparing, and prove it with a workspace reached through a
symlink. A finding whose `path` names an internal revision file is a finding a consumer cannot open.

## Standing conditions

- The tree is clean at the commit the dispatch names. Nested child creation works on this host.
- `tests/guides.test.ts` does not exist yet; unit PB6 creates it. Do not create it, and do not add a guide.
- Do not edit any file under `.agents/`, `.claude/`, or `configs/`. Those are vendored and `repair` reverts an edit there.
- `PROBE.md` is off-limits. It is dissolved by PB6.
- Unit PB8 runs after you, and changes what `src/core/types.ts`, `src/core/helpers.ts`, and `src/core/validators.ts` declare — `Control.reason`, the `isSource` guard, `computeReceipt`'s strictness, and origin rendering. Correct the statements you find; do not pre-empt those four rulings.

## Scope

**Owned:** `src/core/types.ts`, `src/core/helpers.ts`, `src/core/constants.ts`, `src/server/types.ts`,
`src/server/helpers.ts`, `src/server/Overlay.ts`, `src/server/stages/RuntimeStage.ts`,
`src/server/index.ts`, `package.json`, and the mirrored test files under `tests/src/`.

**Off-limits:** everything else, including `PROBE.md`, every file in `.orkestrel/`, and every vendored
path.

**Tools:** read, write, and run commands inside `/workspace/probe`. Do not commit, push, install a
dependency, or run a destructive command.

## Execution

Perform this assignment directly. Spawn nothing.

A documentation repair still gets a proof. Where a sentence states a behaviour, the test that binds it
executes that behaviour and fails when it changes — `.claude/rules/documentation.md` refuses a
substring check as a close condition. Where a sentence states a shape rather than a behaviour, the
existing parity gate binds it and you say so.

## Acceptance criteria

1. Every row above is reported as repaired, or as already closed by PB4 with the `file:line` that closes it.
2. Every repaired behavioural statement has an executed assertion that fails when the behaviour changes.
3. Row 44 leaves exactly one `normalizePath` in the tree, exported and tested.
4. `npm run format:check` exits 0.
5. `npm run lint:check` exits 0.
6. `npm run check` exits 0.
7. `npm run build` exits 0.
8. `npm test` exits 0.
9. `npm run test:distribution` exits 0.

## Deviation contract

A conflict with the objective stops the unit: report expected, found, exact evidence, done or not done,
and at most one short hypothesis. A row whose correct fix is a behaviour change rather than a sentence
change stops that row and is reported; it does not stop the unit.

## Output

- Per row: what you found before changing anything, what you changed, and the `file:line`.
- The executed assertion that now binds each behavioural statement.
- The gate table: command, bare exit code.
- Files changed.

No process diary.

## One row added after PB6

PB6 found this in a file its own rows did not reach, and recorded it against the capability that owns
it. It is yours.

| Row | The statement, and what the code does | Source |
| --- | ------------------------------------ | ------ |
| 47 | `src/server/stages/RuntimeStage.ts:41-46` carries a latency measurement in a source comment with no date. | PB6 report, 2026-08-20 |

This is the defect class the `PROBE.md` ruling exists to stop, surviving in a source comment. Apply the
same rule `.agents/orchestration.md` § Before you prune fixes for a guide: a number carries the date it
was taken, or it is re-taken, or it goes. Re-take it on this host and date it, or delete it and say
what the comment is for without the number.

## What PB6 changed that you must read before starting

PB6 landed a guide, a parity gate, and a barrel change. Three of its findings correct inputs this brief
inherited:

- **`Overlay` and `OverlayInterface` are now interned**, named in the parity `INTERNAL` list. `Overlay` is no longer barrelled. Row 44's `normalizePath` consolidation still stands, but read the barrel as it is now.
- **`tests/guides.test.ts` exists** and sweeps both barrels for a missing `@example`. Any export you add or rename must carry one, or that gate fails.
- **Eleven of fifteen barrelled server helpers lacked an `@example`; all fifteen carry one now.** Row 23's `formatFinding` example is a core helper and is still yours.
