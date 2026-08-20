All four rows remained open and are now applied.

## Row rulings

- Row 32 — Before: `Control.reason` was required but unread after submission. Ruling: every Probe-produced verdict carries the claimant’s explanation unchanged as `Verdict.reason`. It remains explanatory and does not affect receipt eligibility or token content. Interface: [types.ts](/workspace/probe/src/core/types.ts:311), writer: [Probe.ts](/workspace/probe/src/server/Probe.ts:148).
  - Red: `npm run test:src:core -- tests/src/core/helpers.test.ts` — 1 failed, 8 passed.
  - Green: same command — 9 passed.

- Row 37 — Before: `isSource` admitted `../../etc/hosts`. Ruling: refuse absolute and workspace-escaping paths while admitting contained traversal such as `src/../tests/greeting.test.ts`. Implementation: [validators.ts](/workspace/probe/src/core/validators.ts:40), proof: [validators.test.ts](/workspace/probe/tests/src/core/validators.test.ts:87).
  - Red: `npm run test:src:core -- tests/src/core/validators.test.ts` — 1 failed, 5 passed.
  - Green: same command — 6 passed.

- Row 39 — Before: a control broken at declared and undeclared stages still earned a receipt. Ruling: the declared stage must contain a code finding, and every other control stage must remain clean. Implementation: [helpers.ts](/workspace/probe/src/core/helpers.ts:97), proof: [helpers.test.ts](/workspace/probe/tests/src/core/helpers.test.ts:305).
  - Red: `npm run test:src:core -- tests/src/core/helpers.test.ts` — 1 failed, 9 passed.
  - Green: same command — 10 passed.

- Row 24 — Before: rendered code and instrument findings were identical. Ruling: render `[code]` or `[instrument]` before every finding location. Implementation: [helpers.ts](/workspace/probe/src/core/helpers.ts:27), proof: [helpers.test.ts](/workspace/probe/tests/src/core/helpers.test.ts:28).
  - Red: `npm run test:src:core -- tests/src/core/helpers.test.ts` — 1 failed, 9 passed.
  - Green: same command — 10 passed.

The final contract wording is aligned in [probe.md](/workspace/probe/guides/probe.md:193).

## Gate results

| Command | Exit | Classification |
|---|---:|---|
| `npm run format:check` | 0 | Criterion |
| `npm run lint:check` | 0 | Criterion |
| `npm run check` | 0 | Criterion |
| `npm run build` | 0 | Observation |
| `npm test` | 1 | Observation — 14 process-heavy server timeouts or child-process failures; 122 tests passed |
| `npm run test:distribution` | 0 | Observation |

Supplemental proofs passed: 18 core tests, 86 policy tests, 9 guide tests, and the focused Probe integration test.

## Files changed

- `guides/probe.md`
- `src/core/helpers.ts`
- `src/core/types.ts`
- `src/core/validators.ts`
- `src/server/Probe.ts`
- `tests/guides.test.ts`
- `tests/src/core/helpers.test.ts`
- `tests/src/core/validators.test.ts`
- `tests/src/server/Probe.test.ts`