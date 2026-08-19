# The `tmp/probe` bin failure is a race in the test, not a flake and not the deferred gitignore issue

## Correcting the record

This campaign has been calling it "the known `tmp/probe` bin flake" — in `plan.md`, in the O9-U2 brief,
and in the D1 brief. Both halves of that label are wrong.

It is **not a flake**: an independent verifier ran it under whole-suite load and alone on an idle
container and got identical failures both times.

It is **not** the `tmp/probe` arming false green deferred to the user. That one is about `.gitignore`
excluding `tmp`, oxlint honouring version-control ignores in LSP mode, and `#arm()` asserting
`findings.length > 0`. This is a different defect in a different file.

## What it actually is

`tests/src/bin/main.test.ts:326` spawns the built entry in a scratch workspace holding only a
`package.json` and a linked `node_modules`, waits a fixed **750 ms**, then reads
`<scratch>/tmp/probe` expecting two arming files.

Arming creates those files. Then boot fails — the scratch has no `vite.config.ts`, which the child's
own discarded stderr says plainly — and the failure path removes the directory. The test's fixed sleep
lands after that removal.

## Measured

Three runs, sampled every 15 ms, reproducing the test's exact setup including `createScratch` and its
piped-but-unread stdio:

```text
run 1: armed at 154ms, gone by 690ms, window 536ms  (the test reads at 750ms)
run 2: armed at 153ms, gone by 658ms, window 505ms  (the test reads at 750ms)
run 3: armed at 152ms, gone by 674ms, window 522ms  (the test reads at 750ms)
```

The child's stderr, which the test discards so a boot failure is invisible to it:

```text
failed to load config from /tmp/orkestrel-test-kF5F6b/vite.config.ts
```

The test needs to read inside a window that opens at ~153 ms and closes at ~670 ms. Its constant sits
60 to 90 ms past the close, every time, on this container. On a slower host the cleanup lands later and
the same constant passes, which is exactly why this read as intermittent for so long.

## Not caused by O9-U2

`tests/src/bin/main.test.ts` was last touched in `6ce8544`, several units before O9-U2, whose diff
covers only `src/server/stages/RuntimeStage.ts` and its own test.

## Why it is in scope

Criterion 5 requires the five gates to pass. `npm test` chains
`test:src && test:policy && test:config`, so this one failure stops the chain and **`test:policy` and
`test:config` never run at all**. The campaign's standing "201 passed" figure cannot be reproduced
until this closes.

## The repair

Replace the fixed sleep with a bounded poll for the arming files, then kill immediately once they are
observed. That makes the proof independent of how fast the host tears down a failed boot, which is the
property the test actually wants. It keeps proving what it was written to prove: killing the entry
during boot leaves the arming files behind.

Unit **B1**, routed to Sol — the subject is timing, constraints, and a teardown ordering, which is the
objective lane's work class.
