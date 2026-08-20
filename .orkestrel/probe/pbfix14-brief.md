# PBFIX14: the PBFIX12 audit's carriers

## Role and engine

Sol `implementer`, GPT-5.6 Sol, inside `codex exec --sandbox workspace-write` at `/home/user/probe`.

## Objective

Close every carrier the `tmp/pbfix12-audit-verdict.md` file routes to PBFIX14, plus the
observations PBFIX13's report left open.

## Context

- Read before editing: the `AGENTS.md` file, `.claude/rules/architecture.md` (§ Kind purity — the
  leaf direction F1 turns on), `.claude/rules/typescript.md`, `.claude/rules/writing.md`,
  `.claude/rules/tests.md`, the `guides/probe.md` guide, the `tmp/pbfix12-audit-verdict.md` file
  (the rulings — binding), and the `tmp/pbfix13-report.md` file (the observations).
- The tree is committed and clean at dispatch, with PBFIX13 landed: `Source` is `Draft`,
  `Verdict.checks` is `case`, `PARTIES` is `PROBE_PARTIES`, `messageFromUnknown` is
  `describeUnknown`. Line numbers in the verdict predate PBFIX13 — re-locate by pattern.
- Standing sandbox conditions as before: no network; spawned-child stdio is unreliable, so a
  spawn-driving proof that misbehaves is recorded with its exact command for the host; in-process
  scoped runs are reliable.
- The items:
  - **BR5 prose A** — the guide's `Issue.origin` paragraph still assigns "a specification it
    could not write" to `instrument` while the blocked-directory case now reports `workspace`.
    Add the blocked directory to the `workspace` sentence and qualify the `instrument` clause to
    the write proper, matching the class remark's split.
  - **BR5 prose B** — the RuntimeStage class remark's `instrument` clause dropped the write
    entirely while the code still classifies a post-creation write failure there. Restore it with
    the qualifier the code enforces: a specification it could not write once its directory
    exists, run, evict, or delete for a reason the target tree does not own.
  - **F1** — `findRefusedPaths` in core `helpers.ts` imports the claim shape from `shapers.js`,
    inverting the module's leaf direction. Move the function to `src/server/helpers.ts` beside
    its only consumer (ProbeServer), reading the shape through `@src/core`; move its tests to the
    server helpers suite and its guide row from the core table to the server helpers table. Do
    not re-derive the guards.
  - **F2** — `ProbeServerInterface.start` throws after teardown and carries no `@throws` tag. Add
    `@throws When this call comes after teardown begins`, in the file's own form.
  - **R2** — the boot's workbench creation (`mkdirSync` of `tmp/probe` in Probe's boot path) lets
    the same target-tree blocker escape as an unwrapped native error. Classify a boot workbench
    creation fault as a `workspace` `ProbeError` with the message shape its stage-door sibling
    uses. Red proof: a file occupying `tmp/probe` at construction expects the `ProbeError`, not
    the raw host error.
  - **R3** — the bin refusal proof's exact stderr equality reddens on any unrelated host
    diagnostic. Split it: assert the formatted line is contained, no `ProbeError:` stack appears,
    and the status is 1.
  - **The non-blocking recommendations, all accepted**: the guide's mint summary row reads "one
    check per stage in each phase"; the RuntimeStage classification ternary collapses to one
    condition (workspace when the failure is a `workspace` `ProbeError` or the creation marker is
    set); the lint fixture comment names the `admitted` file the held-diagnostics branch writes;
    the BR4 guide sentence takes the TSDoc's plainer shape (the guarantee covers the claim inputs
    and the target tree as inspected); § Registering the server names the bin's failure
    presentation (one stderr line, `[origin] code: message`, exit 1) beside the prerequisites it
    already points at.
  - **PBFIX13's observations**: rule the positional `above`/`below` comments in `tests/src/**` by
    the writing canon per site and fix the banned ones; correct the `strayed`/`stayed` remark
    mismatch in core `helpers.ts` (one spelling, matching the binding).

## Unknowns

- Whether the R2 red proof can drive `new Probe(...)` in this sandbox is likely yes (in-process);
  record the run either way.

## Scope

- Owned: `src/`, `tests/src/`, `guides/probe.md`.
- Off-limits: `package.json`, `vite.config.ts`, `tsconfig.json`, `configs/`, the vendored files,
  `tests/guides.test.ts` and `tests/distribution.test.ts` unless the F1 move breaks a parity
  assertion (then the assertion moves with it, recorded), `tmp/` except your own report file.
- Permission limits: no commit, no push, no install, no `git checkout`/`restore`/`stash`/`reset`/
  `clean`, no secrets.

## Execution

You perform this assignment directly and spawn no agent.

## Output

Write your report to the `tmp/pbfix14-report.md` file: per item, what changed with file:line, the
R2 red and green readings, the per-site comment rulings, and any claim of your own you flag. End
with the diffstat. No process diary.

## Deviation contract

A conflict with a ruling stops the unit with the standard report. An ancillary choice (sentence
form, test placement inside the owned files) is yours to decide and record.

## Acceptance criteria (in order)

1. `npm run lint:check` exits 0.
2. `npm run check` exits 0.
3. `npm run format:check` exits 0 (run `npm run format` first if needed).
4. `rg -n "findRefusedPaths" src/core/` returns no hit and the server helpers suite carries its
   tests.
5. The R2 proof carries a recorded red and green (or the sandbox observation with the exact
   command).
6. `rg -n "could not write" guides/probe.md src/server/stages/RuntimeStage.ts` shows the split
   stated on both surfaces.
7. `npm run test:guides` exits 0.
8. Scoped runs over the files you touched pass, or their denial is recorded.

## Review evidence

Return the actual `git diff --stat` and `git status --short` output in the report. The full diff
stays in the tree for the auditor.
