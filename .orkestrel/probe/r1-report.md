# Unit R1 — returned report

Transcribed at the same moment the code was committed. Baseline `8d0f055`, tree confirmed clean at start.

## What the overwrite changed

| Path | Change |
| ---- | ------ |
| `.claude/agents/orkestrel.md` | catalog table gained an `@orkestrel/process` row; the `@orkestrel/scaffold` row moved `0.0.42` → `0.0.43` |
| `guides/queue.md` | created — new vendored guide for `@orkestrel/queue` |
| `guides/test.md` | created — new vendored guide for `@orkestrel/test` |
| `package.json`, `package-lock.json` | the unit's own step-2 re-pin of `@orkestrel/scaffold` to `^0.0.43`; the overwrite touched no other range |

## Range verification

Fresh `npm view` reads against `package.json` after the overwrite:

```text
@orkestrel/contract  ^0.0.12   registry=0.0.12   unchanged
@orkestrel/emitter   ^0.0.7    registry=0.0.7    unchanged
@orkestrel/mcp       ^0.0.18   registry=0.0.18   unchanged
@orkestrel/queue     ^0.0.9    registry=0.0.9    unchanged
@orkestrel/timeout   ^0.0.7    registry=0.0.7    unchanged
@orkestrel/tool      ^0.0.11   registry=0.0.11   unchanged
@orkestrel/guide     ^0.0.12   registry=0.0.12   unchanged
@orkestrel/test      ^0.0.7    registry=0.0.7    unchanged
@orkestrel/scaffold  ^0.0.43   registry=0.0.43   moved by the step-2 re-pin
```

## Gates

| Gate | Exit code |
| ---- | --------- |
| `format:check` | 0 |
| `lint:check` | 0 |
| `check` | 0 |
| `build` | 0 — two pre-existing informational `EMPTY_IMPORT_META` warnings in `RuntimeStage.ts` and `TypeStage.ts`, no error |
| `test` | 0 |

## Counts

**198 passed, 0 skipped, 0 todo** (`test:src` 84, `test:policy` 86, `test:config` 28) — unchanged from
the baseline, which is the correct outcome for a repair that adds no behaviour.

## Anything re-run alone

None. Every suite passed on a single run; no re-run was needed.

## Deviation

None. `npx scaffold overwrite` refused on the first attempt because `package.json` and
`package-lock.json` were dirty from the unit's own step-2 re-pin — **which the brief's prescribed order
makes unavoidable**, since it requires re-pinning and installing before the overwrite so the overwrite
runs the current vendored host. It re-ran with `--dirty` after confirming the waived dirt was limited to
those two files.

`npx scaffold audit` reports **0 of 127 planned paths drifted**.

## Decisions

- Used `--dirty`, justified by the brief's own step order and confirmed scoped to the two files the
  re-pin owns before proceeding.
- Ran `format` alone in step 6, because `lint --fix` produced no changes.
- No file was hand-edited. Every change came from `npm install` or `scaffold overwrite`.

## Independently verified by the Orchestrator

```text
git diff --stat 8d0f055 -- src tests/src   (empty — nothing under src or tests/src moved)
npx scaffold audit                          0 of 127 planned paths drifted
package.json devDependency                  @orkestrel/scaffold ^0.0.43
format:check / lint:check / check           exit 0
```

`guides/README.md` is untouched, so its "Not created" row for `guides/probe.md` stands — which is
correct, because R1 was told not to create the guide and U4c still owes it.

## A note the brief did not anticipate

The overwrite vendored `guides/queue.md` and `guides/test.md`. Both are guides for packages probe already
declares, so their arrival is the generator catching up rather than a new obligation. `guides/test.md` is
worth reading before unit T2, which adopts more of `@orkestrel/test`.
