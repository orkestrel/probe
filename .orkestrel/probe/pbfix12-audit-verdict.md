# PBFIX12 audit — Opus 5 reviewer (cross-engine), 2026-08-20

Subject: the Sol unit at commit 8749d69, audited in the pinned worktree. Summary with the
Orchestrator's rulings; the full per-claim evidence is in the session record.

- BR1, BR2, BR3, BR7, BR4, BR8, and report honesty: CONFIRMED under real attacks (the undeclared-
  member and substitution attacks on the schema gate; the sibling-mint vacuity attack on the
  duplicate proof; the plain-file, claimant-phase-sample, and rename-race attacks on the two-inode
  construction).
- BR5: BROKEN on prose only — guides/probe.md's `Issue.origin` paragraph still assigns "a
  specification it could not write" to `instrument` while the emitted message now reports
  `workspace` for the blocked directory, and the class remark's `instrument` clause dropped the
  write that the code still classifies there once the directory exists. Both sentences take the
  split the code enforces.
- BR6: UNRESOLVED — the recorded red failed at the fixture marker, which fires with and without
  the fix, so it discriminates nothing about the gauge. The sanctioned settlement is the mutation
  probe: move the LintStage increment back to the publish path, run the held-diagnostics proof to
  a red at the progress assertion, restore, green.
- F1: `findRefusedPaths` imports `CLAIM_SHAPE` from `shapers.js` inside core `helpers.ts`,
  inverting the module's leaf direction. Ruled: move the function to `src/server/helpers.ts`
  beside its only consumer, with its guide row; re-deriving the guards is refused as a second copy
  of the shape.
- F2: `ProbeServerInterface.start` gained a throw and no `@throws` tag. Ruled: add the tag in the
  file's own form.

## Referral rulings

- R1 (the type-stage admission half): recorded as an intent alignment rather than a repair — the
  audit could construct no pre-fix misattributed expiry for that stage, no defect claim stands on
  it, and the landed placement matches the contract. No further lane is spent on constructing an
  interleaving for a site already aligned.
- R2 (the boot workbench `mkdirSync` door): accepted — the same target-tree blocker the stage door
  now reports as `workspace` escapes the boot as an unwrapped native error. The boot creation
  fault classifies as a workspace `ProbeError`, with a red proof.
- R3 (the bin proof's exact-equality stderr pin): accepted — split into the content assertion plus
  the no-stack assertion so an unrelated host diagnostic cannot redden the proof.
- The commit 8749d69 message's "red then green" framing over-covered BR6; the correction rides in
  the successor commit's message. The unit report itself was honest.

VERDICT: FAIL — 1 broken, 1 unresolved, 0 not-evidenced, 2 findings outside the claims

Carriers: BR5 prose, F1, F2, R2, R3, and the audit's non-blocking recommendations (the guide's
mint summary row, the classification conditional, the lint fixture comment naming the `admitted`
file, the BR4 guide sentence taking the TSDoc shape, and the registration section naming the bin's
failure presentation) → PBFIX14. BR6's settlement → the Orchestrator's mutation probe at PBFIX13's
landing.
