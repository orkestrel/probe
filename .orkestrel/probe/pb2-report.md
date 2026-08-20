## What changed and why

- Replaced both `import.meta.resolve` calls with `loadWorkspaceModule`, which uses `createRequire` against the target workspace. ESM and CommonJS consumers now load the same workspace-installed TypeScript and Vitest peers.
- Peer-resolution failures occur synchronously during stage construction instead of being hidden by stored promise rejection handlers.
- Added `enforceBuildLog` to every emitted target. It throws on `EMPTY_IMPORT_META` and forwards other build logs unchanged.
- Added resolver, construction-failure, and barrel-export tests.

## Files written

- [configs/helpers.ts](/workspace/probe/configs/helpers.ts)
- [vite.config.ts](/workspace/probe/vite.config.ts)
- [src/server/helpers.ts](/workspace/probe/src/server/helpers.ts)
- [RuntimeStage.ts](/workspace/probe/src/server/stages/RuntimeStage.ts)
- [TypeStage.ts](/workspace/probe/src/server/stages/TypeStage.ts)
- Four matching server test files.

`tests/distribution.test.ts` was not changed.

## Red-then-green proofs

- Initial build: exit 0 despite two `EMPTY_IMPORT_META` warnings.
- Initial `grep -c "{}\." dist/src/server/index.cjs`: `2`.
- Initial distribution project: exit 1, with 1 failed test and both the artifact and CommonJS consumer assertions failing.
- Final artifact count: `0`. `grep` exits 1 because it finds no matches.
- Final distribution project: exit 0, 2 tests passed. Its installed-tarball ESM and CommonJS consumers both returned verdicts.
- Changed server tests: exit 0, 49 tests passed.
- Missing TypeScript or Vitest peers now throw during stage construction.

## Build-gate control

A deliberate `import.meta.resolve('typescript')` reintroduction made `npm run build` exit 1 with `[orkestrel-build] [EMPTY_IMPORT_META]`. After removing the control, the build exited 0.

## Validation

- `npm run format:check`: exit 0
- `npm run lint:check`: exit 0
- `npm run check`: exit 0
- `npm run build`: exit 0
- `npm run test:policy`: exit 0, 86 tests passed
- `npm run test:distribution`: exit 0, 2 tests passed
- Scoped changed server tests: exit 0, 49 tests passed

## Deviation

`npm test` exits 1 on unrelated existing failures: 10 lint-stage timeouts, 1 probe timeout, and 1 bin boot-kill timing assertion. The isolated server project reproduced 11 of those failures. The config project also exits 1 because its child process receives `EPERM` spawning `/opt/node22/bin/node`. No off-scope files were changed.