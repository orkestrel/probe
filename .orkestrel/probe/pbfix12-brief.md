# PBFIX12: the objective readiness seams

## Role and engine

Sol `implementer`, GPT-5.6 Sol, inside `codex exec --sandbox workspace-write` at `/home/user/probe`.

## Objective

Close the rows the `tmp/readiness-matrix.md` file carries as PBFIX12: BR1 through BR8, with BR21's
red-then-green proofs inside each row.

## Context

- Read before editing: the `AGENTS.md` file, `.claude/rules/typescript.md`,
  `.claude/rules/tests.md`, `.claude/rules/writing.md`, `.claude/rules/names.md`, the
  `guides/probe.md` guide, and the `tmp/readiness-matrix.md` file — the matrix rows carry the
  reproduced evidence and the exact prescriptions; this brief restates only what each row needs.
- The tree is committed and clean at abf3cf5. `node_modules` is installed. The gates are
  `npm run format:check`, `npm run lint:check`, `npm run check`, `npm run build`, `npm test`.
- Standing sandbox conditions: no network; a child spawned by a test may be denied or carry
  unreliable stdio — any proof that drives a spawned child (BR8's bin proof, the BR6
  held-diagnostics proof if it spawns the lint server) may false-green or hang here. Where a run is
  denied or suspect, record the exact command as an observation; the Orchestrator takes the reading
  on the host. Scoped runs that stay in-process are reliable.
- The rows, restated:
  - **BR1** — `findRefusedPaths` (src/core/helpers.ts:244) substitutes `text: ''` and tests only
    the path, so a schema-invalid source is blamed as a containment refusal. Return no refused
    paths unless the claim shape admits the input; the guide row at guides/probe.md:121 then stays
    true. Red proof: a claim whose source is `{ text: '' }` expects `refused` empty while the
    schema flag reports the rejection.
  - **BR2** — `computeReceipt` (src/core/helpers.ts:141) tests stage presence only. Require each
    declared stage exactly once in each phase. Red proof: a hand-built verdict carrying duplicate
    `type` checks mints today and must refuse.
  - **BR3** — `ProbeServer.start()` after `destroy()` silently returns (src/server/ProbeServer.ts:79)
    while the guide's failure table promises `claimant`/`destroyed`. Keep the no-op only for an
    already-serving server; throw the destroyed error after teardown. Red proof.
  - **BR4** — the containment TOCTOU (RuntimeStage.ts:390-394) is ruled a documented boundary, not
    a code change: Node's portable fs API cannot traverse descriptor-relative, so the guide's
    containment sentence (guides/probe.md:584) and the write path's TSDoc state that the guarantee
    covers the inputs and the tree as inspected, and a concurrent process mutating components
    between the check and the write is outside it. No new prevention code.
  - **BR5** — a native creation fault in `#specification` (RuntimeStage.ts:389 `mkdirSync` inside
    the attempt whose catch ternary at :400-417 defaults to `instrument`) classifies to
    `instrument` when the target tree owns the blocker. Classify target-tree creation faults as
    `workspace`, retain the claimant exceptions (`ENAMETOOLONG`, `ERR_INVALID_ARG_VALUE` stay
    claimant/refused), and update the pinned test and the class remark's taxonomy prose. Red
    proof: a workspace file occupying the declared test directory path expects a `workspace` issue.
  - **BR6** — `LintStage` raises `#progress` only when diagnostics arrive (:399) and `TypeStage`
    only in `#unblock` (:233), so an expiry between claimant-work admission and publication reads
    level and is attributed to the instrument. Raise `progress` when the claimant's work is
    admitted (the document publish for the lint stage; the analogous admission for the type
    stage), holding the `StageInterface.progress` contract in src/server/types.ts. Add the
    held-diagnostics proof: with the claimant's document admitted and diagnostics not yet
    published, `progress` reads above the baseline. Then make the guide's `StageInterface` row
    (guides/probe.md:131) state the landed contract conditionally and name `RuntimeStage` as the
    stage that returns `progress` before stage-owned awaited work.
  - **BR7** — the gauge proof (tests/src/server/stages/RuntimeStage.test.ts, the test named
    "raises progress for the caller's run and lowers it before the stage's cleanup") uses one FIFO
    path for two rendezvous, admitting an interleaving where the cleanup reader attaches to the
    still-open claimant writer and samples elevated progress. Give each rendezvous its own FIFO
    inode: after the claimant read completes, atomically replace the cache path with the second
    FIFO before closing the claimant reader, then drain the cleanup FIFO to end of file. The
    proof must stay deterministic by construction; state the construction in the test's comment.
  - **BR8** — with the workspace toolchain absent, the built bin dies on an uncaught `ProbeError`
    stack. The bin entry (src/bin/main.ts) reports a construction failure as one stderr line
    naming the origin, the code, and the message, then exits 1 — no stack for a `ProbeError`;
    anything else keeps the stack. Write the test under the bin suite; if the sandbox cannot
    drive it honestly, record the exact command for the host.

## Unknowns

- Whether the BR6 admission point for the type stage is `#unblock` or an earlier seam is yours to
  read from the stage's flow; report the point you chose and why.
- Whether the BR6 and BR8 proofs run honestly inside this sandbox is unknown; record commands
  either way.

## Scope

- Owned: `src/`, `tests/src/`, `guides/probe.md`.
- Off-limits: `package.json`, `vite.config.ts`, `tsconfig.json`, `configs/`, `.claude/`,
  `.agents/`, `tests/setupPolicy.ts`, `tests/policy.test.ts`, `tests/config.test.ts`,
  `tests/guides.test.ts`, `tests/distribution.test.ts`, `README.md`, `tmp/` except your own
  report file.
- A criterion that seems to need an off-limits file is a deviation, not a workaround.
- Permission limits: no commit, no push, no install, no `git checkout`/`restore`/`stash`/`reset`/
  `clean`, no secrets.

## Execution

You perform this assignment directly and spawn no agent.

## Output

Write your report to the `tmp/pbfix12-report.md` file: per row, what changed with file:line, the
red and green commands with exact readings (or the sandbox observation), the BR6 admission-point
choice, the BR7 construction argument, and any claim of your own you flag. End with the diffstat.
No process diary.

## Deviation contract

A conflict with a row's prescription stops the unit with the standard report. An ancillary choice
(sentence form, test placement within the owned files, error-message wording within the stated
shape) is yours to decide and record.

## Acceptance criteria (in order)

1. `npm run lint:check` exits 0.
2. `npm run check` exits 0.
3. `npm run format:check` exits 0 (run `npm run format` first if needed).
4. Each of BR1, BR2, BR3, BR5, BR6 carries a recorded red and green reading (or a recorded
   sandbox denial with the exact command).
5. The BR7 test file passes repeatedly in-process (state the run you used) and its comment states
   the two-inode construction.
6. The BR4 sentences landed in the guide and the TSDoc; quote both in the report.
7. Scoped vitest runs over the files you touched pass, or their denial is recorded. Whole-suite
   and timing readings are observations, never criteria.

## Review evidence

Return the actual `git diff --stat` and `git status --short` output in the report. The full diff
stays in the tree for the auditor.
