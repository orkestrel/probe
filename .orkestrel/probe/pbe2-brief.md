# PB-E2: carry the ownership axis into the server, and close the tree

## Role and engine

Role `sol` implementer. Engine GPT-5.6 Sol, high effort, sandbox `workspace-write`, rooted at
`/workspace/probe`. You are the sole writer in this checkout for the duration of this unit.

## Objective

The unit before you renamed the core ownership axis and **left the tree red on purpose**:
`src/server/`, `src/bin/`, and `tests/guides.test.ts` still speak the old vocabulary. Carry the axis
into them, translate the native failures that escape the contract today, and make `npm run check`
exit 0 again.

## Read first, in this order

1. `AGENTS.md` — § Design laws especially
2. `.claude/rules/typescript.md`, `.claude/rules/architecture.md`, `.claude/rules/tests.md`
3. `guides/probe.md` — the governing spec
4. `.orkestrel/probe/pbdesign-ruling.md` — PB-Q3 is the ruling this unit finishes
5. `.orkestrel/probe/pbe1-report.md` — what the core half already did
6. `src/core/types.ts` and `src/core/constants.ts` — the axis as it now stands

## What already landed, and is not yours to reopen

`Origin` is `'claimant' | 'workspace' | 'instrument'`, carried by both `Finding` and `ProbeError`.
`ProbeErrorCode` is `'refused' | 'missing' | 'malformed' | 'destroyed' | 'deadline'`. Both are
required on `ProbeErrorOptions`. `isProbeError` validates both axes. `createDestroyedError` returns
claimant-owned destruction. The receipt predicates read `claimant`, and no receipt is minted when
either phase reports an instrument fault.

The invariant: **a claimant finding is a tool's diagnostic about a candidate source, and nothing
else. Every other claimant fault is a throw.**

## The migration, per site

Apply this table. Locate each site yourself; the line numbers behind it were taken before the core
half landed.

| Site | Becomes |
| --- | --- |
| `helpers.ts` path escapes the workspace; `ProbeServer` claim refused; `LintStage` already inspecting that path | `origin: 'claimant', code: 'refused'` |
| `helpers.ts` cannot infer a scoped project | `origin: 'claimant', code: 'refused'` |
| `Probe` coordinator deadline | `origin` attributed per the rule below, `code: 'deadline'` |
| `LintStage` server did not exit within its bound | `origin: 'instrument', code: 'deadline'` |
| `helpers.ts` no bin field; a tool the workspace does not install | `origin: 'workspace', code: 'missing'` |
| `helpers.ts` manifest not a record; bin entry not a string; `Probe` no readable version; `Probe` version out of range; `TypeStage` project unparseable | `origin: 'workspace', code: 'malformed'` |
| `Probe` boot controls; `ProbeServer` schema unadvertisable; `ProbeServer` invalid verdict; `LintStage` stage fault | `origin: 'instrument', code: 'malformed'` |

## The three behaviour repairs, none optional

The axis means nothing if a failure escapes it. Each of these was measured by an audit lane.

**Translate the native failures.** `resolveWorkspaceModule`, `loadWorkspaceModule`, and
`readWorkspaceManifest` let native faults through untranslated: `require.resolve` raises
`MODULE_NOT_FOUND`, and `readFileSync` plus `JSON.parse` leak the same way. An executed probe showed
`readWorkspaceManifest(process.cwd(), 'definitely-absent-package')` raising a native `Error` with
`isProbeError(error) === false`, while `guides/probe.md` claims every failure this package raises is
a `ProbeError`. Each becomes `origin: 'workspace'` with `code: 'missing'` or `'malformed'`, carrying
the native fault as `cause`.

Do not stop at the three named functions. Sweep every native call site under `src/server/` —
`readFileSync`, `writeFileSync`, `mkdirSync`, `JSON.parse`, `createRequire`, `require` — and rule
each one translated or deliberately inside a `try`. Report the sweep and its ruling per site.

**A caller-selected test path matching no configured Vitest project throws.** It reports an
instrument finding today. Under the invariant it is a claimant fault and must throw:
`origin: 'claimant', code: 'missing', context: { stage: 'runtime', path }` — the same treatment its
sibling already gives a caller path mistake. Its workspace-owned neighbour stays a finding: a project
the root configuration names by a path string carries no overlay plugin, which is the target's
configuration shape, so that becomes `origin: 'workspace'` on the runtime `Check`.

**`TypeStage` splits a fileless diagnostic on who chose the project.** Under a project the caller
named it is the caller's selection and throws `origin: 'claimant', code: 'refused'`. Under a project
the package inferred it stays a finding and becomes `origin: 'instrument'`. `inspect` already knows
which, from whether its `project` parameter arrived.

## The deadline attribution rule

A `deadline` failure carries an `origin` that separates a slow claim from a stalled instrument, as a
value rather than a message. A stage that reported progress under this inspection is `claimant`; a
stage that never returned to the event loop is `instrument`.

Decide what evidence a stage must record to attribute honestly, and implement it. If no honest
attribution is reachable for some path, say so in your report with the exact reason rather than
guessing a value — a wrong attribution is worse than an admitted gap. Drive both attributions with a
test.

## Scope

- **Owned:** everything under `src/server/`, `src/bin/`, and `tests/src/server/`, plus
  `tests/src/bin/`.
- **`tests/guides.test.ts`: you own the legacy-constant reference only.** It still asserts
  `FINDING_ORIGINS`, which no longer exists. Rename that assertion to the current constant and its
  values, and change nothing else in that file — a later unit owns the guide and its parity rows, and
  a conflicting edit costs both units.
- **Shared, report-only:** `guides/probe.md` and `README.md`. Return exact replacement text; do not
  edit them.
- **Off-limits:** `src/core/` — the axis is settled there and reopening it re-breaks the tree.
  `tests/src/core/`, `tests/distribution.test.ts`, and every other file. The vendored host —
  `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `.codex/`, `.cursor/`, `configs/helpers.ts`,
  `scripts/*.sh`, `tests/config.test.ts`, `tests/policy.test.ts`, `tests/setupPolicy.ts` — is owned
  by `@orkestrel/scaffold` and restored by `repair`. `package.json` and `vite.config.ts` are
  scaffold-planned. Do not change the version.

## Host conditions

- The tree is committed at `e170de0` and clean when you start. `npm run check` is RED when you start,
  and closing it is your objective.
- **Your sandbox denies a loopback listener, a nested install, an `rm -rf`, a process one level below
  a child you spawn, and a write to some paths outside the obvious source tree.** Measured here:
  `LintStage`, `Probe`, and `ProbeServer` suites cannot pass inside it because Oxlint's children are
  denied. Never work around a denial. Report the reading as an observation naming the exact command;
  the Orchestrator takes it on the host, where every probe gate was green before this migration.
- Use `rmdir` for an empty directory. `tests/guides.test.ts` asserts a receipt earned with
  `tmp/probe` absent.
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
- No mocks, behavioral fakes, module replacement, framework spies, or fake clocks.
- State no count in any prose you write, and never name a list item by its position.

## Acceptance criteria

Close them in this order and report each command with its exit code and counts.

1. `rg -n 'FINDING_ORIGINS|FindingOrigin' src/ tests/` returns no hit.
2. `npm run lint:check` exits 0.
3. `npm run check` exits 0. This is the objective: the tree closes.
4. A permanent test proves `readWorkspaceManifest` with an absent package raises a value
   `isProbeError` admits, carrying `origin: 'workspace'`, `code: 'missing'`, and the native fault on
   `cause`. Record red-then-green.
5. A permanent test proves a caller-selected test path matching no configured Vitest project raises
   `origin: 'claimant'` rather than producing a finding. Record red-then-green.
6. A permanent test drives both deadline attributions, or your report states exactly which is
   unreachable and why.
7. A permanent test proves a fileless type diagnostic raises `origin: 'claimant'` under a
   caller-named project and reports `origin: 'instrument'` under an inferred one.
8. `npx vitest run --config vite.config.ts --project src:core` exits 0. Report its counts. You did
   not own core; this proves you did not break it.

Report the `src:server` project as an **observation** with its counts, never as a criterion — your
sandbox cannot pass it.

## Deviation contract

Stop and report if the objective itself conflicts with what you find: expected, found, exact
evidence, done or not done, and at most one short hypothesis. An ancillary choice — a helper's name,
a test's name, where a guard sits — is yours to decide, record, and carry on from. The migration
table's values and the claimant-finding invariant are not ancillary: a conflict with either stops
the unit.

## Output

Write your report to `tmp/codex/pbe2-report.md` and make it your final message too. It contains: the
files you touched and what changed in each; the native-call-site sweep with a ruling per site; the
deadline attribution rule you implemented and any path you could not attribute honestly; the
red-then-green readings; each acceptance criterion with its exit code and counts; an
**Observations** section for every reading your sandbox denied with the exact host command; the exact
guide and README replacement text your change obliges; and anything you could not close. No process
diary.
