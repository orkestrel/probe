# PBFIX10 amendment — the gauge proof's drain, corrected from the Orchestrator's diagnosis

Successor to `tmp/pbfix10-brief.md`. The brief stands except for D5's drain mechanism, corrected
here. Your previous run's deviation stop was correct, and its red proofs and deletions in the
working tree are kept — resume from the tree as it stands; do not re-record the reds already in
your report.

## What the Orchestrator measured after your stop

The gauge proof hangs on the idle host exactly as it hung in your sandbox — the failure is the
mechanism, not the sandbox. Instrumented marks, host, 2026-08-20: the claimant-side open and
drain both fire; the second `open` never resolves. The cause, read from the installed Vitest
source (`writeToCache` is a plain async `fs.promises.writeFile` to the cache path, no rename):
`readFile()` waits for EOF, and during that wait and the close that follows, the stage's
continuation reaches eviction; eviction's `writeFile` opens the FIFO **while the claimant reader
is still open**, so its open succeeds immediately, its payload lands in the pipe buffer, and it
closes. The buffered payload dies with the claimant reader's close, and the proof's second open
then waits for a writer that has already come and gone.

## The corrected drain, replacing D5's step shapes

- After `await open(cache, 'r')` resolves for the claimant phase: read the `stage.progress`
  value, then drain with **one bounded `read()` call** (a single `handle.read(buffer, 0, size,
  null)` into a buffer large enough for the payload, 65536 bytes) and `close()` immediately. Do
  not call `readFile()` and do not wait for EOF — the EOF wait is the window the eviction writer
  slips through.
- Then `await open(cache, 'r')` for the cleanup phase, read `stage.progress`, drain with the same
  single bounded `read()`, and close.
- The causality that makes this deterministic, for your report: the reader's close is queued at
  its read's completion, which precedes the claimant writer's own close-completion, while the
  stage's march to eviction requires that close plus its whole reporter chain — so the claimant
  reader is closed before the eviction writer can open. And at the cleanup rendezvous, the
  proof's open resolves the instant the writer's open succeeds, before the writer has issued its
  write and close and before the stage can take one step past `writeToCache` — so the
  `stage.progress` reading at that resolution strictly precedes any code after the eviction
  write, which is what makes the negative control (the decrement moved below `#evict`) report
  red deterministically rather than by a tick race.
- Everything else in D5 stands: the assertions, the negative control with both recorded
  readings, and the prohibition on any duration-valued wait.

## Everything else stands

D1 through D4, the scope, the prohibitions, the criteria order, and the output contract are
unchanged from `tmp/pbfix10-brief.md`. Your recorded reds for D1, D2, and D3 stand as this
unit's red readings; proceed to the production fixes and the green halves.
