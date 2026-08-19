**Files written**

- `src/server/Probe.ts`
- `src/core/types.ts`
- `tests/src/server/Probe.test.ts`

Baseline `abec122`; the diff contains only owned files: 248 insertions and 63 deletions across 3 files.

**Validation**

- Focused red baseline: 3 failed, 5 filtered; overlap, duplicate arming error, and post-destroy error cases failed.
- Stalled-lint red baseline: 1 failed, 7 filtered.
- Focused green: 8 passed.
- Server project: 6 files, 39 tests passed.
- `npm run format:check`: exit 0; 140 files checked.
- `npm run lint:check`: exit 0.
- `npm run check`: exit 0.
- `npm run build`: exit 0.
- `npm test`: source 57 passed; policy 86 passed; config 27 passed and 1 environmental failure. No suite reported skipped or todo tests.

**Acceptance evidence**

- Per-stage admission queues start deadlines after queue admission.
- Runtime expiry recycles only the active worker before releasing queued work.
- An ordinary claim queued behind an infinite loop completes with a receipt.
- A protocol-faithful lint server that withholds diagnostics causes `prove` to reject at 6,000 ms.
- Boot refusal errors include rendered stage findings.
- Arming, ordinary stage failure, expiry, and post-destroy rejection each emit exactly one `error`.
- `expire` fires only after the replacement runtime worker is installed.
- Expiry cleanup checks only the uniquely named revision created by its test.
- Existing server tests retain exit-code, cleanup, destruction, elapsed-time, and recovery coverage.

**Deviation**

Expected `npm test` to exit 0. It exited 1 because the off-limits vendored configuration proof could not spawn Node:

```text
FAIL |config| tests/config.test.ts > policy plugin > loads every configured policy rule through the real binary
Error: spawnSync /opt/node22/bin/node EPERM
tests/config.test.ts:615:23
```

The implementation is done. Full acceptance remains blocked only by this sandbox failure.

**Decisions**

- `deadline` bounds active execution, not queue wait. Work ahead carries its own inspection and recovery bounds.
- Type and lint expiry starts stage destruction without extending the caller’s deadline.
- `prove` owns `error` emission. The observation channel remains available after stage destruction so a later rejected proof can emit once.
- The expiry test changed from sequential recovery to two overlapping calls because concurrency is the defect’s reachable path.
- The generic whole-directory cleanup assertion changed to the unique `after-destroy.test.probe-` prefix because sibling projects share `tmp/probe/`.