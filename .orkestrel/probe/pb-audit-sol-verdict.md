### Claim 1
Verdict: FAIL  
Evidence: `tests/src/server/Probe.test.ts:1086-1144` proves a caller-selected permissive project mints a receipt while the workspace project refuses the same claim. Project identity makes the discrepancy visible but does not prevent minting. Determinism itself is proven at `tests/src/server/Probe.test.ts:1021-1078`.

### Claim 2
Verdict: CONFIRMED  
Evidence: `src/server/types.ts:139-160` declares `TypeStageInterface`; `src/server/stages/TypeStage.ts:41` implements it. `src/server/stages/TypeStage.ts:148-151` checks destruction before and after warming.

### Claim 3
Verdict: CONFIRMED  
Evidence: `src/server/Probe.ts:322-340` emits `expire` only after recycling completes. `src/server/Probe.ts:349-380` replaces type, lint, and runtime stages by identity. Replacement behavior is exercised at `tests/src/server/Probe.test.ts:427-557` and `tests/src/server/Probe.test.ts:559-650`.

### Claim 4
Verdict: CONFIRMED  
Evidence: `src/server/stages/LintStage.ts:110-126` bounds shutdown at 2,000 ms and kills an unreleased child. `tests/src/server/stages/LintStage.test.ts:591-615` proves teardown settles when shutdown is answered but exit is ignored.

### Claim 5
Verdict: CONFIRMED  
Evidence: `src/server/Probe.ts:185-207` wraps boot failures as arming failures and replaces a rejected arming attempt. `tests/src/server/Probe.test.ts:652-729` proves two distinguishable failures followed by successful re-arming after repair.

### Claim 6
Verdict: FAIL  
Evidence: `src/server/stages/RuntimeStage.ts:490-499` deletes every file matching the revision-name pattern when its embedded PID is dead; it does not establish that the file is a generated specification. `tests/src/server/stages/RuntimeStage.test.ts:1065-1085` confirms that it also deletes a boot dependency. A developer file named `notes.probe-<dead-pid>-<uuid>.ts` would also be deleted. The live-sibling half is confirmed at lines 1057-1085.

### Claim 7
Verdict: CONFIRMED  
Evidence: `.orkestrel/probe/pb6-amendment.md:7-28` forbids carrying the old undated measurement corpus and requires fresh measurements. `guides/probe.md:490-498` gives the two retained measurements with date, host, tool versions, and run counts. Other figures, including defaults and the 64-specification bound, correspond to shipped constants such as `src/server/Probe.ts:74-76` and `src/server/stages/RuntimeStage.ts:430-434`.

### Claim 8
Verdict: CONFIRMED  
Evidence: `tests/guides.test.ts:19-41` holds the claim literal; `tests/guides.test.ts:218-228` compares it exactly with the guide and `Claim` example. `tests/guides.test.ts:242-265` executes it and requires the documented receipt. The supplied guides and full-test gates exited 0.

### Claim 9
Verdict: FAIL  
Evidence: `src/server/index.ts:1` barrels every declaration from `types.ts`, while `src/server/types.ts:35-39` deliberately gives `OverlayInterface` no `@example`. The gate excludes that export through `INTERNAL` at `tests/guides.test.ts:12-17`. More generally, `extractDocumented` at `tests/guides.test.ts:91-99` discovers only exports that already have documentation, so the loop at lines 179-192 cannot detect an entirely undocumented export.

### Claim 10
Verdict: CONFIRMED  
Evidence: `src/server/index.ts:1-8` does not export the `Overlay` class. `tests/guides.test.ts:171-176` checks runtime barrel keys and would fail if that class returned. The separate `OverlayInterface` surface defect is finding 18.

### Claim 11
Verdict: CONFIRMED  
Evidence: Runtime revalidation hashes contents at `src/server/stages/RuntimeStage.ts:466-478`; TypeScript versions disk files by modification time at `src/server/stages/TypeStage.ts:288-294`. `inferTestProject` has no fallback at `src/server/helpers.ts:196-219`. Finding path and line behavior is stated at `src/core/types.ts:163-170` and implemented at `src/server/stages/RuntimeStage.ts:632-655`. The example’s 549 ms elapsed value at `src/core/types.ts:295-305` exceeds the two sequential phase floors, 259 + 254 = 513 ms; each phase runs its stages concurrently through `Promise.all` at `src/server/Probe.ts:309-319`.

### Claim 12
Verdict: CONFIRMED  
Evidence: `src/server/stages/RuntimeStage.ts:619-655` resolves both the generated specification and reported stack paths through real paths before mapping them. `tests/src/server/stages/RuntimeStage.test.ts:93-131` proves a symlinked workspace reports the declared test path.

### Claim 13
Verdict: CONFIRMED  
Evidence: `src/server/helpers.ts:28-30` is the sole `normalizePath` declaration under `src`. Its callers route through that function, including `src/server/Overlay.ts:43-69`, `src/server/helpers.ts:71-72`, `src/server/stages/LintStage.ts:195`, and `src/server/stages/RuntimeStage.ts:413`.

### Claim 14
Verdict: CONFIRMED  
Evidence: `src/server/types.ts:198-219` declares only `start()` and `destroy()`. `src/server/factories.ts:52-54` constructs `ProbeServer`, whose constructor creates its own `Probe` at `src/server/ProbeServer.ts:40-47`. `src/bin/main.ts:1-3` is one import and one expression statement.

### Claim 15
Verdict: CONFIRMED  
Evidence: `src/server/stages/RuntimeStage.ts:201-253` captures and releases signal listeners around every `createVitest` call. `src/server/helpers.ts:405-440` compares listeners by identity. `tests/src/server/stages/RuntimeStage.test.ts:808-870` proves the behavior after runner replacement, and lines 984-1031 prove it across independent warms.

### Claim 16
Verdict: CONFIRMED  
Evidence: `tests/src/bin/main.test.ts:389-423` covers SIGINT and SIGTERM during both boot and armed service, requiring exit code 0, bounded teardown, and an empty workbench. The supplied source, build, and full-test gates exited 0.

### Claim 17
Verdict: CONFIRMED  
Evidence: `src/server/ProbeServer.ts:72-87` stops the transport, removes the stdin listeners it gained, pauses stdin, and destroys the probe without calling `process.exit`. `tests/src/bin/main.test.ts:417-423` proves the spawned process then exits naturally with code 0. The embedded-host contract has a narrower defect recorded as finding 22.

## Continuing findings

18. FAIL — `OverlayInterface` remains public even though its TSDoc says it stays out of the server barrel. `src/server/index.ts:1` star-exports it, `src/server/types.ts:35-39` declares it exported, and `dist/src/server/index.d.ts:346` ships it. `tests/guides.test.ts:17` hides it from parity, while the runtime-key check at lines 171-176 cannot observe type-only exports.

19. FAIL — `Inspection` is excess first-release surface. `src/server/types.ts:3-20` exports it, and `src/server/index.ts:1` barrels it, but its only product role is the coordinator’s private queue record at `src/server/Probe.ts:309-315`. No published method accepts or returns it.

20. FAIL — the published stage teardown guarantee is false before lint warming settles. `src/server/types.ts:113-117` says destruction abandons inspections without waiting, but `src/server/stages/LintStage.ts:95-101` awaits `#warmth` before rejecting them. Warming waits for the initialize response at `src/server/stages/LintStage.ts:153-181`; a server that stays alive and never answers therefore deadlocks destruction. The campaign explicitly left this case open at `.orkestrel/probe/prune-disposition.md:39`.

21. FAIL — the guide’s cross-workspace digest statement is false for valid claims containing absolute-looking strings. `guides/probe.md:355-357` says the digest depends on case and control bytes alone. `src/server/helpers.ts:350-365` rewrites every absolute string relative to the selected workspace before hashing at lines 385-389. For example, a control reason equal to one workspace root normalizes to `.` there but remains absolute in another workspace, producing different digests from identical claim bytes.

22. FAIL — `ProbeServer.destroy()` does not always return an embedded process to its prior stdin state. `src/server/types.ts:210-215` promises the process is left as before `start`, but `src/server/ProbeServer.ts:84-86` unconditionally pauses stdin. A host whose stdin was flowing before `start` retains its listeners but stops reading after destruction. `tests/src/server/ProbeServer.test.ts:24-62` checks listener counts, not the prior paused/flowing state.

23. CONFIRMED — PB9 was right to omit `process.exit()`. `src/server/ProbeServer.ts:72-87` releases the handles that prevented natural exit, and `tests/src/bin/main.test.ts:389-423` proves both signals exit 0 during boot and service. An explicit exit would also kill a host using the exported server factory. This ruling is falsified if any delivery in that test exceeds `TEARDOWN_BOUND`, returns a signal or nonzero code, or leaves stdin listeners above their captured baseline.

24. CONFIRMED LIMIT — a receipt quoted without its claim and workspace is not proof. A hostile claimant can type any well-formed token, earn one under a permissive project, weaken configurations omitted from the token, or use an unrelated broken control. These limits are documented at `guides/probe.md:376-420` and the permissive-project attack is executed at `tests/src/server/Probe.test.ts:1086-1144`. The threat statement is accurate, but the token has evidentiary value only when the reader recomputes it from the claim and trusted workspace.

VERDICT: FAIL