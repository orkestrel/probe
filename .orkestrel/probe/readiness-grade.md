# Production-readiness grade, 2026-08-19

Six blind audit lanes, three per package, each required to end every row IMPLEMENT, REPAIR,
RETAIN, EXCLUDE, or UNPROVEN with executed evidence and a concrete closing condition. Graded on
coverage per `.claude/rules/quality.md`, never on polish.

The lane reports follow the grade.

---

# Production-readiness grade

Two packages, six blind lanes, graded on coverage: whether every applicable seam exists, works, and stays proven.

---

# @orkestrel/probe

## 1. Verdict

**Not production-ready. Do not publish.**

Eight defects each independently block a first release, and they are not polish gaps — they are seams that do not work at all:

- **The package cannot be installed** by the npm bundled with the Node line its own `engines` field declares. `npm install <tarball>` under npm 10.9.7 crashes with `Cannot read properties of null (reading 'edgesOut')`.
- **A default install resolves TypeScript 7**, on which the type stage dies with an unnamed `TypeError: Cannot read properties of undefined (reading 'readFile')`. The peer range is `>=6.0.0` and `npm view typescript version` returns `7.0.2`.
- **The CommonJS server entry crashes** in two of three stages on `{}.resolve is not a function`.
- **The receipt is forgeable by the caller.** `Claim.project` selects the compiler configuration that judges the caller's own case, and the receipt token records the toolchain but not the project, so a receipt minted under a caller-supplied `strict: false` config is indistinguishable from an honest one.
- **The runtime stage cannot import the candidate files** that `Case.files` is documented — in the source, in the shipped `.d.ts`, and in the live MCP tool schema — to supply to the test.
- **A type or lint deadline expiry kills the probe permanently.** The stage is destroyed and never replaced, so every later proof rejects with `The lint stage has been destroyed`.
- **`LintStage.destroy()` never settles** against a server that answers `shutdown` and ignores `exit`; `Probe.destroy()` inherits the hang and the child leaks for the host's lifetime.
- **No documented claim in the package earns a receipt.** The flagship `Claim` in `src/core/types.ts:95-101`, run verbatim, returns `no receipt`.

Underneath all eight: **no gate loads the published artifact.** Every one of these was reachable in under a minute from a packed tarball and none is visible to `prepublishOnly`.

## 2. Capability/defect matrix

| # | Row | Seam | State | Severity | Closes when |
|---|---|---|---|---|---|
| P1 | npm 10 crashes on the three-peer set | package consumption | IMPLEMENT | blocks-release | `npm install <tarball>` exits 0 under npm 10.9.7 in an empty directory. Verified fix: `peerDependenciesMeta` marking `oxlint`, `typescript`, and `vitest` optional, which is correct on its own terms because all three resolve from the target workspace. |
| P2 | `typescript: ">=6.0.0"` admits TypeScript 7 | supported runtime targets | REPAIR | blocks-release | Peers read `^6.0.0`, `^4.1.0`, `^1.77.0`; a workspace whose TypeScript major is outside the range makes `prove` reject with a named error stating the supported range. The version is already read at `src/server/Probe.ts:72`. |
| P3 | CJS server entry `{}.resolve` | generated output | REPAIR | blocks-release | `grep -c "{}\." dist/src/server/index.cjs` reports 0, and `require('@orkestrel/probe/server')` then `createProbe({workspace}).prove(claim)` from an installed tarball returns a verdict. |
| P4 | Wire-chosen `project` mints a receipt the workspace refuses | receipt integrity | REPAIR | blocks-release | `Verdict` carries the resolved project, `formatVerdict` prints it, the receipt token includes it, and a test asserts two verdicts over one claim under two projects carry different tokens. |
| P5 | Runtime stage cannot import `Case.files` candidates | declared meaning versus behaviour | REPAIR | blocks-release | Either a test importing a text-only candidate resolves at the runtime stage and earns a receipt, or `Source`/`Case` state that the runtime stage serves no candidates and the failure carries `origin: 'instrument'` instead of `origin: 'code'`. |
| P6 | Type or lint expiry destroys the stage and never replaces it | lifecycle | REPAIR | blocks-release | A type or lint expiry replaces its stage the way `#recycle` replaces the runtime stage, and a test proves a clean claim served after an expiry at each of the three stages. |
| P7 | `LintStage.destroy()` never settles | teardown | REPAIR | blocks-release | `#destroy` bounds the wait and sends `SIGKILL` on expiry; a test with a fixture that ignores `exit` asserts `destroy()` settles and the child is gone. The hedge at `tests/src/server/Probe.test.ts:356` (`Promise.race([probe.destroy(), waitForDelay(5_000)])`) goes with it. |
| P8 | Documented `createProbeServer` lifecycle never returns | server lifecycle, `@example` truth | REPAIR | blocks-release | `createProbeServer(probe).stop()` leaves `process.stdin.listenerCount('data') === 0`, and a child running the documented `start`/`stop`/`destroy` sequence with an open stdin pipe exits within a bounded time. |
| P9 | No documented claim can earn a receipt | worked-example adequacy | IMPLEMENT | blocks-release | At least one `@example` or guide section carries a complete claim that returns a `Verdict` with a defined `receipt`, and a test asserts that receipt from the exact literal the documentation shows. |
| P10 | No gate holds the published artifact | "stays proven" | IMPLEMENT | blocks-release | A `distribution` Vitest project and `tests/distribution.test.ts` registered in `vite.config.ts` with the `test:distribution` script `tests/config.test.ts:406` already requires, packing and installing the tarball outside the repo, asserting every `exports` entry loads under `import` and `require`, that `prove` returns a verdict under both, and that no `{}.` artifact remains. The build fails on `EMPTY_IMPORT_META` through an `onwarn` handler. |
| P11 | No guide, no README, no registry metadata, prerequisites undocumented | documentation of the consumed surface | IMPLEMENT | degrades-consumers | `guides/probe.md` states the four executed prerequisites (a Vitest project literally named `probe`; that project including `tmp/probe/**/*.test.ts`; a `tsconfig.json` resolving at least one input; the workspace's `typescript`, `oxlint`, and `vitest` being the same resolved files probe resolves). `README.md` states what a probe proves, the `probe` binary, its MCP tool, and one runnable claim. `package.json` carries a non-default description and non-empty `keywords`. `tests/guides.test.ts` enforces parity. |
| P12 | `formatFinding` `@example` does not compile | TSDoc truth | REPAIR | degrades-consumers | Both calls carry `origin`, and a test compiles every extracted `@example` block under the root project settings with a planted-defect control that must fail. 1 of 48 blocks fails today, and it ships in `dist/src/core/index.d.ts`. |
| P13 | Two unapplied doc-truth defects | TSDoc truth | REPAIR | degrades-consumers | `src/core/types.ts:100` stops declaring a `control` byte-identical to the case, and `src/core/shapers.ts:69` names `isClaim`, the guard `src/server/factories.ts:65` actually applies. |
| P14 | Coordinator deadline does not bound synchronous stage work | concurrency, liveness | REPAIR | degrades-consumers | Caller-influenced work — project parsing, semantic diagnostics, the module snapshot — yields or runs off the loop, and a test bounds the longest timer stall during a proof over a caller-named tree-wide project. Measured: a 100 ms deadline fired at 202 ms and 225 ms; a hostile project stalled the loop 1783 ms. |
| P15 | Arming failure is permanent and reports a stage-timeout message | lifecycle, boot | REPAIR | degrades-consumers | A boot-origin failure names arming, and either `prove` re-arms or the message states the failure is terminal; a test asserts the second `prove` after a boot expiry carries the boot-origin message. |
| P16 | No shutdown path in the shipped entry; orphan specifications break the consumer's gates | resource cleanup | IMPLEMENT | degrades-consumers | `src/bin/main.ts` installs `SIGINT` and `SIGTERM` handlers that await `probe.destroy()`, `RuntimeStage` deletes stale `*.probe-*` siblings at warm, and a test asserts a signalled host leaves none and a pre-existing orphan is removed at construction. |
| P17 | Instrument fault on the test path rejects instead of reporting | failure routing | REPAIR | degrades-consumers | A missing target directory and a write failure return an `origin: 'instrument'` finding on the runtime check rather than a bare `Error` that loses the other two stages' checks. |
| P18 | `TypeStage` infers the project from the declared spelling | instrument correctness | REPAIR | degrades-consumers | `inspect` resolves each candidate path before inferring its project, and a test asserts two spellings of one resolved file return the same findings. The false finding carries `origin: 'code'`, the origin `computeReceipt` counts. |
| P19 | `TypeStage` publishes members absent from `src/server/types.ts` | `*/types.ts` authority | REPAIR | internal-quality | `src/server/types.ts` declares a `TypeStageInterface` carrying `candidates` and the two-parameter `inspect`, `TypeStage` implements it, and the barrel test asserts published members equal that interface's. |
| P20 | `Overlay` is barrelled with no consumer seam, and no `INTERNAL` list exists | barrel membership | REPAIR | internal-quality | Either a stage constructor accepts an `OverlayInterface`, or `Overlay` leaves the barrel and is named in an `INTERNAL` list the parity gate reads. |
| P21 | 11 of 12 barrelled server helpers carry no `@example` | TSDoc completeness | REPAIR | internal-quality | Each of the eleven carries a runnable `@example` a test executes, or leaves the barrel. |
| P22 | Revision-file cleanup comment states a glob match that does not exist | documentation truth | REPAIR | internal-quality | The comment names the gates the orphan enters and drops the glob claim. The sweep itself is right. |
| P23 | `engines.node` admits Node 23, which `vitest@4` excludes | supported runtime targets | REPAIR | internal-quality | `engines.node` reads `^22.12.0 \|\| >=24.0.0`. |
| P24 | Proven seams: guard exactness (23 vectors, 0 divergences, `CASE_SHAPE` control fired); core TSDoc runtime truth (33 claims, 0 failed); ESM dual-mode declaration resolution under `skipLibCheck: false` with a firing `nonExistent` control; tarball, `exports`, `files`, and hygiene alignment; the shipped bin driven by a foreign JSON-RPC client; barrel completeness and readonly public collections; three overlapping `prove` calls each earning a receipt; throwing listeners routed to `options.error`; FD delta 0 over 24 proofs and flat heap over 70 proofs across the 64-specification recycle; no orphan oxlint child after host death; 14 hostile-shape guard vectors; idempotent destroy; no dual-package identity hazard | multiple | RETAIN | internal-quality | Each is proven once and bound by nothing. They close as retained when P10's distribution test and the guides parity gate pin them, so a future edit that contradicts one fails a gate. |
| P25 | `moduleResolution: node10` and the absent top-level `types` field | package consumption | EXCLUDE | internal-quality | Excluded: `tsc` under the peered TypeScript reports `TS5107: Option 'moduleResolution=node10' is deprecated and will stop functioning in TypeScript 7.0`. Re-open only if a consumer class pinned below TypeScript 6 enters the support statement. |

## 3. BLOCKERS, in close order

1. **P1 — npm 10 install crash.** Nothing else matters while the package cannot enter a consumer's tree. One manifest field, verified.
2. **P2 — TypeScript 7 peer range.** A fresh install today resolves a TypeScript with no compiler API. Bound the range and name the fault.
3. **P10 — the distribution gate.** Land it third, not last. It is the mechanism that catches P1, P2, P3, and every future instance of them, and it makes the remaining blockers verifiable rather than asserted.
4. **P3 — CommonJS `{}.resolve`.** Two of three stages are dead for every CJS consumer, and the failure is swallowed at construction by `void this.#typescript.catch(() => {})` so it surfaces only at the first `prove`.
5. **P4 — receipt forgery through `project`.** The receipt is the package's entire output. Until it records what judged the case, it certifies nothing.
6. **P5 — candidates unreachable at the runtime stage.** The advertised primary capability does not work, and the resulting failure is attributed to the consumer's code.
7. **P6 — type and lint expiry kills the probe.** A resident MCP server that dies on one slow claim and answers every later call with a stale message is not a server.
8. **P7 — `LintStage.destroy()` hang.** Fix the defect and delete the suite's `Promise.race` hedge in the same change.
9. **P8 — `createProbeServer` lifecycle.** The documented sequence never returns. The fix site is `@orkestrel/mcp`'s `stop()`, so this is a dependency bump plus a probe-side test, not a probe-side patch.
10. **P9 and P11 — a claim that earns a receipt, and prose a consumer can read.** A tool whose documentation cannot demonstrate its own success condition is not shippable at any quality bar.

## 4. ACCEPTED LIMITS

- **`moduleResolution: node10` is unsupported.** The mode is deprecated in the peered TypeScript 6 and removed in 7. No supported consumer configuration reaches it.
- **Sourcemaps embed full TypeScript source text.** Every map carries complete `sourcesContent` with zero nulls and no absolute build paths, so maps resolve standalone in a consumer's debugger. Publishing source inside maps is a disclosure choice, and it is the fleet's choice.
- **`guides/` is not in `files`.** The fleet convention ships `dist/src`, `dist/bin`, `README.md`, and `LICENSE`. This stops being acceptable only where the README's guide link must resolve from `node_modules`.
- **No branded identity crosses the ESM and CJS graphs.** Loading core through both gives distinct objects, and `isClaim` returns `true` in both, because the package uses no `instanceof` and no `Symbol()` in core. This is safe as built.
- **`Case` and `Claim` guards refuse hostile shapes exactly as documented**, and path strings the guard admits are refused downstream by `resolveWorkspaceFile`. The rejection *style* for those three is P17, not a guard defect.

## 5. UNPROVEN

| Seam | Command that settles it |
|---|---|
| A failed re-warm after the 64-specification bound leaves the runtime stage permanently rejected | Run a `RuntimeStage` over a scratch workspace for 65 inspections, replace `vite.config.ts` with a config `createVitest` rejects between inspection 64 and 65, and assert inspection 66 reports a recoverable fault: `npx vitest run --config vite.config.ts --project probe <that test>` |
| Windows behaviour of every lifecycle finding — the signal-kill orphan sweep, the orphaned lint child, `ENAMETOOLONG`, and the `SIGKILL` fallback are POSIX-specific in mechanism | `npm test` plus the shutdown-orphan and teardown-hang probes on a `win32` host, recorded beside the Linux results |
| A supplied candidate that shadows an existing file on disk | Repeat the three-specifier candidate probe with a real file present at the candidate path, and record whether the type and runtime stages disagree about which text they read |

---



---

# Lane reports

All probes run; `tmp/probe/` removed and `git status` clean.

ROW: `formatFinding` @example does not compile
SEAM: public contract and documentation — TSDoc truth
STATE: REPAIR
EVIDENCE: Extracted all 48 `@example` blocks in `src/`, wrapped each as one compile unit against the package's own `strict`/`exactOptionalPropertyTypes` settings. Exactly one failed:
`tmp/probe/ex/ex05.ts(20,16): error TS2345: Argument of type '{ path: string; message: string; line: number; }' is not assignable to parameter of type 'Finding'. Property 'origin' is missing` (and again at 22,16). Source is `/workspace/probe/src/core/helpers.ts:10-16` — both documented calls omit the required `origin`. The same defect ships: `dist/src/core/index.d.ts` carries 35 `@example` blocks including this one. `origin` is required deliberately — `/workspace/probe/src/core/validators.ts:134` says "`origin` is required rather than optional." Instrument controls (drawn from outside the failing population): corrupting `ex13` to `const stage: Stage = 'typecheck'` produced TS2322, and `ex21` to `vitest: 4110` produced TS2322; both cleared on restore.
CLOSES WHEN: both calls in the `formatFinding` `@example` carry an `origin` member, and a test compiles every extracted `@example` block under the root project settings with a planted-defect control that must fail.
SEVERITY: degrades-consumers

ROW: Documented `createProbeServer` lifecycle never returns
SEAM: public contract and documentation — @example truth, lifecycle contract
STATE: REPAIR
EVIDENCE: Ran the `@example` at `/workspace/probe/src/server/factories.ts:44-51` verbatim from a linked consumer against the published `exports` map. `timeout 90 node exitcheck.mjs server` → `Terminated`, wall 90016 ms, twice; a first run at 120 s also hung. The control — the identical script without `createProbeServer` — exits: `destroy resolved at 3281 ms` / `exit at 3291 ms`, wall 3468 ms, and again at 3448 ms. Instrumented state immediately after `stop()`: `stdin reading? true listeners: 1 0`, and 4 s after `await destroy()`: `["PipeWrap","PipeWrap","PipeWrap"] stdin destroyed? false`. Two documented claims are false: `/workspace/probe/src/server/types.ts:162-168` "Stops the standard-input pump", and `/workspace/probe/src/core/types.ts:342-347` "@returns A promise that settles when every engine has released its resources". Fix site is downstream: `node_modules/@orkestrel/mcp/dist/src/server/index.js:1773` implements `stop()` as `transport.close()`, which leaves the `data` listener attached and `readableFlowing === true`. The published `dist/bin/main.js` is unaffected because it never calls `stop()` and dies on stdin EOF.
CLOSES WHEN: `createProbeServer(probe).stop()` leaves `process.stdin.listenerCount('data') === 0`, and a test that runs the documented `start`/`stop`/`destroy` sequence in a child process with an open stdin pipe observes the child exit within a bounded time.
SEVERITY: blocks-release

ROW: `Case.files` documented as importable by the test; the runtime stage cannot import them
SEAM: public contract and documentation — declared property meaning versus behaviour
STATE: REPAIR
EVIDENCE: `/workspace/probe/src/core/types.ts:54` declares `files` as "The candidate sources the test imports"; the same wording is the shipped MCP tool schema (`"description":"The candidate sources the test imports."` in the live `tools/list` response). Supplied `src/core/greeting.ts` as text and had the test import it, over three specifier forms, against the real workspace:

```
../../../src/core/greeting.js   type: clean   runtime: code Cannot find module '../../../src/core/greeting.js'
../../../src/core/greeting.ts   type: clean   runtime: code Cannot find module '../../../src/core/greeting.ts'
../../../src/core/greeting      type: clean   runtime: code Cannot find module '../../../src/core/greeting'
```

The type stage resolves the text-only candidate (clean case, and the control's `Type 'string' is not assignable to type 'number'.` surfaces); the runtime stage does not. The finding carries `origin: "code"` — verified by printing origins — which contradicts `/workspace/probe/src/core/types.ts:113-127`, where `instrument` is defined to cover "a module that ran no test", and lets such a failure satisfy the receipt condition at `/workspace/probe/src/core/helpers.ts:105-110`. Coverage: I tested only candidates with no file on disk at that path; a candidate shadowing an existing disk file was not tested.
CLOSES WHEN: either a test importing a text-only candidate resolves at the runtime stage (proven by a claim whose case imports a supplied candidate and earns a receipt), or `Source`/`Case` state on the type that the runtime stage does not serve candidates to the module graph and the resulting failure is emitted with `origin: 'instrument'`.
SEVERITY: blocks-release

ROW: No documented claim can earn a receipt
SEAM: public contract and documentation — worked-example adequacy
STATE: IMPLEMENT
EVIDENCE: The test text `test("greets", () => {})` is the only worked `Source.text` for a test in the whole surface — `src/core/types.ts:49`, `:72`, `:96`, `src/core/validators.ts:67`, `:81`. Ran the flagship `Claim` from `src/core/types.ts:95-101` verbatim through `createProbe`/`prove`:

```
case lint: 1 finding  tests/src/core/greeting.test.ts:1 Test has no assertions
case runtime: 1 finding  tests/src/core/greeting.test.ts:1 test is not defined
no receipt
```

Repairing the already-known byte-identical control (using the `Control` `@example` text from `types.ts:70`) is not sufficient — the control's type error appears, and the verdict is still `no receipt`, because the documented test text fails lint and runtime on the *case*. The package's own passing fixture (`tests/src/server/Probe.test.ts:63`) uses `import { expect, test } from 'vitest'` and asserts, and imports no candidate at all — a form that appears in no `@example`. This extends the known "control byte-identical to case" row rather than restating it: fixing that row alone still yields no receipt.
CLOSES WHEN: at least one `@example` (or a guide section) carries a complete claim that, run against this workspace, returns a `Verdict` with a defined `receipt`, and a test asserts that receipt is issued from the exact literal the documentation shows.
SEVERITY: blocks-release

ROW: Published prose surface is the scaffold stub
SEAM: public contract and documentation — what a consumer can learn
STATE: IMPLEMENT
EVIDENCE: `npm pack --dry-run` ships 17 files, 508053 B unpacked. The only prose is `README.md` at 98 B, whose entire body is "The @orkestrel/probe package." plus `npm install` / `npm test`. `package.json` carries `{"description":"The @orkestrel/probe package.","keywords":[]}` — the registry listing. `guides/` is not in `files`, and `PROBE.md` (71917 B at the repo root) is not shipped either. The package installs a `probe` binary on PATH (`bin.probe → ./dist/bin/main.js`) and an MCP stdio server; neither is mentioned anywhere a consumer can read. A consumer of `@orkestrel/probe/server` must also import types from `@orkestrel/probe` (the server barrel re-exports no core type — correct under the barrel rule) and nothing says so.
CLOSES WHEN: `README.md` states what a probe proves, the install line, the `probe` binary and its MCP tool, and one complete runnable claim; `package.json` carries a description that is not the scaffold default and non-empty `keywords`; and `files` ships whatever guide the parity gate checks.
SEVERITY: degrades-consumers

ROW: `Overlay` is barrelled but has no consumer seam, and there is no `INTERNAL` list
SEAM: public contract — barrel membership versus INTERNAL
STATE: REPAIR
EVIDENCE: `src/server/index.ts:4` barrels `Overlay`; `dist/src/server/index.d.ts` publishes it. Enumerating every published class member from the shipped `.d.ts`, no public signature accepts or returns an `OverlayInterface`: all three stages are `constructor(workspace?: string)`, and the only overlay-derived public value is `TypeStage.candidates`, which returns `this.#overlay.paths` (`src/server/stages/TypeStage.ts:70-77`). That is exactly the interning test in `.claude/rules/architecture.md:255-257` — "the public value is a projection of the instance rather than the instance". A consumer can call `new Overlay()` (verified: `OK new Overlay() (1 ms) "x"`) and then feed it to nothing. No `INTERNAL` list exists in this repository: `grep -rn INTERNAL .claude tests configs vite.config.ts` returns only the rule text itself.
CLOSES WHEN: either a stage constructor accepts an `OverlayInterface` so a consumer can inject the instance they built, or `Overlay` leaves `src/server/index.ts`, its `@example` goes with it, and it is named in an `INTERNAL` list the parity gate reads.
SEVERITY: internal-quality

ROW: `TypeStage` publishes members absent from `src/server/types.ts`
SEAM: public contract — `*/types.ts` authority
STATE: REPAIR
EVIDENCE: Enumerated published members from `dist/src/server/index.d.ts`. `LintStage`, `RuntimeStage`, `Probe`, `Overlay` match their declared interfaces exactly. `TypeStage` publishes two members no interface declares — `get candidates(): readonly string[]` and a second parameter on `inspect(subject: Case_2, project?: string)` — while `StageInterface` (`src/server/types.ts:103-126`) declares `inspect(subject: Case): Promise<Check>` and no `candidates`. `src/server/stages/TypeStage.ts:80-84` acknowledges this in prose ("The second parameter is this stage's own, not the stage contract's") but `AGENTS.md` makes `*/types.ts` authoritative and requires public types be defined there first. `Probe` depends on the undeclared parameter (`src/server/Probe.ts` type queue handler passes `inspection.claim.project`).
CLOSES WHEN: `src/server/types.ts` declares a `TypeStageInterface` carrying `candidates` and the two-parameter `inspect`, `TypeStage implements` it, and the barrel-membership test asserts the class's published members equal that interface's.
SEVERITY: internal-quality

ROW: 11 of 12 barrelled server helpers carry no `@example`
SEAM: public contract and documentation — TSDoc completeness
STATE: REPAIR
EVIDENCE: Scanned every `export const|function|class|interface|type` in `src/**/*.ts` for `@param`/`@returns`/`@example`. Zero flags across all of `src/core`. In `src/server/helpers.ts`, only `readWorkspaceManifest` (line 63) has an `@example`; these eleven have none: `resolveWorkspaceFile:15`, `relativeWorkspaceFile:32`, `resolveWorkspaceModule:44`, `resolveWorkspaceBinary:80`, `inferTypeProject:104`, `inferTestProject:118`, `inferDocumentLanguage:132`, `createRevisionFile:148`, `matchesWorkspaceModule:161`, `parseContentLength:171`, `messageFromUnknown:185`. All eleven are in the server barrel and all eleven ship in `dist/src/server/index.d.ts`, so a consumer holding `parseContentLength` or `createRevisionFile` has one description line and nothing else. Instrument controls drawn from outside the flagged population, run on a copy under `tmp/probe/srccopy`: stripping the `@example` from `PROBE_STAGES` flagged `no-@example`, and an appended undocumented export flagged `NO-TSDOC`. Coverage: the scan matches single-line `export` declarations at line start only; `index.ts` contains only `export *`, so nothing is missed there.
CLOSES WHEN: each of the eleven either carries a runnable `@example` a test executes, or leaves the barrel because it is not an intentional reusable capability.
SEVERITY: internal-quality

ROW: `isClaim` equals `compileGuard(CLAIM_SHAPE)`
SEAM: public contract — documented equivalence between the in-process guard and the wire guard
STATE: RETAIN
EVIDENCE: `/workspace/probe/src/core/validators.ts:99-100` claims they "Admit and refuse exactly what `compileGuard(CLAIM_SHAPE)` does". Differential-tested both against the built `dist` over 23 vectors including whitespace-only `project`/`reason`/`path`, empty strings, `undefined` versus missing members, excess members at all four nesting levels, a null-prototype claim, a `__proto__` payload, a boxed `String` path, a sparse `files` array, a non-array `files`, and non-object claims: **23 vectors, 0 divergences**. Negative control drawn from outside the population — `isClaim` versus `compileGuard(CASE_SHAPE)` — reported 2 divergences on 2 vectors, so the instrument does discriminate.
CLOSES WHEN: retained; the differential with its `CASE_SHAPE` control is adopted as a test so a future shape edit that splits the two guards fails a gate.
SEVERITY: internal-quality

ROW: Core TSDoc examples are true at runtime
SEAM: public contract and documentation — TSDoc truth
STATE: RETAIN
EVIDENCE: Executed every self-contained documented claim in `src/core` against the built ESM `dist` — 33 assertions covering `PROBE_STAGES`, `FINDING_ORIGINS`, `RECEIPT_PREFIX`, `RECEIPT_SEPARATOR`, `formatFinding` (both forms), `formatCheck`, `formatVerdict`, `computeReceipt` (both branches), all four shape guards, `compileSchema(CLAIM_SHAPE).type`, and all ten validators including their documented `false` cases. Result: `33 documented claims run, 0 FAILED`. Every commented-out value in every core `@example` is the value the shipped code produces.
CLOSES WHEN: retained; adopt the runner as a test so a formatter or receipt change that contradicts a documented output fails a gate.
SEVERITY: internal-quality

ROW: Dual-mode type resolution for a real consumer
SEAM: package consumption — published `exports` and declaration files
STATE: RETAIN
EVIDENCE: Built a scratch consumer with the package linked into `node_modules/@orkestrel/probe`, so the `exports` map governs resolution. ESM consumer (`"type":"module"`, `module: node20`, `moduleResolution: node16`, **`skipLibCheck: false`**) importing types and values from both `.` and `./server` and constructing all five barrelled classes: **exit 0, no diagnostics**. CJS consumer (no `"type"`, same settings): **exit 0**; `--traceResolution` confirms it took the `require` branch — `Module name '@orkestrel/probe' was successfully resolved to '/workspace/probe/dist/src/core/index.d.cts'` and `'@orkestrel/probe/server' … index.d.cts`. Negative control fired: adding a `nonExistent` import produced `TS2305: Module '"@orkestrel/probe"' has no exported member 'nonExistent'`. The self-referencing `import { Case } from '@orkestrel/probe'` inside the server declarations resolves correctly for a consumer.
CLOSES WHEN: retained; this is the missing `tests/distribution.test.ts` content (already a known row) — pin it there with the `nonExistent` control.
SEVERITY: internal-quality

ROW: Every barrelled class is constructible and drivable from values a consumer holds
SEAM: public contract — barrel row obligation
STATE: RETAIN
EVIDENCE: From the linked consumer over the published `./server` ESM entry, holding only a workspace path and a `Case`:

```
OK new Overlay() (1 ms) "x"
OK new TypeStage(ws).inspect (1688 ms) {"stage":"type","findings":0}
OK new LintStage(ws).inspect (232 ms) {"stage":"lint","findings":0}
OK new RuntimeStage(ws).inspect (565 ms) {"stage":"runtime","findings":[]}
```

`Probe` likewise: `createProbe({workspace})` → `prove(claim)` returned a full `Verdict` with all six checks. Every constructor is `()` or `(workspace?: string)` or `(options?: ProbeOptions)` — no class requires a value only its owner produces.
CLOSES WHEN: retained.
SEVERITY: internal-quality

ROW: Published binary and advertised MCP tool schema
SEAM: public contract — externally driven surface
STATE: RETAIN
EVIDENCE: Drove the shipped `dist/bin/main.js` over stdio with a real JSON-RPC client:
`{"result":{"capabilities":{"tools":{}},"protocolVersion":"2025-11-25","serverInfo":{"name":"probe","version":"0.0.1"}}}`, then `tools/list` returned the `prove` tool whose `inputSchema` carries every `objectShape` description from `src/core/shapers.ts`, `additionalProperties:false`, `minLength:1` on `path`, and the correct `required` sets. The advertised schema and the enforced guard are provably the same value (preceding differential row).
CLOSES WHEN: retained; the binary is undocumented, which is carried by the README row.
SEVERITY: internal-quality

ROW: Barrel completeness and readonly public collections
SEAM: public contract — barrel membership, immutability
STATE: RETAIN
EVIDENCE: Both barrels contain only `export * from './module.js'` and cover every file in their environment, so no intentional export is stranded. `tests/src/core/index.test.ts:8-31` and `tests/src/server/index.test.ts:6-26` pin the exact export sets (22 and 19), and both stated the population before drawing from it. Runtime confirms: `ESM core: 22 exports`, `ESM server: 19 exports`, `CJS core: 22`, `CJS server: 19`. Every public collection in `src/core/types.ts` is `readonly` (`Case.files`, `Verdict.checks`, `Verdict.control`, `Check.findings`, `ProbeEventMap` tuples) and `OverlayInterface.paths` is `readonly string[]`; `Probe` freezes `#toolchain` and both check arrays before returning them.
CLOSES WHEN: retained.
SEVERITY: internal-quality

Known rows, confirmed in one line each:

- **No guide, no parity gate** — confirmed: `guides/` holds only nine vendored dependency guides and no `probe.md`; `guides/README.md` itself prints "Not created. Create this file when the workspace has a public surface: `guides/probe.md`" three times while the workspace has one; no `tests/guides.test.ts` exists.
- **CJS server entry crashes** — confirmed with execution, not inspection: the entry *loads* (19 exports) but `dist/src/server/index.cjs:681` and `:1061` contain `{}.resolve("vitest/node")` / `{}.resolve("typescript")`, and driving it gives `FAIL new TypeStage(cwd).inspect: TypeError: {}.resolve is not a function` and the same for `RuntimeStage`; `Overlay` alone survives.
- **Two unapplied doc-truth defects** — confirmed: `src/core/types.ts:100` still declares `control: { files: [greeting], … }` byte-identical to the case, and `src/core/shapers.ts:69` still says "admits a call with `compileGuard(CLAIM_SHAPE)`" while `src/server/factories.ts:65` admits with `isClaim(input)`.
- **No `tests/distribution.test.ts`** — confirmed absent; the dual-mode consumer probe above is its content.
- **`PROBE.md` open reconciliation list** — confirmed present at 71917 B and confirmed *not published* (`files` ships only `dist/src`, `dist/bin`, `README.md`).

Two notes on method. First, `AGENTS.md` and `.claude/rules/quality.md` in this repo are the vendored scaffold host copies, identical to the ones in the system prompt; I graded on coverage, not on further interleavings against seams already proven. Second, the instruction directed probes to `tmp/probe/` and deletion afterwards; `tmp/` is gitignored and I did not enumerate it before `mkdir -p tmp/probe`, so if a prior campaign kept anything at that exact path it was removed with my scratch. `tmp/codex` is untouched and `git status` is clean.

BLOCKERS: Documented `createProbeServer` lifecycle never returns; `Case.files` documented as importable by the test while the runtime stage cannot import them; No documented claim can earn a receipt.

---

ROW: Wire-chosen `project` mints a receipt the workspace's own project refuses
SEAM: hostile input at the MCP tool boundary / receipt integrity
STATE: REPAIR
EVIDENCE: `Claim.project` is `isNonEmptyString` (src/core/validators.ts:112) and is passed unchecked to `TypeStage.inspect` for every candidate (src/server/Probe.ts:89), so the caller selects the compiler configuration that judges its own case. Two `prove()` calls with byte-identical `case`, `control`, and candidate text (`export function read(value: string | undefined): number { return value.length }`), differing only in `project`:
```
honest project  -> receipt=undefined
caller project  -> receipt=probe:88a5addc-7d33-40dc-9a5a-104b71f8787d:runtime:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11
```
where honest = `configs/src/tsconfig.core.json` and caller = a `strict: false` config the caller names. Isolated type checks of the same source: `project "configs/src/tsconfig.core.json" -> type=["code: 'value' is possibly 'undefined'."]`, `project "tmp/probe/lax.tsconfig.json" -> type=[]`. The clean type check satisfies `computeReceipt`'s first condition (src/core/helpers.ts:107), and neither `Verdict` (src/core/types.ts) nor the receipt token (src/core/helpers.ts:112-119) records which project produced it, so the forged receipt and the honest one are indistinguishable downstream. Negative control: the honest project on the identical claim issues no receipt.
CLOSES WHEN: `Verdict` carries the resolved project the type stage used, `formatVerdict` prints it, the receipt token includes it, and a test asserts two verdicts over one claim under two projects carry different receipt tokens.
SEVERITY: blocks-release

ROW: Type and lint deadline expiry destroys the stage and never replaces it
SEAM: lifecycle / deadline propagation
STATE: REPAIR
EVIDENCE: `#inspectStage` destroys the stage on expiry (src/server/Probe.ts:263) but `#type` and `#lint` are `readonly` and only `#runtime` has `#recycle` (src/server/Probe.ts:289-309). Probe against a scratch workspace whose language server stalls on one path, deadline 6000 ms, after a successful `arm`:
```
first  prove -> Error: The lint stage exceeded 6000 ms
LATER PROOF: {"outcome":"rejected","error":"Error: The lint stage has been destroyed"}
```
The later claim touched no stalling path; the probe is dead for the life of the process. The class `@remarks` promises replacement only for the runtime stage (src/server/Probe.ts:34-35), so this is unhandled rather than documented. A destroyed `TypeStage` refuses identically: `DESTROYED TYPE STAGE INSPECT -> Error: The type stage has been destroyed`.
CLOSES WHEN: a type or lint expiry replaces its stage the way `#recycle` replaces the runtime stage, and a test proves a claim served cleanly after an expiry at each of the three stages.
SEVERITY: blocks-release

ROW: `LintStage.destroy()` never settles when the server answers shutdown and does not exit
SEAM: resource ownership / teardown
STATE: REPAIR
EVIDENCE: `#destroy` awaits an unbounded `released` promise for the child's `exit`/`close` (src/server/LintStage.ts:100-105); `#retire` only sends `SIGKILL` when the shutdown *conversation* throws (src/server/LintStage.ts:111-118), so a server that replies to `shutdown` and ignores `exit` is never killed. Probe with a protocol-faithful fixture that answers `initialize`, publishes diagnostics, answers `shutdown`, and ignores `exit`:
```
LINT DESTROY (server ignores exit): HUNG after 10003ms
```
`Probe.destroy()` awaits `Promise.all([...])` with no deadline (src/server/Probe.ts:327), so the coordinator inherits the hang and the child leaks for the host's lifetime. `StageInterface.destroy` documents "settles after the resident tool releases its resources" (src/server/types.ts:118-123). The package's own test hedges this path with `Promise.race([probe.destroy(), waitForDelay(5_000)])` (tests/src/server/Probe.test.ts:356).
CLOSES WHEN: `#destroy` bounds the wait for the child's exit and sends `SIGKILL` when it expires, and a test with a fixture that ignores `exit` asserts `destroy()` settles and the child process is gone.
SEVERITY: blocks-release

ROW: The coordinator deadline does not bound synchronous stage work
SEAM: concurrency / liveness under hostile input
STATE: REPAIR
EVIDENCE: `#inspectStage` races the operation against a timer (src/server/Probe.ts:258-261), but `TypeStage.inspect`'s body after `await this.#typescript` is synchronous (src/server/stages/TypeStage.ts:104-122), as is `#service`'s `parseJsonConfigFileContent` (src/server/stages/TypeStage.ts:194) and `RuntimeStage.#snapshot`'s full-tree sha256 walk (src/server/stages/RuntimeStage.ts:389-415). A 100 ms deadline on this repository fired at 202 ms and 225 ms across two runs. One caller-named `project` whose `include` expands over `node_modules` produced, with the deadline set to 5000 ms and never firing:
```
HOSTILE PROJECT: 2211ms (deadline 5000ms) worstTimerStall=1783ms -> fulfilled
```
An ordinary proof on this small repository already stalls the loop 331 ms. During the stall every stage, every queue, and the MCP stdio transport are blocked, and the magnitude is set by wire input and target size.
CLOSES WHEN: work whose duration the caller can influence — project parsing, semantic diagnostics, the module snapshot — runs off the coordinator's loop or yields cooperatively, and a test asserts the longest timer stall during a proof over a workspace with a caller-named tree-wide project stays under a stated bound.
SEVERITY: degrades-consumers

ROW: An arming failure is permanent and every later proof reports it in 0 ms
SEAM: lifecycle / boot
STATE: REPAIR
EVIDENCE: `#arming` is stored once (src/server/Probe.ts:103) and every `prove` awaits it (src/server/Probe.ts:120); there is no re-arm. The boot control runs through the same deadline as a claim, so a transient boot slowness condemns the instance:
```
exp1: 215ms -> Error: The type stage exceeded 100 ms
exp2:   0ms -> Error: The type stage exceeded 100 ms
exp3:   4ms -> Error: The type stage exceeded 100 ms
```
The 0 ms rejections are the cached arming rejection, not a fresh inspection. `src/bin/main.ts` constructs the probe once at process start, so a slow boot leaves the shipped MCP server answering every tool call with a stale stage-timeout message that names no boot origin — the package's own test records that a boot timeout "carries the identical message a stage timeout carries" (tests/src/server/Probe.test.ts:326-328).
CLOSES WHEN: a boot-origin failure is reported with a message that names arming, and either `prove` re-arms on a boot failure or the failure is terminal by design and the message says so; a test asserts the second `prove` after a boot expiry carries the boot-origin message.
SEVERITY: degrades-consumers

ROW: No shutdown path in the shipped entry, and the generated specification survives into the target's gates
SEAM: resource cleanup / package consumption
STATE: IMPLEMENT
EVIDENCE: `grep -rn "process.on\|SIGINT\|SIGTERM\|beforeExit\|unref" src/` returns nothing, and `src/bin/main.ts` is three lines that never call `destroy`. A host proving a hanging runtime test, stopped the way an MCP client stops a stdio server:
```
SIGTERM to 8236
--- after SIGTERM ---
host and child gone
crashcase.test.probe-3a6953b6-....ts
crashcase.test.probe-77880d08-....ts
```
Two orphans accumulated across two host lifetimes; nothing sweeps `*.probe-*` at boot. With one orphan present in `tests/src/core/`, the target workspace's own gates fail:
```
npm run format:check -> Format issues found in above 1 files
npm run lint:check   -> tests/src/core/crashcase.test.probe-....ts:2:1: error vitest(expect-expect): Test has no assertions
```
The orphan is a `.ts` file under `tests/`, which `tsconfig.json` (`exclude: ["node_modules","dist","tmp"]`) also compiles. `RuntimeStage.#destroy` cleans `#revisions` (src/server/stages/RuntimeStage.ts:164-169) but only on a graceful teardown nothing invokes.
CLOSES WHEN: `src/bin/main.ts` installs `SIGINT` and `SIGTERM` handlers that await `probe.destroy()` before exit, `RuntimeStage` deletes stale `*.probe-*` siblings of its target directories at warm, and a test asserts a signalled host leaves no `*.probe-*` file and that a pre-existing orphan is removed at construction.
SEVERITY: degrades-consumers

ROW: An instrument fault on the test path rejects the proof instead of reporting an instrument finding
SEAM: hostile input / failure routing
STATE: REPAIR
EVIDENCE: `RuntimeStage.inspect` throws on a missing test directory (src/server/stages/RuntimeStage.ts:113-115) and lets `writeFileSync` throw (src/server/stages/RuntimeStage.ts:116), while every other machinery fault it raises becomes an `origin: 'instrument'` finding as its `@remarks` state (src/server/stages/RuntimeStage.ts:48-51). Driving wire-legal paths through the real stage:
```
PATH "tests/src/core/absent/deep/x.test.ts" -> throw Error: The runtime test directory does not exist: /workspace/probe/tests/src/core/absent/deep
PATH "tests/src/core/<400 x>.test.ts"       -> throw Error: ENAMETOOLONG: name too long, open '.../....test.probe-2a1074b9-....ts'
PATH "tests/src/core/../../../root-escape.test.ts" -> check [{"origin":"instrument", ...}]
```
The ENAMETOOLONG path is legal until the stage appends its own 43-character `.probe-<uuid>` suffix. A rejection loses the other two stages' checks and reaches the caller as a bare `Error`, not a verdict.
CLOSES WHEN: a missing target directory and a write failure return an `origin: 'instrument'` finding on the runtime check, and a test asserts each of those two paths yields a verdict whose runtime check names the fault.
SEVERITY: degrades-consumers

ROW: `TypeStage` infers the scoped project from the declared spelling, not the resolved path
SEAM: hostile input / instrument correctness
STATE: REPAIR
EVIDENCE: `inferTypeProject(source.path)` reads the raw declared string (src/server/stages/TypeStage.ts:111) while `#record` and `#findings` resolve it (src/server/stages/TypeStage.ts:181, 266). `RuntimeStage` fixed exactly this class and says so (src/server/stages/RuntimeStage.ts:277-279). One source text at one resolved file, two spellings:
```
DECLARED SPELLING (src/core/../server/wire.ts) -> [{"origin":"code","path":"src/server/wire.ts","message":"Cannot find name 'process'. ..."}]
RESOLVED SPELLING (src/server/wire.ts)         -> []
```
The false finding carries `origin: 'code'`, the origin `computeReceipt` counts. Reachable through the published `TypeStage` export and its documented default project behaviour (src/server/stages/TypeStage.ts:88-90), not through `Probe.prove`, because `claim.project` is always supplied and overrides inference.
CLOSES WHEN: `inspect` resolves each candidate path against the workspace before inferring its project, and a test asserts the two spellings above return the same findings.
SEVERITY: degrades-consumers

ROW: The revision-file cleanup comment states a glob match that does not exist
SEAM: documentation truth on a cleanup path
STATE: REPAIR
EVIDENCE: `RuntimeStage.#destroy` justifies its sweep with "that file matches the workbench project's glob" (src/server/stages/RuntimeStage.ts:161-163). `createRevisionFile` inserts the token before the extension, not after the stem:
```
tests/src/core/x.test.ts  -> tests/src/core/x.test.probe-UUID.ts
tmp/probe/expiry.test.ts  -> tmp/probe/expiry.test.probe-UUID.ts
```
Neither ends in `.test.ts`, so neither matches `tmp/probe/**/*.test.ts` (vite.config.ts:184) nor `tests/src/core/**/*.test.ts` (vite.config.ts:44). The sweep is still right — the orphan breaks `format:check`, `lint:check`, and the root `tsc` project, proved in the shutdown row — so the comment, not the code, is wrong.
CLOSES WHEN: the comment names the gates the orphan actually enters and drops the glob claim.
SEVERITY: internal-quality

ROW: A failed re-warm after the 64-specification bound leaves the runtime stage permanently rejected
SEAM: lifecycle / stage fault recovery
STATE: UNPROVEN
EVIDENCE: `#runner` assigns `this.#vitest = this.#replace(this.#vitest)` (src/server/stages/RuntimeStage.ts:358) and `#replace` closes the old instance before calling `#warm()` (src/server/stages/RuntimeStage.ts:363-368). A throw from `#warm` stores a permanently rejected promise; the coordinator's `#recycle` only runs on a deadline expiry (src/server/Probe.ts:281), so no other fault replaces the stage. I did not reach this state: forcing it needs a workspace whose `vite.config.ts` is valid at warm and invalid at re-warm.
CLOSES WHEN: run a `RuntimeStage` over a scratch workspace for 65 inspections, replace `vite.config.ts` with a config `createVitest` rejects between inspection 64 and 65, and assert inspection 66 reports a recoverable fault rather than the same rejection forever. Command: `npx vitest run --config vite.config.ts --project probe <that test>`.
SEVERITY: degrades-consumers

ROW: Concurrent `prove()` calls
SEAM: concurrency
STATE: RETAIN
EVIDENCE: Three overlapping `prove()` calls against the real coordinator each returned their own receipt: `CONCURRENT -> ["alpha: receipt=true","beta: receipt=true","gamma: receipt=true"]`. One queue per stage at `concurrency: 1` (src/server/Probe.ts:83-102) serializes each resident tool; each inspection installs its own `Overlay` (src/server/stages/TypeStage.ts:102, RuntimeStage.ts:105) and each runtime specification carries its own UUID. `tests/src/server/Probe.test.ts` already proves arrival order and single-occupancy through a recording language server.
CLOSES WHEN: retained; no change.
SEVERITY: internal-quality

ROW: Listener faults
SEAM: hostile input from the embedding host
STATE: RETAIN
EVIDENCE: A probe whose `arm` and `prove` listeners both throw still returned a receipt, and both faults reached `options.error`: `THROWING LISTENER -> fulfilled receipt=probe:310b7041-...`, `ERROR HANDLER SAW ["Error: arm listener fault","Error: prove listener fault"]`.
CLOSES WHEN: retained; no change.
SEVERITY: internal-quality

ROW: Descriptor and memory retention across a resident session
SEAM: resource ownership
STATE: RETAIN
EVIDENCE: 24 proofs inside one probe: `FD 31 -> 31 (delta 0)`, and `LEFTOVER REVISION FILES []`. 70 proofs through `dist/` under `node --expose-gc`, crossing the 64-specification recycle:
```
after 10: rss=565MB heapUsed=272MB
after 40: rss=593MB heapUsed=275MB
after 70: rss=589MB heapUsed=275MB
DESTROYED
```
The documented replacement bound (src/server/stages/RuntimeStage.ts:38-45) holds; heap is flat across the boundary.
CLOSES WHEN: retained; no change.
SEVERITY: internal-quality

ROW: Orphaned Oxlint child after the host dies
SEAM: resource ownership / child processes
STATE: RETAIN
EVIDENCE: `ps` before: `29598 29590 /opt/node22/bin/node .../oxlint/bin/oxlint --lsp`. After `kill -9 29590`: `NO ORPHAN OXLINT`. `#warm` sends `processId: process.pid` in `initialize` (src/server/stages/LintStage.ts:137) and the real server honours it. This is the only path that reclaims the child, which is why the teardown-hang row above matters.
CLOSES WHEN: retained; no change.
SEVERITY: internal-quality

ROW: Claim, Case, and Control guards against hostile shapes
SEAM: hostile input at the MCP tool boundary
STATE: RETAIN
EVIDENCE: `isClaim` over 14 vectors: `REFUSE extra member`, `REFUSE prototype key in source`, `REFUSE nested __proto__ literal`, `REFUSE files not an array`, `REFUSE stage unknown`, `REFUSE empty reason`, `ADMIT exact claim`, `ADMIT null prototype`; `Object.prototype.polluted = undefined`; `isCase({files:{length:0}}) = false`. The guards are exact as documented (src/core/validators.ts:97-100) and `createProbeServer` applies `isClaim` before executing (src/server/factories.ts:148). Path strings that the guard admits are refused downstream by `resolveWorkspaceFile`: `absolute candidate path -> THROW Error: Path escapes the workspace: /etc/passwd`, `traversal candidate path -> THROW ... ../../etc/passwd`, `absolute test path -> THROW ... /tmp/wire.test.ts`.
CLOSES WHEN: retained; no change. The rejection *style* for those three is the routing row above, not a guard defect.
SEVERITY: internal-quality

ROW: Repeated destroy and operations after teardown
SEAM: lifecycle
STATE: RETAIN
EVIDENCE: Each stage memoizes `#closing` and sets `#destroyed` synchronously (Probe.ts:143-148, TypeStage.ts:125-130, LintStage.ts:85-90, RuntimeStage.ts:152-157); a destroyed stage refuses on entry: `DESTROYED TYPE STAGE INSPECT -> Error: The type stage has been destroyed`. The suite covers "abandons an inspection and destroys idempotently" for all three stages and "destroys idempotently and observes one error for a later proof" for the coordinator.
CLOSES WHEN: retained; no change.
SEVERITY: internal-quality

ROW: Published CommonJS server entry (already known — confirmed)
SEAM: package consumption
STATE: REPAIR
EVIDENCE: `require('./dist/src/server/index.cjs')` succeeds, but constructing either resident host fails: `TYPE FAIL: {}.resolve is not a function`, `RUNTIME FAIL: {}.resolve is not a function`, from `import.meta.resolve` transpiled to `{}.resolve(...)` at dist/src/server/index.cjs:681 and :1061. Confirming the known row only; it is on the do-not-re-report list.
CLOSES WHEN: owned by the known list.
SEVERITY: blocks-release

ROW: Windows behaviour of every finding in this lane
SEAM: environment isolation
STATE: UNPROVEN
EVIDENCE: Every probe above ran on Linux 6.18.5 / Node v22.22.2. The signal-kill, orphan-child, `ENAMETOOLONG`, and `SIGKILL` fallback rows are all POSIX-specific in mechanism; `Overlay` normalizes backslashes (src/server/Overlay.ts:42) and `LintStage` kills with `SIGKILL` (src/server/stages/LintStage.ts:116), neither of which behaves identically on Windows.
CLOSES WHEN: `npm test` plus the shutdown-orphan and teardown-hang probes run on a Windows host and their results are recorded beside these.
SEVERITY: degrades-consumers

ROW: Guide and distribution coverage (already known — confirmed)
SEAM: documentation / package consumption
STATE: IMPLEMENT
EVIDENCE: `find guides tests -type f` shows `guides/` carries only `README.md` and dependency guides, no `probe.md`, and `tests/` carries no `guides.test.ts` and no `distribution.test.ts`. Confirming the known rows only.
CLOSES WHEN: owned by the known list.
SEVERITY: degrades-consumers

BLOCKERS: Wire-chosen `project` mints a receipt the workspace's own project refuses; Type and lint deadline expiry destroys the stage and never replaces it; `LintStage.destroy()` never settles when the server answers shutdown and does not exit.

---

ROW: `quoteArgument` `%1` claim is false
SEAM: TSDoc and guide truth — published prose contradicts behaviour
STATE: REPAIR
EVIDENCE: `guides/process.md:396` and `src/server/helpers.ts:252-253` both state "Every other token is left exactly as written, so a batch script still receives `%1` without added quotes." The metacharacter class is `/[\s"&|<>^()%!]/` (`src/server/helpers.ts:264`) and includes `%`. Executed against `dist/src/server/index.js`: `quoteArgument("%1")` => `"\"%1\""`; controls `quoteArgument("a b")` => `"\"a b\""`, `quoteArgument('say "hi"')` => `"\"say \"\"hi\"\"\""`. `%1` is quoted, not left as written. The guides gate cannot catch this: `%1` appears only in prose, never as a fence value, and `test:guides` passes 51/51.
CLOSES WHEN: both sentences state that `%` is in the quoted set (so `%1` returns `"%1"`), and `tests/guides.test.ts` asserts `quoteArgument('%1') === '"%1"'` alongside the existing `a&b` row.
SEVERITY: degrades-consumers

ROW: `ProcessCommand.isolated` TSDoc omits the constraint that broke the fence
SEAM: public contract — the option's own declaration
STATE: REPAIR
EVIDENCE: The repair landed the constraint in the guide only (`guides/process.md:439-440`, "On a POSIX host, `isolated: true` removes `PATH`…"). `src/core/types.ts:38` still reads in full: "If `true`, the child environment is `environment` alone; if `false` or omitted, it merges over the parent environment." Two defects in that one line. (1) The POSIX `PATH` consequence is absent, and it is reachable through every tier: executed, `run({file:'node',arguments:['-e','process.stdout.write("x")'],environment:{TOKEN:'a'},isolated:true},{strict:false})` => `{"code":-2,"failed":true,"stderr":""}`; non-isolated control => `{"code":0,"failed":false,"stdout":"x"}`. `runSync` same call => `{"failed":true,"code":null}`. (2) "the child environment is `environment` alone" is false on Windows by the guide's own text at `guides/process.md:434-438` (libuv injects `PATH`, `SYSTEMROOT`, `TEMP`, `USERPROFILE`). A consumer hovering `isolated` in an editor reads the declaration, never the guide, and gets the exact ENOENT the published fence got.
CLOSES WHEN: `src/core/types.ts:38` states both host qualifications — POSIX `isolated: true` leaves no `PATH`, so pass an absolute file or include `PATH`; Windows injects a host set regardless — and `ProcessCommand`'s `@remarks` (`src/core/types.ts:27-31`) carries the same qualification.
SEVERITY: degrades-consumers

ROW: A spawn fault's exit code is undocumented and the runners disagree
SEAM: TSDoc and guide truth — result contract
STATE: REPAIR
EVIDENCE: `guides/process.md:520` and `src/server/helpers.ts` `buildRunResult` `@remarks` both state "a `null` code from a spawn fault is therefore a failure". Executed against a missing binary: Node baseline `close` => `{"code":-2,"sig":null}`; `Process.exit` => `{"code":-2,"signal":null}`; `run(...)` `RunResult` => `{"code":-2,"signal":null,"failed":true}`; `runSync(...)` => `{"code":null,"signal":null,"failed":true}`. So the documented `null` holds for `runSync` alone; `run` and `Process` surface the negative errno. `ProcessExit.code` TSDoc (`src/core/types.ts:44`) says only "The exit code, or `null` when a signal ended the process" and never admits a negative errno, while `guides/process.md:729` routes consumers to `exit` precisely for spawn faults ("a child that fails to spawn is returned, and its fault surfaces through its own `exit`"). Executed: `manager.launch` with a missing binary did not throw, `exit` resolved `{"code":-2,"signal":null}`, and the `error` event carried `ENOENT`. `failed` is correct in every case; only the documentation is wrong.
CLOSES WHEN: `ProcessExit.code` and the `RunResult` prose state that a spawn fault yields the host's negative errno on `Process` and `run` and `null` on `runSync`; the "Where the two runners differ" table (`guides/process.md:557-563`) gains that row; and `tests/guides.test.ts` transcribes both spawn-fault codes.
SEVERITY: degrades-consumers

ROW: The ESRCH fallback has no committed regression guard
SEAM: proof of a same-day product repair to a published helper
STATE: REPAIR
EVIDENCE: `grep -rn "ESRCH" tests/ src/` returns only `src/server/helpers.ts:511` and `:537` — zero test hits. The claim published today is `guides/process.md:355-356`, "so `killProcess` and `stopChild` also support a non-detached child", plus the same statement in `killProcess` and `stopChild` `@remarks`. Its only evidence is prose in commit `b392629`. I reproduced it with a negative control drawn from outside the changed population: repaired `killProcess`, non-detached child => `SIGKILL`; pre-repair catch-all control, non-detached child => `SURVIVED`; repaired, detached => `SIGKILL`; pre-repair control, detached => `SIGKILL`. The fix is real and the detached path is undisturbed — and nothing in the suite would notice it reverting. Related, smaller: `src/server/types.ts` `ProcessChild` `@remarks` still says "`pid` addresses a POSIX process group" with no mention of the direct fallback.
CLOSES WHEN: `tests/src/server/helpers.test.ts` carries a POSIX-gated test that spawns a non-detached child, calls `killProcess(child, 'SIGKILL')`, and asserts the observed exit, with the pre-repair swallow as its recorded control; and `ProcessChild` names the fallback route.
SEVERITY: internal-quality

ROW: Termination table still describes the group-only POSIX sequence
SEAM: guide prose stale after today's repair
STATE: REPAIR
EVIDENCE: `guides/process.md:345` — "| POSIX | `SIGTERM` to the process group, wait `grace`, then `SIGKILL` to the group. | used |". After the repair, `stopChild` (`src/server/helpers.ts:632-645`) routes through `killProcess`, which falls back to the direct child on `ESRCH`, and the `stopChild` `@remarks` (`src/server/helpers.ts:609-610`) now says so. The table is the row a reader scans; the correcting paragraph sits eight lines below it. This is the failure mode the lane names: the guides gate binds fence values, and this claim is a table cell, so `test:guides` passes 51/51 over it.
CLOSES WHEN: the POSIX table row names both routes — the process group, or the child directly when no group owns its pid.
SEVERITY: internal-quality

ROW: TSDoc `@example` values satisfy the example gate without ever executing
SEAM: documentation gate coverage
STATE: REPAIR
EVIDENCE: `tests/guides.test.ts:265` uses `findUnexampled(names, fences, source.examples())`, so a Surface function's TSDoc `@example` alone discharges the requirement. Twelve exports appear in no guide fence and rely on that path: `trimHead`, `trimTail`, `retainChunk`, `resolveExecutable`, `isFile`, `readVariable`, `validateText`, `validateTimer`, `validateBytes`, `validateEnvironment`, `validateCommand`, `validateWorkspace`. Nothing executes them. I executed all 16 value-bearing `@example` claims in `src/**` against `dist/`: `trimTail("hello",3)` => `"llo"`, `trimHead` => `"hel"`, `isFile(execPath)` => `true`, `resolveExecutable('git',{})` => `null` (matches "…, 'git' elsewhere"), `retainChunk` counts => `[5,3]` (claims `counts[1] // 3`), `isExited({0,null})` => `true`, all six `validate*` => `undefined`, `isProcessError` => `true`/`false`, `createInvalidError(...).code` => `"invalid"`. Every claim is true today; none is bound.
CLOSES WHEN: `tests/guides.test.ts` transcribes the value-bearing `@example` blocks of those twelve exports, so a changed return value fails the gate.
SEVERITY: internal-quality

ROW: The guide's Tests section claims coverage that only runs on Windows
SEAM: documentation honesty about proof
STATE: REPAIR
EVIDENCE: `guides/process.md:875-878` states `tests/src/server/helpers.test.ts` covers "the resolver under `PATHEXT` and an extension-bearing name, the quoted `cmd.exe` builder and its percent-sign refusal", and `:865-871` credits `Process.test.ts` with tree termination. `npx vitest run --project src:server` on this host: `Tests 88 passed | 9 skipped (97)`. The nine skipped rows are exactly those claims — `resolves a bare name through the effective PATH and PATHEXT`, `tries an extension-bearing name literally before it applies PATHEXT to it`, `searches the workspace before the path`, `routes a batch script through a quoted cmd.exe command line`, `refuses a percent sign in an argument bound for a batch target`, `refuses a defined percent-delimited argument a batch target would otherwise expand`, `runs a batch script whose directory name contains a space`, `kills a grandchild through the tree while the root is still live`, `reports failure for a tree no process id owns` — each `it.skipIf(process.platform !== 'win32')`. A reader running the suite on Linux is told those behaviours are covered and gets nothing.
CLOSES WHEN: the Tests section states that the Windows resolution, batch-path, and tree-termination rows execute on Windows only, and names the host each half of the suite was last proven on.
SEVERITY: internal-quality

ROW: `README.md` ships to consumers under no gate
SEAM: published documentation parity
STATE: IMPLEMENT
EVIDENCE: `package.json` `files` is `["dist/src","README.md"]`, so `README.md` is published surface. `tests/guides.test.ts:88-92` builds its file set from `readInventory(root, ['src','guides','tests'])` plus `ROOT_FILES = ['AGENTS.md']` — `README.md` is in neither, so no backticked-API check, no link check, and no fence-import check reaches it. I swept it by hand: every API name it backticks (`Process`, `run`, `runSync`, `RunResult`, `ProcessError`, `ProcessManager`, `createProcess`, `detach`, `isProcessError`, `strict`, `launch`, `stop`, `emitter`, `lines`, `exit`, `destroy`, `grace`) resolves against the built barrels, and both relative links (`guides/process.md`, `LICENSE`) exist. Correct today, unbound tomorrow.
CLOSES WHEN: `README.md` joins `ROOT_FILES` in `tests/guides.test.ts` and is asserted for resolvable backticked APIs and existing relative links, the same two assertions `guides/process.md` already gets.
SEVERITY: internal-quality

ROW: Export parity in both directions
SEAM: public contract
STATE: RETAIN
EVIDENCE: Measured against the built artifact rather than the source text the gate parses. Runtime ESM: core exports 13 names, server 29. Declarations: `dist/src/core/index.d.ts` declares 31 (13 values + 18 types), `dist/src/server/index.d.ts` declares 30 (29 values + `ProcessChild`). Guide tables enumerate exactly 13 core value rows + 18 Types rows = 31, and 2+3+2+7+4+5+6 = 29 server value rows + `ProcessChild` = 30. Zero undocumented exports, zero documented phantoms, in both directions. A programmatic sweep of the 134 backticked identifier tokens in guide prose outside fences found none that is a package API but not an export; the residue is member names, option keys, primitives, and host names (`execvp`, `taskkill`, `readline`, `System32`), plus `EmitterErrorHandler`, `EmitterHooks`, and `EmitterInterface`, which are real public exports of the declared `@orkestrel/emitter` dependency. The instrument's negative control fired: removing `killTree` from the declared set made it report as unresolved.
CLOSES WHEN: retained — re-run on any barrel change.
SEVERITY: internal-quality

ROW: Guide fences typecheck against the published declarations
SEAM: public contract — fence type truth
STATE: RETAIN
EVIDENCE: Extracted all 19 `ts` fences from `guides/process.md` and compiled them under `strict` with `moduleResolution: Bundler` and `paths` pointed at `dist/src/*/index.d.ts`. Result: two errors, both in the Observing fence (`guides/process.md:748`) — `TS2304: Cannot find name 'log'` and `TS2304: Cannot find name 'metrics'`, which are the fence's deliberate illustrative observers. Eighteen of nineteen compile clean against the shipped types, and no `TS2307` appeared, confirming the specifiers resolved rather than being silently skipped.
CLOSES WHEN: retained — the two `TS2304` identifiers are EXCLUDE, being named placeholders for a consumer's own logger and metrics sink.
SEVERITY: internal-quality

ROW: Documented examples actually run
SEAM: guide behaviour truth
STATE: RETAIN
EVIDENCE: `npm run test:guides` => `Tests 51 passed (51)`, covering the eleven transcribed flagship fences. I then ran the six untranscribed but runnable fences verbatim against `dist/`, creating only the scripts they name: abort-termination fence (`guides/process.md:359`) => emitted its `stderr` chunk, `exit` resolved, `evidence` returned `"server up\n"`; `detach` fence (`:591`) => returned; `git rev-parse HEAD` pattern (`:764`) => returned the real commit; stream-and-cancel fence (`:773`) => iterated lines then `exit {"code":0,"signal":null}`; `stopChild` fence (`:812`) => `true`; the `isExited`/`killProcess`/`killTree`/`waitForExit` composition fence (`:827`) => `isExited` `true`. I also executed unfenced prose claims: `detach` over a missing binary returns rather than throwing, `stop(unknownId)` => `false`, `launch` over a missing binary does not throw, `timeout: 0` is accepted and does not expire, `send` after exit => `false`, `run` rejects while `runSync` throws on an `invalid` input, and `RunSyncOptions` is `RunOptions` minus `grace` and `signal` in the emitted declaration. All matched the guide.
CLOSES WHEN: retained.
SEVERITY: internal-quality

ROW: Both published entry points load and typecheck for a real consumer
SEAM: package consumption
STATE: RETAIN
EVIDENCE: `require('dist/src/core/index.cjs')` => 13 keys, `require('dist/src/server/index.cjs')` => 29 keys, `PROCESS_GRACE` `5000`, `run` and `stopChild` both `function`. `grep -rn "import\.meta" src/` => none, so the CommonJS defect known for `probe` does not reach this package. I then built a consumer with `node_modules` symlinks and typechecked one `.mts` and one `.cts` file importing values and types from both specifiers under `module: node20`, `moduleResolution: node16`, `strict`, and `skipLibCheck: false` — `tsc` exit 0. Control fired: adding an import of a non-existent member produced `TS2305: Module '"@orkestrel/process/server"' has no exported member 'nope'`. The `.d.cts` copies resolve `@orkestrel/emitter` correctly, which has its own `require` types condition.
CLOSES WHEN: retained — `tests/distribution.test.ts` would make it a standing gate rather than a one-off run.
SEVERITY: internal-quality

ROW: killProcess ESRCH fallback documented on the owning interface
SEAM: documentation placement
STATE: RETAIN
EVIDENCE: The fallback is stated on `killProcess` (`src/server/helpers.ts:510-514`), on the composer that inherits it, `stopChild` (`src/server/helpers.ts:606-615`), and in the guide (`guides/process.md:353-357`). The gap is not placement but proof and the stale table, covered in the two rows above.
CLOSES WHEN: retained.
SEVERITY: internal-quality

Confirming the already-known items my lane touches, one line each: `guides/process.md` has a guide and `tests/guides.test.ts` gates it, 51/51 — the `probe` absence does not apply here. `ls tests/` shows no `distribution.test.ts`, so nothing gates the published artifact as a standing check. Windows job objects are stated as an out-of-scope limit at `guides/process.md:349-351`. Per-stream truncation is documented as one `limit` covering both streams (`limit` row, and `truncated` "Either stream exceeded `limit`"). `lines` single-consumer with no fan-out is stated twice, at `guides/process.md:263-265` and in the Practices list. The seven POSIX repairs are POSIX-verified only; nine Windows-gated tests skipped on this host, which is the coverage half of the Tests-section row above.

BLOCKERS: `quoteArgument` `%1` claim is false; `ProcessCommand.isolated` TSDoc omits the POSIX `PATH` constraint and misstates Windows; A spawn fault's exit code is undocumented and the runners disagree; The ESRCH fallback has no committed regression guard.