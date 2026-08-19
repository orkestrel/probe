**Files written**

- [RuntimeStage.ts](/workspace/probe/src/server/stages/RuntimeStage.ts)
- [RuntimeStage.test.ts](/workspace/probe/tests/src/server/stages/RuntimeStage.test.ts)
- [Probe.test.ts](/workspace/probe/tests/src/server/Probe.test.ts)
- [main.test.ts](/workspace/probe/tests/src/bin/main.test.ts)

`git diff --stat`: 4 owned files, 292 insertions, 66 deletions.

**Validation**

- `npm run format:check`: exit 0; 140 files.
- `npm run lint:check`: exit 0.
- `npm run check`: exit 0.
- `npm run build`: exit 0.
- `npm test`: exit 1 at the known sandbox-only config test.
  - Source: 45 passed across 10 files.
  - Policy: 86 passed.
  - Config: 27 passed, 1 environmental failure.
  - No skipped or todo tests reported.
- `npm run test:src:bin`: 4 passed.
- No generated `*.probe-*` files remain.
- `git diff --check`: clean.

**Acceptance evidence**

The focused server command was:

```text
npx vitest run --config vite.config.ts --no-cache --reporter=verbose --project src:server tests/src/server/Probe.test.ts tests/src/server/stages/RuntimeStage.test.ts
```

Before repair it reported 4 failures: skipped execution, unmapped-path rejection, retained cache entries, and the combined receipt/path proof. After repair, each changed case passed; the comprehensive source run reported 45/45 passing.

The real built-entry proof failed before repair with `Unexpected token 'w', "worker-wit"... is not valid JSON`. After repair, `npm run test:src:bin` reported 4/4 passing with both newline and non-newline worker writes.

The 15-inspection retention curve was:

```text
before
run       1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
files     1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
ids       2  4  6  8 10 12 14 16 18 20 22 24 26 28 34
graph     3  4  5  6  7  8  9 10 11 12 13 14 15 16 17
results   1  2  3  4  5  6  7  8  9 10 11 12 13 14 15

after
run       1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
files     0  0  0  0  0  0  0  0  0  0  0  0  0  0  0
ids       0  0  0  0  0  0  0  0  0  0  0  0  0  0  0
graph     2  2  2  2  2  2  2  2  2  2  2  2  2  2  2
results   0  0  0  0  0  0  0  0  0  0  0  0  0  0  0
```

Run 15 contained 2 suites and 3 tests. Direct eviction retained the resident runner. Instrument wall time moved from 4.1 seconds to 4.8 seconds across 15 inspections.

**Deviation**

Expected: `npm test` exits 0.

Found: exit 1 in the off-limits [config.test.ts](/workspace/probe/tests/config.test.ts:615):

```text
Error: spawnSync /opt/node22/bin/node EPERM
```

This is the brief-declared bench sandbox failure. The implementation is done, but criterion 7 cannot be reported green in this sandbox. No off-limits file was changed.

**Decisions**

- Skipped, todo, and skipped-suite execution produces a finding: `Vitest ran no tests in the module`. It is not a refusal.
- Only the `passed` module state is clean. Failed, skipped, pending, queued, and unrecognized states produce findings.
- An admitted unmapped path returns a runtime finding instead of making `prove` reject.
- Worker stdout and stderr terminate in a consumed `PassThrough`, never the protocol stream.
- Per-inspection cleanup removes task IDs, file state, specifications, result-cache rows, Vite nodes, and graph edges. Runner recycling was unnecessary.
- The existing unmapped-path assertion moved from expecting a thrown error to expecting a finding because the input contract admits that path and a verdict must report it.