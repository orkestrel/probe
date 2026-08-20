# PBDESIGN: rule on probe's public surface and its error axis, before 0.0.1

## Role and engine

Role `planner`. Engine Claude Opus 5, high effort. Read-only: you propose, you never implement or
accept.

## Objective

`@orkestrel/probe` has never been published. An objective audit lane found its public surface larger
than its capability and its error space overlapping. Rule on both. Your output is a design ruling a
writing unit will execute, not an implementation.

## Read first, in this order

1. `AGENTS.md` — § Design laws especially
2. `.claude/rules/architecture.md`, `.claude/rules/patterns.md`, `.claude/rules/names.md`
3. `guides/probe.md` — the governing spec
4. `src/core/types.ts`, `src/server/types.ts` — authoritative for the public contracts
5. `src/core/index.ts`, `src/server/index.ts` — the two barrels

## Already ruled — do not reopen

`createProbe` and `createProbeServer` are one-line constructor pass-throughs, and
`.claude/rules/architecture.md` says to delete a pass-through factory. Both are being deleted. Take
that as settled and rule only on what it obliges: what `src/bin/main.ts`, `README.md`,
`guides/probe.md`, `src/server/types.ts:203`, and the tests must become, and whether
`src/server/factories.ts` survives at all as a file.

## The questions

**Q1 — `Inspection`.** The audit reports it is an internal queue record, and that no public
operation accepts or returns it. Verify that yourself against the barrels and the public signatures.
If it holds, rule on whether it is interned into its implementation module or kept exported, and say
which rule decides it. `AGENTS.md` § Design laws requires reusable declarations to be centralized and
exported; it also requires a minimal public API added with its first real consumer.

**Q2 — `TypeStageInterface.candidates`.** The audit reports the member and its getter are read only
by TypeStage's own tests, never by production coordination. Removing it makes whatever those tests
observe unobservable, which is its own defect class. Rule between: keep it as an intentional
observation seam and say so in the guide; replace it with an observation the coordinator already
exposes; or remove it and accept that the behaviour is pinned some other way. Name the way.

**Q3 — the error axis.** The audit found the failure space overlaps and is incomplete:

- `readWorkspaceManifest(cwd, 'definitely-absent-package')` raises a native `Error`, and
  `isProbeError(error)` is `false`, while `guides/probe.md` claims every package failure is a
  `ProbeError`.
- A caller-selected test path matching no Vitest project returns `origin: 'instrument'`, while
  another caller path mistake raises `ProbeError` with `code: 'invalid'`, and a missing
  caller-selected TypeScript project is `code: 'workspace'`.
- A deadline finding names only the stage and the duration, so it cannot separate slow claimant code
  from a stalled instrument.
- `TypeStage` classifies fileless compiler diagnostics as `instrument` even when the caller-selected
  project caused them.

Sol's proposed remedy is one ownership discriminant used by both thrown errors and findings, with
native dependency and filesystem failures translated into the declared contract, and invalid claim
paths and projects classified consistently as claimant faults while a separate structured category
carries the underlying condition.

Rule on the **shape**: what the discriminant is called, what its values are, where it is declared,
how it relates to the existing `origin: 'code' | 'instrument'`, and whether `ProbeError`'s `code`
survives beside it or folds into it. `AGENTS.md` § Design laws forbids `kind` and `type` as a
discriminant name, forbids a decorative literal union, and requires a real domain state. A caller
must be able to answer "is this my fault or the tool's" from a value, not from a message string.

State the cost of your ruling: what a consumer writes today versus after, and what the guide must
say.

## Scope

Read-only. You are on an isolated worktree at commit `a5da753`; a writing unit is editing the main
checkout and you will not see its work, which is intended. Own nothing. Edit nothing. Spawn nothing.
Perform this assignment directly.

## Prohibitions

- Never run `git checkout`, `git restore`, `git stash`, `git reset`, or `git clean`.
- State no count in anything you write, and never name a list item by its position.

## Output

One ruling per question, each with: the decision, the rule that decides it, the exact new or changed
type text where a type changes, the consumers the change obliges, and the cost to a consumer. Then
one bounded unit brief's worth of scope — owned files and acceptance criteria — that a writing unit
could execute without further design. No process diary, no alternatives survey: rule, then say why.
