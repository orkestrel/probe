**Files written**

- [tests/src/server/Probe.test.ts](/workspace/probe/tests/src/server/Probe.test.ts:247) now requires the `arm` event before testing the stalled lint inspection. The fixture still withholds diagnostics only for `/src/core/`.

**Validation**

- `npm run format:check`: exit 0, 140 files.
- `npm run lint:check`: exit 0.
- `npm run check`: exit 0.
- `npm run build`: exit 0.
- `npm run test:policy`: exit 0, 86 passed.
- `npm test`: exit 1, 55 passed and 2 failed. The named test failed before `arm`; the off-limits bin test failed because its boot directory was absent.
- `npm run test:config`: exit 1, 27 passed and the known `spawnSync ... EPERM` test failed.
- Named isolation run 1: exit 1, 11.64 seconds.
- Named isolation run 2: exit 1, 11.71 seconds.
- Named isolation run 3: exit 1, 11.69 seconds.

All 3 isolation runs rejected before `arm` with `The lint stage exceeded 6000 ms`.

**Acceptance evidence**

The prior test could pass on a boot lint timeout because boot and the intended stalled inspection use the same error message. The revised test first requires `arm`, then races the intended proof against the unchanged 7,000 ms discriminator and asserts `The lint stage exceeded 6000 ms`.

The fixture condition remains:

```ts
!message.params.textDocument.uri.includes('/src/core/')
```

Every other test in the full source run passed, including the other S2 regression tests.

**Deviation**

Criteria 1–3 could not pass in this sandbox. A Node process spawned by another Node process exits cleanly here without exchanging piped stdin or stdout. The fixture therefore cannot complete initialization, and the probe rejects during boot before the intended inspection is admitted.

No file under `src/server/stages/` was edited. All `tmp/scratch/` instruments were deleted.

**Decisions**

The green run and gate disagreed because the green run accepted a boot lint timeout as evidence for the stalled source, while the gate progressed beyond that false-positive path and reached the test’s premature fallback.

The proof now distinguishes boot from the intended inspection. The fixture safety exit was extended from 10,000 ms to 30,000 ms so it outlives boot plus the configured deadline; its protocol and withholding behavior did not change. The implementation and contract were not changed because the existing active-inspection bound fires with the specified message.