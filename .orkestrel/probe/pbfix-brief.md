# PBFIX — close the campaign audit's findings

## Role and engine

`implementer` (Claude Opus 5, native). Perform the assignment directly and spawn nothing.

Both engines audited this campaign and both returned FAIL. The findings split across engines rather
than by subject, so one unit closes them and the audit lane for it is **Sol**.

## Read first

`.orkestrel/probe/pb-audit-reconciliation.md`. It carries every finding, which lane raised it, and
what was ruled rather than repaired. The two verdicts sit beside it as `pb-audit-sol-verdict.md` and
in the Opus lane's report. This brief assigns the reconciliation; it does not restate it.

Then `AGENTS.md` and the `.claude/rules/` files for what you touch — at minimum `documentation.md`,
`quality.md`, `writing.md`, `names.md`, `architecture.md`, `tests.md`.

## What you close

### The six false statements, R1 through R6

Each is a sentence the shipped code contradicts. Correct the sentence to what the code does, unless
the code is wrong — and for R4 and R6 it is, so read those rows carefully.

**R1 and R5 are one defect seen twice.** The digest is a function of the workspace and the claim, and
both sentences describe it as a function of the claim alone. `reason` enters the digest because
`Control` carries it, and every absolute string is rewritten relative to the selected workspace before
hashing. State the real rule once, in the guide, and make the `Verdict.reason` TSDoc agree.

Do not remove `reason` from the digest. A claim's declared falsifier is part of what the verdict
answered, and excluding it would make the digest a claim about less than the claim.

**R4 and R6 are code, not prose.** R4: stage destruction says it abandons inspections without waiting
and awaits `#warmth` first, so a language server that stays alive and never answers `initialize`
deadlocks it. Either bound that wait or correct the sentence — rule it and say which, with the reason.
R6: `destroy()` promises to leave the process as it was before `start` and pauses stdin
unconditionally. Pause only what this server resumed, the same ownership test `@orkestrel/mcp` now
applies; a host whose stdin was already flowing keeps flowing.

### The five defects, D1 through D5

**D1 — the sweep is too broad.** It deletes any file whose name matches the revision pattern with a
dead pid, without establishing the file is a generated specification. Its own test confirms it deletes
a boot dependency too. Narrow it to what this package writes, and prove a developer file named
`notes.probe-<dead-pid>-<uuid>.ts` survives.

**D2 — the guides gate is blind where it claims coverage.** `extractDocumented` discovers only
exports that already carry documentation, so the sweep that fails on a missing `@example` cannot see
an export with no documentation at all. This is the instrument-coverage law in
`.claude/rules/quality.md`: an instrument certified only from the inside is trusted exactly where it
has never been tested. Enumerate the barrel's real exports and check documentation against that
population. **Prove the new gate fails** by planting an undocumented export, watching it red, and
removing it.

**D3 — `Inspection` is excess surface.** Exported and barrelled, and its only role is a private queue
record. This package has never published. Remove it from the barrel, or state the consumer that needs
it. Removing an export moves the guide's Surface table and the parity gate with it.

**D4 — `computeReceipt` checks arity on the case and not the control**, so an unrecorded control stage
reads as clean while the published sentence says every other control stage stayed clean. Unreachable
through `prove` and reachable through the exported helper. Close it, and add the missing-control-stage
case.

**D5 — the absolute-path refusal is documented twice and proven nowhere**, and the guard's Windows
drive-letter branch is unreached. Two assertions.

## Not yours

- The `Verdict.control` sub-entity question (Opus 8, 9, 12) is a design round the Orchestrator holds. Do not restructure `Verdict`.
- The malformed `@example` comment in `resolveWorkspaceFile` belongs to the next unit owning that file.
- Sol 24's threat-model ruling stands as documented. Do not weaken it.

## Standing conditions

- The tree is clean at the commit the dispatch names, except `tmp/`, which is gitignored and expected dirty.
- This host permits nested child creation and real installs. Take every measurement.
- Do not edit `.agents/`, `.claude/`, `configs/`, or `vite.config.ts`.
- `.orkestrel/` is off-limits.

## Scope

**Owned:** `src/core/types.ts`, `src/core/helpers.ts`, `src/core/validators.ts`, `src/server/types.ts`,
`src/server/helpers.ts`, `src/server/index.ts`, `src/server/ProbeServer.ts`,
`src/server/stages/LintStage.ts`, `src/server/stages/RuntimeStage.ts`, `guides/probe.md`,
`tests/guides.test.ts`, and every mirrored file under `tests/src/`.

**Off-limits:** everything else.

## Execution

Perform this assignment directly. Spawn nothing.

Insert a failing proof before each behavioural change and before the gate repair. A sentence
correction whose subject a gate already executes needs no red proof and you say so; a sentence stating
behaviour no gate reaches needs the assertion that would break if it went false.

## Acceptance criteria

Ordered so an unreachable criterion cannot hide the gates.

1. R1 through R6 each ruled and closed, with the `file:line` of the corrected statement or the corrected code, and for R4 an explicit ruling on bound-versus-document with its reason.
2. D1: a developer file matching the revision pattern with a dead pid survives the sweep, proven.
3. D2: the guides gate detects an entirely undocumented barrel export, proven by planting one and watching it fail.
4. D3: `Inspection` is out of the barrel, or its consumer is named.
5. D4: an unrecorded control stage refuses the receipt, proven.
6. D5: an absolute path and a Windows drive-letter path are both refused, proven.
7. `npm run format:check` exits 0.
8. `npm run lint:check` exits 0.
9. `npm run check` exits 0.
10. `npm run build` exits 0.
11. `npm test` exits 0.
12. `npm run test:distribution` exits 0.

## Deviation contract

A conflict with the objective stops the unit: expected, found, exact evidence, done or not done, and
at most one short hypothesis. Where a finding's right fix is a design change rather than a repair,
stop that row and report it — do not restructure a published type on your own account.

## Output

- Per finding: what you ruled, what you changed, the `file:line`.
- The red-then-green command and both counts, per behavioural change and for the gate repair.
- The gate table: command, bare exit code.
- Files changed.

No process diary.
