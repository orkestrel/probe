# PBFIX10: the sweep's terminal marker, three misclassifications, and the deterministic gauge proof

## Role and engine

Role `sol` implementer. Engine GPT-5.6 Sol, high effort, sandbox `workspace-write`, rooted at
`/home/user/probe`. Sole writer for this unit, dispatched from a clean committed baseline.

## Why you exist

A cross-engine audit (Claude Opus 5 `reviewer`) of the PBFIX7 and PBFIX9 rounds returned FAIL, and
the Orchestrator reproduced or source-verified each finding this unit carries. A blind design round
separately ruled that the deleted flaky deadline proof is replaced by a deterministic stage-level
proof of the published `progress` contract. The reconciliations are at
`tmp/fixround-audit-reconciliation.md` and `tmp/design-deadline-reconciliation.md`; read both.

## Read first

1. `AGENTS.md` — § Non-negotiable rules, § Design laws
2. `.claude/rules/typescript.md`, `.claude/rules/tests.md`, `.claude/rules/patterns.md`
3. `tmp/fixround-audit-reconciliation.md` and `tmp/design-deadline-reconciliation.md`
4. `guides/probe.md` § What a probe proves and § Failures

## Standing conditions

- The tree you inherit carries the PBFIX8 rename: the ownership union is `Party`
  (`PARTIES`, `isParty`), and the member stays `origin`. Audit line numbers below were taken at
  `b34e8ca`, before that rename and other edits — locate each site by its content, never by the
  number.
- The container has 4 CPUs. `npm ci` has run; `dist/` exists from a prior build.
- The bench sandbox denies network and denies a grandchild process. Everything this unit needs is
  local; `mkfifo` is a direct child and is available (the deleted proof used it from this same
  suite). The FIFO in the new proof is opened and written within the test's own process and the
  in-process Vitest instance — no child pipes carry the proof.
- Do not run the whole `npm test` as a criterion; your exec is load and whole-suite timing is the
  Orchestrator's reading. Scoped runs over your owned files are your criteria.

## The defects, each with its fix

**D1 — the sweep reads the FIRST marker for an adjacent-marker basename.** In
`src/server/stages/RuntimeStage.ts` `#sweep`, the pattern's tail `(?:\.|$)` is a consuming group;
`matchAll` with `/g` eats the separating `.`, so `greeting.probe-<A>.probe-<B>.ts` yields one
match carrying `<A>` while the file's text carries `<B>`, `#owned` fails, and a dead host's
specification survives forever. Orchestrator reproduction, 2026-08-20, exact pattern: adjacent
shape → matches 1, last revision `<A>`; separated shape (`.test.` between markers) → matches 2,
last revision `<B>`; with the tail changed to the lookahead `(?=\.|$)` both shapes → matches 2,
last revision `<B>`. Fix: change the tail to `(?=\.|$)`. Extend the existing
`removes the files a dead host left behind` proof in
`tests/src/server/stages/RuntimeStage.test.ts` with an adjacent-marker case — a caller-declared
test path whose stem already ends in the marker shape — recorded red before the fix and green
after.

**D2 — the specification-cleanup catch discards the helper's classification.** In
`RuntimeStage.ts`, the catch around the cleanup `resolveWorkspaceFile`/`unlinkSync` hard-codes
`origin: 'instrument'`, while `#specification`'s catch a few dozen lines away carries the correct
ternary (`error instanceof ProbeError && error.origin === 'workspace' ? 'workspace' :
'instrument'`). Fix: use the same ternary in the cleanup catch. The branch is reachable only when
the target tree mutates between the specification write and its cleanup; if you cannot construct
a deterministic test for that interleaving with real filesystem operations, make the code change,
keep the existing suite green, and record the reachability bound as an observation rather than
inventing a fake.

**D3 — a caller's own unacceptable path is blamed on the workspace.** In `src/server/helpers.ts`
`resolveWorkspaceFile`, the mutation-path catch wraps every non-`ProbeError` native fault as
`origin: 'workspace'`, `code: 'malformed'`. A fault the caller's own path causes — `ENAMETOOLONG`
from a 300-character component, the `TypeError` a NUL byte raises — classifies as
`origin: 'claimant'`, `code: 'refused'` instead, keeping `workspace`/`malformed` for the rest
(permissions, I/O faults). Discriminate on the native fault: `error.code === 'ENAMETOOLONG'`, and
the NUL-byte `TypeError` (its `code` is `'ERR_INVALID_ARG_VALUE'`) — verify both codes against
the real host before pinning them, and pin what the host actually reports. Update the two proofs
that pinned the old owner: `reports a target path inspection failure as a workspace finding` in
`tests/src/server/stages/RuntimeStage.test.ts` (over-long path → now a `claimant` refusal — note
the route: `#specification` throws rather than returning a finding for claimant-origin failures,
so read the code and assert what actually happens end to end) and
`translates a native path inspection fault and retains its cause` in
`tests/src/server/helpers.test.ts` (NUL vector → `claimant`/`refused`, `cause` retained). Record
each red before the change and green after. State the bound in the helper's TSDoc: a workspace
nested so deep that the package's own short generated names overflow the host limit also reads
`claimant`; the helper classifies the fault, not the author.

**D4 — a raw Vitest rejection escapes `prove` unclassified.** In `RuntimeStage.ts`, the
`await vitest.runTestSpecifications([task], false)` has no catch, so a rejection propagates out
of `prove` bare, against the published contract that every failure probe raises while serving a
claim is a `ProbeError`. Fix: catch a rejection at that await, re-throw a `ProbeError` untouched,
and wrap anything else as `origin: 'instrument'`, `code: 'malformed'`, with the rejection on
`cause` — the same translation shape the package uses elsewhere. For the proof, attempt one real
vector (for example driving the stage after closing or corrupting its Vitest instance through
real operations); if no real vector exists without a mock or module replacement, make the code
change, and record in your report that the wrap is covered by the categorization gate's
construction check and the type reading, naming that limit plainly.

**D5 — the flaky deadline proof is replaced by the deterministic gauge proof.** Delete the test
`attributes a deadline in runtime cleanup to the instrument` from
`tests/src/server/Probe.test.ts` whole, plus `waitForExit` and any import (`ChildProcess`,
`spawn`) nothing else uses — keep `spawnSync` and everything the sibling proofs use. Add to
`tests/src/server/stages/RuntimeStage.test.ts` a proof named for what it proves — that the stage
raises `progress` for the caller's run and lowers it before its own cleanup — with this
mechanism, preconditions already probed by the Orchestrator:

1. Build the scratch workspace the deleted proof built (`package.json`, `node_modules` linked to
   the repository's, `tsconfig.json`, `configs/src/tsconfig.core.json`, `src/core/index.ts`, and
   a `vite.config.ts` carrying `cacheDir: '.probe-cache'` and the `probe` project), and drive a
   real `RuntimeStage` directly — no `Probe`, so no deadline exists anywhere in the proof.
2. `await stage.inspect(...)` once so Vitest writes its results cache; locate
   `<cacheRoot>/**/results.json`, remove it, `mkfifo` in its place.
3. Record `baseline = stage.progress`. Start `const running = stage.inspect(...)` without
   awaiting.
4. `await open(cache, 'r')` (from `node:fs/promises`). That resolves when Vitest's end-of-run
   cache write opens the FIFO, inside the caller's run — assert `stage.progress` is greater than
   `baseline`. Drain what the writer wrote and close the handle.
5. `await open(cache, 'r')` again. That resolves when the stage's own eviction write opens the
   FIFO — assert `stage.progress` equals `baseline`. Drain and close.
6. `await running`, assert its findings are empty, then destroy the stage and remove the scratch.

Every wait resolves on an action the subject takes; the proof contains no `waitForDelay`, no
`setTimeout`-as-duration, and no relationship to host speed. Negative control, run once and
recorded: move the `#progress -= 1` in `RuntimeStage.ts` from the first statement of the run's
`finally` to after the `#evict` call, record the new proof red with its exact command and counts,
restore the line, record the same command green. If step 4 or 5 does not behave as the mechanism
states — the open resolves early, the writes share one open, either wait never resolves — stop
and report the exact observation; do not convert any wait into a duration.

## Scope

- **Owned:** `src/server/stages/RuntimeStage.ts`, `src/server/helpers.ts`,
  `tests/src/server/stages/RuntimeStage.test.ts`, `tests/src/server/helpers.test.ts`,
  `tests/src/server/Probe.test.ts`.
- **Off-limits:** everything else, including `guides/`, `README.md`, `src/core/`,
  `src/server/types.ts`, `package.json`, `vite.config.ts`, the vendored host files, and the
  string-declared project's origin value — a successor unit owns that and the prose.

## Execution

Perform this assignment directly. Spawn nothing beyond the child processes the proofs themselves
require. Never run `git checkout`, `git restore`, `git stash`, `git reset`, or `git clean`. Never
commit, push, or install. No `any`, no `as`, no `!`, no suppression comment. State no count in
prose you write, and never name a list item by its position.

## Acceptance criteria, in this order

1. The sweep pattern's tail is the lookahead, and the extended sweep proof records red (exact
   command and counts) before the fix and green after.
2. The cleanup catch carries the classification ternary, and the existing `RuntimeStage` suite is
   green scoped: `npx vitest run --config vite.config.ts --no-cache --project src:server
   tests/src/server/stages/RuntimeStage.test.ts`, exit code and counts reported.
3. The over-long-path and NUL proofs record red before D3 and green after, each with its exact
   command and counts, and the helper's TSDoc states the bound.
4. The D4 wrap is in place; the vector outcome (real vector red-then-green, or the recorded
   limit) is reported.
5. The old deadline proof is gone — a search for `attributes a deadline in runtime cleanup` over
   `tests/` returns nothing — and the new gauge proof passes scoped, with the negative control's
   red and green readings recorded.
6. `npm run lint:check` exits 0.
7. `npm run check` exits 0.

## Observations, not criteria

`npx vitest run --config vite.config.ts --no-cache --project src:server` — run it, report exit
code and counts, and do not treat a timing failure as yours to close.

## Deviation contract

Stop and report — expected, found, exact evidence, done or not done, one short hypothesis — if a
fix contradicts what you find in the tree, if a proof cannot bind to its defect, or if a wait in
D5 cannot resolve on the subject's own action. An ancillary choice (a test's placement within its
file, a TSDoc sentence's position) is yours to decide and record.

## Output

Write your report to `tmp/pbfix10-report.md` and make it your final message too: files touched;
each criterion with its exit code and counts; each red-then-green pair with its exact command;
the D4 vector outcome; observations; anything you could not close. No process diary.
