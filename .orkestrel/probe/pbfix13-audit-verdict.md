# PBFIX13 audit verdict and reconciliation

Subject: commit 7b20615. Lane: Sol `analyst`, read-only, in the pinned worktree
`/home/user/probe-audit-wt`. Journal `tmp/codex/pbfix13-audit-journal.jsonl`, session
`01a02126-189e-7d70-9765-1f2d0c3f2c5e`. The lane returned `VERDICT: FAIL`, 2026-08-20.

## Lane verdicts

- Claim 1 CONFIRMED - rename residue: the scoped search found only unrelated English uses of
  "Source"; the same instrument against the parent commit found every retired form, which is the
  control that certifies it.
- Claim 2 CONFIRMED - `Stage` derives from the frozen `PROBE_STAGES` tuple through indexed access,
  and every listed stage is constructed and registered by `Probe`.
- Claim 3 BROKEN - the driven client supplies no protocol `version`, and the installed
  `@orkestrel/mcp` declaration states an unpinned client probes `server/discover` while only a
  pinned legacy client runs `initialize`. A server whose discovery path works and whose
  `initialize` path fails passes the test.
- Claim 4 CONFIRMED - one text block from `formatVerdict`, receipt as closing line, deferral
  recorded in the guide.
- Claim 5 CONFIRMED - no `any`, assertion, suppression, or banned prose term in the diff; the
  `as const` tuple derivation is the exempted form.
- Claim 6 CONFIRMED - kind placement and barrel membership hold for every added or moved
  declaration.
- Claim 7 CONFIRMED - `PROBE_PARTIES` has one live declaration; guide and test literals pin it
  independently.
- Claim 8 BROKEN - the first sentences of `PROBE_PARTIES` and the shape values in `shapers.ts`
  are noun phrases, not the required third-person `-s` verb form.

## Orchestrator rulings

- Claim 3: sustained, narrowed. The Orchestrator reproduced the vector: the raw-protocol suite
  drives `initialize` with `protocolVersion: '2025-06-18'` (`tests/src/bin/main.test.ts:192`), so
  the protocol path is proven, and the gap is exactly the quality rule's: no real client of the
  pinned-legacy class drives that path end to end. Fix: a pinned driven-client case
  (`version: '2025-06-18'`) asserting the exact negotiated version, beside the unpinned case that
  proves the modern class. Carrier: PBFIX15.
- Claim 8: sustained, widened to the files. The untouched siblings in `constants.ts` carry the
  same noun-phrase form (`The stages...`, `The conditions...`, `The leading token...`), so a
  diff-only fix leaves the file alternating forms. Fix: converge every public-export first
  sentence in `constants.ts` and `shapers.ts` to the `-s` verb form. Carrier: PBFIX15.
- The confirmed claims stand as evidence for acceptance; no finding was dropped.

## Terminal

VERDICT: FAIL - carriers PBFIX15 (claims 3 and 8).
