# PBFIX11: the party that must act, and the gauge's contract

## Role and engine

Role `implementer`. Engine Claude Opus 5, high effort. Sole writer in `/home/user/probe` for this
unit, dispatched from a clean committed baseline. This is blame vocabulary, contract prose, and
guide voice, which is why it is not on the objective bench.

## Why you exist

The cross-engine audit of the fix rounds broke the ruling that flipped the string-declared
project's ownership to `instrument`, and broke the `progress` member's contract sentence. The
Orchestrator accepted both findings; the reconciliations are at
`tmp/fixround-audit-reconciliation.md` and `tmp/design-deadline-reconciliation.md`. Read both
before editing.

## Read first

1. `AGENTS.md` — § Non-negotiable rules, § Design laws, § Writing
2. `.claude/rules/names.md`, `.claude/rules/documentation.md`, `.claude/rules/writing.md`
3. `tmp/fixround-audit-reconciliation.md`, `tmp/design-deadline-reconciliation.md`
4. `guides/probe.md`

## Standing conditions

- The tree carries the PBFIX8 rename (`Party`, `PARTIES`, `isParty`; the member stays `origin`)
  and the PBFIX10 repairs (the sweep lookahead, the cleanup-catch ternary, the
  claimant-classification of caller-caused native faults, the raw-rejection wrap, and the
  deterministic gauge proof replacing the deleted deadline proof). Locate every site by content,
  never by a line number from an earlier round.
- The container has 4 CPUs. Whole-suite timing readings are the Orchestrator's, not yours.
- `tests/guides.test.ts` asserts a receipt earned with `tmp/probe` absent. Run `rm -rf tmp/probe`
  before any guides-project run.

## The changes

**C1 — restore `workspace` ownership of the string-declared project.** In
`src/server/stages/RuntimeStage.ts`, the finding returned when a project's configuration carries
no runtime overlay plugin goes back to `origin: 'workspace'`. The axis names the party that must
act, and the party that must act on a string-declared Vitest project is the workspace owner
editing `vite.config.ts` — the finding's own message already says "its configuration". The
receipt refusal is unaffected: the receipt helper refuses any finding in the case, whatever its
origin. Update every proof that pins the old value — the string-declared expectations in
`tests/src/server/stages/RuntimeStage.test.ts` and the
`refuses a receipt when the case reaches a string-declared runtime project` proof in
`tests/src/server/Probe.test.ts` — asserting both the restored origin and the still-refused
receipt, each recorded red before the change and green after.

**C2 — the class remark names what the class emits.** The `RuntimeStage` class-level `@remarks`
was edited to explain only the origin the stage stopped producing. Amend it to name every origin
a finding from this stage can carry, including the `workspace` finding the specification path
produces for a symbolic link or an uninspectable mutation path, and the restored string-declared
`workspace` finding.

**C3 — the guide's ownership prose follows C1.** In `guides/probe.md`, re-edit the two passages
the Orchestrator integrated at `17c0edd` that assert the `instrument` reading: the
`Finding.origin` paragraph (a string-declared project is a `workspace` example again, beside the
symbolic link and the uninspectable mutation path; `instrument` keeps the specification it could
not write and the module that ran no test) and the `## Prerequisites` string-declared bullet
(the finding it names is `origin: 'workspace'`). Keep everything else those integrations changed.
Also update the `## Failures` table's `claimant`/`refused` row to include a path the host
filesystem refuses, matching PBFIX10's classification change.

**C4 — one implementable contract sentence for `progress`.** In `src/server/types.ts`, replace
the `StageInterface.progress` doc line with the obligation an implementer can build against, in
this sense exactly: raise `progress` when claimant-owned work begins; where the stage performs
its own work after the claimant's — cleanup, eviction — return `progress` to its pre-inspection
reading first, so an expiry during stage-owned work reads level with the coordinator's snapshot.
Derive the guide's `StageInterface` surface row from that sentence. Every shipped stage complies
as written: `RuntimeStage` balances the gauge, and `TypeStage` and `LintStage` perform no
stage-owned work after the claimant's inside one inspection.

**C5 — the narrow proven-surface statement.** In the guide's `### Server contracts` section,
beside the `StageInterface` row or in its nearest prose, state what is proven and what is not:
the stage's gauge boundary is proven deterministically, the claimant-side expiry through the
coordinator is proven, and the composed instrument-side expiry through the coordinator has no
executed proof. Write it as a statement of the proof surface a foreign coordinator relies on,
not as an apology; the gauge is the seam that would prove it.

## Scope

- **Owned:** `src/server/stages/RuntimeStage.ts` (the origin value and the class remark only),
  `src/server/types.ts` (the `progress` doc line only), `guides/probe.md`,
  `tests/src/server/stages/RuntimeStage.test.ts` and `tests/src/server/Probe.test.ts` (the
  expectations C1 moves only).
- **Off-limits:** everything else, including `src/core/`, `src/server/helpers.ts`, `README.md`,
  `package.json`, `vite.config.ts`, the vendored host files, and every mechanism PBFIX10 landed.
  Do not change the version.

## Execution

Perform this assignment directly. Spawn nothing. Never run `git checkout`, `git restore`,
`git stash`, `git reset`, or `git clean`. Never commit, push, or install. No `any`, no `as`, no
`!`, no suppression comment. State no count in prose you write, and never name a list item by its
position.

## Acceptance criteria, in this order

1. C1's proofs record red (exact command and counts) before the origin restore and green after.
2. The class remark names every origin the stage emits; paste the remark in your report.
3. `rm -rf tmp/probe && npm run test:guides` exits 0 with its counts — the guide edits hold
   parity and the flagship fences still run.
4. `npm run format` then `npm run format:check` exits 0.
5. `npm run lint:check` exits 0.
6. `npm run check` exits 0.

## Observations, not criteria

`npx vitest run --config vite.config.ts --no-cache --project src:server` — run it, report exit
code and counts, and do not treat a timing failure as yours to close.

## Deviation contract

Stop and report if a change contradicts what you find — in particular if any receipt proof fails
for a reason the reconciliation does not predict. Where a sentence sits inside its section is
yours to decide and record.

## Output

Write your report to `tmp/pbfix11-report.md` and make it your final message too: files touched;
each criterion with its exit code and counts; the pasted class remark and the exact `progress`
sentence as landed; observations; anything you could not close. No process diary.
