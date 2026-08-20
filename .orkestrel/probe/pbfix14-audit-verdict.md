# PBFIX14 audit verdict and reconciliation

Subject: commit ef33bd2. Lane: Opus 5 `reviewer`, read-only, in the pinned worktree. The lane
returned `VERDICT: FAIL`, 2026-08-20.

## Lane verdicts

- Claim 1 CONFIRMED - the boot workbench ordering: only workbench creation reaches the workspace
  classification; the attacks on the `created` flag, on a raw escape, and on the symlink branch
  failed with evidence.
- Claim 2 CONFIRMED - the `findRefusedPaths` move is textually identical, resolves the same
  symbols through the barrel, keeps the server helpers a leaf, and leaves core clean.
- Claim 3 BROKEN - the guide's instrument clause ("a specification it could not write after its
  directory exists") carries no ownership qualifier, so a symlink-crossing write path satisfies
  the workspace sentence and the instrument sentence at the same time while the code answers
  `workspace` (`RuntimeStage.ts:388` refuses before `creating` is set). The class remark's
  qualifier attaches only to run, evict, and delete. Reproduced by the Orchestrator on both
  surfaces.
- Claim 4 CONFIRMED - each named defect reddens the bin proof; the `ProbeError` name reaches the
  stack header, so the stack assertion is not vacuous.
- Claim 5 CONFIRMED - the R2 red ran at the raw host error against a real blocker, collected, and
  the revert reddens exactly the named test.
- Claim 6 CONFIRMED - every recommendation landed; one report citation is wrong (F6).
- Claim 7 CONFIRMED - per-site rulings hold, including the verified parent-directory claim.
- Claim 8 CONFIRMED - no banned construct on the added lines; the product-prose sweep was scoped
  and named; the campaign-record population carries hits recorded as F8.

## Orchestrator rulings

- Claim 3: sustained. PBFIX16 carries the auditor's exact rewrites for the guide sentence and
  the class remark.
- Findings F1 through F8: sustained as written; every one is carried by PBFIX16. F7 lands
  conditionally: the unit drives a newline-bearing refusal through the bin's real arguments if
  one is reachable, and otherwise records the reading and reports the flattening as defensively
  unreachable.
- The placement proposal on `findRefusedPaths`: adopted as a remark, not a move. PBFIX16 adds
  one `@remarks` sentence naming why the function lives in the server helpers.
- Referral 1 (the relabelling catch at `Probe.ts:239-240`): closed by an executed probe. On this
  host `resolveWorkspaceFile` with a 4206-character workspace returns the resolved string without
  throwing (nothing exists to inspect), and the length refusal surfaces as raw `ENAMETOOLONG`
  from `mkdirSync`, which the catch classifies `workspace`/`malformed` - the designed R2
  behavior. No claimant-origin `ProbeError` reaches the catch through this door; the vector is
  hypothetical, and the probe reading (scratchpad `relabel-readings.txt`, transcribed here:
  `resolve: returned a string of length 4215`, `mkdir threw host code: ENAMETOOLONG`) closes the
  referral with no code change.
- Referral 2 (`test:src:server` on the host): settled before the audit returned - the
  Orchestrator's bare host run exited 0 with 138 passed, recorded in the PBFIX14 landing.
- The empty `tmp/pbfix14-status.txt`: a staging defect of the Orchestrator's - the status was
  captured in the worktree after checkout rather than from the pre-commit dirty tree. The diff
  carried the substance; the next audit staging captures the pre-commit status.

## Terminal

VERDICT: FAIL - carriers PBFIX16 (claim 3, F1-F8, the placement remark).
