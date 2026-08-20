# PBFIX8 amendment — host facts and criteria correction for the resumed session

Successor to `.orkestrel/probe/pbfix8-brief.md`. The brief stands except where this file corrects
it. Read the brief first, then this.

## What changed and why

The session that wrote the brief ended; a fresh container resumed the campaign. The paths and the
whole-suite criteria in the brief no longer match the host the unit runs on.

## Host facts, corrected

- The checkout is `/home/user/probe`, not `/workspace/probe`. You are the sole writer there.
- The container is fresh: `npm ci` has run (150 packages, exit 0, 2026-08-20); `dist/` exists only
  after `npm run build`. The `src:bin` test project drives `dist/bin/main.js`, so any `npm test`
  observation needs `npm run build` first.
- The container has 4 CPUs.

## Criteria correction

Criteria 1 through 5 of the brief stand as acceptance criteria, in the brief's order.

Criteria 6 and 7 (`rm -rf tmp/probe && npm test`, and `npm run test:distribution -- --mode
release`) are demoted from acceptance criteria to **observations**: run them (build first), report
each command with its exit code and counts, and do not treat a timing failure there as a criterion
you must close. The authoritative whole-suite reading is taken by an independent verifier on an
idle host after you exit, per `.agents/orchestration.md` § Writing concurrency's rule on re-running
a timing failure alone.

## A standing condition, named so it does not come back as a deviation

`attributes a deadline in runtime cleanup to the instrument` in `tests/src/server/Probe.test.ts`
is known to fail intermittently under a fully concurrent suite on a loaded host — received
`origin: 'claimant'` where it expects `'instrument'`. That proof is owned by a separate design
round. Do not repair, retime, rename, or delete it; the rename this unit performs touches the
`Origin` type name, not the `origin` member or that test's mechanism. If the proof fails during
your observation runs, record the failure as an observation and continue.

## Everything else stands

Scope, ownership, off-limits files, prohibitions, the rename ruling (`Origin` to `Party`,
`ORIGINS` to `PARTIES`, `isOrigin` to `isParty`, the member stays `origin`), the `Finding`
collision note, and the deviation contract are unchanged from the brief.
