Heading count from `grep -c '^#' PROBE.md`: **35**.

| Heading | Lines | Disposition | What a guide must carry from it, in one sentence |
| --- | --- | --- | --- |
| PROBE.md | 1-5 | PRODUCT | The package is the mechanism that lets an agent prove a claim with type, lint, and runtime evidence at a cost lower than reasoning about the claim. |
| Ruling | 6-42 | NARRATIVE | Nothing. |
| What was built, and what it measures | 43-91 | PRODUCT (PB4-dependent) | A harness reaches `@orkestrel/probe` as a newline-delimited JSON MCP stdio server whose `prove` tool returns toolchain, per-stage findings for case and control, and a receipt; warm boot is 4392 ms, one `prove` is 530-621 ms, one inspection is 264 ms, and runtime alone is 187 ms, and the receipt token's fields are PB4-owned. |
| What the build found that the design did not | 92-202 | PRODUCT (PB4-dependent) | Type and lint overlay `Case.files` in memory while runtime writes a file, so a receipt must not be described as certifying runtime evidence over source that stage never ran; `destroy` releases resident processes (the orphan claim was withdrawn). |
| The lesson worth keeping | 203-212 | NARRATIVE | Nothing. |
| What is wrong today | 213-230 | NARRATIVE | Nothing. |
| What the optimal design is, and what physics permits | 231-267 | PRODUCT | Type and lint inspect from memory (Oxlint lints a URI that need not exist on disk); runtime is the only stage that needs a real file, and a virtual module path does not execute. |
| The certified prototype | 268-307 | PRODUCT | A `Verdict` exists only when all three stages ran on both the case and the control; do not carry the prototype's 337 ms median as the shipped `prove` cost (lines 76-79 are the later reading). |
| Warm residency forces five laws | 308-317 | PRODUCT | Residency is what makes the probe fast, and a warm service returns a confident wrong answer about freshly edited source unless it revalidates. |
| Address every revision, and never reuse a path | 318-325 | PRODUCT | Each runtime inspection must use a fresh identity with `runTestSpecifications`; reusing a path with `rerunFiles` reports a false pass. |
| Revalidate every dependency, in both stages | 326-364 | PRODUCT | `prove` revalidates every workspace file whose modification time moved, because a digest of the claim's own bytes does not see imported files. |
| Own the deadline outside the worker | 365-376 | PRODUCT | `ProbeOptions.deadline` belongs to the coordinator outside the worker, because a Vitest `testTimeout` cannot fire while a synchronous loop blocks that worker; expiry recycles the worker and emits `expire`. |
| Typecheck against the scoped project, never the root | 377-406 | PRODUCT | Candidate sources are checked against the claim's scoped `project`; the test file is checked against the root project that supplies Vitest and Node globals. |
| Arm the instrument at boot, against the failure that actually threatens it | 407-423 | PRODUCT | Construction arms the service against a known-failing control that proves revalidation; `arm` fires when that control reports red, and `prove` awaits that step rather than starting a second warm. |
| What isolation the runtime already provides, and what it does not | 424-453 | PRODUCT | Vitest per-file workers isolate module state, `globalThis`, and `process.env`; they do not contain infinite loops, checkout writes, loopback binds, or public network access. |
| Transport: the watcher is fast and cannot answer | 454-468 | NARRATIVE | Nothing. |
| Enforcement, stated honestly | 469-512 | PRODUCT (PB4-dependent) | A receipt is issued only when the case is clean and the control reports at least one `origin: 'code'` finding at the stage it declared; the package cannot compel a proof. |
| The surface | 513-601 | PRODUCT (PB4-dependent) | Carry `Stage`, `Source`, `Case`, `Control`, `Claim`, `Check`, and `Toolchain` as dumped; take `Finding` with `origin` from `src/core/types.ts:153` and `Verdict` (`id`, `digest`, `toolchain`, `project`, `checks`, `control`, `elapsed`, `receipt`) from `src/core/types.ts:279` as PB4-owned; drop `client.mjs` and promotion, which the barrels do not export. |
| Build the diskless pair first | 602-635 | NARRATIVE | Nothing. |
| How simple is this to implement | 636-666 | NARRATIVE | Nothing. |
| Why the instrument pair is the recommendation | 667-689 | SUPERSEDED | Nothing. |
| The engine cannot be published, which decides where it lives | 690-715 | SUPERSEDED | Nothing. |
| The socket daemon and the MCP tool are one design, not two | 716-741 | NARRATIVE | Nothing. |
| Use the fleet's own MCP package, and wrap it in the legacy decorator | 742-756 | PRODUCT | `createProbeServer` serves newline-delimited JSON over stdio and must wrap the MCP server in the legacy decorator so handshake-era `initialize`/`tools/list` and modern `_meta` requests both answer. |
| Which protocol revision this speaks, and why both | 757-790 | PRODUCT | The stdio server speaks MCP revision 2026-07-28 and the handshake era together; a modern request that omits any of the three reserved `_meta` keys is refused as malformed by both shapes. |
| Give the engine its own package, because peers are what keep the verdict honest | 791-877 | PRODUCT | `@orkestrel/probe` resolves `typescript`, `oxlint`, and `vitest` from the workspace into `toolchain`, declares those peers as floors not carets, throws when a stage cannot start, and carries `toolchain` on every `Verdict`. |
| How you actually use it | 878-918 | PRODUCT | Declare `@orkestrel/probe` as a development dependency and register `node node_modules/@orkestrel/probe/dist/bin/main.js` as the `probe` MCP server exposing the `prove` tool; do not register a global install, `npx`, or the npm bin shim. |
| Do not ship it as a single executable | 919-949 | PRODUCT | The package must borrow the target's compiler, linter, and runner; a single executable that froze its own toolchain would stop predicting the gate. |
| Start it with the harness, and warm it behind the reply | 950-991 | PRODUCT | There is no `start` method: warming begins at construction, `prove` awaits it, and the harness owns process lifetime; a second client is a second process at the measured resident set. |
| Reach the target's tools the way that survives Windows | 992-1004 | PRODUCT | Resolve each tool from the target's `package.json` and spawn the resolved JavaScript entry with `process.execPath`; do not spawn `node_modules/.bin` shims. |
| The upgrade path does not change the inspections | 1005-1013 | SUPERSEDED | Nothing. |
| The edits, in order | 1014-1045 | NARRATIVE | Nothing. |
| Rejected | 1046-1079 | NARRATIVE | Nothing. |
| Risks | 1080-1125 | PRODUCT | A probe process retains filesystem and network capability; `prove` runs case then control in sequence so it pays the runtime floor twice; Vitest retains one result record per specification with no bound stated on the surface. |
| Open questions | 1126-1145 | SUPERSEDED | Nothing. |

## Superseded, with the contradiction

- **Why the instrument pair is the recommendation** (667-689) — contradicted by `src/server/index.ts:5-8`, which exports `Probe`, `LintStage`, `RuntimeStage`, and `TypeStage` as the published engine rather than a vendored `tests/setupProbe.ts` pair.
- **The engine cannot be published, which decides where it lives** (690-715) — contradicted by `src/server/index.ts:5` (`export * from './Probe.js'`) and `src/core/types.ts:368` (`ProbeInterface` is the published contract); the engine lives in `src/server` and is exported.
- **The upgrade path does not change the inspections** (1005-1013) — contradicted by `src/server/index.ts:6-8`, which publishes the three stage classes; inspections are not exported functions in `tests/setupProbe.ts`.
- **Open questions** (1126-1145) — contradicted by `src/server/index.ts:3-8` and `src/server/types.ts:195` (`ProbeServerInterface`): the resident service and MCP stdio server are members of the published server barrel, which closes the placement and MCP-dependency questions.

## Measurements

Every figure below is stated as a measurement. A date is recorded only where noted. A measurement with no date is one the guide cannot carry.

| Line | Measurement | Date in file |
| --- | --- | --- |
| 13 | 4244 ms (instrument pair, all three signals) vs 3874 ms (one signal) | no |
| 16-17 | resident service 337 ms vs instrument pair 4244 ms | no |
| 32 | socket daemon 40 ms slower per call than the MCP tool | no |
| 49 | package 87.5 kB packed, 359.8 kB unpacked, 17 files; single-executable floor 118.9 MB | no |
| 76 | boot including arming 4392 ms | no |
| 77 | one `prove` 530-621 ms | no |
| 78 | one inspection 264 ms | no |
| 79 | runtime stage alone 187 ms | no |
| 81 | type stage 56 ms, lint stage 72 ms | no |
| 87-88 | boot 4392 ms vs 4351 ms; type control about 40 ms | no |
| 89 | warm `prove` moved from 492 ms to 530-621 ms | no |
| 215-219 | `npm run test:probe` 3874 ms cold, 2751 ms warm | **2026-08-18** |
| 229 | roughly 4 seconds per question (restates 219) | **2026-08-18** (section date) |
| 241 | type cold 1198 ms, warm 11-90 ms | no |
| 242 | lint initialize 269 ms, warm 1-5 ms | no |
| 243 | runtime cold 771 ms, warm 243-290 ms | no |
| 247-248 | five virtual documents linted while `existsSync` reported false | no |
| 261 | project-rooted virtual path reports 0 diagnostics | no |
| 270-272 | prototype median 337 ms vs 3874 ms; 11.5 times faster | no |
| 274 | 12 warm calls (sample size) | no |
| 279 | type stage 57-83 ms | no |
| 280 | lint stage 15-22 ms | no |
| 281 | runtime stage 259-346 ms | no |
| 282 | combined 315-440 ms, median 337 ms | no |
| 286 | spawned-Oxlint prototype 614-651 ms; resident lint about 280 ms of the improvement | no |
| 304-306 | 20 sequential probes: first five 637 ms, last five 644 ms, drift 7 ms, resident set 456 MB | no |
| 320-322 | `rerunFiles` 2-4 ms false pass; fresh path `runTestSpecifications` 270 ms fail | no |
| 367-369 | `testTimeout: 2000` never returned; wrapper killed at 100 seconds, exit code 124 | no |
| 385-386 | root project 0 diagnostics; scoped core project 1 (`Cannot find name 'process'`) | no |
| 450-452 | five concurrent probes 1636 ms vs about 3100 ms serial; about 1.9 times, 4 processors | no |
| 457-458 | `fs.watch` notice 0-1 ms; Unix socket round trip 1.26 ms | no |
| 463 | client process Node startup 38-43 ms | no |
| 475 | 337 ms vs 3874 ms (restatement) | no |
| 615 | type+lint 72-105 ms combined vs runtime 259-346 ms | no |
| 620 | wrong answer costs 80 ms to reproduce in the type stage | no |
| 644 | option 1 cold 4244 ms (measured) | no |
| 645 | option 2 cold 3182-3459 ms (measured) | no |
| 646 | option 3 cold ~2 s (projection), warm ~380 ms (derived) | no |
| 647 | option 4 cold ~1.5 s (projection), warm ~340 ms (derived) | no |
| 649-651 | 337 ms service + 38-43 ms client + 1.26 ms socket; MCP transport 0.32 ms | no |
| 710-712 | two inspections about 370 ms; `--no-cache` 2779 ms vs 2508 ms, saving about 270 ms | no |
| 727 | socket client 38-43 ms (restatement) | no |
| 730 | socket warm transport 1.26 ms; MCP 3.08 ms | no |
| 731 | socket warm total about 380 ms; MCP about 340 ms | no |
| 748 | `@orkestrel/mcp` 10 packages, 6.3 MB | no |
| 751-752 | MCP overhead 3.08 ms vs 0.32 ms hand-written; 0.8 percent of one probe | no |
| 839 | declared `^1.77.0`, installed 1.78.0 (also 29, 927) | no |
| 902-903 | `createRequire` resolved typescript 6.0.3, vitest 4.1.10, oxlint 1.78.0 | no |
| 933-934 | SEA floor 118.9 MB; typescript 24 MB, oxlint 2.4 MB, vitest 2.2 MB; dependency 6.3 MB | no |
| 966-967 | `initialize` 57.6 ms; warming finishes 3119 ms later; first probe 222 ms | no |
| 971-973 | module-scope import delayed `initialize` to 869 ms; dynamic import restores 57.6 ms | no |
| 977-978 | mid-warm `prove` at T+0 answered after 3346 ms | no |
| 981-982 | revalidation sequence 257 ms then 334 ms | no |
| 985 | second client second engine at 456 MB resident | no |
| 1050 | `test:probe` 2751 ms warm (restates 219) | no |
| 1056 | `npx oxlint` 636-672 ms vs direct binary 257-258 ms vs LSP 1-5 ms | no |
| 1061 | `isolate: false` buys 7 ms of a 228 ms runtime stage | no |
| 1067-1071 | hand-rolled MCP 12 lines, 0.32 ms round trip; saving 2.76 ms on a call about 340 ms | no |
| 1073 | socket 40 ms slower per call (restatement) | no |
| 1095-1100 | 150 probes: `getFiles` 50, 100, 150; memory 259 MB, 264 MB, 236 MB vs 159 MB at start; latency 228 ms, 231 ms, 228 ms | no |
| 1106 | `forks` (default) warm median 260 ms | no |
| 1107 | `threads` 228 ms | no |
| 1108 | `threads`, `isolate: false` 221 ms | no |
| 1109 | `forks`, `isolate: false` 256 ms | no |
| 1110 | `threads`, single thread 230 ms | no |
| 1112-1114 | disabling isolation saves 7 ms; `threads` takes 32 ms; remaining floor about 220 ms | no |
| 1118-1120 | one inspection 264 ms; runtime 187 ms of that; warm `prove` 492 ms | no |
| 1119-1120 | type 56 ms, lint 72 ms (restates 81) | no |
| 1122 | concurrent case+control would take a `prove` to roughly 264 ms (derived, not measured) | no |
EXIT:0
