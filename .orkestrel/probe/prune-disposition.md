# Disposition of every probe row no unit carries

`pd-a-carry-check.md` found 56 open items and 40 with no carrier. Units PB5 through PB8 take 24 of
them. This file rules on the rest, so `.orkestrel/probe/` can be pruned without destroying an open
item. `.agents/orchestration.md` § Before you prune, check 1: every item ends with a commit that
closed it, a live brief that owns it, or an explicit drop on the record. This is that record.

Row numbers are `pd-a-carry-check.md`'s.

## Carried into a live brief

| Row | Subject | Brief |
| --- | ------- | ----- |
| 5, 6, 7, 8 | Stage expiry, destroy hang, arming failure, shutdown handlers | PB5 |
| 9, 10, 11, 12, 13, 14, 15, 16 | Receipt-earning claim, guide, README, metadata, barrel and TSDoc truth, `PROBE.md` | PB6 |
| 21, 23, 33, 34, 35, 36, 38, 40, 44, 46 | Statements that describe behaviour the code does not have | PB7 |
| 24, 32, 37, 39 | Four contract rulings recorded and never taken | PB8 |
| 42 | Stack remapping compares paths by exact string, so a non-realpath workspace leaks `probe-<uuid>` into `Finding.path` | PB7, added by amendment |

## Dropped, with the reason

Each of these is real. None is in this campaign's exit criterion, and
`.claude/rules/quality.md` § Evidence before change forbids reopening a fixed matrix: a finding outside
it is recorded against the row that owns it, for the next matrix.

| Row | Subject | Why it drops here |
| --- | ------- | ----------------- |
| 17 | `plan.md` still sequences `O9-U3`; no brief exists and none names it | The plan is a campaign artifact and dies with the folder. A unit nothing specifies is not work; it is a placeholder. |
| 19 | The coordinator deadline does not bound synchronous stage work — a measured 1783 ms stall on a caller-named tree-wide project | Graded MEDIUM. `plan.md:179` excludes surviving medium findings from campaign close, and `p4-receipt-ruling.md:277` already refused bounding it as P4's defence. |
| 20 | A missing test directory or a write failure rejects `prove` as a bare `Error` rather than an `origin: 'instrument'` finding | Graded MEDIUM, same exclusion. |
| 22 | An unrelated `Control` — independent `files` and `test` — still earns a receipt | `pb4-brief.md:60` states it needs its own design pass and refuses to fold it in. A design round is a new scope. |
| 25 | A failed re-warm after the 64-specification bound may leave the runtime stage permanently rejected | UNPROVEN. Closing it needs the 65-inspection probe, which no unit runs. |
| 27 | A candidate shadowing an existing on-disk file was never probed for type-versus-runtime disagreement | UNPROVEN, and `u3-orchestrator-findings.md:349` names it the dangerous false green. It needs a probe this campaign does not run. |
| 28 | The end-to-end forgery pair, `resolve` latency, and digest stability across TypeScript 6.x patches were not re-measured | PB4 implemented the mechanism and did not re-take these measurements. They are measurements, not defects. |
| 30 | T2's `resolveRoot` through `tests/setup.ts` plus `requireValue` is unshipped | Test-helper debt recorded in `testhelper-synthesis.md:143`. |
| 31 | `createTeardown` at 29 `finally` blocks | `testhelper-synthesis.md:105` deferred it explicitly: "do not do this now". |
| 41 | The generated specification's `import.meta.url` carries the revision suffix | Routed to a successor at `o9-u2-audit-reconciliation.md:96` and never scheduled. |
| 43 | `experimental.fsModuleCache` could serve a disk-derived transform for a covered path | Recorded as an open question rather than a finding. It needs a probe to become either. |
| 45 | A language server that accepts stdin and never answers `initialize` deadlocks `destroy()` | Marked `[OUT_OF_SCOPE]` at `s3-audit-lens-verdicts.md:38`, and distinct from P7, which is shutdown-then-ignore-`exit`. PB5 bounds the shutdown door, not this one. |
| 47 | `ProcessInterface.bytes` and `write` were ruled and briefed to a writer that never ran | A `@orkestrel/process` change, not a probe change. |
| 48 | Opus's bare-`\r` change to `lines` was recorded as a successor and never scheduled | A `@orkestrel/process` change, not a probe change. |

## Needs the user

| Row | Subject |
| --- | ------- |
| 18 | `createProbeServer(probe).stop()` never returns, because the stdin `data` listener stays attached. The fix site is `@orkestrel/mcp`, not this package. It is graded a release blocker, and closing it means bumping `mcp` and adding a probe test that `stop()` leaves `process.stdin.listenerCount('data') === 0`. |
| 29 | `.gitignore` covering `tmp` makes the `tmp/probe` arming and lint path a permanent false green, and any fix turns `#arm()` red. `plan.md:387` already rules this a product decision belonging to the user. |

## What this file owes the prune commit

Every row above must appear in the prune commit's message or in a durable artifact before
`.orkestrel/probe/` is deleted. The dropped rows go to `ROADMAP.md` in the orchestrator repository,
grouped under probe. The two user rows are surfaced to the user before the prune, not after.
