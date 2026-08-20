# PB-E1: one ownership axis, in core

## Role and engine

Role `sol` implementer. Engine GPT-5.6 Sol, high effort, sandbox `workspace-write`, rooted at
`/workspace/probe`. You are the sole writer in this checkout for the duration of this unit.

## Objective

An objective audit found that a caller of `@orkestrel/probe` cannot tell their own fault from the
tool's by any value the package returns. A design lane ruled the shape that fixes it. Execute that
ruling in `src/core/` and its tests. A second unit carries it into `src/server/`.

`@orkestrel/probe` has never been published, so no consumer migrates. This is the free moment.

## Read first, in this order

1. `AGENTS.md` — § Design laws especially
2. `.claude/rules/typescript.md`, `.claude/rules/architecture.md`, `.claude/rules/names.md`,
   `.claude/rules/tests.md`
3. `guides/probe.md` — the governing spec
4. `.orkestrel/probe/pbdesign-ruling.md` — PB-Q3 is the ruling this unit executes
5. `src/core/types.ts` — authoritative for the public contracts

## The ruling, which is settled and not yours to reopen

Ownership and condition are two axes. Today `ProbeErrorCode` is the ownership axis wearing a
condition's name, which is why it overlaps `FindingOrigin`.

**`Origin` is `'claimant' | 'workspace' | 'instrument'`, carried by both `Finding` and `ProbeError`.**
`claimant` is the caller who wrote the claim — its input, its selections, its candidate code, its
lifecycle. `workspace` is the target tree probe borrows. `instrument` is this package, and keeps the
meaning it already carries.

The word is not new: `src/core/types.ts` already states that `ProbeErrorCode`'s `instrument` carries
the same meaning it does on `FindingOrigin`. The design already intends one axis and spells it twice.

**`FindingOrigin` is renamed `Origin`, and its `'code'` value becomes `'claimant'`.** That removes the
collision where `code` names both a `Finding.origin` value and a `ProbeError` member, so after this
change `code` means exactly one thing in the package.

**`ProbeErrorCode` becomes `'refused' | 'missing' | 'malformed' | 'destroyed' | 'deadline'`**, each
naming a different repair:

- `refused` — a guard or a containment rule rejected the value before work started. Change the value.
- `missing` — a thing the operation names is not present in the tree. Create or install it.
- `malformed` — a value exists and does not match the contract it is read against. Repair it.
- `destroyed` — the subject was torn down. Build a replacement.
- `deadline` — a budget expired. `origin` says whether to raise it, shrink the claim, or file a bug.

No value on either axis is derivable from the other.

**The invariant that makes one union sound:** a `claimant` finding is a tool's diagnostic about a
candidate source, and nothing else. Every other claimant fault is a throw. Without it a caller's bad
test path arrives as a `claimant` finding and satisfies the receipt condition that a test which never
ran must never satisfy. State this in `Finding`'s remarks.

`origin` never carries a value derived from another field, and no second field records progress,
blame, or completeness beside it.

## The exact declarations

`src/core/constants.ts` — `ORIGINS` replaces `FINDING_ORIGINS`, in the derive-to-type direction
`PROBE_ERROR_CODES` already uses:

```ts
export const ORIGINS = Object.freeze(['claimant', 'workspace', 'instrument'] as const)

export const PROBE_ERROR_CODES = Object.freeze([
	'refused',
	'missing',
	'malformed',
	'destroyed',
	'deadline',
] as const)
```

`PROBE_STAGES` keeps its current form. It is not on this axis.

`src/core/types.ts`:

```ts
export type Origin = (typeof ORIGINS)[number]
```

`Finding.origin` becomes `Origin` with the TSDoc "The party that must act on this message."
`ProbeErrorOptions` gains a required `origin: Origin` beside its required `code: ProbeErrorCode`,
documented as "The party that must act on this failure." and "The condition that ended the
operation." Both are required: a failure a consumer cannot branch on is the failure this type exists
to replace.

`src/core/errors.ts` — `ProbeError` carries `readonly origin: Origin` beside `readonly code`.
`isProbeError` reads `ORIGINS` beside `PROBE_ERROR_CODES`, so a branded lookalike carrying an
undeclared origin stays outside the type. `createDestroyedError` returns
`{ origin: 'claimant', code: 'destroyed' }`.

`src/core/validators.ts` — `export const isOrigin: Guard<Origin> = literalOf(ORIGINS)`. The guard's
name is already right and does not move.

`ProbeErrorContext` gains no member. It already carries `stage`, `path`, `project`, `name`,
`deadline`, and `value`, and `cause` already carries the underlying fault.

`src/core/helpers.ts` — `computeReceipt` follows the invariant literally:

```ts
const broke = declared?.findings.some((finding) => finding.origin === 'claimant') ?? false
```

and the clean-elsewhere conditions read `finding.origin !== 'claimant'` where they read
`=== 'instrument'` today. Under the old union those were the same predicate; under the widened one
they are not.

## What landed before you, which you must carry forward

A unit that ran before this one changed `computeReceipt` so that **no receipt is minted when any
`instrument` finding appears in either phase.** An instrument finding means the inspection did not
complete, and a receipt over an incomplete inspection attests nothing. That behaviour stays. Read
what is in the tree and preserve it; the predicate above is about which findings count as the
control breaking, not about relaxing the instrument rejection.

The same unit hardened path containment and the sweep's ownership marker. Do not undo either.

A second unit has since removed `createProbe`, `createProbeServer`, and `src/server/factories.ts`
entirely, removed `TypeStageInterface.candidates` and its getter, and removed
`this.#overlay.clear()` from `TypeStage.#destroy` after proving by measurement that the overlay is
empty at teardown. `Inspection` stays exported. None of that is yours to revisit, and none of it is
in `src/core/`.

## Scope

- **Owned:** `src/core/constants.ts`, `src/core/types.ts`, `src/core/errors.ts`,
  `src/core/validators.ts`, `src/core/helpers.ts`, `src/core/shapers.ts`, and every test file under
  `tests/src/core/`.
- **Shared, report-only:** `guides/probe.md` and `README.md`. Return the exact replacement text your
  change obliges; a later unit owns the guide.
- **Off-limits:** `src/server/`, `src/bin/`, `tests/src/server/`, `tests/src/bin/`,
  `tests/guides.test.ts`, `tests/distribution.test.ts`, and every other file. The vendored host —
  `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `.codex/`, `.cursor/`, `configs/helpers.ts`,
  `scripts/*.sh`, `tests/config.test.ts`, `tests/policy.test.ts`, `tests/setupPolicy.ts` — is owned
  by `@orkestrel/scaffold` and restored by `repair`. `package.json` and `vite.config.ts` are
  scaffold-planned. Do not change the version.

## The typecheck will be red, and that is expected

Renaming `FindingOrigin` and changing `ProbeErrorCode`'s values breaks `src/server/`, which you do
not own. `npm run check` therefore **cannot** exit 0 at the end of this unit, and it is not a
criterion. Run `npm run check:src:core` instead, which is scoped to what you own. Report the
tree-wide result as an observation with its failure paths, so the unit that follows you knows exactly
what it inherits.

## Host conditions

- The tree is committed and clean when you start. Untracked files under `tmp/` and `.orkestrel/` are
  expected.
- **Your sandbox denies a loopback listener, a nested install, an `rm -rf`, a process one level
  below a child you spawn, and a write to some paths outside the obvious source tree.** Measured in
  this repository: `LintStage`, `Probe`, and `ProbeServer` suites cannot pass inside it because
  Oxlint's children are denied. The `src:core` project needs none of that and does run. Never work
  around a denial; report it as an observation naming the exact command, and the Orchestrator takes
  the reading on the host, where every probe gate is currently green.
- Use `rmdir` for an empty directory.
- The network is unavailable. Do not install or fetch.
- Do not run `npm run build`, tree-wide `npm run format`, or the whole `npm test`.

## Execution

Perform this assignment directly. Spawn nothing.

## Prohibitions

- Never run `git checkout`, `git restore`, `git stash`, `git reset`, or `git clean`. Each discards a
  working-tree change silently, and this tree has no other copy of your work. To undo your own edit,
  undo exactly that edit.
- Never commit, push, install, or read a credential.
- No `any`, no `as`, no `!`, no `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable`.
- No mocks, behavioral fakes, module replacement, or framework spies.
- State no count in any prose you write, and never name a list item by its position.

## Acceptance criteria

Close them in this order and report each command with its exit code and counts.

1. `rg -n 'FINDING_ORIGINS|FindingOrigin' src/ tests/` returns no hit.
2. `rg -n "'invalid'|'workspace'|'instrument'" src/core/constants.ts` shows none of them inside
   `PROBE_ERROR_CODES`.
3. `ProbeErrorOptions` requires both `origin` and `code`, and `isProbeError` refuses a branded value
   carrying an undeclared `origin`. A permanent test proves the refusal.
4. `computeReceipt` reads `=== 'claimant'` and `!== 'claimant'`, and still mints no receipt when an
   `instrument` finding appears in either phase. A permanent test proves both.
5. `npm run lint:check` exits 0.
6. `npm run check:src:core` exits 0.
7. `npx vitest run --config vite.config.ts --project src:core` exits 0. Report its counts.

## Deviation contract

Stop and report if the objective itself conflicts with what you find: expected, found, exact
evidence, done or not done, and at most one short hypothesis. An ancillary choice — a helper's name,
a test's name — is yours to decide, record, and carry on from. The ruled union values and the
invariant are not ancillary: a conflict with either stops the unit.

## Output

Write your report to `tmp/codex/pbe1-report.md` and make it your final message too. It contains: the
files you touched and what changed in each; the permanent tests you added and what each pins; each
acceptance criterion with its exit code and counts; an **Observations** section carrying the
tree-wide `npm run check` failure paths the next unit inherits; the exact guide and README
replacement text your change obliges; and anything you could not close. No process diary.
