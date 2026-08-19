# Unit S1 fix round 2 — independent gate evidence

Run by a `verifier` independent of the writer, outside the bench sandbox, on the partial change.

| Command | Exit code | Result |
| ------- | --------- | ------ |
| `npm run format:check` | 0 | PASS |
| `npm run lint:check` | 0 | PASS |
| `npm run check` | 0 | PASS |
| `npm run build` | 0 | PASS |
| `npm test` | 0 | PASS |

`test:src` 10 files / 52 tests, `policy` 86, `config` 28. Total 166, all passed. Skipped, todo, and
failed: 0.

## The change is partial and consistent, not half-applied

`grep -rn "origin" src/core/types.ts src/core/validators.ts` returns `NO ORIGIN PROPERTY PRESENT`. The
unit stopped on the discriminant and left neither the type nor its guard carrying half of it, so the
tree is a coherent state to commit and to dispatch a successor from.

`git status --short --untracked-files=all` shows exactly the five modified files and nothing untracked.
`tmp/scratch/` does not exist — the unit deleted its instrument. `tmp/probe/` is empty.

Suppression grep over `src/` and `tests/`: `NO SUPPRESSIONS FOUND`.

## The sandbox EPERM is not deterministic

Two earlier units reported `tests/config.test.ts` failing with `spawnSync /opt/node22/bin/node EPERM`
inside the bench sandbox. The unit that produced this change reported that file PASSING 28/28 in the
same kind of sandbox, and it passes here.

The verifier recorded the honest limit rather than the convenient conclusion: one run cannot establish
determinism. Treat the failure as possible but not expected, and never as a reason to doubt a change
that did not touch that file.

## Failures

None.
