# PBFIX3 — report

Unit: `implementer`, Opus 5. Brief: `pbfix3-brief.md`. One rule, and the case the suite could not see.

## The defect

PBFIX2's R6 recorded stdin ownership as `!process.stdin.isPaused()`. `isPaused()` is
`readableFlowing === false`, and a stream nobody has read reports `readableFlowing` as `null`, so
`isPaused()` returns `false` for it. On a fresh `process.stdin` — every real launch — the flag
recorded `true`, `#destroy` never paused, the `PipeWrap` handle stayed ref'd, and the process did not
exit.

`tests/src/bin/main.test.ts` proved it before the fix: all four `SIGTERM` and `SIGINT` tests timed out
at 120000 ms, reproduced on an isolated re-run.

## The rule as it ships

```ts
this.#owns = process.stdin.readableFlowing !== true                                   // :71
if (this.#owns === true && process.stdin.listenerCount('data') === 0) process.stdin.pause()  // :107
```

| Case at `start` | `readableFlowing` | Decided by | Result |
| --- | --- | --- | --- |
| fresh stdin | `null` | `:71` owns, `:107` sees no listener | paused |
| already paused | `false` | `:71` owns, `:107` sees no listener | paused, a no-op |
| already flowing | `true` | `:71` does not own | left flowing |
| a reader attached after `start` | any | see the finding | reader removed, then paused |

## Red then green

Both new tests were run red against the R6 rule, with the source reverted for the run and restored in
the same script.

- `pauses a standard input stream nobody had read` — red at `isPaused()`, green after.
- `keeps delivering to a reader that was reading before it started` — asserts real byte delivery
  through `push` rather than a flag.

The unit reports honestly that the second test does not discriminate the R6 rule from the fix, and
says why: under R6, `!isPaused()` is also `true` for a resumed stream. It chose the reachable half of
the second-reader case over the brief's post-`start` reader, because that case's premise is false of
this implementation.

Independent of the suite, on a real piped stdin with no project code:

```
r6:  owns=false paused=false  node_exit=124 (killed at 5 s)  elapsed_ms=5006
fix: owns=true  paused=true   node_exit=0                    elapsed_ms=103
```

`src:bin` after the Orchestrator rebuilt `dist/`: `Test Files 1 passed (1)`, `Tests 8 passed (8)`.

## The finding this unit did not own

The release-time listener check is **behaviourally inert in `ProbeServer` today**.
`releaseListeners` in `src/server/helpers.ts` removes every `data` listener gained since the capture,
including a caller's own, so a reader attached after `start` is gone before `:107` reads the count.
The check is correct and mandated, and it becomes load-bearing the moment that helper stops taking
listeners it did not add.

That is a defect in `releaseListeners`, not in this rule. Carried to a successor.

## A dispatch defect, recorded

The brief made `src:bin` an acceptance criterion and banned `npm run build` in the same document.
That suite drives `dist/bin/main.js`, so the criterion could not close from the owned files. The unit
diagnosed it exactly, refused to explain the red away, and named the rebuild as what would settle it.
The Orchestrator rebuilt and took the reading.

The lint failure was also the Orchestrator's: an unused parameter in a campaign instrument copied into
`.orkestrel/`. Fixed at the source.
