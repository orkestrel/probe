# PBFIX2's R6 fix reintroduces the exit defect — measured

Found by the Orchestrator on 2026-08-20 while reproducing an mcp audit finding of the same class.
The unit is uncommitted, so this is caught before it reaches history.

## The shipped rule

`src/server/ProbeServer.ts`:

- `:68` — `this.#flowing = !process.stdin.isPaused()` in `start`
- `:102` — `if (this.#flowing === false) process.stdin.pause()` in `#destroy`

Read as: pause only when the stream was already paused before `start`.

## What `isPaused()` actually returns

`readable.isPaused()` is `readableFlowing === false`. A stream nobody has read has
`readableFlowing === null`, so `isPaused()` returns **false**, not true.

Measured on the real object with a real piped stdin, `scratchpad/stdin-state.mjs`:

```
untouched process.stdin: readableFlowing=null isPaused()=false
after on(data):          readableFlowing=true isPaused()=false
after removeListener:    readableFlowing=true isPaused()=false
STILL ALIVE after 800ms -- the handle is still ref'd
```

## The consequence

A fresh `process.stdin` is every real launch of this server. There, `#flowing` records `true`, so
`#destroy` does not pause, the flow `start` created is never stopped, the `PipeWrap` handle stays
ref'd, and **the process does not exit** — the exact defect `@orkestrel/mcp`'s `48ded67` existed to
close, reintroduced here.

`PB9` established that `ProbeServer.destroy()` releases the handles and both signals exit 0. R6 made
the pause conditional, and the condition is false in the normal case.

## Why the gates cannot see it

R6's test asserts two directions: a stdin flowing before `start` is still flowing after `destroy`,
and a stdin paused before `start` is paused after it. Both set the state explicitly. Neither covers
the fresh state, where `readableFlowing` is `null` and neither branch's premise holds.

## The correct rule, measured

From `scratchpad/flow-fix-probe.mjs`, over four cases, correct in all four:

```
owns  = input.readableFlowing !== true        // recorded in start, before attaching
pause = owns && input.listenerCount('data') === 0   // tested in destroy, after removing our own
```

- fresh (`null`) → owns → nobody left → pause. The server started the flow and stops it.
- pre-paused (`false`) → owns → pause. Restores the state the caller had.
- pre-flowing (`true`) → not owns → no pause. The caller's flow survives.
- a second reader attached after `start` → owns, but one listener remains → no pause.

`isPaused()` cannot express the first case because it collapses `null` and `true` into one answer.
`readableFlowing !== true` separates them.

The same rule closes `@orkestrel/mcp`'s claims 1, 2, and 7. Both packages take one measured rule.
