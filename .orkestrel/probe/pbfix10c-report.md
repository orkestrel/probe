# PBFIX10C report — the Orchestrator's applied fix

The cleanup reader drains to end-of-file; the claimant reader keeps the single bounded read and
early close. Applied 2026-08-20 per tmp/pbfix10c-brief.md.

Control: with the `#progress` decrement moved below `#evict`, the gauge proof recorded red — exit
1, `AssertionError: expected 1 to be +0` — and after the restore the same command recorded green.

Repetitions: the scoped RuntimeStage file
(`npx vitest run --config vite.config.ts --no-cache --project src:server
tests/src/server/stages/RuntimeStage.test.ts`) exited 0 on runs one through five, Tests 35 passed
(35) each time, zero `EPIPE` hits in any log.

`npm run lint:check` exit 0. Auditor: the Sol `analyst` in the final round.
