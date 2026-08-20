| # | Item, stated as the falsifiable claim it makes | Source file:line | Carrier | Evidence |
| --- | --- | --- | --- | --- |
| 1 | `Claim.project` mints a receipt the workspace's own project refuses; the token records toolchain but not project | `readiness-grade.md:43` | LIVE BRIEF `pb4-brief.md` | Phrase: "Row P4 of `.orkestrel/probe/readiness-grade.md`, a release blocker" |
| 2 | Documented six-field receipt `@example` blocks (and `Verdict.id` `'01J8Z0'`) do not match the ruled seven-field token | `p4-receipt-ruling.md:271` | LIVE BRIEF `pb4-brief.md` | Phrase: "P12's stale examples. Three `@example` blocks embed the six-field token" |
| 3 | `TypeStage` publishes `candidates` and a two-parameter `inspect` that `src/server/types.ts` does not declare | `readiness-grade.md:58` | LIVE BRIEF `pb4-brief.md` | Phrase: "P19 closes with it." |
| 4 | `TypeStage` infers the project from the declared spelling, so two spellings of one file mint two receipts / two findings | `readiness-grade.md:57` | LIVE BRIEF `pb4-brief.md` | Phrase: "P18 becomes load-bearing." |
| 5 | A type or lint deadline expiry destroys the stage and never replaces it, so later proofs reject with `The lint stage has been destroyed` | `readiness-grade.md:45` | LIVE BRIEF `pb5-brief.md` | Phrase: "P6 — a type or lint expiry destroys the stage and never replaces it" |
| 6 | `LintStage.destroy()` never settles against a server that answers `shutdown` and ignores `exit` | `readiness-grade.md:46` | LIVE BRIEF `pb5-brief.md` | Phrase: "P7 — `LintStage.destroy()` never settles" |
| 7 | A boot-origin failure is permanent and reports a stage-timeout message that does not name arming | `readiness-grade.md:54` | LIVE BRIEF `pb5-brief.md` | Phrase: "P15 — arming failure is permanent and misreported" |
| 8 | The shipped entry installs no `SIGINT`/`SIGTERM` handlers; killed hosts leave `*.probe-*` orphans that break consumer gates | `readiness-grade.md:55` | LIVE BRIEF `pb5-brief.md` | Phrase: "P16 — the shipped entry has no shutdown, and orphans break the consumer's gates"; `git log -S'SIGTERM' -- src/bin/main.ts` is empty |
| 9 | No documented claim, run verbatim, returns a `Verdict` with a defined `receipt` | `readiness-grade.md:48` | LIVE BRIEF `pb6-brief.md` | Phrase: "P9 — no documented claim can earn a receipt (BLOCKER)" |
| 10 | Flagship `Claim` `@example` binds a control byte-identical to the case, so it can never earn a receipt | `criterion-3-verification.md:24` | LIVE BRIEF `d1-brief.md`; also `pb6-brief.md` | `d1-brief.md`: "Close rows 9 and 10 of `.orkestrel/probe/criterion-3-verification.md`"; `pb6-brief.md`: "P13 — two doc-truth defects" |
| 11 | `CLAIM_SHAPE` `@remarks` says the tool admits with `compileGuard(CLAIM_SHAPE)` while the server admits with `isClaim` | `criterion-3-verification.md:25` | LIVE BRIEF `d1-brief.md`; also `pb6-brief.md` | Same phrases as row 10 |
| 12 | No `guides/probe.md`, no consumer README/registry metadata, no `tests/guides.test.ts` | `readiness-grade.md:50` | LIVE BRIEF `pb6-brief.md` | Phrase: "P11 — the guide, the README, and the registry metadata" |
| 13 | `Overlay` is barrelled with no consumer seam and no `INTERNAL` list | `readiness-grade.md:59` | LIVE BRIEF `pb6-brief.md` | Phrase: "P20, P21, P22 — barrel and TSDoc truth" / "`Overlay` is barrelled with no consumer seam" |
| 14 | Eleven of twelve barrelled server helpers carry no `@example` | `readiness-grade.md:60` | LIVE BRIEF `pb6-brief.md` | Phrase: "Eleven of twelve barrelled server helpers carry no `@example`" |
| 15 | Revision-file cleanup comment claims a glob match that does not exist | `readiness-grade.md:61` | LIVE BRIEF `pb6-brief.md` | Phrase: "The revision-file cleanup comment claims a glob match that does not exist" |
| 16 | `PROBE.md` must describe what shipped (criterion 6), including every measurement and withdrawn claim on the work list | `plan.md:465`; `probe-md-worklist.md:8` | LIVE BRIEF `pb6-brief.md` | `probe-md-ruling.md:50`: "PB6 owns the migration"; `pb6-brief.md`: "`PROBE.md` is dissolved into your work" |
| 17 | Plan still sequences `O9-U3` after D1; no `o9-u3-brief.md` exists and no live brief names it | `plan.md:469` | NO CARRIER | Glob of `.orkestrel/probe/` has `o9-u1-brief.md` / `o9-u2-brief.md` / `o9-u2fix-brief.md`, not `o9-u3`; live briefs are only `pb4`/`pb5`/`pb6`/`d1` |
| 18 | `createProbeServer(probe).stop()` never returns; stdin `data` listener stays attached (fix site `@orkestrel/mcp`) | `readiness-grade.md:47` | NO CARRIER | Blocker P8; `pb5-brief.md` does not name `createProbeServer` or P8 |
| 19 | Coordinator deadline does not bound synchronous stage work (measured stall 1783 ms on a caller-named tree-wide project) | `readiness-grade.md:53` | NO CARRIER | Grade: REPAIR. Plan reading: `plan.md:179` excludes surviving medium findings from campaign close. `p4-receipt-ruling.md:277` records bounding against P14 and refuses it as P4's defence. No live brief owns the repair |
| 20 | Missing test directory and write failure reject `prove` as a bare `Error` instead of an `origin: 'instrument'` finding | `readiness-grade.md:56` | NO CARRIER | P17; no live brief names it. Plan reading: `plan.md:179` medium exclusion |
| 21 | `engines.node` admits Node 23, which `vitest@4` excludes | `readiness-grade.md:62` | NO CARRIER | `git log -S'engines' -- package.json` shows only `892377d` (scaffold). Plan reading: `plan.md:179` |
| 22 | An unrelated `Control` (independent `files`/`test`) still earns a receipt; refusal shape is not ruled | `p4-receipt-ruling.md:279` | NO CARRIER | `pb4-brief.md:60`: "P26, the unrelated-control gap, is a separate row needing its own design pass. The ruling refuses to fold it in. Do not attempt it." |
| 23 | `formatFinding` `@example` omits required `origin`, so 1 of 48 extracted blocks fails to compile | `readiness-grade.md:51` | NO CARRIER | Grade P12 is this compile failure. `p4-receipt-ruling.md:271` reused "P12" for six-field token examples. `pb4-brief.md` quotes only the token blocks, not `origin` |
| 24 | `formatFinding` / `formatCheck` render `'code'` and `'instrument'` identically | `receipt-defect-closed.md:70` | NO CARRIER | "Carried out of scope, deliberately" against the formatting capability; no live brief names it |
| 25 | A failed re-warm after the 64-specification bound leaves the runtime stage permanently rejected | `readiness-grade.md:91` | NO CARRIER | UNPROVEN; PB5 recycles on deadline expiry, not this re-warm path |
| 26 | Windows behaviour of signal-kill orphan sweep, orphaned lint child, `ENAMETOOLONG`, and `SIGKILL` fallback is unmeasured | `readiness-grade.md:92` | NO CARRIER | UNPROVEN; no win32 run is recorded |
| 27 | A supplied candidate that shadows an existing on-disk file was never probed (type vs runtime text disagreement) | `readiness-grade.md:93` | NO CARRIER | UNPROVEN; `aad0f58` closed off-disk candidates (`P5`), not this shadowing row. `u3-orchestrator-findings.md:349-355` still names the on-disk row as the dangerous false green |
| 28 | End-to-end `Probe.prove` forgery pair, `resolve` latency, and TypeScript 6.x digest stability were not re-measured | `p4-receipt-ruling.md:285` | NO CARRIER | "Unproven, carried forward." PB4 implements the ruling; it does not re-take these measurements |
| 29 | `.gitignore` on `tmp` makes the `tmp/probe` arming / lint path a permanent false green; any fix turns `#arm()` red | `plan.md:387` | NO CARRIER | "That is a product decision and it belongs to the user." Related residue: `s3fix-audit-reconciliation.md:62` |
| 30 | T2 (`resolveRoot` via `tests/setup.ts` plus `requireValue`) is still blocked in the synthesis as unshipped | `testhelper-synthesis.md:143` | NO CARRIER | `git log -S'resolveRoot' -- tests` is empty. `t2-brief.md` exists but is not in the briefed-not-landed set (`pb4`/`pb5`/`pb6`/`d1`) |
| 31 | `createTeardown` at 29 `finally` blocks is deferred | `testhelper-synthesis.md:105` | NO CARRIER | "A4 — `createTeardown` · **DEFER** · do not do this now"; "Not scheduled: A4" |
| 32 | `Control.reason` is required, validated at three layers, and read by nothing; S5's route-or-remove ruling was never applied | `s5-brief.md:82` | NO CARRIER | `git log --grep='S5'` is empty. No live brief names `Control.reason` |
| 33 | `ProbeInterface` / `ProbeOptions` document mtime-keyed revalidation; the sweep hashes contents and covers only module extensions | `s5-brief.md:105` | NO CARRIER | S5 never landed; not in `pb4`/`pb5`/`pb6`/`d1` |
| 34 | `inferTestProject` `@returns` documents a root-project fallback the implementation does not have | `s5-brief.md:107` | NO CARRIER | S5 never landed |
| 35 | `expire` event documentation says the runtime worker was recycled; the event fires before recycling, and recycling is conditional | `s5-brief.md:115` | NO CARRIER | S5 never landed |
| 36 | `Verdict` `@example` `elapsed` is below `max(case)+max(control)=513`, copied at three sites | `s5-brief.md:118` | NO CARRIER | S5 never landed |
| 37 | A workspace-escaping `Source.path` is admitted by `isSource` and `SOURCE_SHAPE` (S4 deferred this half) | `s5-brief.md:123` | NO CARRIER | S5 never landed. Grade `readiness-grade.md:85` still says the guard admits those paths and `resolveWorkspaceFile` throws |
| 38 | `Finding.line` is documented absent for a runtime failure; `RuntimeStage` sets it when the stack carries one | `critic-findings-routing.md:35` | NO CARRIER | Routed to S5; S5 never landed |
| 39 | `computeReceipt` issues when the control also broke at stages it did not declare; docs and boot control state the strict reading | `critic-findings-routing.md:44` | NO CARRIER | Routed to S5 as a ruling; S5 never landed |
| 40 | `Finding.path` docs say "path the tool reported"; all three stages substitute a different path | `critic-findings-routing.md:86` | NO CARRIER | Routed to S5; S5 never landed |
| 41 | Generated specification `import.meta.url` carries the revision suffix | `o9-u2-audit-reconciliation.md:96` | NO CARRIER | "Routed to a successor, not this fix." `7112bb6` (O9-U2fix) does not name a successor brief in the live set |
| 42 | Stack remapping compares paths by exact string; a non-realpath workspace leaks `probe-<uuid>` into `Finding.path` | `o9-u2-audit-reconciliation.md:97` | NO CARRIER | Same successor routing; no live brief |
| 43 | `experimental.fsModuleCache` could serve a disk-derived transform for a covered path; unproven either way | `o9-u2-audit-reconciliation.md:100` | NO CARRIER | Named as an open question, not a finding; no carrier |
| 44 | Shared `normalizePath` in `src/server/helpers.ts` for `Overlay.covers` and the stage was not promoted | `o9-u2-audit-reconciliation.md:103` | NO CARRIER | "promoting the helper is a separate change" |
| 45 | A language server that accepts stdin and never answers `initialize` deadlocks `destroy()` | `s3-audit-lens-verdicts.md:38` | NO CARRIER | Marked `[OUT_OF_SCOPE]`; not P7 (P7 is shutdown-then-ignore-`exit`) |
| 46 | `Probe.test.ts` still asserts emptiness over generic `arm-` / `.probe-` prefixes | `seam-sweep-triage.md:304` | NO CARRIER | "The generic-prefix defect in `Probe.test.ts` is real and unrepaired." S2 was the named carrier and has landed (`abad0f6`) without a later file recording this closure |
| 47 | `ProcessInterface.bytes` / `write` synthesis is ruled and "briefed to a writer"; that writer is not a live probe brief | `process-bytes-reconciliation.md:133` | NO CARRIER | Implementation "is briefed to a writer and audited by Sol"; not `pb4`/`pb5`/`pb6`/`d1` |
| 48 | Opus's bare-`\\r` change to `lines` was recorded as a successor and never scheduled | `process-bytes-reconciliation.md:130` | NO CARRIER | "Out of scope for this round… Record it as a successor." |
| 49 | `quoteArgument("%1")` is documented unquoted and returns `"\"%1\""` | `readiness-grade.md:441` | NO CARRIER | Process-package REPAIR row in this register; no live probe brief owns `guides/process.md` |
| 50 | `ProcessCommand.isolated` TSDoc omits POSIX `PATH` removal and misstates Windows injection | `readiness-grade.md:448` | NO CARRIER | Process-package REPAIR; no live brief |
| 51 | Spawn-fault exit code is documented as `null` but `run`/`Process` surface `-2` while `runSync` surfaces `null` | `readiness-grade.md:455` | NO CARRIER | Process-package REPAIR; no live brief |
| 52 | ESRCH fallback in `killProcess` / `stopChild` has no committed regression guard | `readiness-grade.md:462` | NO CARRIER | Process-package REPAIR; no live brief |
| 53 | POSIX termination table still describes the group-only sequence after the ESRCH fallback landed | `readiness-grade.md:469` | NO CARRIER | Process-package REPAIR; no live brief |
| 54 | Twelve process exports discharge `@example` parity without the guides gate executing them | `readiness-grade.md:476` | NO CARRIER | Process-package REPAIR; no live brief |
| 55 | Process guide Tests section claims coverage that only runs on Windows (`9 skipped` on Linux) | `readiness-grade.md:483` | NO CARRIER | Process-package REPAIR; no live brief |
| 56 | Process `README.md` is published and ungated by `tests/guides.test.ts` | `readiness-grade.md:490` | NO CARRIER | Process-package IMPLEMENT; no live brief |

## NO CARRIER

17. Closing it requires writing what `O9-U3` owns (the plan never states the files) or striking the unit from `plan.md:469`.
18. Closing it requires an `@orkestrel/mcp` `stop()` bump plus a probe test that `createProbeServer(...).stop()` leaves `process.stdin.listenerCount('data') === 0`.
19. Closing it requires yielding or off-looping caller-influenced type/lint/snapshot work, with a stall bound — or an explicit plan exclusion that updates the grade row.
20. Closing it requires `RuntimeStage.inspect` to return `origin: 'instrument'` findings for a missing directory and a write failure instead of throwing.
21. Closing it requires `engines.node` to read `^22.12.0 || >=24.0.0`.
22. Closing it requires a design pass on whether `prove` refuses a control whose test path differs from the case's, then an implementation unit.
23. Closing it requires both `formatFinding` `@example` calls to carry `origin`, plus a compile-the-examples test.
24. Closing it requires `formatFinding` / `formatCheck` to render `origin` so `formatVerdict` distinguishes control failure from instrument fault.
25. Closing it requires the 65-inspection re-warm probe named at `readiness-grade.md:91`.
26. Closing it requires `npm test` plus the shutdown-orphan and teardown-hang probes on a `win32` host.
27. Closing it requires repeating the three-specifier candidate probe with a real file at the candidate path and recording type vs runtime text.
28. Closing it requires re-running the forgery pair, measuring `resolve` latency, and checking `CompilerOptions` digest stability across 6.x patches.
29. Closing it is a product decision on `.gitignore` / oxlint LSP ignores / `#arm()`; the register assigns it to the user.
30. Closing it requires the A2+A3 unit in `testhelper-synthesis.md:143` (`tests/setup.ts` `ROOT`, six imports, two `requireValue` sites).
31. Closing it requires adopting `createTeardown` at the 29 `finally` blocks, or an explicit drop of A4 in a durable artifact.
32. Closing it requires S5's ruling: route `Control.reason` onto `Verdict` or remove it from types, shape, guard, and writers.
33. Closing it requires rewriting the mtime-revalidation sentences to content hashing of module extensions.
34. Closing it requires restating `inferTestProject` `@returns` to the implemented contract.
35. Closing it requires restating the `expire` event so it does not claim a recycle that has not happened.
36. Closing it requires one `elapsed` figure above 513 at `types.ts`, `helpers.ts`, and `validators.ts`.
37. Closing it requires `isSource` and `SOURCE_SHAPE` to refuse a workspace-escaping `path` while still admitting a contained relative path.
38. Closing it requires restating `Finding.line` as absent when the error carries no stack frame.
39. Closing it requires tightening `computeReceipt` to the strict reading or restating the two sentences to the loose one.
40. Closing it requires restating `Finding.path` as the mapped workspace path, not "what the tool reported".
41. Closing it requires stopping the generated specification's `import.meta.url` from carrying the revision suffix, or documenting that exception.
42. Closing it requires symlink-aware remapping so a non-realpath workspace cannot leak `probe-<uuid>` into `Finding.path`.
43. Closing it requires executing the `fsModuleCache` overlay probe and then repairing or excluding on that evidence.
44. Closing it requires one shared `normalizePath` helper consumed by `Overlay.covers` and the runtime stage.
45. Closing it requires bounding `#destroy` when `#warmth` never settles (initialize hang), which P7 does not cover.
46. Closing it requires `Probe.test.ts` to assert only files this test created, identified by a unique token.
47. Closing it requires implementing the ruled `bytes` / `write` surface on `@orkestrel/process` and auditing the two-cursor queue.
48. Closing it requires a successor unit on bare-`\r` handling in `lines`, or an explicit drop.
49. Closing it requires correcting both `%1` sentences and asserting `quoteArgument('%1') === '"%1"'` in `tests/guides.test.ts`.
50. Closing it requires host-qualified `isolated` TSDoc on `ProcessCommand` (POSIX `PATH`, Windows injected set).
51. Closing it requires documenting spawn-fault codes per runner (`-2` vs `null`) and transcribing both in the guides gate.
52. Closing it requires a POSIX-gated `killProcess` non-detached-child test with the pre-repair swallow as control.
53. Closing it requires the POSIX table row to name the group route and the direct-child ESRCH fallback.
54. Closing it requires `tests/guides.test.ts` to transcribe the twelve value-bearing `@example` blocks.
55. Closing it requires the Tests section to state that those nine rows execute on Windows only, with the host each half was proven on.
56. Closing it requires `README.md` to join the process guides gate's `ROOT_FILES` for backticks and relative links.

## Superseded

- Criterion 3 recorded **Closed** at `plan.md:373`; `criterion-3-verification.md:4` refutes that assertion (two highs unapplied). The corrected state is `plan.md:462` **Open** (rows 9–10 still this table).
- Runtime eviction labelled HIGH in the sweep; `criterion-3-verification.md:51` and `plan.md:437` reclassify it MEDIUM and move it to the campaign exclusion list — it dies correctly as a campaign-close item.
- O8 (orphaned processes on termination) is withdrawn at `u3-orchestrator-findings.md:291`; `plan.md:277` records the same withdrawal.
- O9-U2 audit **R4** (refuse a second concurrent `inspect`) is prescribed at `o9-u2-audit-reconciliation.md:52` and withdrawn at `o9-u2-audit-reconciliation.md:124` — "Nothing is owed."
- S3's claim that the orphan is reached through a signal death is overturned at `s3-audit-reconciliation.md:94` and `s3-audit-lens-verdicts.md:70`: the signal door deadlocks; the orphan's door is a code-0 exit.
- Criterion 6 "`PROBE.md` describes what shipped" at `plan.md:171` is transformed at `probe-md-ruling.md:55`: dissolve `PROBE.md` into `guides/probe.md` (PB6).
- D1's acceptance that a test asserts a receipt from the example *before* P4 (`d1-brief.md:191`) is overturned at `p4-receipt-ruling.md:267`: "P9 must be written after this lands, not before."
- S5's repair "make `isClaim = compileGuard(CLAIM_SHAPE)`" at `s5-brief.md:66` is overturned by `d1-brief.md:96` and `pb6-brief.md:47`: rewrite the remark; leave `validators.ts:99` untouched.
- Calling the bin arming failure "the known `tmp/probe` flake" / the gitignore false green is overturned at `b1-finding.md:5`; that defect is a 750 ms sleep past a 153–670 ms window. Repair landed as `a20e730`.
- Rival explanation that S1's eviction broke arming cleanup (`seam-sweep-triage.md:256`) is excluded at `seam-sweep-triage.md:273`: the writer was S1's own stdout proof, not a destroy regression.
EXIT:0
