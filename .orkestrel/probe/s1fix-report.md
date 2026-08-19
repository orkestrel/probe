**Files written**

- [RuntimeStage.ts](/workspace/probe/src/server/stages/RuntimeStage.ts)
- [RuntimeStage.test.ts](/workspace/probe/tests/src/server/stages/RuntimeStage.test.ts)
- [main.test.ts](/workspace/probe/tests/src/bin/main.test.ts)

**Validation**

- `npm run format:check`: exit 0; 140 files.
- `npm run lint:check`: exit 0.
- `npm run check`: exit 0.
- `npm run build`: exit 0.
- Focused runtime tests: 11 passed.
- Bin tests: 5 passed.
- `npm test`: source 51 passed; policy 86 passed; config 27 passed and 1 brief-declared sandbox failure.
- `git diff --check`: clean.
- No generated files remain under `tmp/probe`.

**Acceptance evidence**

- Runtime `ctx.skip()` and empty-file regressions failed before repair. Static skips remained findings, and genuine passes remained clean.
- The runtime-skip check now blocks `computeReceipt`.
- Real Vite tests read `_unresolvedUrlToModuleMap` and `fileToModulesMap`; both return to their first-generation sizes after runner replacement.
- Disabling the 64-inspection replacement reddened exactly the retention test. Restoring it passed.
- Making cleanup throw reddened exactly the cleanup test with `EISDIR`. Restoring the finding path passed.
- Routing stderr back to the discard stream reddened exactly the worker-diagnostics test. Routing it to `process.stderr` passed.
- Adversarial stdout cases both assert real receipts.
- Generated bin specifications use `tmp/probe/bin`, which maps to the ungated `probe` project.
- Missing project inference and missing configured-project findings have distinct messages.

**Deviation**

Expected: `npm test` exits 0.

Found: exit 1 at the off-limits `tests/config.test.ts:615` case:

```text
Error: spawnSync /opt/node22/bin/node EPERM
```

This is the brief-declared sandbox failure. The implementation is complete, and no off-limits file changed.

**Decisions**

- Break 2 uses runner recycling while retaining unique revision paths. The audit measured one unresolved entry per inspection. The 65-inspection proof records two runner warmups, and direct map inspection confirms replacement resets both resident maps. A 64-inspection lifetime added about 1.15 s as reported, since corrected to 260-285 ms by measurementeconds across 65 measured inspections, roughly 18 ms amortized per inspection.
- Cleanup bookkeeping runs before eviction. Eviction and deletion failures return findings and cannot mask an inspection failure.
- Worker stdout remains drained through `PassThrough`; worker stderr reaches `process.stderr`.
- Unmapped paths remain caller findings. Missing configured projects name the absent project.
