# PB1 — the manifest blockers and the gate that keeps them closed

## Role and engine

`sol` (GPT-5.6 Sol), direct `codex exec`. You are the engine reading this inside your own CLI:
perform the assignment directly and spawn nothing.

## Why this unit is first

A six-lane production-readiness audit graded this package **not ready, eight blockers**. The full
grade is `.orkestrel/probe/readiness-grade.md` — read it before you start.

The finding underneath all eight: **no gate loads the published artifact.** Every blocker was
reachable in under a minute from a packed tarball, and none is visible to `prepublishOnly`.

You close four rows and build the gate that keeps them closed. The gate is the point. Without it the
next regression is invisible again.

## Context

`/workspace/probe`, branch `main`. Read `AGENTS.md`, `.claude/rules/workspace.md` (the test-project
matrix and the `distribution` row), `.claude/rules/tests.md`, and `.claude/rules/quality.md` first.

## The repairs

### P1 — the package cannot be installed

`npm install <tarball>` under npm 10.9.7 crashes: `Cannot read properties of null (reading 'edgesOut')`.
That is the npm bundled with the Node line this package's own `engines` declares.

The audit verified the fix: add `peerDependenciesMeta` marking `oxlint`, `typescript`, and `vitest`
optional. That is correct on its own terms, because all three resolve from the **target workspace**
being probed, not from this package's own tree.

Prove it: `npm install <tarball>` exits 0 in an empty directory under npm 10.

### P2 — a default install resolves TypeScript 7, which has no compiler API

The peer range is `typescript: ">=6.0.0"` and `npm view typescript version` returns `7.0.2`. On 7 the
type stage dies with an unnamed `TypeError: Cannot read properties of undefined (reading 'readFile')`.

Two parts:

- Bound the peers: `typescript: "^6.0.0"`, `oxlint: "^1.77.0"`, `vitest: "^4.1.0"`. Check the exact
  installed majors before writing these — do not copy them from this brief without verifying.
- Make the failure named. The version is already read at `src/server/Probe.ts:72`. When the resolved
  major is outside the supported range, `prove` rejects with an error that **states the supported
  range and the version found**, rather than dying inside the compiler.

### P23 — `engines.node` admits a Node that `vitest@4` excludes

`engines.node` must read `^22.12.0 || >=24.0.0`. Verify against `vitest@4`'s own `engines` before
writing it.

### P10 — the distribution gate

`tests/config.test.ts:406` **already asserts** a `test:distribution` script exists. Build the whole
row the workspace rules describe:

- a `distribution` Vitest project in `vite.config.ts`, selected by the presence of
  `tests/distribution.test.ts`;
- the `test:distribution` script exactly as `tests/config.test.ts` requires;
- `tests/distribution.test.ts` itself;
- `prepublishOnly` runs it.

The test packs the package, installs the tarball **outside this repository** in a scratch directory,
and asserts:

1. every `exports` entry resolves and loads under **both** `import` and `require`;
2. reading a real export from each entry works, not merely that the module loads;
3. `createProbe({workspace}).prove(claim)` returns a verdict under **both** module systems;
4. no `{}.` artifact remains in any emitted `.cjs` (this is P3's guard, which a later unit repairs —
   write the assertion now and let it fail, then say so in your report);
5. the install itself exits 0.

Give it a generous timeout: it packs, installs, and runs real stages.

**A negative control is required.** The audit's own law: an instrument is not evidence until it has
failed. Include a control that must fail — for example asserting a deliberately absent export path
resolves — and confirm it fires, then remove it or keep it as a skipped-by-design row with a comment.
State in your report what the control proved.

## Scope

Owned: `package.json`, `vite.config.ts`, `tests/distribution.test.ts` (new), `src/server/Probe.ts`
(for P2's named error only), and `tests/src/server/Probe.test.ts` (for P2's proof only).

Off-limits: every other file under `src/`, `.orkestrel/`, `guides/`, `PROBE.md`.

If P3's assertion in the distribution test fails, that is **expected and correct** — a later unit
repairs the CJS emit. Do not fix it here and do not weaken the assertion.

## Execution

Perform this assignment directly. Spawn nothing.

## Acceptance criteria

Cheap gates first, deliberately.

1. `npm run format:check`, `npm run lint:check`, and `npm run check` each exit 0.
2. `npm install <tarball>` exits 0 in an empty scratch directory.
3. A workspace whose TypeScript major is unsupported makes `prove` reject with an error naming the
   supported range and the version found, proven red-then-green.
4. `tests/config.test.ts` passes, including its existing `test:distribution` assertion.
5. `tests/distribution.test.ts` exists, is collected by its own project, and its non-P3 assertions
   pass.

**`npm run build` and the whole-suite test projects are observations, not criteria.** Run them, report
each command and its **bare** exit code — a pipe masks the code. Your own exec is load, so a
whole-suite timing failure read from inside it is a question, not an answer; the Orchestrator takes
the authoritative run after you exit.

## Deviation contract

Stop and report if a repair needs a file you do not own, or if bounding the peer ranges breaks a
gate in a way you cannot close within your scope. How you word the named error, where the scratch
directory lives, and how you structure the distribution test are yours to decide and carry on from.

## Output

**Per numbered row: what changed and why**, **Files written**, **Red-then-green proofs** with exact
commands and both counts, **The control and what it proved**, **Validation** (each gate, bare exit
code), **What P3's assertion did**, **Deviation**, **Decisions**. No process diary.
