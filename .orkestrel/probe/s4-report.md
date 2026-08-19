# Unit S4 — returned report

Transcribed at the same moment the code was committed. Baseline `282c902`.

## Files written

- `src/server/stages/TypeStage.ts` — tracks resolved overlays inside the cleanup boundary and deletes
  overlay and version entries in `finally`.
- `tests/src/server/stages/TypeStage.test.ts` — escape-position cleanup and version-retention
  regressions.

## Validation

| Check | Result |
| ----- | ------ |
| Focused regression **before** the fix | exit 1 — **4 failed, 5 passed** |
| Focused regression **after** the fix | exit 0 — **9 passed** |
| Owned-file format check | exit 0 |
| Owned-file lint check | initial exit 1 for a missing `toThrow` message; final exit 0 |
| `npm run check` | exit 0 |
| `npm run test:src:server` | exit 1 — 11 failed, 55 passed (see Deviation) |
| `git diff --check` | exit 0 |

## Acceptance evidence

1. `removes every applied overlay when an escaping source is first` observes a later inspection reading
   the real file. The focused command changed from 4 failed, 5 passed to 9 passed.
2. The same test asserts the exact disk text for the test and both candidate files before accepting the
   later inspection.
3. `removes every applied overlay when an escaping source is first`, `...middle`, and `...last` drive
   `../outside.ts` through each position. All three failed before the fix and passed afterward.
4. `reports a real type error and accepts clean source` stayed green, proving normal candidate overlays
   still affect diagnostics across successive inspections.
5. `releases candidate versions after every inspection` observed 6 retained entries before the fix and 0
   afterward. **No behavioural consequence exists**, because `#version` consults `#overlays` before using
   `#versions`, so the test inspects the private map. The unit flagged this itself: "A public
   resident-resource metric would have been a better observable seam, but none exists."

## Deviation — resolved by the Orchestrator as contention, not a defect

The unit reported `npm run test:src:server` at exit 1, 11 failed and 55 passed, **every failure a timeout
in `tests/src/server/Probe.test.ts` or the off-limits `tests/src/server/stages/LintStage.test.ts`**. It
stopped without investigating or editing those files, per its deviation contract.

**Re-run alone by the Orchestrator with no concurrent lane:**

```text
Test Files  6 passed (6)
     Tests  66 passed (66)
  Duration  41.08s
```

The failures were contention. A read-only audit lane had been permitted to run scoped Vitest projects
against the real Oxlint binary while this unit ran its gates, and both write into one `tmp/probe`
directory. Cause recorded in `brief-check.md`; the unit was right to stop, and right not to guess.

## Gates, run by the Orchestrator after the re-run

| Gate | Exit code |
| ---- | --------- |
| `npm run format:check` | 0 |
| `npm run lint:check` | 0 |
| `npm run check` | 0 |
| `npm run build` | 0 |
| `npm test` | 0 — **198 passed** (84 + 86 + 28), 0 skipped, 0 todo |

## Decisions

- Recorded each resolved path before changing either map, then cleaned the recorded paths without
  resolving caller input again — so the cleanup itself cannot throw on a path the application accepted.
- Deleted `#versions` entries beside their overlays.
- Used a genuine `../outside.ts` escape, per the amendment, rather than a dot-prefixed name H1 has since
  made contained.
- Left admission validation, the class remarks, and every off-limits file unchanged.
