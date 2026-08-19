# Unit S1 fix round — independent gate evidence

Run by a `verifier` independent of the writer, outside the bench sandbox, on the post-fix tree at
baseline `f9810f9`.

## Gates

| Command | Exit code | Result |
| ------- | --------- | ------ |
| `npm run format:check` | 0 | PASS — 140 files |
| `npm run lint:check` | 0 | PASS — no oxlint output |
| `npm run check` | 0 | PASS — root, core, server, and bin projects all typecheck |
| `npm run build` | 0 | PASS — core, server, bin all built; server emitted two non-fatal `EMPTY_IMPORT_META` rolldown warnings |
| `npm test` | 0 | PASS |

## Test counts

- `src:core` + `src:server` + `src:bin`: 10 files, 51 tests, all passed.
- `policy`: 1 file, 86 tests, all passed.
- `config`: 1 file, 28 tests, all passed.
- Total: 12 files, 165 tests. Skipped, todo, and failed: 0.

The unit reported `npm test` exit 1 at `tests/config.test.ts` with `spawnSync /opt/node22/bin/node
EPERM`. That file is off-limits to it and it did not change it. The project runs to completion here,
where nested spawns are permitted, so the deviation was the bench sandbox rather than the change.

## Evidence commands

`git status --short` — exactly the three owned files, nothing untracked:

```text
 M src/server/stages/RuntimeStage.ts
 M tests/src/bin/main.test.ts
 M tests/src/server/stages/RuntimeStage.test.ts
```

`ls -1a tmp/probe/` — 2 entries (`.` and `..`), so the directory is empty. No name contains `.probe-`
and none starts with `arm-`. `tmp/probe/bin/` does not exist, which is consistent with the unit's claim
that generated bin specifications are created there and removed: nothing survived the run.

Suppression grep over `src/` and `tests/` — `NO SUPPRESSIONS FOUND`.

Stray-instrument check at the repository root — `NO STRAY INSTRUMENT FILES AT ROOT`. The
`runtime-warms.txt` and `retention.jsonl` observed mid-run were deleted by the unit before it returned.

## Failures

None.
