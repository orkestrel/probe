# Unit S1 fix round — close what the audit broke

## Role and engine

`sol` — GPT-5.6 Sol, high reasoning effort. You wrote unit S1. An Opus lane audited it and returned
`VERDICT: FAIL`. This brief carries its findings. The audit of THIS round goes to an engine that did
not write it, so do not audit your own work here — implement and report.

## Objective

Close the three broken claims and the findings listed under **Also yours**, without reopening what the
audit confirmed.

## Context

Read before acting, in this order: `AGENTS.md`; `.claude/rules/names.md`, `typescript.md`,
`architecture.md`, `patterns.md`, `tests.md`, `quality.md`, `writing.md`; then this brief.

Governing guide: `PROBE.md`, at `/home/user/scaffold/PROBE.md` — the orchestrator's repository, not
yours. Read it if your sandbox permits; if it refuses, proceed, because this brief carries the facts.

The full audit is at `/home/user/scaffold/.orkestrel/probe/s1-audit-verdict.md`. Read it. It carries
evidence this brief summarises.

**What the audit CONFIRMED, so do not revisit it:** the stdout isolation mechanism itself (claim 3),
the `PassThrough` bound (claim 4), the unmapped-path verdict (claim 7), and the per-module fallback
fix (claim 8). Your work on those stands.

## Break 1 — a receipt is still issued for a test that never ran

**This is the defect the unit exists to close, and it is still open.**

`module.state()` is not derived from whether tests ran. It reads the file task's own `mode` and
`result.state`. `ctx.skip()` mutates the test AFTER `interpretTaskModes` has fixed `file.mode = 'run'`,
so the module ends `passed` and your `passed` fast path `continue`s to a clean check.

Measured by the Orchestrator against your shipped stage:

```text
CTX-SKIP findings   : []
CONTROL pass        : []
CONTROL static skip : [{"path":"...","message":"Vitest ran no tests in the module"}]
```

The breaking case:

```ts
test('proves the fix', (ctx) => { ctx.skip(); throw new Error('never reached') })
```

The body never completes, yet the check is clean and a receipt issues. Note what the controls say: a
static `test.skip` DOES produce a finding, so your repair works for the case it targeted. This is a
different door, and at module level it is indistinguishable from a pass.

**The auditor's prescribed fix**, which you may adopt or better:

```ts
if (state === 'passed') {
    for (const test of module.children.allTests('skipped')) {
        findings.push({ path: original, message: `Vitest did not run the test (${test.fullName})` })
    }
    continue
}
```

One rule closes `ctx.skip()`, runtime `skipIf`, a partially skipped file, and the `passWithNoTests`
empty-file path together, and it states the invariant this package actually sells: **a clean check
means every collected test passed.**

The second instance to cover: with `passWithNoTests: true` in the TARGET workspace's config — which
`#warm` never overrides and which an arbitrary workspace may set — an empty test file also returns
`passed`.

## Break 2 — eviction leaves one map growing forever

`EnvironmentModuleGraph._unresolvedUrlToModuleMap` gains one entry per generated specification.
Nothing removes it; Vite's dist has no `delete` and no `clear` for that map.

Measured by the Orchestrator, applying your exact eviction sequence:

```text
UNRESOLVED   : [3,4,5,6,7,8]
FILETOMODULES: [2,2,2,2,2,2]
```

`fileToModulesMap` is a map you DO evict, and it stays flat — that control is what makes this specific
rather than a broken probe.

**Your reported curve read flat because your instrument counted the four maps you evict and never
counted this one.** That also overturns your recorded decision that "runner recycling was
unnecessary", which rests on those four.

The map is `@internal` and absent from Vite's declared type, so it cannot be deleted without a type
assertion, and `AGENTS.md` forbids those. **Do not add one.**

Two legitimate routes. Choose on evidence and say which you took and why:

- **Stop minting a unique path per inspection.** Reuse one stable revision path per test path and let
  Vitest's own invalidation work. If a unique path is required for cache correctness, prove that with a
  test rather than asserting it.
- **Cap the resident runner's lifetime**, recycling the Vitest instance every N inspections. If you
  take this, N is a measured choice, not a round number.

## Break 3 — the self-check cannot fire

Your check at the end of `#evict` re-reads three variables the same function just assigned. The ids
were just deleted, `filesMap` was just cleared by `watcher.onFileDelete`, and `getModulesByFile` reads
the very key just deleted. All three disjuncts are false by construction. It reads like a safety net
and holds nothing.

It also opens a masking hazard: `await writeToCache()` yields between the deletions and the check, and
a throw there propagates from `#inspect`'s `finally`, replacing whatever the `try` produced — a
legitimate `Check`, or the real diagnosis when the run rejected. That is the defect class unit S3 is
repairing in `LintStage`.

**Two-part fix.**

1. **A cleanup handler must not throw.** This package's vocabulary is "return a `Check` carrying
   `Finding`s". If retained state must be reported, report it as a `Finding` on the returned `Check`.
   Move `this.#revisions.delete(file)` ABOVE the `#evict` call so cleanup bookkeeping does not depend
   on eviction succeeding.
2. **A self-check belongs in the test, not the shipped `finally`.** Put the retention assertion in
   `tests/src/server/stages/RuntimeStage.test.ts`, where it can be observed red and where a Vitest
   upgrade fails loudly instead of silently.

## Also yours

- **The retention test proves only the disk half while its name claims both.** Nothing in it reads
  `state.filesMap`, `state.idMap`, `pathsSet`, or any module graph, so no resident-map size can redden
  it, and its 15-iteration loop carries no assertion — one iteration passes identically. Assert the
  resident maps are equal after inspection 1 and inspection N, include the map from break 2, and rename
  the test to what it proves.
- **Generated specifications now land in a GATED directory.** `tests/src/bin/main.test.ts` targets
  `tests/src/bin/wire-runtime.test.ts`, and `vite.config.ts:130` globs `tests/src/bin/**/*.test.ts` for
  `src:bin`, which `npm test` selects. A leaked revision file is collected and run by the next
  `npm test` — and this same file contains a test proving the entry leaks files when killed. Move them
  under `tmp/probe/`, which is ungated and gitignored. The auditor suggests `tmp/probe/bin/…`; verify
  `inferTestProject` returns `probe` for that path before relying on it.
- **`stderr` is discarded for no gain.** Only `stdout` frames the protocol. Bind `stderr` to
  `process.stderr` and comment at the call site naming stdout as the framed stream.
- **The two adversarial stdout inputs assert no verdict.** Ids 5 and 6 assert only that content is an
  array. Give them the id-4 assertion shape, so a case whose test writes to stdout is proven to still
  earn a receipt.
- **A misconfigured workspace is reported as a caller error.** `#project` collapses "the path infers no
  project name" and "the inferred project does not exist" into one `undefined`. Keep the finding for
  the first and give the second a distinct message naming the missing project. Only the caller can fix
  the first; only the workspace owner can fix the second.
- **`unlinkSync` now runs before the state cleanup.** An `EBUSY` or `EPERM` there skips `#evict`
  entirely and leaks both the file and the resident state. Guard it or restore the order.

## Explicitly NOT yours

`tests/src/server/Probe.test.ts` lines 293-297 assert over the whole `tmp/probe` directory filtered by
a generic shape. That is a real defect and it is a SUCCESSOR unit's, not yours — unit S2 owns that
file. Do not repair it. Your break-2 and gated-directory fixes will reduce the collision pressure on
it; that is enough from you.

## Scope

- **Owned**: `src/server/stages/RuntimeStage.ts`, `tests/src/server/stages/RuntimeStage.test.ts`,
  `tests/src/bin/main.test.ts`.
- **Off-limits**: everything else, and specifically `tests/src/server/Probe.test.ts`, `src/core/**`,
  `src/server/Probe.ts`, the other two stages, `src/bin/main.ts`, `vite.config.ts`, `guides/**`,
  `package.json`, `configs/**`, and every dotfile.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: no commit, push, tag, publish, dependency install, or destructive command. Add no
  npm package. Add no type assertion, and no suppression of any kind.

## Criteria

Each owes a committed test, red before the fix and green after, with the exact command and both counts.

1. A case whose test calls `ctx.skip()` produces a finding and earns no receipt.
2. A case whose test is statically skipped still produces a finding. Do not regress what works.
3. A case whose every test genuinely passes still produces a clean check and still earns a receipt.
4. A test file that collects no tests produces a finding, under a workspace config that would otherwise
   report it passed.
5. The unresolved-url map does not grow across N inspections. Assert it, with N greater than 5, and
   include a control map that your eviction does clear so a reader can tell the assertion discriminates.
6. `#evict` throws nothing. A retention failure surfaces as a `Finding`, and a real inspection failure
   reaches the caller unmasked.
7. No generated specification can be collected by any gated Vitest project.
8. Worker `stderr` reaches `process.stderr`.

## Execution

Perform this assignment directly. Spawn no subagent.

## Host facts

- Working directory `/workspace/probe`. Nested spawns permitted. `npm test` takes roughly three minutes
  and is safe.
- Put any throwaway instrument in `tmp/scratch/`, and delete it before returning. `tmp` is gitignored;
  a bare `scratch/` at the repository root is NOT.
- `npm test` exits 1 in your sandbox at `tests/config.test.ts` with `spawnSync EPERM`. That file is
  off-limits and that failure is the sandbox. It passes outside. Report it and move on; it is not yours.
- The `probe` Vitest project collects `tmp/probe/**/*.test.ts` and NO gate selects it. That is the
  quarantine the gated-directory fix restores.

## Deviation contract

Stop and report when a fix needs an off-limits file, when two criteria contradict, when closing break 2
appears to require a type assertion, or when a gate reddens for a reason your change does not explain.
Report expected, found, the exact command and output, whether the work is done, and at most one short
hypothesis.

Ancillary conflicts — a test's placement, the order of two assertions, a message's wording — you decide,
record, and carry on.

## Output

Return exactly: **Files written**, **Validation**, **Acceptance evidence**, **Deviation**, **Decisions**.

Under **Decisions**, lead with which route you took for break 2 and the evidence you chose it on.
