# Carry ledger — every sweep finding names the unit that carries it

The dispatch law requires that after reconciling findings into briefs, every finding names the brief
item carrying it, because a finding with no carrier is a dropped finding. This is that walk, done once
over all 29.

## Result

All 29 sweep findings have a carrier. One further finding was added after the sweep by the third
repair round's audit, and one more by the Orchestrator, so 31 items are carried in total.

| Unit | Subject | Findings carried |
| ---- | ------- | ---------------- |
| S1 | `RuntimeStage.ts` | 4 — skipped-test receipt (H), worker stdout on the protocol stream (H), eviction that removes nothing (H), unmapped test path throws (L, admission half in S5) |
| S2 | `Probe.ts` | 5 — deadline armed before queueing (H), boot control discards findings (M), deadline measures queue time (M), only the runtime stage is deadlined (M), plus the duplicate `error` emit added by the round-3 audit |
| S3 | `LintStage.ts` | 6 — `exitCode` liveness (H), orphaned document promise (H), `didClose` cleanup throws (M), `child.stdin` has no error listener (M), cleanup replaces the crash diagnosis (M), document map never emptied (M) |
| S4 | `TypeStage.ts` | 3 — overlays applied outside the `try` (H), `#versions` never pruned (M), class `@remarks` describes the wrong project selection (M) |
| S5 | `src/core/*`, `src/server/types.ts`, `helpers.ts` | 10 — `Claim` example can never earn a receipt (H), `CLAIM_SHAPE` derivation does not exist (H), `Control.reason` read by nothing (M), wire-guard single-source claim (M), `inferTestProject` `@returns` (M), mtime revalidation (M), `StageInterface.destroy` guarantee (M), `Verdict.id` (L), `Verdict` `@example` elapsed (L), `expire` event doc (L) |
| S6 | `src/bin/main.ts` | 1 — the entry wires no shutdown and no error observation (M) |
| O9 | candidate-source overlay | 1 — the type stage cannot resolve a candidate file not already on disk (H) |
| Orchestrator | test suite | 1 — four server test files share one `tmp/probe/` directory under parallel projects |

10 HIGH + 15 MEDIUM + 4 LOW = 29, plus the audit's duplicate-emit finding and the Orchestrator's
isolation finding.

## What the instrument was, and what it could not answer

The first pass was a keyword router over the finding headings. It reports on the words in a heading and
nothing else, so its coverage is exactly "headings whose wording matches a route I wrote". It flagged
five anomalies, and every one was a limit of the router rather than a gap in the carry. Each was
resolved by reading the brief.

- **The skipped-test receipt** routed nowhere because the heading says "runtime Check", not "runtime
  stage". It is defect A in `s1-brief.md`.
- **The worker stdout finding** routed nowhere because its heading names Vitest and `process.stdout`
  rather than a source file. It is defect B in `s1-brief.md`.
- **The `didClose` cleanup finding** routed nowhere because `didClose` is an LSP method name rather
  than a file name. It belongs to `LintStage.ts` and is in `s3-brief.md`.
- **"Only the runtime stage is deadlined"** routed to three units at once because the heading names
  every stage. The defect is the coordinator's deadline scope, so the fix is in `Probe.ts` and it is in
  `s2-brief.md`.
- **`Case.test.path`** routed to two units, and that one is genuinely split. The behaviour half —
  `prove` throwing instead of returning a verdict — is S1's. The admission half is S5's, because
  `Case.test` is a `Source` and S5 owns the `isSource` and `SOURCE_SHAPE` path check. Both halves are
  named in their briefs, so the finding is carried twice rather than dropped once.

Stating this because a keyword count over 29 headings reads like a completeness proof and is not one.
The completeness claim rests on reading the six briefs, which is what settled all five anomalies. The
router's value was narrowing 29 items to 5 worth reading closely.
