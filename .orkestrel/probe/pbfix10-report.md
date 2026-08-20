# PBFIX10 report

## Outcome

The production fixes and required regression proofs are in place. The final scoped RuntimeStage
suite, lint gate, and typecheck gate exit 0. The whole-server observation exits 1 with timing and
load failures outside this unit's owned files.

One gauge-drain concern remains recorded: the first full RuntimeStage run completed both FIFO
rendezvous and both gauge assertions, but the inspection returned an `EPIPE` eviction finding. Two
exact reruns passed. The brief's single-read mechanism remains unchanged.

## Files touched

- `src/server/stages/RuntimeStage.ts`
- `src/server/helpers.ts`
- `tests/src/server/stages/RuntimeStage.test.ts`
- `tests/src/server/helpers.test.ts`
- `tests/src/server/Probe.test.ts`
- `tmp/pbfix10-report.md`

## Sweep terminal marker

The sweep pattern uses `(?=\.|$)`, so a match does not consume the separator before an adjacent
marker. The adjacent-marker regression recorded this red:

```text
npx vitest run --config vite.config.ts --no-cache --project src:server tests/src/server/stages/RuntimeStage.test.ts -t "removes the files a dead host left behind, at construction"
exit 1
Test Files  1 failed (1)
Tests       1 failed | 32 skipped (33)
AssertionError: a marked specification beside a caller-declared marker: expected true to be false
```

The unchanged command recorded this green after the production fix:

```text
npx vitest run --config vite.config.ts --no-cache --project src:server tests/src/server/stages/RuntimeStage.test.ts -t "removes the files a dead host left behind, at construction"
exit 0
Test Files  1 passed (1)
Tests       1 passed | 34 skipped (35)
```

## Cleanup classification

The cleanup catch preserves a workspace-origin `ProbeError` as a workspace finding. The real
symbolic-link cleanup proof recorded this red:

```text
npx vitest run --config vite.config.ts --no-cache --project src:server tests/src/server/stages/RuntimeStage.test.ts -t "preserves workspace classification when cleanup crosses a symbolic link"
exit 1
Test Files  1 failed (1)
Tests       1 failed | 33 skipped (34)
Expected origin: workspace
Received origin: instrument
```

The unchanged command recorded this green after the production fix:

```text
npx vitest run --config vite.config.ts --no-cache --project src:server tests/src/server/stages/RuntimeStage.test.ts -t "preserves workspace classification when cleanup crosses a symbolic link"
exit 0
Test Files  1 passed (1)
Tests       1 passed | 34 skipped (35)
```

The required scoped suite recorded this final result:

```text
npx vitest run --config vite.config.ts --no-cache --project src:server tests/src/server/stages/RuntimeStage.test.ts
exit 0
Test Files  1 passed (1)
Tests       35 passed (35)
```

## Caller path classification

The host reports `ENAMETOOLONG` for the over-long component and `ERR_INVALID_ARG_VALUE` for the NUL
path. `resolveWorkspaceFile` maps both to `claimant`/`refused`, retains the native cause, and states
the deep-workspace classification bound in its TSDoc. `RuntimeStage` translates the generated path
back to the caller-declared test path when it propagates that refusal.

The over-long path proof recorded this red:

```text
npx vitest run --config vite.config.ts --no-cache --project src:server tests/src/server/stages/RuntimeStage.test.ts -t "refuses a caller's unacceptable target path"
exit 1
Test Files  1 failed (1)
Tests       1 failed | 32 skipped (33)
AssertionError: promise resolved with a workspace finding instead of rejecting
```

The unchanged command recorded this green after the production fix:

```text
npx vitest run --config vite.config.ts --no-cache --project src:server tests/src/server/stages/RuntimeStage.test.ts -t "refuses a caller's unacceptable target path"
exit 0
Test Files  1 passed (1)
Tests       1 passed | 34 skipped (35)
```

The NUL path proof recorded this red:

```text
npx vitest run --config vite.config.ts --no-cache --project src:server tests/src/server/helpers.test.ts -t "translates a native path inspection fault and retains its cause"
exit 1
Test Files  1 failed (1)
Tests       1 failed | 26 skipped (27)
Expected claimant/refused
Received workspace/malformed
```

The unchanged command recorded this green after the production fix:

```text
npx vitest run --config vite.config.ts --no-cache --project src:server tests/src/server/helpers.test.ts -t "translates a native path inspection fault and retains its cause"
exit 0
Test Files  1 passed (1)
Tests       1 passed | 26 skipped (27)
```

## Vitest rejection classification

The `runTestSpecifications` await rethrows a `ProbeError` untouched and translates any other
rejection to `instrument`/`malformed`, with the rejection on `cause`.

The attempted real vector started a never-settling Vitest test, waited for its filesystem marker,
and destroyed the stage. Vitest resolved the inspection with an instrument finding for the pending
module and an instrument finding for failed specification cleanup. It did not reject. The temporary
rejection assertion recorded this result and was removed because it did not reach the branch:

```text
npx vitest run --config vite.config.ts --no-cache --project src:server tests/src/server/stages/RuntimeStage.test.ts -t "continues teardown when a generated specification cannot be unlinked"
exit 1
Test Files  1 failed (1)
Tests       1 failed | 34 skipped (35)
AssertionError: promise resolved with a runtime check instead of rejecting
```

No real vector reached the rejection without a mock or module replacement. The construction gate
and the type reading cover the boundary's permitted construction shape:

```text
npx vitest run --config vite.config.ts --no-cache --project src:core tests/src/core/errors.test.ts -t "constructs no unclassified failure in any source module"
exit 0
Test Files  1 passed (1)
Tests       1 passed | 7 skipped (8)
```

`npm run check` also exits 0 over the catch and its `unknown` rejection value. The raw-rejection
branch has no executed behavioral proof.

## Gauge proof and removed deadline proof

The old deadline proof, its `waitForExit` helper, and the child-process imports that only they used
are gone:

```text
rg -n "attributes a deadline in runtime cleanup|waitForExit" tests/
exit 1
no matches
```

The gauge proof opens the results-cache FIFO for the claimant write, reads `progress`, performs one
bounded read into a 65,536-byte buffer, and closes the reader. It repeats that sequence for the
eviction write. The claimant reader closes after its read completes and before the claimant
writer's close-completion can let the stage advance through its reporter chain to eviction. The
cleanup open resolves when the eviction writer opens, before the write and before code following
`writeToCache` can run. Those points make the gauge readings causal rather than duration-based.

The negative control moved the `progress` decrement below eviction and recorded this red:

```text
npx vitest run --config vite.config.ts --no-cache --project src:server tests/src/server/stages/RuntimeStage.test.ts -t "raises progress for the caller's run and lowers it before the stage's cleanup"
exit 1
Test Files  1 failed (1)
Tests       1 failed | 34 skipped (35)
AssertionError: expected 1 to be +0
```

After restoring the decrement as the first statement of the run's `finally`, the unchanged command
recorded this green:

```text
npx vitest run --config vite.config.ts --no-cache --project src:server tests/src/server/stages/RuntimeStage.test.ts -t "raises progress for the caller's run and lowers it before the stage's cleanup"
exit 0
Test Files  1 passed (1)
Tests       1 passed | 34 skipped (35)
```

The proof contains no duration-valued wait.

## Lint

```text
npm run lint:check
exit 0
Oxlint warnings  0
```

## Typecheck

```text
npm run check
exit 0
Root typecheck       passed
Source core check    passed
Source server check  passed
Source bin check     passed
```

## Observations

The whole-server observation was run as required and is not a closure criterion:

```text
npx vitest run --config vite.config.ts --no-cache --project src:server
exit 1
Test Files  3 failed | 4 passed (7)
Tests       16 failed | 117 passed (133)
```

The failures comprise ProbeServer reader timing assertions, LintStage timeouts and teardown
readings, and Probe timeouts or downstream effects under whole-project load. They do not name an
owned PBFIX10 production file as their failing assertion site.

The first full RuntimeStage run after the FIFO correction recorded this result after both FIFO
opens and both gauge readings completed:

```text
npx vitest run --config vite.config.ts --no-cache --project src:server tests/src/server/stages/RuntimeStage.test.ts
exit 1
Test Files  1 failed (1)
Tests       1 failed | 34 passed (35)
Finding     The runtime stage could not evict the generated specification (EPIPE: broken pipe, write)
```

The immediate exact rerun and the final post-format exact rerun both exited 0 with all RuntimeStage
tests passing. No duration or alternate drain was added.

## Unclosed evidence

The D4 raw-rejection branch lacks an executed real-operation proof because the attempted teardown
vector resolved as a check. The gauge proof also produced one transient cleanup `EPIPE` under its
required single-read drain, although both exact reruns passed. All explicit acceptance commands
finish in their required final state.