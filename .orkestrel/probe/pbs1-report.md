# PB-S1 report

## Files changed

- `src/server/factories.ts` — deleted the pass-through `createProbe` and `createProbeServer` factories.
- `src/server/index.ts` — removed the deleted factory module from the server barrel.
- `src/server/types.ts` — removed `TypeStageInterface.candidates`, documented that a coordinator mints `Inspection`, and changed the server example to construct `ProbeServer` directly.
- `src/server/stages/TypeStage.ts` — removed the `candidates` getter and the redundant teardown clear.
- `src/bin/main.ts` — constructs `ProbeServer` directly.
- `tests/src/server/stages/TypeStage.test.ts` — removed the getter assertions, retained the consumer-facing release proofs, and replaced the teardown assertion with the destroyed-stage refusal.
- `tests/src/server/ProbeServer.test.ts` — constructs `ProbeServer` directly.
- `tests/src/bin/main.test.ts` — expects the direct `ProbeServer` construction in the entry.
- `tests/distribution.test.ts` — drives the published `Probe` class directly under ESM and CommonJS.
- `guides/probe.md` — removed the server factories section, moved the construction behavior into the engine rows, removed the `candidates` contract text, and changed the flagship fence to construct `Probe` directly.
- `README.md` — changed the in-process example to construct `Probe` directly.

## `#overlay.clear()` ruling

Delete `this.#overlay.clear()` from `TypeStage.#destroy`. The teardown line is unreachable with a populated overlay.

The unchanged focused suite passed with the line present: `npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/TypeStage.test.ts` exited 0 with 1 test file and 17 tests passed. With the line removed and a temporary teardown assertion that threw when `this.#overlay.paths` was non-empty, the same command exited 0 with 1 test file and 17 tests passed.

The rejected-warm trace used `npx vitest run --config vite.config.ts --project probe tmp/probe/type-stage-warm-rejection.test.ts`. It exited 0 with 1 test file and 1 test passed. `inspect` rejected at `await this.#typescript`; execution never reached the later `new Overlay()` assignment or any `#record` call. Teardown therefore retained the empty overlay created with the stage, and the temporary `paths` assertion stayed clean. The temporary probe and assertion were removed.

## Acceptance evidence

| Command | Exit | Counts and result |
| --- | ---: | --- |
| `rg -n 'createProbe\|createProbeServer' src/ tests/ guides/ README.md` | 1 | 0 matches; the no-match exit is expected. |
| `test ! -e src/server/factories.ts` | 0 | The deleted module is absent. |
| `rg -n 'candidates' src/server/ tests/src/server/` | 0 | 0 removed-member hits. The 17 remaining matches are `Overlay` storage, runtime locals, test names, and prose unrelated to a `TypeStage` member. |
| `npm run lint:check` | 0 | 0 diagnostics. |
| `npm run check` | 0 | 0 diagnostics across the root, `src:core`, `src:server`, and `src:bin` checks. |
| `npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/TypeStage.test.ts` | 0 | 1 test file passed; 17 tests passed. |
| `npx vitest run --config vite.config.ts --project src:bin` | 0 | 1 test file passed; 8 tests passed. |
| `npx vitest run --config vite.config.ts --project guides` | 0 | 1 test file passed; 12 tests passed. `tmp/probe` was absent before the run. |

## Observations and open items

`npx vitest run --config vite.config.ts --project src:server` exited 1 with 7 test files: 4 passed and 3 failed. It ran 128 tests: 112 passed and 16 failed. The failures were 10 `LintStage` tests, 4 `Probe` tests, and 2 `ProbeServer` tests. They match the brief's sandbox limits on nested child processes and process input delivery; the focused `TypeStage` acceptance project passed.

No `test:distribution` observation was taken. A valid reading requires a fresh build, while the brief forbids `npm run build`; the nested install can also be denied in this sandbox. Distribution was not an acceptance criterion.

No acceptance criterion remains open.