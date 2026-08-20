# PBFIX10C: the cleanup drain reads to end-of-file

## Role and engine

Orchestrator-owned fix unit, applied directly by the Orchestrator under the acceptance law that
briefs, owns, and audits its own writing like any other unit. Auditor: the GPT-5.6 Sol `analyst`
in the final round, an engine the Orchestrator does not share.

## The defect, from PBFIX10's report

The gauge proof's first full-file run completed both FIFO rendezvous and both gauge assertions,
then failed on an eviction finding: `The runtime stage could not evict the generated specification
(EPIPE: broken pipe, write)`. Two exact reruns passed. The cleanup reader performs one bounded
read and closes; when the eviction writer still holds bytes at that close, its next write hits a
closed pipe. A release gate carries no intermittent proof, so the residue closes now.

## The fix

Asymmetric drains in `tests/src/server/stages/RuntimeStage.test.ts`, gauge proof only:

- The claimant reader keeps the single bounded read and immediate close — that early close is what
  guarantees the reader is gone before the eviction writer can open, per the PBFIX10 amendment's
  causality argument.
- The cleanup reader drains to end-of-file (`readFile`) before closing. It is the last reader and
  no successor writer exists to miss, so the EOF wait reopens no window — and the reader staying
  open until the writer closes is what makes the writer's EPIPE impossible.

The `stage.progress` readings stay exactly where they are: at each open's resolution, before any
drain.

## Acceptance criteria

1. The negative control still binds: move the `#progress -= 1` decrement below the `#evict` call,
   record the proof red with the exact command and counts, restore, record green.
2. The scoped RuntimeStage file exits 0 in consecutive repeated runs (a run count of five,
   recorded), with no eviction finding in any of them.
3. `npm run lint:check` exits 0.

## Output

The applied diff, the control's red and green readings, and the repetition readings, recorded in
the campaign capture.
