# PB4 — implement the receipt-integrity contract

## Role and engine

`implementer`, Claude Opus 5, native subagent. Perform the assignment directly and spawn nothing.

## Why this unit exists

Row P4 of `.orkestrel/probe/readiness-grade.md`, a release blocker, and the most consequential one:
the receipt **is** this package's product, and it is forgeable by the caller.

`Claim.project` selects the TypeScript configuration that judges the caller's own case, and the token
records the toolchain but not the project — so a receipt minted under a caller-supplied `strict: false`
is byte-indistinguishable from an honest one.

## The design is already ruled — implement it, do not redesign it

Two blind lanes designed this and the reconciliation is
**`.orkestrel/probe/p4-receipt-ruling.md`**. Read it in full first. It is the specification.

It carries the exact type declarations, the token format with a worked example measured in this
checkout, the file-by-file ownership table, ten falsifiable acceptance criteria, and three planted-
defect controls. Follow it. If you believe a part of it is wrong, **stop and report** rather than
substituting your own design — two lanes and a reconciliation went into it.

Three things in it are load-bearing and easy to lose:

- **`verdict.id` leaves the token.** That is what makes verification possible at all: two `prove` calls
  over one claim in two processes must return byte-identical tokens. Criterion 7 pins it and it fails
  today.
- **The project field goes last**, so the parsing rule stays total for a workspace-relative path
  containing `:` or `@`.
- **The digest binds content, not just the path.** A fork can weaken a project while keeping its name,
  and a receipt travels away from the workspace that minted it.

## Atomicity — this is the part that breaks a consumer if you get it wrong

The ruling states it and it is not optional: **`isVerdict`, `Verdict`, and `Probe.prove` land in one
commit.** `createProbeServer` validates what `prove` returns, so a tree where the type has moved and
the guard has not makes **every wire call throw** "The prove tool returned an invalid verdict".

Do not stage this across steps that leave the tree inconsistent.

## What the ruling says this obliges, and you own

- **P19 closes with it.** `TypeStage` publishes `candidates` and a two-parameter `inspect` that no
  interface declares, and you are adding `resolve` to the same class. Declare `TypeStageInterface` in
  `src/server/types.ts` and have the barrel test assert published members equal the interface's.
- **P18 becomes load-bearing.** `Project.path` must be the resolved workspace-relative spelling, never
  the caller's literal, or two spellings mint two receipts. Criterion 3 is the shared test.
- **P12's stale examples.** Three `@example` blocks embed the six-field token — `computeReceipt`,
  `RECEIPT_PREFIX`, and `RECEIPT_SEPARATOR`, the last asserting `.length // 6` — plus the `Verdict`
  example whose `id` is `'01J8Z0'` while `randomUUID` produces a UUID. Correct all of them in this
  pass so the documented token matches a real one.
- **`tests/distribution.test.ts` takes the new surface.** It exists and passes; the emitted
  declarations change, so update it rather than leaving it to be retrofitted.

## Not in scope

- **P26**, the unrelated-control gap, is a separate row needing its own design pass. The ruling refuses
  to fold it in. Do not attempt it.
- **P9**, a documented claim that earns a receipt, comes after this lands and after P13's control fix.
  Do not write it here — the ruling says writing it against the current format guarantees rewriting it.

## Standing conditions

- Unit PB3 lands before you and owns the stage files. Take its state as given.
- The sandbox denies **nested** child creation and nested `npm install` with `EPERM`. Spawn-dependent
  and distribution proofs may be unrunnable here: record them as observations naming the exact
  settling command, and never substitute a weaker instrument. The Orchestrator re-runs them on the
  host.

## Scope

Owned: `src/core/types.ts`, `src/core/validators.ts`, `src/core/constants.ts`, `src/core/helpers.ts`,
`src/server/helpers.ts`, `src/server/types.ts`, `src/server/stages/TypeStage.ts`,
`src/server/Probe.ts`, `tests/distribution.test.ts`, and every matching file under `tests/src/`.

Off-limits: `PROBE.md`, `.orkestrel/`, `package.json`, `vite.config.ts`, `guides/`.

## Execution

Perform this assignment directly. Spawn nothing.

## Acceptance criteria

The ruling's section 5 carries all ten and its three controls. They are the criteria; do not restate
or weaken them. In addition:

1. `npm run format:check`, `npm run lint:check`, and `npm run check` each exit 0.
2. The three planted-defect controls each fail before the fix and pass after, reported with both
   counts.
3. `isVerdict`, `Verdict`, and `Probe.prove` are consistent in every commit you make.

**`npm run build` and the test projects are observations, not criteria.** Report every command's
**bare** exit code; a pipe masks it.

## Deviation contract

Stop and report if a part of the ruling is wrong, if atomicity cannot hold within your owned files, or
if a criterion needs a file you do not own. Naming inside the ruling's stated shapes, test structure,
and comment placement are yours.

## Output

**What changed per ruling section**, **Files written**, **Red-then-green proofs** with exact commands
and both counts, **The three controls and what each proved**, **Validation** (each gate, bare exit
code), **What you could not run and the settling command**, **Deviation**, **Decisions**. No process
diary.
