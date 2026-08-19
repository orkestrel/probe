# Unit S1 — independent gate evidence

Run by a `verifier` independent of the writer, outside the bench sandbox, on S1's post-change tree at
baseline 938eb04.

## Gates

| Command | Exit code | Result |
| ------- | --------- | ------ |
| `npm run format:check` | 0 | PASS |
| `npm run lint:check` | 0 | PASS |
| `npm run check` | 0 | PASS |
| `npm run build` | 0 | PASS |
| `npm test` | 0 | PASS |

## Test counts

- `src` (`src:core`, `src:server`, `src:bin`): 10 files, 45 tests, all passed.
- `policy`: 1 file, 86 tests, all passed.
- `config`: 1 file, 28 tests, all passed.
- Total: 12 files, 159 tests. Skipped, todo, and failed: 0.

## The unit's deviation was sandbox-only

S1 reported `npm test` exit 1 at `tests/config.test.ts` with `spawnSync /opt/node22/bin/node EPERM`,
an off-limits vendored file it did not change. That project passes 28/28 here, where nested process
spawns are permitted. The deviation was the bench sandbox, not the change.

## Evidence commands

`git status --short` — exactly the four owned files, nothing stray:

```text
 M src/server/stages/RuntimeStage.ts
 M tests/src/bin/main.test.ts
 M tests/src/server/Probe.test.ts
 M tests/src/server/stages/RuntimeStage.test.ts
```

`ls -1 tmp/probe/` — 0 entries. No name containing `.probe-` and none starting with `arm-`, so no
generated specification or arming file survived the run.

Suppression grep over `src/` and `tests/` for `oxlint-disable`, `eslint-disable`, `@ts-ignore`,
`@ts-expect-error`, and `@ts-nocheck` — `NO SUPPRESSIONS FOUND`.

## Failures

None.
