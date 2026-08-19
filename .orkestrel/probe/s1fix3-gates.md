# Unit S1 fix round 3 — independent gate evidence

Run by a `verifier` independent of the writer, outside the bench sandbox.

| Command | Exit code | Result |
| ------- | --------- | ------ |
| `npm run format:check` | 0 | PASS — 140 files |
| `npm run lint:check` | 0 | PASS |
| `npm run check` | 0 | PASS — root, core, server, bin |
| `npm run build` | 0 | PASS — two non-fatal `EMPTY_IMPORT_META` warnings on the cjs output |
| `npm test` | 0 | PASS |

`test:src` 10 files / 55 tests, `policy` 86, `config` 28. Total 169, all passed. Skipped, todo, and
failed: 0.

## The discriminant reached every file that needs it

`grep -c origin` per source file: `types.ts` 6, `validators.ts` 7, `constants.ts` 2, `helpers.ts` 5,
`RuntimeStage.ts` 31, `TypeStage.ts` 3, `LintStage.ts` 4 — consistent with the 16 / 3 / 4 construction
sites the unit counted by reading. The typechecker is the completeness proof regardless: `origin` is
required, so a `Finding` built without it does not compile, and `npm run check` exits 0.

## No suppression, no assertion, no `any`

The suppression grep returns `NO SUPPRESSIONS FOUND`. The assertion grep returned nine matches and the
verifier triaged every one as a false positive — `import type * as`, prose comments, and the English
word "as" inside a string literal. None is a type assertion and none is `: any`.

Recording that triage rather than the raw count, because a nine-match grep result filed without reading
it looks exactly like nine violations.

## Tree state

14 modified files, no untracked. `tmp/probe/` empty, `tmp/scratch/` absent — the unit deleted its
instruments.

## The sandbox EPERM did not appear again

`tests/config.test.ts` passed 28/28 here, as it did for the previous two runs. Two units saw
`spawnSync EPERM` inside the bench sandbox and three subsequent runs have not. Treat it as intermittent.

## Failures

None.
