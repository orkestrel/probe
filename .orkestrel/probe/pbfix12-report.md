# PBFIX12 report

## BR1 — schema-owned refusals

`src/core/helpers.ts:245` now admits the whole value through `compileGuard(CLAIM_SHAPE)` before it
checks any source path. It passes each admitted source unchanged to `isSource`, so a missing path or
text remains a schema refusal. `tests/src/core/helpers.test.ts:556` pins the `{ text: '' }` source,
asserts that the advertised shape refuses it at `:565`, and expects no refused paths.

Red command:

```text
npm run test:src:core -- -t "reports nothing for a refusal the advertised schema already explains"
```

Exit 1. Vitest reported 1 failed and 31 skipped. `findRefusedPaths` returned
`['case.files.0.path']`; the test expected `[]`.

Green command: the same command. Exit 0. Vitest reported 1 passed and 31 skipped; the final run
took 1.48 s.

## BR2 — exact stage cardinality

`src/core/helpers.ts:142-147` now requires each `PROBE_STAGES` member exactly once in both phases.
`tests/src/core/helpers.test.ts:336` pins a duplicate in the case phase and a duplicate in the
control phase.

Red command:

```text
npm run test:src:core -- -t "refuses a receipt when either phase repeats a stage"
```

Exit 1. Vitest reported 1 failed and 31 skipped. `computeReceipt` returned a receipt string where
the test expected `undefined`.

Green command: the same command. Exit 0. Vitest reported 1 passed and 31 skipped; duration 668 ms.

## BR3 — server restart after teardown

`src/server/ProbeServer.ts:84-85` throws `createDestroyedError('probe server')` when teardown has
begun and preserves the no-op only while the server is already serving. The public contract is in
`src/server/types.ts:221-224` and `guides/probe.md:232`. `tests/src/server/ProbeServer.test.ts:141`
pins the exact `claimant` / `destroyed` failure and message.

Red command:

```text
npm run test:src:server -- -t "refuses a start after teardown"
```

Exit 1. Vitest reported 1 failed and 134 skipped. The captured value was `undefined`; the test
expected the `ProbeError` object.

Green command: the same command. Exit 0. Vitest reported 1 passed and 134 skipped; duration 4.78 s.

## BR4 — physical-containment boundary

This row is documentation-only as prescribed. The runtime class TSDoc at
`src/server/stages/RuntimeStage.ts:77` says:

> The write path's physical-containment guarantee covers the claim inputs and the target tree as
> inspected. A concurrent process that mutates a path component between the final inspection and
> the write is outside that guarantee.

The guide at `guides/probe.md:590` says:

> Nothing this package writes or deletes can land outside the target tree for the claim inputs and
> the tree as inspected. A concurrent process that mutates a path component between the final
> inspection and the write or delete is outside that guarantee.

No prevention code or red proof was added. `npm run test:guides` exited 0 with 13 tests passed.

## BR5 — directory-creation ownership

`src/server/stages/RuntimeStage.ts:377-423` marks only the `mkdirSync` interval as creation and
classifies a native fault in that interval as `workspace`. A successful `mkdirSync` clears the
marker at `:396`, so later write failures retain their instrument classification. The preceding
claimant `ProbeError` branch remains unchanged, retaining `ENAMETOOLONG` and
`ERR_INVALID_ARG_VALUE` as claimant refusals. The class taxonomy is at `:66-74`; guide parity is at
`guides/probe.md:375-382`. `tests/src/server/stages/RuntimeStage.test.ts:511` pins a file occupying
the requested directory.

Red command:

```text
npm run test:src:server -- -t "reports a directory it cannot create as a workspace issue"
```

Exit 1. Vitest reported 1 failed and 134 skipped. The issue origin was `instrument`; the test
expected `workspace`. The retained host reason named the failing `mkdir` with `ENOTDIR`.

Green command: the same command. Exit 0. Vitest reported 1 passed and 134 skipped; duration 2.58 s.
The final whole-file RuntimeStage run also exited 0 with all 35 tests passed.

## BR6 — progress at claimant admission

`src/server/stages/LintStage.ts:249-257` increments progress immediately after the `didOpen`
notification is accepted, before diagnostics are awaited. The fixture records that notification
and withholds diagnostics at `tests/src/server/stages/LintStage.test.ts:53-61`; the held proof is at
`:282-307`.

`src/server/stages/TypeStage.ts:114-125` increments progress after it records the complete claimant
overlay and before it requests the first compiler diagnostics or reaches the first yield.

Own claim — type admission point: the complete overlay is the earliest point at which the type
stage has accepted all claimant input for inspection. Incrementing there makes admission visible at
the next yield and does not label overlay validation or recording failures as admitted work.

The conditional contract is in `src/server/types.ts:112-119` and `guides/probe.md:131`. Both name
claimant admission; both require a return to baseline before later stage-owned awaited work; both
name `RuntimeStage` eviction and cleanup.

Held-diagnostics command:

```text
npm run test:src:server -- -t "raises progress after admitting a document whose diagnostics are held"
```

Pre-fix red: exit 1, with 1 failed and 134 skipped. The fixture's `admitted` marker was
`undefined`, so the run failed before the progress assertion.

Post-fix sandbox observation: exit 1, with 1 failed and 134 skipped after 14.97 s. The spawned
fixture again never wrote `admitted`; the exact failure was
`expect(scratch.read('admitted')).toContain('lint-progress.test.ts')`, received `undefined`. This is
the child-stdio denial anticipated by the brief, so the host must take the green reading.

Reliable adjacent readings:

- `npm run test:src:server -- -t "reports a workspace lint issue at the declared path"` exited 0
  with 1 passed and 134 skipped.
- `./node_modules/.bin/vitest run --config vite.config.ts --no-cache --reporter=dot --project src:server tests/src/server/stages/TypeStage.test.ts`
  exited 0 with all 18 tests passed.

## BR7 — two-inode gauge proof

`tests/src/server/stages/RuntimeStage.test.ts:943-966` creates the claimant FIFO at the cache path
and a second cleanup FIFO at `${cache}.cleanup`. After the claimant read completes, it atomically
renames the second FIFO over the cache path while the claimant reader still holds the first inode.
It then opens the cleanup reader on the second inode and drains it to EOF. The construction comment
at `:957-965` states both the distinct-inode argument and the cleanup drain.

Own claim — construction: an open reader retains its original FIFO inode across the rename, while a
new open resolves the replacement inode. The cleanup reader therefore cannot attach to the
claimant's still-open writer or sample claimant progress.

Repeated command:

```text
npm run test:src:server -- -t "raises progress for the caller's run and lowers it before the stage's cleanup"
```

Three separate runs exited 0. Each reported 1 passed and 134 skipped. Their durations were 1.53 s,
1.51 s, and 1.36 s.

## BR8 — construction refusal at the bin boundary

`src/bin/main.ts:4-9` catches construction-time `ProbeError` values, replaces embedded line breaks,
writes `[origin] code: message` through stderr, and sets exit status 1. Line 7 rethrows unknown
values unchanged, retaining their normal stack. `tests/src/bin/main.test.ts:91-117` drives the built
entry from a package-only workspace and requires one stderr line, no stdout, no `ProbeError:` stack,
and status 1.

Own choice: the one-line boundary replaces CRLF, LF, and CR inside a `ProbeError.message` with a
space so every declared `ProbeError` keeps the promised one-line shape.

Red preparation and proof:

```text
npm run build:src:bin
npm run test:src:bin -- -t "reports a construction refusal as one stderr line without a stack"
```

The build exited 0. The test exited 1 with 1 failed and 8 skipped. It received the uncaught stack
beginning with the built entry's file URL and `ProbeError: typescript does not publish a readable
manifest`; it expected one formatted line.

Post-fix sandbox command:

```text
npm run test:src:bin -- -t "reports a construction refusal as one stderr line without a stack"
```

Exit 1. The child exited 1, but Vitest captured an empty stderr buffer instead of the expected line.
The full bin file had the same sandbox observation: 8 passed, 1 failed, duration 27.19 s. This is the
unreliable spawned-child stdio condition named in the brief.

A direct invocation of the final built entry from an empty `/tmp/pbfix12-bin-observation` directory
exited 1 and emitted exactly one line with no stack:

```text
[workspace] missing: typescript does not publish a readable manifest
```

The host must rerun the exact Vitest command for the green captured-stream reading.

## Final verification

- `npm run lint:check`: exit 0, no warnings.
- `npm run check`: exit 0 for the root, core, server, and bin TypeScript projects.
- `npm run format:check`: exit 0; all 148 files matched.
- `npm run build`: exit 0 for core ESM/CJS, server ESM/CJS, and bin. API Extractor warned that its
  bundled TypeScript 5.9.3 is older than the project's 6.0.3; the build remained green.
- `npm run test:src:core`: exit 0; 32 tests passed across 3 files.
- RuntimeStage exact-file run: exit 0; 35 tests passed.
- TypeStage exact-file run: exit 0; 18 tests passed.
- `npm run test:policy`: exit 0; 86 tests passed.
- `npm run test:guides`: exit 0; 13 tests passed.
- `git diff --check`: exit 0.
- ProbeServer exact-file run: 6 passed and 2 failed because sandboxed stdin pushes delivered `[]`
  instead of `['probe']`; the BR3 targeted run passed.
- `npm test` was stopped with Ctrl-C after repeated spawned-child exchange timeouts; exit 130 and no
  final counts. This is a whole-suite sandbox observation, not an acceptance criterion.

## Actual git status

```text
 M guides/probe.md
 M src/bin/main.ts
 M src/core/helpers.ts
 M src/server/ProbeServer.ts
 M src/server/stages/LintStage.ts
 M src/server/stages/RuntimeStage.ts
 M src/server/stages/TypeStage.ts
 M src/server/types.ts
 M tests/src/bin/main.test.ts
 M tests/src/core/helpers.test.ts
 M tests/src/server/ProbeServer.test.ts
 M tests/src/server/stages/LintStage.test.ts
 M tests/src/server/stages/RuntimeStage.test.ts
```

## Diffstat

```text
 guides/probe.md                              | 32 ++++++-----
 src/bin/main.ts                              |  9 ++-
 src/core/helpers.ts                          | 28 ++++-----
 src/server/ProbeServer.ts                    | 10 ++--
 src/server/stages/LintStage.ts               |  2 +-
 src/server/stages/RuntimeStage.ts            | 23 +++++---
 src/server/stages/TypeStage.ts               |  2 +-
 src/server/types.ts                          | 10 ++--
 tests/src/bin/main.test.ts                   | 28 +++++++++
 tests/src/core/helpers.test.ts               | 48 ++++++++++++++++
 tests/src/server/ProbeServer.test.ts         | 14 ++++-
 tests/src/server/stages/LintStage.test.ts    | 29 ++++++++++
 tests/src/server/stages/RuntimeStage.test.ts | 86 +++++++++++++++-------------
 13 files changed, 234 insertions(+), 87 deletions(-)
```
