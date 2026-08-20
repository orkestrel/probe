# PBFIX14 report

## Carrier rulings

- **BR5 prose A.** The guide assigns a blocked specification directory to the workspace and
  limits the instrument-owned write case to a write after the directory exists
  (`guides/probe.md:282-288`).
- **BR5 prose B.** The `RuntimeStage` class contract names post-directory-creation write,
  run, eviction, and deletion failures as instrument issues when the target tree does not own the
  reason (`src/server/stages/RuntimeStage.ts:66-75`).
- **F1.** `findRefusedPaths` is a server leaf (`src/server/helpers.ts:493-509`).
  `ProbeServer` imports that server leaf (`src/server/ProbeServer.ts:17,174`). Its behavioral
  coverage moved to the server helpers suite (`tests/src/server/helpers.test.ts:447-493`). The
  public guide row and test index name the server surface (`guides/probe.md:168-190,768-778`).
  The core tree has no remaining `findRefusedPaths` reference.
- **F2.** `ProbeServerInterface.start` declares the post-teardown throw in TSDoc
  (`src/server/types.ts:224-227`).
- **R2.** `Probe.#arm` creates the boot workbench through `#workbench` before its general boot
  wrapper (`src/server/Probe.ts:213-254`). The helper preserves a workspace `ProbeError` code,
  classifies a native creation fault as `workspace`/`malformed`, records
  `{ path: 'tmp/probe' }`, retains the cause, and uses the stage-door message shape. The regression
  occupies `tmp/probe` with a file and checks the complete failure contract
  (`tests/src/server/Probe.test.ts:345-390`). The failures table includes this boot condition
  (`guides/probe.md:324-334`).
- **R3.** The construction-refusal proof requires status 1, empty stdout, containment of the
  formatted stderr line, and absence of a `ProbeError:` stack. It no longer requires stderr to
  equal only that line (`tests/src/bin/main.test.ts:93-114`).
- **Accepted recommendations.** The receipt summary says each phase owes one check per stage
  (`guides/probe.md:22`). Runtime write classification uses one workspace condition
  (`src/server/stages/RuntimeStage.ts:417-424`). The lint fixture states that `PROBE_SILENT`
  writes the URI to `admitted` (`tests/src/server/stages/LintStage.test.ts:20-21`). The containment
  sentence uses the agreed claim-input and inspected-target-tree boundary
  (`guides/probe.md:609-618`). The server registration section documents the one-line failure
  format and exit status (`guides/probe.md:412-417`).
- **PBFIX13 terminology.** The receipt explanation uses `stayed` consistently with the local
  binding (`src/core/helpers.ts:101-108,151-154`).

## R2 red and green

Command, before the fix:

```text
npx vitest run --config vite.config.ts --no-cache --project src:server tests/src/server/Probe.test.ts -t 'blocked boot workbench'
```

Exit 1: 1 failed, 21 skipped, 22 collected. The native workbench blocker reached the general arm
wrapper as `The probe could not arm: ENOTDIR...`, with `origin: 'instrument'` and no path context;
the proof expected the workspace-owned workbench failure.

The same command after the fix exited 0: 1 passed, 21 skipped, 22 collected.

## Comment rulings

- Replaced positional references with named relationships in
  `tests/src/core/errors.test.ts:47,165,285`,
  `tests/src/server/ProbeServer.test.ts:8,153`,
  `tests/src/server/Probe.test.ts:248,1289`,
  `tests/src/server/stages/RuntimeStage.test.ts:297`,
  `tests/src/server/stages/TypeStage.test.ts:457,490`, and
  `tests/src/server/stages/LintStage.test.ts:324,351,509,513,719`. The resulting words such as
  `following assertion`, `preceding class`, `preceding run`, and `parent directory` identify the
  referenced entity instead of its page position.
- Retained comparative uses because they express a measured relation, not source position:
  `tests/src/bin/main.test.ts:19,360`, `tests/src/server/ProbeServer.test.ts:214`, and
  `tests/src/server/Probe.test.ts:18,248`.

## Ancillary choice and own claim

- The F1 tests stay in the existing server helpers test file instead of gaining another suite.
- Own claim: placing `#workbench` before the general boot wrapper makes only workbench creation use
  the workspace classification. Later boot faults retain the existing instrument-owned arming
  contract (`src/server/Probe.ts:213-226`).

## Verification

- `npm run lint:check`: exit 0.
- `npm run check`: exit 0.
- `npm run format:check`: exit 0 after `npm run format` exited 0.
- `rg -n "findRefusedPaths" src/core/`: no output, exit 1 as required for no match.
- `rg -n "could not write" guides/probe.md src/server/stages/RuntimeStage.ts`: the qualified guide
  clause appears at `guides/probe.md:287`; the class clause and runtime message appear at
  `src/server/stages/RuntimeStage.ts:72,423`.
- `npm run test:guides`: exit 0, 13 tests passed.
- Core helper/error scope: exit 0, 23 tests passed.
- Server helpers scope: exit 0, 29 tests passed.
- Runtime stage scope: exit 0, 35 tests passed.
- Type stage scope: exit 0, 18 tests passed.
- Selected lint stage scope: exit 0, 3 tests passed and 20 skipped; its missing-spawn proof also
  exited 0 with 1 passed and 22 skipped.
- ProbeServer post-teardown scope: exit 0, 1 passed and 7 skipped.
- Selected Probe scope: exit 0, 2 passed and 20 skipped. The separate R2 proof is recorded above.
- `npm run build`: exit 0.
- `git diff --check`: exit 0.
- `npm run test:src:server`: exit 1 after 121 passed and 17 failed. The 17 failures were
  spawned-child or stdin-sensitive timeouts and empty marker/stdin deliveries under the brief's
  stated child-stdio sandbox condition. Run this exact command on the host.
- `npx vitest run --config vite.config.ts --no-cache --project src:bin tests/src/bin/main.test.ts -t 'construction refusal'`:
  exit 1 with status 1 observed but no captured stderr. This spawn-driven proof needs the same host
  rerun; the in-sandbox symptom matches the stated child-stdio condition.

Actual `git status --short`:

```text
 M guides/probe.md
 M src/core/helpers.ts
 M src/core/validators.ts
 M src/server/Probe.ts
 M src/server/ProbeServer.ts
 M src/server/helpers.ts
 M src/server/stages/RuntimeStage.ts
 M src/server/types.ts
 M tests/src/bin/main.test.ts
 M tests/src/core/errors.test.ts
 M tests/src/core/helpers.test.ts
 M tests/src/server/Probe.test.ts
 M tests/src/server/ProbeServer.test.ts
 M tests/src/server/helpers.test.ts
 M tests/src/server/stages/LintStage.test.ts
 M tests/src/server/stages/RuntimeStage.test.ts
 M tests/src/server/stages/TypeStage.test.ts
```

Actual `git diff --stat`:

```text
 guides/probe.md                              | 46 +++++++++++----------
 src/core/helpers.ts                          | 48 +---------------------
 src/core/validators.ts                       |  3 +-
 src/server/Probe.ts                          | 30 +++++++++++---
 src/server/ProbeServer.ts                    |  2 +-
 src/server/helpers.ts                        | 47 ++++++++++++++++++++-
 src/server/stages/RuntimeStage.ts            | 15 ++++---
 src/server/types.ts                          |  1 +
 tests/src/bin/main.test.ts                   |  5 +--
 tests/src/core/errors.test.ts                |  8 ++--
 tests/src/core/helpers.test.ts               | 61 +---------------------------
 tests/src/server/Probe.test.ts               | 53 +++++++++++++++++++++++-
 tests/src/server/ProbeServer.test.ts         |  9 ++--
 tests/src/server/helpers.test.ts             | 61 +++++++++++++++++++++++++++-
 tests/src/server/stages/LintStage.test.ts    | 17 ++++----
 tests/src/server/stages/RuntimeStage.test.ts |  2 +-
 tests/src/server/stages/TypeStage.test.ts    |  4 +-
 17 files changed, 240 insertions(+), 172 deletions(-)
```
