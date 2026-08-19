# Unit S1 audit — VERDICT: FAIL

Opus audited what Sol wrote, per the cross-engine rule. Three of eight claims broke, and nine
findings landed beyond them. The Orchestrator then executed the two runs the read-only lane named,
because a lane with no shell cannot settle a behavioural claim.

## Claims

| Claim | Verdict | What it was |
| ----- | ------- | ----------- |
| 1 | **BROKEN** | A case whose test never runs cannot produce a clean check |
| 2 | CONFIRMED | A passing case still produces a clean check and earns a receipt |
| 3 | CONFIRMED | Worker stdout no longer reaches `process.stdout` |
| 4 | CONFIRMED | The replacement stream cannot grow without bound |
| 5 | **BROKEN** | Eviction leaves no retained state |
| 6 | **BROKEN** | Eviction proves itself |
| 7 | CONFIRMED | An unmapped test path returns a verdict rather than throwing |
| 8 | CONFIRMED but inert | The per-module fallback is now per-module |

## Claim 1 — measured broken, with two controls

`module.state()` is not derived from whether tests ran. It reads the file task's own `mode` and
`result.state`, and `ctx.skip()` mutates the test AFTER `interpretTaskModes` has already fixed
`file.mode = 'run'`. So the module ends `passed`.

Executed by the Orchestrator against the shipped stage:

```text
CTX-SKIP findings   : []
CONTROL pass        : []
CONTROL static skip : [{"path":"tmp/probe/s1-staticskip.test.ts","message":"Vitest ran no tests in the module"}]
CLAIM1-BROKEN       : true
```

The breaking case is a test whose body never completes:

```ts
test('proves the fix', (ctx) => { ctx.skip(); throw new Error('never reached') })
```

**What the controls establish.** An ordinary passing test is also clean, so the instrument can tell
clean from not-clean rather than calling everything a finding. A statically skipped test DOES produce
a finding, so S1's repair genuinely works for the case it targeted. That pair is what makes the empty
`ctx.skip()` result a defect rather than a broken probe.

So the defect S1 was dispatched to close is still open, through a door its tests did not open, and it
is strictly worse than the case it closed: at module level `ctx.skip()` is indistinguishable from a
pass.

A second instance the auditor found by reading: with `passWithNoTests: true` in the TARGET workspace's
config, an empty test file takes the same branch and returns `passed`. `RuntimeStage` is constructed
against an arbitrary workspace, so that is reachable rather than hypothetical.

## Claim 5 — measured broken, with a control

`EnvironmentModuleGraph._unresolvedUrlToModuleMap` gains one entry per generated specification and
nothing removes it. A whole-tree grep of Vite's dist returns one declaration, two `get`, two `set`, no
`delete` and no `clear`.

The Orchestrator's first instrument returned zeroes because it could not reach the stage's `#vitest`
private field — that was a fact about the probe, not about the map, and it was rewritten rather than
reported. The second owns its Vitest and applies S1's exact eviction sequence:

```text
UNRESOLVED   : [3,4,5,6,7,8]
FILETOMODULES: [2,2,2,2,2,2]
GREW         : 5 over 6 inspections
```

**What the control establishes.** `fileToModulesMap` is a map S1's eviction explicitly deletes from,
and it stays flat at 2. So the eviction works for what it targets, and the unbounded growth is
specific to the map nothing removes.

**Why S1's curve read flat.** Its instrument counted `state.filesMap`, `state.idMap`,
`fileToModulesMap`, and the results cache — the four it evicts. It never counted this one. An
instrument certified only from the inside is trusted exactly where it has never been tested, and the
reported "after: all flat" is that failure exactly.

This also overturns S1's recorded decision that "runner recycling was unnecessary". That conclusion
rests on the four maps it counted.

## Claim 6 — broken, and the mirror of what the brief predicted

The brief predicted a reachable `finally`-masking hazard. The auditor found the opposite and worse:
**the self-check cannot fire.** All three disjuncts are falsified by statements executed a few lines
earlier in the same function — the ids were just deleted, `filesMap` was just cleared by
`watcher.onFileDelete`, and `getModulesByFile` reads the very key just deleted. It re-reads three
variables the function just assigned. It reads like a safety net and holds nothing.

The masking hazard exists too, in the window opened by `await writeToCache()` between the deletions
and the check — unlikely rather than impossible, which is the worst combination, because it will not
surface in testing and it destroys the verdict when it does.

Recording that the Orchestrator's prediction was wrong in direction. The claim was worth its place;
the reason it was worth it was not the reason given.

## Findings beyond the claims

1. **`stderr` is discarded.** Only `stdout` frames the protocol, so redirecting `stderr` into the
   discard stream buys nothing and loses every worker diagnostic a developer needs.
2. **The retention test proves the disk half while its name claims both.** No value of resident-map
   size can redden it, and its 15-iteration loop carries no assertion — one iteration would pass
   identically. So defect C's in-memory half was guarded by that test, which cannot see it, and by the
   self-check, which cannot fire.
3. **Generated specifications moved into a GATED directory.** Confirmed by the Orchestrator:
   `tests/src/bin/main.test.ts` now targets `tests/src/bin/wire-runtime.test.ts`, and
   `vite.config.ts:130` globs `tests/src/bin/**/*.test.ts` for `src:bin`, which `npm test` selects. A
   leaked revision file is collected and run by the next `npm test`. This same file contains a test
   proving the entry leaks files when killed.
4. **The stdout-isolation assertions do not assert a verdict** for the two adversarial inputs.
5. **A misconfigured workspace is now reported as a caller error**, collapsing two distinct conditions
   into one message.
6. **Cursor escape bytes still reach the wire** and the new test normalizes them away. NOT-EVIDENCED;
   the auditor named the capture that would settle it.
7. **No suppressions.** Clean.
8. **The fenced test is unchanged.** Confirmed.
9. **S1 wrote no whole-directory assertion**, but raised the count of concurrently-live `.probe-`
   files from about four to nineteen, widening a pre-existing collision window in a file it does not
   own.

## Ruling on the Vite internals reach

Ship the reach; do not ship the self-check that pretends to guard it. The three maps S1 deletes from
are on Vite's declared public type, so the reach is minimal and defensible. But it is uncovered in
both directions and silently incomplete, and the incompleteness cannot be closed without a banned type
assertion — which is the strongest argument that minting a unique specification path per inspection is
the wrong shape one layer up.

One unrelated regression in the same `finally`: `unlinkSync` moved to run BEFORE the state cleanup, so
an `EBUSY` there now skips eviction entirely and leaks both the file and the resident state.

## What the round says about the brief

The auditor's own closing observation, kept because it changes how the next brief is written: claims 2,
4, 7, and 8 were descriptive rather than falsifiable — they restate what the shipped tests assert, or a
Node stream semantic, or a line whose effect is unreachable here. The falsifiable claims were 1, 5, and
6, the three asserting a property of a DEPENDENCY's behaviour rather than of the diff's text. All three
broke.

A claim phrased "the code now does X" is checkable by reading and rarely wrong. A claim phrased
"therefore Y cannot happen" is where the defects live.
