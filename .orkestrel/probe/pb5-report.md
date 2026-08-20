Work complete. Report follows.

## Per numbered row

**P6 — a type or lint expiry destroys the stage and never replaces it.** `Probe` now recycles every stage. `#type` and `#lint` became mutable, `#runRuntime` was folded into `#inspectStage(stage, operation, claim)`, and `#recycle(stage: StageInterface)` bounds the teardown and reinstalls a replacement chosen by field identity. `expire` now fires for any stage's expiry, not only the runtime's.

The type stage could not expire at all before this change: `TypeStage.inspect` awaits one already-resolved promise and then runs to completion synchronously, so its continuation is a microtask that always beats the coordinator's timer. Measured with a probe (`/workspace/probe/tmp/probe/yield.test.ts`, since deleted): a 1,881 ms inspection during which a `setTimeout(…, 0)` never fired. Worse, the block starved the siblings — the first red run of the type test rejected with `The lint stage exceeded 6000 ms` after 40 s, blaming a stage that had answered nothing wrong. `TypeStage.inspect` now yields through `#unblock()` (a `node:timers/promises` `setImmediate` plus a destroyed-check) after each candidate check, which bounds the loop hold to one candidate, makes the deadline reachable, and stops an abandoned inspection from building a language service the stage would own past its own teardown.

**P7 — `LintStage.destroy()` never settles.** `#destroy` now calls `#release(child, released)`, which bounds the whole ending conversation at 2,000 ms with `createTimeout` and sends `SIGKILL` on expiry, then awaits the child's own `exit`. The bound covers `shutdown` and `exit` together, because a server that answers neither hangs in the same place. `SIGKILL` cannot be handled, so the child dies and the wait settles. The `Promise.race([probe.destroy(), waitForDelay(5_000)])` hedge is deleted (it had moved to `tests/src/server/Probe.test.ts:447` after PB4).

**P15 — arming failure is permanent and misreported.** `#arm` now wraps `#boot` and rethrows as `The probe could not arm: <cause>` with `cause` attached, so a boot-origin failure is distinguishable from a claim's own stage failure carrying the identical text. `prove` awaits `#ready()`, which starts **one** replacement boot per call for an attempt it saw fail and joins a concurrent caller's replacement instead of starting a second.

**P16 — shutdown and orphans.** `RuntimeStage` sweeps at warm (synchronously, so it completes during construction) and `#snapshot` and `#sweep` now share one `*#walk()` generator. **The entry-shutdown half is not implemented — see Deviation.**

## The P15 ruling and why

**`prove` re-arms.** The same argument that makes P6 a release blocker makes a terminal boot wrong: the failure that ends arming is usually the workspace's, not the probe's — a stage that outran the deadline, a Vitest project that did not exist yet — and a resident MCP server must not require a restart to notice the repair. The cost is bounded because the re-arm is one attempt per `prove` call, not a loop: a workspace that still cannot arm pays one boot and reports it. The message names arming either way, so the diagnostic half of the row closes independently of the recovery half. Proven by `names arming in a boot expiry and arms again for the next claim`, where the third call arms (`armings.count` 1) and serves a verdict after the obstruction is removed.

## Files written

- `/workspace/probe/src/server/Probe.ts` — generalized recycle over all three stages, `expire` for any stage, `#ready` re-arm, `#arm`/`#boot` split with the arming-named failure.
- `/workspace/probe/src/server/stages/LintStage.ts` — bounded teardown with `SIGKILL` on expiry.
- `/workspace/probe/src/server/stages/TypeStage.ts` — cooperative yield and refusal between candidate checks.
- `/workspace/probe/src/server/stages/RuntimeStage.ts` — warm sweep of dead hosts' specifications, process-owned revision identity, shared `#walk` generator, unreadable directory skipped.
- `/workspace/probe/tests/src/server/Probe.test.ts` — type and lint recycle arms, the arming test, one shared stalling fixture replacing an inline duplicate, hedge deleted.
- `/workspace/probe/tests/src/server/stages/LintStage.test.ts` — `ignored-exit` fixture marker and the teardown proof.
- `/workspace/probe/tests/src/server/stages/RuntimeStage.test.ts` — the orphan sweep proof with three controls.

Diffstat: 7 files, 523 insertions, 73 deletions.

## Red-then-green proofs

Command prefix in every row: `npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:server`.

| Row | Test and command suffix | Red | Green |
| --- | --- | --- | --- |
| P7 | `tests/src/server/stages/LintStage.test.ts -t 'answers shutdown and ignores exit'` | 1 failed \| 20 skipped, exit 1, `Test timed out in 20000ms` | 1 passed \| 20 skipped, exit 0 |
| P6 type | `tests/src/server/Probe.test.ts -t 'replaces a type stage its deadline destroyed'` | 1 failed \| 16 skipped, exit 1, `expected … 'The type stage exceeded 6000 ms' but got 'The lint stage exceeded 6000 ms'` (40.7 s) | 1 passed \| 16 skipped, exit 0 (12.6 s) |
| P6 lint | `tests/src/server/Probe.test.ts -t 'replaces a lint stage its deadline destroyed'` | 1 failed \| 15 skipped, exit 1, `Error: The lint stage has been destroyed` | 1 passed \| 16 skipped, exit 0 |
| P6 runtime | `tests/src/server/Probe.test.ts -t 'expires only the active inspection'` | 1 failed \| 17 skipped, exit 1 with `#recycle`'s replacement reverted | 1 passed \| 16 skipped, exit 0 |
| P15 | `tests/src/server/Probe.test.ts -t 'names arming in a boot expiry'` | 1 failed \| 17 skipped, exit 1, `expected … 'The probe could not arm: The lint stage exceeded 6000 ms' but got 'The lint stage exceeded 6000 ms'` | 1 passed \| 17 skipped, exit 0 |
| P16 sweep | `tests/src/server/stages/RuntimeStage.test.ts -t 'removes the specifications a dead host left behind'` | 1 failed \| 26 skipped, exit 1, `expected true to be false` (with `#sweep()` removed) | 1 passed \| 26 skipped, exit 0 |

The runtime arm's red is a deliberate revert control, because `#recycle` already replaced the runtime stage before this unit. Reverting the replacement (`#recycle` returning `false`) reddened all three arms in one run — `-t 'deadline destroyed'` gave 2 failed \| 16 skipped, exit 1 — and the source was restored from a saved copy before the green re-run.

## Validation

| Command | Bare exit code |
| --- | --- |
| `npm run format:check` | 0 |
| `npm run lint:check` | 0 |
| `npm run check` | 0 |
| `npm run build` (observation) | 0 |
| `npm test` (observation) | 0 — src 126/126 across 11 files, policy 86/86, config 28/28 |
| `npm run test:src:server` (observation) | 0 — 105/105 across 7 files |

`npm test` and `npm run test:src:server` are the executor's own readings under its own load; the authoritative run belongs to an independent verifier.

## What I could not run

Nothing was blocked by the host. Nested child creation worked, so every proof named in the brief was taken as a measurement, including the process-liveness control in the sweep test, which spawns a real child and reads its exited pid rather than assuming one.

## Deviation

**P16's entry-shutdown half is not implemented. It needs files I do not own, and the brief's deviation contract names that as a stop condition.**

Expected: `src/bin/main.ts` installs `SIGINT` and `SIGTERM` handlers that await `probe.destroy()`.

Found: the entry cannot hold the probe reference. Any module-scope binding in `src/bin/main.ts` fails the policy gate, and both binding forms are refused — a value initializer trips the `data` rule, a function initializer trips the `function` rule. Measured:

```
$ cat src/bin/main.ts
import { createProbe, createProbeServer } from '@src/server'

const probe = createProbe()
createProbeServer(probe).start()

$ npm run test:policy
+ [ { "line": 3, "message": "module data sits in a data-kind file",
+     "path": "src/bin/main.ts", "rule": "data" } ]
 Test Files  1 failed (1)
      Tests  1 failed | 85 passed (86)
EXIT 1
```

`.claude/rules/architecture.md` states the same rule in prose: a runtime entry "declares no module-scope constant and no module-scope function: it imports what it needs and runs." `tests/setupPolicy.ts` is a vendored file and `tests/policy.test.ts` is a root cross-cutting proof, so neither is mine to change, and neither should change — the rule is sound.

Done: P6 (all three stages), P7 (including the hedge), P15, and P16's orphan sweep with its construction proof. Not done: the entry shutdown, and therefore acceptance criteria 5's first clause and criterion 6. `tests/src/bin/main.test.ts` is unchanged and still pins the leak, which is correct while the defect stands.

Hypothesis for the resolution: the mechanism has to be reachable by import, which means `createProbeServer` accepting the signals the caller names — `createProbeServer(createProbe(), { signals: ['SIGINT', 'SIGTERM'] }).start()` — with the caller deciding whether any signal is taken and the library owning only the wiring. That needs `ProbeServerOptions` in `src/server/types.ts`, a start/stop handle in `src/server/factories.ts` whose no-nested-function shape is a `ProbeServer` class in a new `src/server/ProbeServer.ts`, plus `src/bin/main.ts` and `tests/src/bin/main.test.ts`. That is a new published capability and a new file, so it is a successor brief rather than an in-flight repair, and I have written none of it.

## Shared-file patch (report-only)

`src/core/types.ts` is off-limits and now carries three stale claims, because `expire` fires for every stage rather than the runtime alone. Exact patch:

```diff
@@ ProbeEventMap @@
- * arriving before it awaits that step rather than starting a second one. `expire` fires when the
- * coordinator's own deadline killed a worker, which is the only way a synchronous infinite loop is
- * ever reported.
+ * arriving before it awaits that step rather than starting a second one. `expire` fires when the
+ * coordinator's own deadline destroyed a stage and a replacement took its place, which is the only
+ * way a synchronous infinite loop is ever reported.
@@ ProbeEventMap member @@
-	/** The coordinator's runtime deadline fired and its worker was recycled before this event. */
+	/** The coordinator's deadline fired at one stage and that stage was replaced before this event. */
 	readonly expire: readonly [claim: Claim]
@@ ProbeOptions member @@
-	/** Milliseconds one active stage inspection may take; an expired runtime worker is recycled. */
+	/** Milliseconds one active stage inspection may take; an expired stage is replaced. */
 	readonly deadline?: number
```

No guide patch: `guides/` holds vendored dependency guides only, and no probe guide exists.

## Decisions

1. **The teardown bound is 2,000 ms**, read back from `timeout.ms` in the message so the value has one home. It sits well inside the 5,000 ms every existing teardown assertion allows.
2. **`expire` fires for every stage.** A consumer watching for "this claim died on the deadline" gets the same event whichever stage died; the claim, not the stage, is what the event carries. This is what makes the core TSDoc patch necessary.
3. **The sweep reads ownership, not the marker.** The first implementation matched `.probe-<uuid>` alone and deleted a live neighbour's specification mid-run: `npm run test:src:server` went red with `Cannot find module …/probe-skipped.test.probe-<uuid>.ts`, 1 failed \| 104 passed. Several hosts share one workspace routinely — this package's own suite does — so the revision is now `${process.pid}-${randomUUID()}` and the sweep deletes only files whose writing process is gone, reading `EPERM` and a non-positive identity as alive. The generated specification filename shape changed accordingly.
4. **Arming dependency files are not swept.** `tmp/probe/arm-*.ts` still leaks from a killed host. Only the generated specifications match the workbench glob, so only they fail a consumer's gates; sweeping the arming files would need the same ownership scheme and belongs with the entry-shutdown successor.
5. **The heavy type candidate is volume, not one giant file.** Thirty candidates of about a second each put roughly 38 s of compiler work behind a 6 s deadline, so the expiry is observed one candidate after the budget on any host, and the test costs about 12 s rather than the whole 38 s.
6. **One stalling lint fixture replaced two.** `Probe.test.ts` had an inline near-duplicate of its own fixture server; the shared `STALLING` const silences by marker file (whole boot) or by text marker (one candidate).
7. **`#walk` skips an unreadable directory** rather than raising. My change made the walk run at construction, so one unreadable directory in a consumer's tree would otherwise refuse the workspace.

`.orkestrel/probe/pb6-amendment.md` shows as modified and `pb7-brief.md`, `pb8-brief.md`, and `prune-disposition.md` as untracked. I did not touch `.orkestrel/`; those appeared during this unit's run.