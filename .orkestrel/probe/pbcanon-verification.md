# PBCANON and PBRESTORE — independent gate evidence

`verifier`, Sonnet, dispatched after PBRESTORE exited. Read-only apart from the gate commands, with
every working-tree-discarding git command prohibited by name.

| Gate                       | Exit |
| -------------------------- | ---- |
| `npm run format:check`     | 0    |
| `npm run lint:check`       | 0    |
| `npm run check`            | 0    |
| `npm run build`            | 0    |
| `npm test`                 | 0    |
| `npm run test:distribution`| 0    |
| `npx scaffold audit`       | 0    |

`scaffold audit`: 0 of 127 planned paths drifted; bytes compared at 112, existence at 4, nothing at 11.

Test counts as the runner printed them:

- `test:src` (`src:core`, `src:server`, `src:bin`): 11 files, 148 tests
- `test:policy`: 1 file, 86 tests
- `test:config`: 1 file, 28 tests
- `test:guides`: 1 file, 11 tests
- `test:distribution`: 1 file, 2 tests

Read-only checks:

- `grep -c "throw new Error(" src/server/helpers.ts` reports 0; `grep -n "ProbeError"` reports the
  import and six throws.
- `grep -rn "throw new Error(" src/` reports no match anywhere in the source tree.
- Both barrels contain only `export * from './module.js'` rows.

No re-runs were required.
