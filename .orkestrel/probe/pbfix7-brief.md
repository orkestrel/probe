# PBFIX7: the receipt, the attribution, and the sweep, before this package first publishes

## Role and engine

Role `sol` implementer. Engine GPT-5.6 Sol, high effort, sandbox `workspace-write`, rooted at
`/workspace/probe`. Sole writer for this unit.

## Objective

An Opus 5 lane audited this package before its first publish and returned FAIL on almost every
claim. Two of its findings are regressions this campaign introduced. Close the correctness defects.
A second unit takes the fleet-wide rename and the guide.

`@orkestrel/probe` has never published. `0.0.1` cements whatever ships.

## Read first

1. `AGENTS.md` — § Non-negotiable rules and § Design laws
2. `.claude/rules/quality.md` — the Falsification law and its Instruments section
3. `.claude/rules/typescript.md`, `.claude/rules/architecture.md`, `.claude/rules/tests.md`
4. `guides/probe.md`
5. `.orkestrel/probe/pbaudit2-brief.md` — the claims that produced these findings

## C1 — the receipt is minted over a phase in which no test ran

`src/core/helpers.ts` computes `clean` as every case finding carrying `origin !== 'claimant'`, so a
`workspace` finding passes it. The only `workspace` **Finding** this package emits is the
string-declared Vitest project in `src/server/stages/RuntimeStage.ts` — and that finding means the
stage installed no overlay and executed nothing. Both phases then carry a runtime check that reports
an inspection which did not happen, and the receipt mints.

Reachable through `prove`, not only through a hand-built verdict: a workspace whose `probe` project
is inline and whose project collecting the claim's declared test path is string-declared produces
exactly that verdict.

Before this campaign the case condition was `check.findings.length === 0` and refused it. The
migration widened it, and a test was added asserting the widening.

**Ruled: close it on both routes.** Reclassify the string-declared-project finding as
`origin: 'instrument'` — the inspection did not complete — keeping the workspace detail in its
message so a reader still knows which file to fix. **And** restore the case phase to refusing any
finding at all. A receipt attests that the case ran clean; a case carrying any finding has not.

The test asserting that a workspace finding in the case phase still mints a receipt is now wrong.
Rewrite it to assert what the rule is, and keep a case proving a workspace finding **outside** the
case phase behaves as the rule says.

Do not add a completion axis beside `Origin` in this unit. Record in your report whether one is
needed; a successor owns that decision.

## C2 — the deadline attribution inverts in the case it exists for

`src/server/stages/RuntimeStage.ts` increments `#progress` at exactly one place: immediately **after**
`await vitest.runTestSpecifications(...)` resolves. A runtime deadline fires while that run is
outstanding, so the coordinator's `stage.progress > progress` comparison is always false and **every**
runtime deadline reports `origin: 'instrument'`.

The package's own test enshrines it: a claim whose test body is `while (true) {}` is asserted to
report `origin: 'instrument'`. A caller's infinite loop is the archetypal claimant fault, and the
package currently tells that caller to file a probe defect.

The mirror fails too. Once the boundary passes, everything left in the raced operation is probe's own
machinery — the eviction that awaits the cache write — so a stall there reports `claimant` for work
the claimant does not own.

**Ruled: move the boundary to where claimant work actually is.** Increment when the run **begins**
rather than when it resolves, and stop counting probe's own cleanup as claimant progress. Then a
caller's spinning test attributes `claimant` and an eviction stall attributes `instrument`.

Drive both directions with a test. The existing `while (true) {}` test changes its expectation; say so
plainly in your report rather than quietly editing it.

## C3 — a file this package generated survives the sweep forever

`src/server/Probe.ts` derives the boot test path from the revision-bearing dependency filename, so the
specification the runtime stage writes for it carries **two** revision markers in its basename —
`arm-type.probe-<revA>.test.probe-<revB>.ts`. The sweep reads the **first** with its pattern and hands
that revision to the ownership check, which compares it against the file's terminal marker naming the
**second**. The comparison can never match, so a host killed mid-boot leaves that file behind
permanently.

That residue is exactly the harm the sweep exists for: the workspace's own `check` and `lint:check`
read such a file and report its diagnostics against the consumer.

Fix it so the revision the sweep tests is the revision the marker names — read the last revision in
the basename, or give the boot test a stable module name carrying no revision so only one marker can
appear. Rule which and say why. Prove it with a test that leaves a marked boot-derived file behind and
watches the sweep remove it.

## C4 — a symlink in the target tree is blamed on the claimant

`src/server/helpers.ts` refuses **any** symbolic link in an existing path component with
`origin: 'claimant', code: 'refused'`, including a link resolving inside the workspace. A workspace
whose scratch directory is a mounted volume or a ramdisk cannot serve a claim at all. The link is a
property of the target tree, which this package's own type documentation defines as `workspace`.

Worse, the boot path and the sweep raise it with no claim in flight — a claimant-owned failure where
there is no claimant. A test asserts the symlinked-workbench case as `origin: 'instrument'`, which the
guide tells a reader means to report a probe defect, so the two sites disagree with each other as well
as with the axis.

Classify the symlink refusal `origin: 'workspace'`, and make the test agree.

## C5 — a native error escapes a published helper unclassified

`src/server/helpers.ts` rethrows raw whatever `lstatSync` raises outside the `ENOENT`/`ENOTDIR` branch
— `EACCES` on an unreadable component, `ELOOP` — and the `realpathSync` beside it is not wrapped at
all. The guide states that every failure this package raises while serving a claim is a `ProbeError`.

The campaign narrowed the instrument that would have caught this: the categorization gate previously
read every file under `src/**` for a bare construction and now reads a resident-module list that
excludes this file.

Translate the non-`ENOENT` branch the way `resolveWorkspaceModule` and `readWorkspaceManifest` already
do — `origin: 'workspace', code: 'malformed'`, native fault on `cause`. Then rule on whether the
categorization gate's narrowed population is defensible, and if it is not, widen it and prove the
widening catches this shape.

## C6 — two assertions cannot fail

One asserts that a **marked** boot dependency whose writer is gone is deleted. The ownership check
tried its path allowlist first and fell through to the same content check before the change, so that
assertion is green against both codebases and binds to nothing. Its sibling — an unmarked caller file
at a boot path surviving — does bind and stays.

The other asserts sorted set equality for origins but only membership for conditions, so a condition
the guide's table omits passes. Its name claims more than it matches.

Fix both: assert the property the change actually moved, and compare the condition set the same way
the origin set is compared.

## Scope

- **Owned:** `src/core/helpers.ts`, `src/server/helpers.ts`, `src/server/Probe.ts`,
  `src/server/stages/RuntimeStage.ts`, `src/server/stages/TypeStage.ts`,
  `src/server/stages/LintStage.ts`, `src/core/types.ts` and `src/server/types.ts` for TSDoc that
  becomes false, `tests/guides.test.ts`, and every test file under `tests/src/`.
- **Shared, report-only:** `guides/probe.md`. Return exact replacement text; a second unit owns it.
- **Off-limits:** `src/core/constants.ts` and `src/core/validators.ts` — a second unit renames the
  union and must not race you. Every other file. The vendored host — `AGENTS.md`, `CLAUDE.md`,
  `.agents/`, `.claude/`, `.codex/`, `.cursor/`, `configs/helpers.ts`, `scripts/*.sh`,
  `tests/config.test.ts`, `tests/policy.test.ts`, `tests/setupPolicy.ts`. `package.json` and
  `vite.config.ts` are scaffold-planned. Do not change the version.

## Host conditions

- The tree is committed and clean at `f9807ad`. Untracked `tmp/` files are expected.
- **Your sandbox denies a loopback listener, a nested install, an `rm -rf`, a process one level below
  a child you spawn, and a write to `.agents/`.** The `LintStage`, `Probe`, and `ProbeServer` suites
  cannot pass inside it because Oxlint's children are denied. Never work around a denial and never
  change a test to suit your sandbox. Report each denied reading as an observation naming the exact
  command; the Orchestrator takes it on the host, where every gate was green before this unit.
- Use `rmdir` for an empty directory and `rm -f` for a single file. `tests/guides.test.ts` asserts a
  receipt earned with `tmp/probe` absent.
- The network is unavailable.
- Do not run `npm run build`, tree-wide `npm run format`, or the whole `npm test`.

## Execution

Perform this assignment directly. Spawn nothing.

## Prohibitions

- Never run `git checkout`, `git restore`, `git stash`, `git reset`, or `git clean`.
- Never commit, push, install, or read a credential.
- No `any`, no `as`, no `!`, no `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable`.
- No mocks, behavioral fakes, module replacement, framework spies, or fake clocks.
- State no count in any prose you write, and never name a list item by its position.

## Acceptance criteria

Close them in this order and report each with its exit code and counts.

1. A permanent test proves no receipt is minted for a verdict whose runtime phase reports the
   string-declared project. Record red-then-green.
2. A permanent test proves a caller's non-terminating test attributes `claimant`, and another proves
   a stall in probe's own cleanup attributes `instrument`. Record red-then-green for the first.
3. A permanent test proves a marked boot-derived specification left by a dead host is swept. Record
   red-then-green.
4. A permanent test proves a symlink in the target tree is refused as `workspace`. Record
   red-then-green.
5. A permanent test proves the non-`ENOENT` `lstatSync` branch raises a `ProbeError` carrying the
   native fault on `cause`. Record red-then-green.
6. `npm run lint:check` exits 0.
7. `npm run check` exits 0.
8. `npx vitest run --config vite.config.ts --project src:core` exits 0. Report its counts.

Report the `src:server` project as an **observation**, never a criterion.

## Deviation contract

Stop and report if the objective itself conflicts with what you find: expected, found, exact
evidence, done or not done, and at most one short hypothesis. An ancillary choice — a helper's name,
a test's name — is yours. The C1 and C2 rulings are not ancillary: a conflict with either stops the
unit.

## Output

Write your report to `tmp/codex/pbfix7-report.md` and make it your final message too: files touched;
your ruling on C3's two options and on C5's gate population; whether a completion axis is needed
beside `Origin`; every red-then-green reading; each criterion with its exit code; an **Observations**
section for each denied reading with its host command; the exact guide replacement text; and anything
you could not close. No process diary.
