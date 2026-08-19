# S3 audit — the six-lens Opus fan-out

12 agents: six blind lenses over disjoint seams, each with an adversarial verifier on a clean context.
`rulings=90 refuted=7 survived=13 killed=11`.

Both lanes refuted the SAME seven claims independently: 6, 7, 8, 9, 11, 12, 15.

## Claim rulings

| Claim | Seam | Verdict |
| ----- | ---- | ------- |
| 1 | liveness | **CONFIRMED** |
| 2 | liveness | **CONFIRMED** |
| 3 | settlement | **CONFIRMED** |
| 4 | stream | **CONFIRMED** |
| 5 | settlement | **CONFIRMED** |
| 6 | overrides | **REFUTED** |
| 7 | instrument | **REFUTED** |
| 8 | liveness | **REFUTED** |
| 9 | settlement | **REFUTED** |
| 10 | instrument | **PLAUSIBLE** |
| 11 | conformance | **REFUTED** |
| 12 | conformance | **REFUTED** |
| 13 | conformance | **CONFIRMED** |
| 14 | liveness | **CONFIRMED** |
| 15 | liveness | **REFUTED** |

## Findings that survived adversarial verification

### [MEDIUM] The repair's comment asserts a coordinator recycle that does not exist; a stdin error degrades the lint stage permanently

`src/server/stages/LintStage.ts:130` — seam `stream`

**Failure scenario.** The Oxlint server closes its input once. `#fail` turns the EPIPE into a rejected inspection, `stdin.writable` is false forever after, and `#send` refuses every later write. The comment added at lines 128-130 says 'Report it as a stage fault so the coordinator can recycle around it' — but the coordinator cannot. `Probe.ts:50` declares `readonly #lint: LintStage`, assigned once at `Probe.ts:77`, so the lint stage can never be replaced. `#recycle` is typed `(stage: RuntimeStage)` at `Probe.ts:289` and called only from `#runRuntime` at `Probe.ts:281`; the lint queue's handler routes through `#inspectStage` (`Probe.ts:254-267`), which on failure only calls `stage.destroy()`, and only when the deadline expired. Every subsequent `prove` on that Probe therefore reports 'The Oxlint language server closed its input' instead of its own evidence, for the life of the process. The repair stops the crash and produces a permanent, deterministic stage fault; it does not produce a recyclable one.

**Evidence.** Executed against the real source: third inspection after the EPIPE returned `REJECTED:The Oxlint language server closed its input` (not a hang, not a recovery). Static: `grep -n "#lint\b" src/server/Probe.ts` -> `50: readonly #lint: LintStage`, `77: this.#lint = new LintStage(this.#workspace)`, `96: this.#inspectStage(this.#lint, ...)`, `327: this.#lint.destroy()`. No other assignment. `grep -n recycle src/server/Probe.ts` -> `281: const recycled = await this.#recycle(stage)` (inside `#runRuntime`), `289: async #recycle(stage: RuntimeStage)`, `307: this.#runtime = new RuntimeStage(this.#workspace)`.

### [OUT_OF_SCOPE] A language server that accepts stdin but never answers `initialize` deadlocks destroy()

`src/server/stages/LintStage.ts:94` — seam `stream`

**Failure scenario.** `#destroy` opens with `const child = await this.#warmth.catch(() => this.#child)`. The `catch` only fires on rejection, so a `#warmth` that never settles hangs teardown before `#fail`, before `#retire`, and before the SIGKILL. A server that reads stdin and returns no response to `initialize` never settles `#warmth`: no `exit` fires so `#ending` stays undefined, and no write fails so the stdin listener never fires. `inspect` hangs on line 71 and `destroy()` never returns. The `#retire` comment at lines 107-109 covers 'a server that ... never answers' only for `shutdown`, not for `initialize`. Outside the stream seam — recorded, not argued.

**Evidence.** Executed against the real source with a fixture whose only behaviour is `process.stdin.on('data', () => {})` plus a 60s keepalive: `LOG inspect HUNG` (5s race) and `LOG destroy DEADLOCK` (6s race). The same host against the code-exit fixture returned `LOG inspect REJECTED:The Oxlint language server exited with code 7 / LOG destroy SETTLED`, so the instrument distinguishes the two.

### [OUT_OF_SCOPE] The lint stage is readonly, so the coordinator has no replacement path for a faulted lint stage

`src/server/Probe.ts:50` — seam `stream`

**Failure scenario.** `readonly #lint: LintStage` makes replacement impossible by construction, and `#recycle` accepts only `RuntimeStage`. Any permanent lint-stage fault — a stdin EPIPE, a dead server, an expired deadline that triggers `stage.destroy()` at Probe.ts:263 — leaves the Probe reporting that fault for every later claim. Probe.ts is not an owned file of this change; recorded with file and line, not repaired and not argued.

**Evidence.** `grep -n "#lint\b" src/server/Probe.ts` -> `50: readonly #lint: LintStage`; only assignment is `77: this.#lint = new LintStage(this.#workspace)`. `sed -n '253,268p'` shows `#inspectStage` calls `void stage.destroy().catch(() => {})` on expiry and never installs a replacement, in contrast to `#recycle` at 289-308 which does `this.#runtime = new RuntimeStage(this.#workspace)`.

### [HIGH] The synthesized path discards the declared directory, so a path-anchored override the gate applies is lost

`src/server/stages/LintStage.ts:207` — seam `overrides`

**Failure scenario.** An agent supplies a candidate declared at `configs/policy.ts` whose text is `export default { value: 1 }`. `.oxlintrc.json` exempts exactly that path from `import/no-default-export`, and `npm run lint:check` accepts the file. `#file` synthesizes `tests/probe-<uuid>.policy.ts` because the axis `configs` is neither `src` nor `app`, the exemption no longer matches, and the stage reports `Prefer named exports` against code the workspace's own gate accepts. This is the same false red C4 claims to have repaired; keeping the basename closed only the basename-keyed half of it.

**Evidence.** LintStage.ts:197-201 collapses any non-src/app axis to `tests`, then line 207 emits `${directory}/probe-${randomUUID()}.${basename(declared)}`. Real oxlint 1.79.0 LSP, real .oxlintrc.json, stage-shaped `capabilities: {}` handshake: declared `configs/policy.ts` -> `[]`; synthesized `tests/probe-5a2ac581-869e-4e55-9157-3cae09535008.policy.ts` -> `["Prefer named exports"]`. Control from outside the exempt population: `configs/helpers.ts` -> `["Prefer named exports"]` both sides, agree.

### [MEDIUM] The C4 test never compares a declared path against its synthesized path, so it cannot detect the divergence it names

`tests/src/server/stages/LintStage.test.ts:151` — seam `overrides`

**Failure scenario.** Both candidates the test declares live under `tmp/probe/`, which oxlint ignores entirely, so the declared paths contribute nothing to what oxlint is asked. What the test actually compares is two synthesized paths under `tests/` that differ only in basename. It therefore proves basename preservation and nothing about the workspace's override selection for the declared path, and it passes unchanged against every counterexample recorded here. Its control also asserts a finding at `path: 'tmp/probe/lint-override.ts'`, a path the workspace gate never lints.

**Evidence.** LintStage.test.ts:151 and :158 declare `tmp/probe/lint-override.config.ts` and `tmp/probe/lint-override.ts`; LintStage.ts:197-201 rewrites both to `tests/`. Real LSP: declared `tmp/probe/candidate.ts` -> `[]` (ignored), synthesized `tests/probe-<uuid>.candidate.ts` -> `["Prefer named exports"]`.

### [HIGH] Claim 7's reachability inference is false: the signal door reaches the deadlock, never the orphan

`/home/user/scaffold/.orkestrel/probe/s3-report.md:73` — seam `instrument`

**Failure scenario.** Drive the unrepaired stage (e11c389) through the real inspect() API with the very candidate the report names — 'const value = ' + '('.repeat(400000) — and the orphan the report says this proves reachable never forms. The next inspection and the teardown both hang instead, and no unhandled rejection is raised.

**Evidence.** node e2e8.mjs before nested (real oxlint 1.79.0, ROOT=/workspace/probe):
  HOSTILE {"ok":false,"message":"The Oxlint language server exited with signal SIGSEGV"}
  LATER {"ok":false,"message":"TIMEOUT later"}
  DESTROY {"ok":false,"message":"TIMEOUT destroy"}
  SIDE []
Cause, at the baseline source: #send reads `child === undefined || child.exitCode !== null` and Node leaves exitCode null for a signal death, so #send never throws and #document never orphans. The four code-0 rows cannot close the gap either — they are inputs the stage cannot send: src/server/stages/LintStage.ts:245-247 always frames JSON.stringify output with an exact Content-Length, and nothing ends child.stdin. Control C4 (shutdown then exit) = {"code":0}, the stage's own suppressed teardown path.

### [MEDIUM] The orphan IS reachable, by a code-0 vector the change never measured: a lone surrogate in candidate text

`/workspace/probe/src/server/stages/LintStage.ts:161` — seam `instrument`

**Failure scenario.** An agent supplies a candidate document whose text contains a lone surrogate (String.fromCharCode(0xd800)). #document forwards it verbatim in textDocument/didOpen; real oxlint 1.79.0 --lsp exits with code 0; on the unrepaired source that is exactly defect B's orphan and it ends the resident host.

**Evidence.** node e2e8.mjs before surrogate:
  HOSTILE {"ok":false,"message":"The Oxlint language server is not running"}
  LATER {"ok":false,"message":"The Oxlint language server is not running"}
  DESTROY {"ok":true}
  SIDE ["unhandledRejection: The lint stage has been destroyed"]
node e2e8.mjs after surrogate → SIDE [], messages 'exited with code 0'.
Raw server measurement: candidate('lone surrogate','const a = "'+String.fromCharCode(0xd800)+'"') = {"code":0,"signal":null}, empty stderr. Controls in the same sweep that stayed alive: empty text, NUL byte, one 8 MB line, unknown languageId; 200000 nested [ also gave SIGSEGV.
The frame is well-formed, so this is the stage's own serialization, not an instrument artefact: JSON.stringify escapes the surrogate to the ASCII sequence \\ud800, /[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])/.test(content) === false, and Buffer.byteLength matches.
This is the fact that rescues the repair. No test drives a real server into a code exit — the code-exit door is covered only by the fixture's process.exit(7).

### [MEDIUM] Test 4 is the one the unit never proved, and it binds to no single repair

`/workspace/probe/tests/src/server/stages/LintStage.test.ts:267` — seam `instrument`

**Failure scenario.** Revert any one of the five defects this commit repairs and 'reports the exit code when the language server dies mid-inspection' still passes. It reddens only when A and D are reverted together, so no single-defect regression this change guards against would be caught by it.

**Evidence.** Section 2 of s3-report.md records red-then-green for five tests (A×2, B, C, C4) and none for this one. Measured against each revert:
  A-rev (mut-liveness) 'The Oxlint language server exited with code 7' — green
  B-rev (mut-orphan)   'The Oxlint language server exited with code 7' — green
  C-rev (mut-nolistener) 'The Oxlint language server exited with code 7' — green
  D-rev (mut-notifyfirst) 'The Oxlint language server exited with code 7' — green
  C4-rev (mut-extname)  'The Oxlint language server exited with code 7' — green
  full baseline        'The Oxlint language server is not running' — RED
The message it asserts is produced by #exit/#fail, which this commit did not modify; with A repaired the throw #close would raise carries the identical text, and with D repaired #close does not raise at all.

### [MEDIUM] An assertion in the host test can never fail: Node does not print the string 'unhandledRejection'

`/workspace/probe/tests/src/server/stages/LintStage.test.ts:340` — seam `instrument`

**Failure scenario.** expect(reported).not.toContain('unhandledRejection') passes for every possible host stderr, including a host that dies of the exact unhandled rejection the test exists to detect. Deleting the line changes no outcome.

**Evidence.** Two controls, both with grep -c 'unhandledRejection' = 0:
  Promise.reject(new Error('boom')) → exit 1, stderr 'Error: boom from a real unhandled rejection ... Node.js v22.22.2'
  Promise.reject('a bare string')   → exit 1, stderr 'UnhandledPromiseRejection: This error originated either by throwing...' (grep -c 'Error:' = 0 too)
The companion assertion has a hole of the same kind: not.toContain('Error:') passed on a host that failed to load the module at all — control run with a nonexistent stage path printed 'Error [ERR_MODULE_NOT_FOUND]:' and asserted not-contains-Error: true. Only expect(status).toBe(0) is load-bearing. The test still detects — mut-orphan gave STATUS 1 with 'Error: The lint stage has been destroyed' — but two of its five assertions do not carry it.

### [LOW] Test 5's red on the unrepaired source is produced by the C4 repair, not the listener it names

`/workspace/probe/tests/src/server/stages/LintStage.test.ts:287` — seam `instrument`

**Failure scenario.** Against the full baseline, 'refuses an inspection through a stage fault when the language server closes its input' never reaches the scenario it describes: the fixture's closes-input trigger matches on the synthesized URI, and the baseline #file drops the declared basename, so the server never closes its input and the second inspection resolves normally.

**Evidence.** before/input → {"refused":{"ok":true,"value":{"stage":"lint","elapsed":3,"findings":[]}}} — resolved, not EPIPE.
mut-extname/input (C4 reverted alone) → same resolution, so the coupling is C4's.
It does still bind to the defect it names: mut-nolistener/input → {"refused":{"ok":false,"message":"TIMEOUT refused inspect after 15000ms"}}, SIDE ["uncaughtException: write EPIPE"]; and mut-notifyfirst/input → 'The Oxlint language server closed its input', which fails toThrow('EPIPE'). Both reproduce the report's C and D proofs.

### [OUT_OF_SCOPE] A concurrent lane is writing and repeatedly wiping the shared /workspace/probe/tmp/scratch

`/workspace/probe/tmp/scratch:1` — seam `instrument`

**Failure scenario.** Two audit lanes sharing one working tree contaminate each other's instruments. Mine was deleted twice mid-run and my driver.mjs was overwritten by a sibling's file of the same name, which produced an ERR_UNSUPPORTED_DIR_IMPORT that looked like a fault in my own harness.

**Evidence.** Directory listing at 13:58 held derive.mjs, mkdeaf.mjs, mkfixture.mjs, nested.mjs and work/ — none written by this lane — and driver.mjs had shrunk from 5960 to 996 bytes. The directory was then removed entirely and later repopulated with events.mjs, f1.mjs, f1-before.mjs, f1b.mjs, LintStage.after.ts, LintStage.before.ts. I moved my instrument to my own sandbox and left those files alone: /workspace/probe git status --porcelain is empty and nothing in tmp/scratch is mine. This is the condition .agents/orchestration.md § Writing concurrency rule 5 requires worktree isolation for.

### [HIGH] destroy() never settles when the language server does not complete the teardown conversation, contradicting the documented destroy contract

`src/server/stages/LintStage.ts:112` — seam `conformance`

**Failure scenario.** Two reachable shapes, both measured. (A) A resident Oxlint server that receives `shutdown` and never replies: `#retire` awaits `#request('shutdown', undefined)`, whose promise nothing can settle — `#destroy` already drained `#failures` through `#fail` at line 97 before the request was registered, so the SIGKILL in the catch at line 115 is unreachable. (B) A server that answers `shutdown` but ignores the `exit` notification and stays resident: `#retire` returns cleanly and `#destroy` blocks on `released` (lines 99-104), which resolves only on the child's `exit` or `close`, with no kill fallback on that path at all. Measured against the real class: control (server answers shutdown and exits) DESTROY=SETTLED after=8ms; subject A DESTROY=HUNG after=6007ms; subject B DESTROY=HUNG after=6007ms. Because src/server/Probe.ts:327 does `await Promise.all([this.#type.destroy(), this.#lint.destroy(), this.#runtime.destroy()])`, a host calling `probe.destroy()` never gets its promise back and never exits.

**Evidence.** Contract: src/core/types.ts:346 — `@returns A promise that settles when every engine has released its resources`. src/server/types.ts:62 — `@returns A promise that settles after the resident tool releases its resources`. Code: `async #retire(child) { try { await this.#request('shutdown', undefined); this.#notify('exit', undefined) } catch { child.kill('SIGKILL') } }` at LintStage.ts:110-117, called from `await this.#retire(child); await released` at LintStage.ts:103-104. Instrument: a Node host loading the real src/server/stages/LintStage.ts through a `.js`→`.ts` resolve hook, three fixture servers differing only in teardown answers, destroy() raced against a 6000 ms timer; written under /workspace/probe/tmp/scratch/ and deleted, tree re-verified clean.

### [MEDIUM] #ending persists state Node already carries on the child process

`src/server/stages/LintStage.ts:48` — seam `conformance`

**Failure scenario.** `#ending: string | undefined` stores a formatted label (`code 7`, `signal SIGKILL`) that is the class's single liveness fact, and `#reachable` reads it as `this.#ending === undefined`. Both are computable from the child the class already holds: `child.signalCode` and `child.exitCode` together carry the complete ending, are set before the exit handler body runs, and stay stable afterwards. The rule is explicit and this change is what introduced the persisted field. Repairing it as a getter also removes the `'unknown'` sentinel below and collapses `#reachable` to one derivation, so it is one repair rather than three.

**Evidence.** Probe, control paired and run together: SUBJECT (child killed by SIGKILL) — while alive `exitCode=null signalCode=null`; inside exit handler `exitCode=null signalCode=SIGKILL`; 50 ms later `exitCode=null signalCode=SIGKILL`. CONTROL (child exiting 7, drawn from the code-exit population the signal case excludes) — while alive `exitCode=null signalCode=null`; inside exit handler `exitCode=7 signalCode=null`; 50 ms later `exitCode=7 signalCode=null`. Rules: .claude/rules/typescript.md § Immutability — "Compute derived facts instead of persisting duplicate state." AGENTS.md § Design laws — "Derive state. Compute facts from existing fields. Do not store a second flag or label that can drift", imported into .claude/rules/names.md § General vocabulary. Counter-argument recorded for weighing: `#ending` is assigned once, in `#exit`, so it cannot in fact drift; the breach is the persistence, not an observed divergence.


## Findings the verifiers killed

Recorded because a dropped finding must be dropped on the record, not silently.

### child.stdout and child.stderr carry no error listener; an error on either ends the resident host

Seam `stream`. **Refuted:** REFUTED — no reachable path, and the finding concedes as much.

The control replicates. I reproduced it: replicating the stage's exact listener set and calling `child.stdout.destroy(new Error('synthetic read failure'))` from the parent ends the host with `node:events:497 throw er; // Unhandled 'error' event ... Emitted 'error' event on Socket instance`, exit=1. But that trigger is a parent-side injection, and nothing in LintStage.ts destroys, pauses, or errors either read stream — the file's whole interaction with them is `child.stderr.resume()` (126) and `child.stdout.on('data', ...)` (127).

RAN THE REACHABILITY QUESTION MYSELF, independently of the finding's 8 vectors. Seven vectors under the stage's shipped `stdio: 'pipe'` listener set, with instrumentation listeners added purely to observe whether an 'error' is emitted at all: closeOwnStdout -> exit:0:null; sigkill -> exit:null:SIGKILL; bigWriteThenKill (200KB/ms then SIGKILL) -> exit:null:SIGKILL; sigsegv -> exit:null:SIGSEGV; abort -> exit:null:SIGABRT; execSelfClose -> exit:0:null; stdinFlood (5MB then SIGKILL) -> stdin:EPIPE, exit:null:SIGKILL. Zero STDOUT-ERROR or STDERR-ERROR observations, `HOST SURVIVED`. Separately, spawn of a nonexistent binary — the one shipped way the stage can fail to start — yields `["child:ENOENT"]` and `HOST SURVIVED`; it routes to `child.on('error')` at LintStage.ts:132, which the stage already handles.

Fifteen vectors between us, none reaching the state. Per the posture, a hypothesis with no reachable path does not survive.

The secondary argument also fails. Claim 4 reads 'child.stdin carries an error listener, and a stream error becomes a stage fault' — `child.stdin` is the sentence's subject, so 'a stream error' is an error on that stream. Reading it as quantifying over all three of the child's streams is a scope stretch, not a defect in the claim.

### A candidate declared under an ignored directory is linted anyway, because the synthesized path lands in tests/

Seam `overrides`. **Refuted:** The divergence reproduces, but it is the package's documented, pre-existing, asserted contract rather than a defect, so the finding breaks on "a guard elsewhere already prevents it" read as "the contract elsewhere already requires it". (a) The test immediately preceding C4 exists at BASELINE e11c389, line 43: 'reports a workspace lint finding for a gitignored test path', asserting a finding for `tmp/probe/lint-stage.test.ts`. Repairing this finding fails that pre-existing shipped test. (b) I measured what honouring the declared path would give: declared `tmp/probe/lint-stage.test.ts` with `debugger` -> [], synthesized `tests/probe-x.lint-stage.test.ts` -> ["`debugger` statement is not allowed"]. So without the relocation the stage returns nothing for candidates in the directory the package designates for them. (c) tmp/probe IS that designated directory: `inferTestProject` in src/server/helpers.ts maps root `tmp` + axis `probe` to the `probe` project, and vite.config.ts:183 includes `tmp/probe/**/*.test.ts`. (d) The design document names this exact problem and the relocation as its answer: PROBE.md:221 records 'Linting | impossible | `oxlint --config .oxlintrc.json tmp/probe/x.test.ts` reports `No files found to lint`', and PROBE.md:1054 kills 'Writing the runtime file under `tmp/probe/`' because '.gitignore:11 makes it unlintable'. The stage lints supplied text at a synthesized path precisely so an ignored declared path is still inspectable. dist/ and node_modules/ are the same required mechanism applied to paths nobody supplies, not a separate defect.

### A two-segment declared path under src or app makes a file name the synthesized directory segment

Seam `overrides`. **Refuted:** I ran the scenario and got agreement in every case, and the harm the finding names is structurally unreachable under the workspace's actual config. The malformed path shape does reproduce (`src/candidate.ts` -> `src/candidate.ts/probe-<uuid>.candidate.ts`), but 10 measured rows across both override classes all returned AGREE=true: src/candidate.ts, src/core.ts, app/core.ts, src/candidate.config.ts and the well-formed src/core/candidate.ts, each with default-export text and with restricted-import text (`import { ref } from 'vue'`). Structural reason it cannot diverge: a two-segment declared path's second segment always ends in `.ts`, so it can never equal `core`, `browser`, `server`, or `bin`, and neither the declared nor the synthesized path can match `src/core/**`, `src/browser/**`, `src/server/**`, `src/bin/**`, or `app/*/**`; the remaining `import/no-default-export` keys `*.config.ts` and `*.vue` are basename globs the commit's basename fix already makes identical on both sides, and `configs/policy.ts` needs a `configs/` prefix neither side carries. The finding itself concedes it does not break claim 6 and conditions its divergence on an override 'keyed on `src/*.ts`' that does not exist — a hypothesis with no reachable failure. Its quoted evidence row also does not reproduce: with the seam's own default-export text I measure ["Prefer named exports"] on both sides, not the []/[] it records. The synthesized file is a virtual document never written to disk, so the nonsense directory segment has no observed consequence.

### Negative result: the change does not alter the path a consumer sees, and the synthesized name cannot collide with a real file

Seam `overrides`. **Refuted:** It names no defect and states 'No failure', so there is no failure scenario to execute and it cannot survive as a finding. Recording it as verified-accurate rather than wrong: `git show e11c389:src/server/stages/LintStage.ts | grep -n documents.set` gives `134: this.#documents.set(uri, source.path.replaceAll('\\', '/'))` and the same line is byte-identical at dcd50a3; `#documents.get(uri)` at LintStage.ts:309 is the only source of Finding.path, and my shipped-stage runs confirm it — every reported finding carried the declared path (configs/policy.ts, tmp/probe/lint-override.ts, dist/candidate.ts). Text-over-disk verified independently: the real on-disk src/server/helpers.ts contains 0 occurrences of `export default`, and opening that URI with `export default { value: 1 }` returned ["Prefer named exports"]. One inaccuracy in it: the finding anchors at LintStage.ts:158 and says the line is unchanged there, but line 158 is a comment ('// this promise pending with no handler...'); the code it quotes sits at line 153.

### The report's first exit-behaviour row attributes the code-0 exit to the wrong cause

Seam `instrument`. **Refuted:** Broken on the quoted evidence. The row at s3-report.md:80 reads 'stdin EOF, with an unparseable `.oxlintrc.json` in the working directory'. `stdin EOF` is the head of the vector and the config is a subordinate 'with ...' circumstance, so the row makes no causal attribution to the config and states nothing false. My own controls confirm the head condition the row already names is the cause: C1 (EOF, no config file) {"code":0,"signal":null}; C2 (EOF, valid .oxlintrc.json) {"code":0}; C3 (unparseable config, initialize + didOpen, no EOF, 8 s cap) {"alive":true}; C4 (unparseable config + EOF) {"code":0}. A later round reproducing the row as written includes the EOF and reaches code 0; the finding's failure scenario needs the reader to drop the half the row leads with. What is left is prose precision about a non-causal condition in the vector column, and the substantive charge against those rows — that the stage cannot send them — belongs to finding 1, which I confirmed separately. Redundant and stylistic.

### The teardown test's wall-clock thresholds are redundant with the Vitest timeout and can only flake red

Seam `instrument`. **Refuted:** The premise is false and I can show it. The 20 s enclosing timeout covers the whole test — two stage warms, two inspections, a kill, a 250 ms wait and two teardowns — and the measured non-teardown cost is roughly 1 s (fixture warm+inspect measured 46-50 ms per inspection). A destroy settling in 6-18 s therefore passes the 20 s timeout and fails toBeLessThan(5_000). That interval is exactly the slow-but-settling teardown regression the guard exists for, such as a #retire that waits out a late shutdown reply, so the assertion is strictly stronger than the timeout rather than redundant. There is also no normative basis for the complaint: .claude/rules/tests.md:38 requires performance.now() for an elapsed interval and the test complies, and nothing in that file forbids a wall-clock threshold; its nearest caution (line 147) is about sizing a budget, not about asserting one. The finding produces no observed failure, records a 1000x margin ({"elapsed":0,"elapsed2":5}), and concedes the threshold is inert and that it is recorded only because the seam asked for it.

### The host's resolve hook rewrites every relative .js specifier in the whole process

Seam `instrument`. **Refuted:** Unreachable, and I instrumented the hook rather than reasoned about it. Running the committed hook rule over the real stage graph and logging every specifier it sees gives exactly ten: file:///.../LintStage.ts (entry), node:crypto, node:child_process, node:path, node:url, ../helpers.js, node:fs, node:module, node:path, @orkestrel/contract. Rewritten: one — '../helpers.js'. Every other specifier is a node: builtin or a bare package name, which the hook hands to next() untouched. The single bare package it reaches, @orkestrel/contract, ships one bundled dist/src/core/index.js on which grep -c "from './" returns 0, so no relative .js specifier exists anywhere in the reachable graph for the rule to corrupt. The finding offers no executed failure, states its scenario conditionally ('A dependency whose dist emits relative './x.js' imports would ...'), and concedes it works today. Hypothesis with no reachable path.

### The #retire comment claims the unanswered-shutdown case is handled; it is the case that hangs

Seam `conformance`. **Refuted:** REFUTED on two independent grounds. (a) The quoted evidence does not say what the finding claims. The comment's operative clause is scoped: 'teardown must not wait on a reply A DEAD PIPE SWALLOWED'. The code does satisfy that clause, and I ran it - killing the child mid-teardown makes #exit fire #fail, the shutdown request reject, the catch run child.kill('SIGKILL'), and destroy settle (mute + external SIGKILL at 500ms -> SETTLED after=506ms). A write to a dead pipe likewise throws in #send and rejects at LintStage.ts:220-227. The only unhandled reading is a LIVE server that stays mute, which the sentence's own dead-pipe gloss does not assert. (b) It is not a separate repair. Bounding destroy - finding 1's fix - makes both disjuncts of the sentence true with no edit to the comment, so the finding carries no work finding 1 does not already carry. Its failure scenario ('a reader takes the case as covered') is not executable and its evidence is finding 1's runs unchanged. The rule quotes do verify (documentation.md:36-37, writing.md:38, quality.md:45), but they are cited against a sentence whose operative clause holds. Non-independent restatement of finding 1.

### `signal ?? 'unknown'` is the sentinel AGENTS.md names by literal

Seam `conformance`. **Refuted:** REFUTED. The code path is unreachable, which is the primary break criterion. Node emits 'exit' with exactly one non-null argument; 'unknown' requires code===null AND signal===null, which I could not produce. Measured: kill -9 -> code=null signal=SIGKILL; kill -15 -> code=null signal=SIGTERM; process.exit(7) -> code=7 signal=null; and the hard case, unnamed real-time signals sent from /bin/kill, kill -34, kill -40 and kill -64 -> code=0 signal=null in every case (Node's signo_string returns empty for an unnamed signal, so the branch assigns exitCode instead). bothNull=false on all five. Corroborated by the derived variant in finding 3, which omits the fallback entirely and produced byte-identical messages across every scenario - the 'unknown' string is never constructed. Two further breaks. The token is not introduced by this change: git diff e11c389..dcd50a3 shows the expression byte-identical, only its assignment target moved from a local const to the field, which the finding itself concedes. And the law's subject is absence, which this code already represents correctly - #ending is 'string | undefined' and a running server reads undefined, exactly as 'Absence is undefined' requires.

### Module-scope test infrastructure sits in the test file rather than tests/setupServer.ts

Seam `conformance`. **Refuted:** REFUTED - the quoted rule does not say what the finding claims for most of its subject. tests.md:159 conditions extraction on 'as soon as it COULD SERVE ANOTHER TEST' and :161 on 'REUSABLE'; the finding applies both as unconditional. I measured the condition. No other test file drives an Oxlint language server: TypeStage.test.ts, RuntimeStage.test.ts, Probe.test.ts and helpers.test.ts declare only ROOT and one ORDERED array at module scope. SERVER is an Oxlint-LSP protocol fixture, FIXTURE is its package layout, HOST hardcodes the LintStage import and its lint-specific flow, and killFixtureServer reads the server.pid that SERVER alone writes - four of the five named declarations are single-consumer by construction, so the rule's trigger is not met for them. The finding's named carrier is also wrong: t2-brief.md scopes T2 to ROOT centralization and resolveRoot adoption across seven sites, not to this fixture set, so it does not carry what the finding routes to it. Its own ruling that nothing is chargeable to S3 is correct and I verified it - s3-brief.md:190-193 owns the two files and marks everything else off-limits. SURVIVING RESIDUE worth recording separately: PASSING is genuinely duplicated against tests.md:160 ('Any duplicate or near-duplicate helper is a defect') - its exact text appears at RuntimeStage.test.ts:277 and Probe.test.ts:76, 150, 157, 186, 193, 380, 387, 423, 430. That single constant, plus ROOT which T2 already owns, is the real gap; the six-declaration framing is not.

### Three 250 ms sleeps exceed the stated default-suite timer band

Seam `conformance`. **Refuted:** REFUTED. I ran the failure scenario and could not produce it. Measuring the real interval the sleeps cover - process.kill(SIGKILL) until the class actually refuses on #ending, driven through the real LintStage - gave 1.93, 2.10, 2.16, 2.35, 2.38, 2.39, 2.60, 2.61, 3.57, 3.94 ms idle (max 3.94), and under 8 CPU hogs on a 4-core box 3.75-11.55 ms over 20 samples (max 11.55). The 250 ms wait is a 21x margin at the worst contention I could manufacture, so 'a contended runner can enter the assertion before #ending is set' is a hypothesis with no reachable path. The rule quotes verify (tests.md:26 'timers normally use 10-50 ms', tests.md:24 determinism) but :26 says 'normally', which the finding itself names as the escape hatch, and it explicitly declines to press this as a refutation leg. No executable failure, an admitted rule qualifier, and a measured 21x margin: this is a preference, not a defect.


## Full claim evidence

### Claim 1 — CONFIRMED (seam `liveness`)

Ran the real dcd50a3 source in a plain Node host (registerHooks .js->.ts) against a protocol-faithful fixture server that announces its pid, then SIGKILLed the real child. Three variants, all settled: (a) kill + 250ms then destroy() -> 'SETTLED(destroy) ok'; (b) kill then destroy() with no delay, so the 'exit' event has not yet landed and #ending is still undefined when #destroy reads it -> 'SETTLED(destroy) ok'; (c) server SIGKILLs itself during 'initialize', so the death lands while #warmth is pending -> 'SETTLED(destroy) ok'. In (b) the mechanism is line 133 -> #exit -> line 350 #fail rejecting the pending 'shutdown' request, so #retire's catch (114-116) kills and 'released' resolves on the real 'exit'. The instrument demonstrably reports HUNG on other scenarios (see claims 8 and 15), so it can fail. A signal death always leaves code === null, so the line 349 suppression never applies to it.

### Claim 2 — CONFIRMED (seam `liveness`)

Same harness. (a) kill + 250ms, then inspect(): 'REJECTED(inspect) The Oxlint language server exited with signal SIGKILL' — line 238-240 of #send throws, #document's catch (169-171) routes it to the document's refusal. (b) kill with NO delay, so #ending is unset when inspect() begins and the didOpen write reaches a dead pipe: 'REJECTED(inspect-1-no-delay) The Oxlint language server exited with signal SIGKILL' — the rescue is #exit -> #fail rejecting #refusals. (c) a second inspect() afterwards: same rejection. (d) kill fired 5ms into an in-flight inspection: the fixture answered first, so that run resolved normally — a race the server won, not a counterexample. Control: inspect() against a live server 'SETTLED(inspect-live)'. No variant hung.

### Claim 3 — CONFIRMED (seam `settlement`)

Ran the real source under a bare Node host with NO unhandledRejection handler (Node's default ends the process with code 1) over seven teardown shapes of a stage whose child died earlier: kill-then-destroy-no-inspect, kill-during-warm-then-destroy, kill-during-warm-never-touched, kill-inflight-then-destroy, destroy-twice-after-kill, inspect-after-destroy-after-kill, kill-then-inspect-then-destroy. Every one printed 'reached-end' with empty stderr and exit=0. A code-death variant (server exits 0 on its own 300ms after warm, then destroy) gave {"outcome":"SETTLED","ms":0,"census":{responses:0,failures:0,documents:0,publishes:0,refusals:0,ending:"code 0"},"rejections":[]}. CONTROLS, both served at the same module URL through a registerHooks load hook so relative imports stayed intact: (a) baseline e11c389 source -> exit=13, 'Warning: Detected unsettled top-level await ... await stage.destroy()' on four of the shapes; (b) dcd50a3 with ONLY the defect-B hunk reverted (notify moved back before the finally) -> exit=1, 'Error: The lint stage has been destroyed\n    at #destroy (file:///workspace/probe/src/server/stages/LintStage.ts:97:14)'. The instrument therefore can fail, and does not on the repaired source. Note the scope of this ruling: claim 3's predicate is 'died earlier ... no unhandledRejection ... does not end the host'. A separate teardown-time hang I found (see claim 9) produces neither an unhandled rejection nor a host death, so it does not touch this claim.

### Claim 4 — CONFIRMED (seam `stream`)

PRESENCE: src/server/stages/LintStage.ts:131 `child.stdin.on('error', (error) => this.#fail(error))`.

SANDBOX CONTROL (the brief's false-green warning does not apply here): a Node-spawned-Node child has working stdio in this sandbox — `node env0.mjs` returned {"out":"HELLOGOT:PING","err":"ERR","code":3,"signal":null}. Executed evidence is therefore admissible.

EXECUTED PROOF: I copied src/server/helpers.ts and src/server/stages/LintStage.ts unmodified into /workspace/probe/tmp/scratch, built the test file's protocol-faithful fixture server (closeSync(0) on didClose of a `closes-input` document), and drove the REAL source from a plain Node host outside Vitest so an uncaught exception ends the process:
  LOG first lint 0
  LOG second REJECTED:write EPIPE
  LOG third REJECTED:The Oxlint language server closed its input
  LOG destroy SETTLED
  HOST_EXIT=0
The EPIPE became a rejected inspection, not an uncaught exception; the host exited 0.

INSTRUMENT CONTROL (proves the instrument can fail): the same host against a mutant with only line 131 deleted (`grep -v "child.stdin.on('error'"`, diff = `131d130`):
  LOG first lint 0
  node:events:497 throw er; // Unhandled 'error' event
  Error: write EPIPE ... at #send (.../LintStage.ts:246:15) at #notify (232:13) at #document (160:16)
  HOST_EXIT=1
The listener is load-bearing.

ORDERING: the listener cannot be beaten by an early write. LintStage.ts:121-133 is one synchronous block inside `#warm`, which the constructor calls at line 57; the first `await` is line 134's `#request('initialize', ...)`, which is also the first `#send`. Before line 125 assigns `#child`, `#send` throws 'The Oxlint language server is not running' (line 241), so no write exists without the listener. Every write's promise is also registered before the write: `#request` fills `#responses`/`#failures` in a synchronous Promise executor (214-217) before `#send` (219), and `#document` fills `#documents`/`#publishes`/`#refusals` (152-156) before `#notify` (161).

EPIPE IS ASYNCHRONOUS AND THE STREAM SELF-CLOSES: probe p1 against a child that closes fd 0 — before-write writable=true; after-write-sync threwSynchronously=none, writable=false; then error-event EPIPE with writableAtListener=false, destroyed=true, and the child still alive (exitCode===null, so `#ending` is undefined). This is exactly why `#send`'s `#ending` check (238) is insufficient alone and the `child.stdin.writable` check (244) is what refuses the next write — the third inspection above rejects deterministically instead of hanging.

FAILED-WARM PATHS, both executed:
  - child exits during warm (fixture `process.exit(7)`): LOG inspect REJECTED:The Oxlint language server exited with code 7 / LOG destroy SETTLED / HOST_EXIT=0.
  - spawn failure (mutant spawning '/nonexistent/probe/binary'): LOG inspect REJECTED:spawn /nonexistent/probe/binary ENOENT / LOG destroy SETTLED / HOST_EXIT=0.

CHILD-PROCESS 'error' (spawn failure) IS HANDLED: LintStage.ts:132 `child.on('error', ...)`, and probe p2 — replicating the stage's exact listener set against a nonexistent binary — recorded ["child:ENOENT"] only. Spawn failure emits on the ChildProcess alone, not on any stdio stream, so the one uncovered emitter class is not reached that way.

I could not break the stdin path. The residual gaps I did find are recorded as findings, not as a refutation: stdout and stderr carry no error listener (fatal if triggered, no trigger reachable in 8 vectors), and the repair's own comment overclaims a coordinator recycle that does not exist.

### Claim 5 — CONFIRMED (seam `settlement`)

Both halves hold, tested where #close actually reaches its notification. Built protocol-faithful servers that fault while the child is still ALIVE and REACHABLE, so #close's guard at LintStage.ts:188 passes and the didClose write really runs: (a) server answers didOpen with a frame header carrying an unparsable Content-Length -> caller receives 'REJECTED: Oxlint sent an invalid JSON-RPC frame header', census after = documents 0; (b) server answers with a well-framed but unparsable JSON body -> caller receives 'REJECTED: Oxlint sent invalid JSON: Expected property name or '}' in JSON at position 1', documents 0; (c) fixture that closes its own stdin on didClose -> caller receives 'write EPIPE', documents 0. Also destroy-during-inflight -> held rejects 'The lint stage has been destroyed', documents 0; silent-then-destroy (server never publishes) -> destroy settles in 6ms, held rejects with the real message, documents 0. CONTROL: dcd50a3 with ONLY the defect-D hunk reverted (notify before the three deletes) on the identical closes-input scenario -> refused becomes 'The Oxlint language server closed its input' instead of 'write EPIPE' AND census documents:1, still 1 after destroy. Same run on the repaired source -> 'write EPIPE', documents:0. Structural confirmation of why it cannot throw: #reachable (LintStage.ts:177-179) tests #ending === undefined and #child?.stdin.writable === true, which is exactly the set of conditions #send throws on (LintStage.ts:238, 241, 244), evaluated in the same synchronous block with no await between them; the only remaining statements in #send are JSON.stringify over a plain-string uri and a string write, neither of which throws synchronously while Node reports the stream writable. The three deletes at LintStage.ts:185-187 run before the guard at 188, so pruning is unconditional.

### Claim 6 — REFUTED (seam `overrides`)

Instrument: a throwaway LSP client under /workspace/probe/tmp/scratch/ (now deleted) spawning `node node_modules/oxlint/bin/oxlint --lsp` with cwd=/workspace/probe, sending the stage's exact `initialize` params including `capabilities: {}`, then `initialized`, then `textDocument/didOpen` for the declared path and for the path `#file` synthesizes for it (the #file algorithm reimplemented byte-for-byte from LintStage.ts:192-209, with a real `randomUUID()`).

Run 1 (fixed uuid, 20 shapes), tab-separated columns declared / synthesized / declared-diagnostics / synthesized-diagnostics / agree:
```
configs/policy.ts	tests/probe-aaaa….policy.ts	[]	["Prefer named exports"]	*** NO ***
configs/helpers.ts	tests/probe-aaaa….helpers.ts	["Prefer named exports"]	["Prefer named exports"]	yes
tmp/probe/candidate.ts	tests/probe-aaaa….candidate.ts	[]	["Prefer named exports"]	*** NO ***
dist/candidate.ts	tests/probe-aaaa….candidate.ts	[]	["Prefer named exports"]	*** NO ***
node_modules/pkg/candidate.ts	tests/probe-aaaa….candidate.ts	[]	["Prefer named exports"]	*** NO ***
vite.config.ts	tests/probe-aaaa….vite.config.ts	[]	[]	yes
candidate.ts / candidate.d.ts / Makefile / .oxlintrc.json / src / src/candidate.ts / src/core/candidate.ts / src/core/deep/nested/candidate.ts / app/core/candidate.ts / src/browser/candidate.ts / Widget.vue / weird[a-b]*.ts / guides/candidate.ts / scripts/candidate.ts	yes (all)
```
Run 2, re-done under the stage's literal handshake (`capabilities: {}`) and a real `randomUUID()`:
```
configs/policy.ts	tests/probe-5a2ac581-869e-4e55-9157-3cae09535008.policy.ts	[]	["Prefer named exports"]	*** NO ***
configs/helpers.ts	tests/probe-5a2ac581-….helpers.ts	["Prefer named exports"]	["Prefer named exports"]	yes
src/server/helpers.ts	src/server/probe-5a2ac581-….helpers.ts	["Prefer named exports"]	["Prefer named exports"]	yes
```
Controls, drawn from outside the exempt population, prove the instrument can fail: `configs/helpers.ts` sits in the same directory and differs only in basename, and it agrees; 16 of 20 shapes agree. A second control confirms the harness itself lints — `oxlint tmp/scratch/sample.ts tmp/scratch/sample.config.ts` (CLI) printed `import(no-default-export)` for `sample.ts` and not for `sample.config.ts`.

Why each break is a real exemption the workspace applies:
- `.oxlintrc.json` overrides carry `{"files": ["configs/policy.ts"], "rules": {"import/no-default-export": "off"}}`. That glob is path-anchored, and `#file` rewrites the directory to `tests` for any axis that is not `src` or `app` (LintStage.ts:197-201), so the exemption is lost.
- `tmp/`, `dist/`, and `node_modules/` are exempt from the gate by ignore rules (`.oxlintignore` lists `dist/` and `node_modules/`; `.gitignore` lists `tmp`). Verified against the gate itself: with `tmp/probe/gatecheck.ts` containing `debugger`, `./node_modules/.bin/oxlint` (the `lint:check` command, package.json:60) printed 0 lines mentioning it. The stage rewrites those candidates into `tests/`, which is not ignored, so they report.

`Source.path` is contractually just "Workspace-relative path the stages resolve the text against" (src/core/types.ts:29-34) with no restriction to `src`, `app`, or `tests`, and `configs/policy.ts` and `configs/helpers.ts` are real files in this workspace, so these declared paths are reachable candidates.

### Claim 7 — REFUTED (seam `instrument`)

All seven rows of the report's table reproduce exactly against installed oxlint 1.79.0 (node node_modules/oxlint/bin/oxlint --lsp, real protocol, 2026-08-19):
R1 stdin EOF + unparseable .oxlintrc.json {"code":0,"signal":null}
R2 exit notification with no shutdown {"code":0,"signal":null}
R3 well-framed message, unparseable JSON body {"code":0,"signal":null}
R4 frame header with no Content-Length {"code":0,"signal":null}
R5 request naming an unknown method {"alive":true}
R6 didOpen carrying 400000 nested ( {"code":null,"signal":"SIGSEGV"}
R7 --not-a-flag on the command line {"code":1} `--not-a-flag` is not expected in this context
The rows reproduce; the inference drawn from them does not. Three measurements break it.
(a) The four code-0 rows are inputs the stage CANNOT send. src/server/stages/LintStage.ts:245-247 always frames JSON.stringify output with an exact Content-Length, and nothing ends child.stdin. R2's `exit` is sent only from #retire at teardown, where #exit suppresses it (`this.#destroyed && code === 0`). Control C4 (shutdown then exit, the stage's own teardown path) = {"code":0} — the normal path, not a fault.
(b) The SIGSEGV row IS reachable through shipped code but does NOT produce the orphan. Driving the UNREPAIRED stage (e11c389) through the real inspect() API with text 'const value = ' + '('.repeat(400000):
  HOSTILE {"ok":false,"message":"The Oxlint language server exited with signal SIGSEGV"}
  LATER {"ok":false,"message":"TIMEOUT later"}
  DESTROY {"ok":false,"message":"TIMEOUT destroy"}
  SIDE []
No orphan, no unhandled rejection — a deadlock, because the unrepaired #send reads `child.exitCode !== null` and Node leaves exitCode null for a signal death. So the signal door reaches defect A, never defect B. The report's "Defect B is reachable through shipped code by both doors" is false as reasoned.
(c) R1's stated cause is refuted by control. C1 (stdin EOF, NO config file) = {"code":0}; C2 (stdin EOF, VALID .oxlintrc.json) = {"code":0}; C3 (unparseable .oxlintrc.json + initialize + didOpen, no EOF, 8 s cap) = {"alive":true}. The EOF alone causes the exit; the unparseable config contributes nothing. Instrument control C5 (initialize only) = {"alive":true}, so the cap can fail.
The terminal conclusion is nonetheless TRUE, by a vector the report never measured — see finding 2. That correction is why this REFUTED must not be read as "the repair was unjustified": the repair is justified, the stated justification is not.

### Claim 8 — REFUTED (seam `liveness`)

A spawn failure ends the child and never sets #ending. Line 133 (child.on('exit', ...)) is the ONLY writer of #ending; grep of every class-level child listener returns exactly lines 100, 101, 132, 133 — there is no class-level 'close' handler. Node emits 'error' then 'close' and NEVER 'exit' for a failed spawn: probe with a control — healthy child 'exit:0/null | close:0/null'; bad cwd 'error:ENOENT | close:-2/null'; missing binary 'error:ENOENT | close:-2/null'. Consequence, run against the real source with `new LintStage('<dir>/absent')` (oxlint still resolves from the parent, so spawn is reached and #child IS assigned): inspect rejects 'spawn /opt/node22/bin/node ENOENT', then destroy() one second later -> 'HUNG(destroy) after 4000ms'. Traced: '[T] destroy: child=defined ending=undefined exitCode=-2 stdinWritable=false / retiring / retired, awaiting released' and never 'released resolved' — line 98 does not take the early return, and the once('exit')/once('close') at 100-101 are attached after 'close' already fired at +7ms (timed probe: late listeners attached at +2000ms never fire; child.kill() returns false). CONTROL 1, the baseline e11c389 source in the identical scenario: 'SETTLED(destroy)' — the old `child.exitCode !== null` check reads -2 and returns early, so this is a regression the repair introduced. CONTROL 2, dcd50a3 on a healthy workspace with the identical one-second delay: 'SETTLED(destroy)'. The write half of the claim does hold: #send (236) is the only write site, #notify and #request both funnel through it, and it consults #ending (238) before stdin.writable (244); child.kill at 115 is not a write.

### Claim 9 — REFUTED (seam `settlement`)

Found two paths that leave an entry behind in #responses AND #failures permanently, and on which destroy() never settles. Instrument: the real source loaded through a registerHooks load hook that injects a read-only `census` getter over the five maps; the tree was not modified. PATH A - the child exits with code 0 without answering `shutdown`: {"outcome":"HUNG","ms":6007,"census":{"responses":1,"failures":1,"documents":0,"publishes":0,"refusals":0,"ending":"code 0","destroyed":true},"rejections":[]}. PATH B - destroy() is called during warm and the child exits with code 0 without answering `initialize`: {"outcome":"HUNG","ms":6007,"census":{"responses":1,"failures":1,...,"ending":"code 0","destroyed":true}}. CONTROLS isolating the cause to the exit code alone, same fixture, same script, one character changed in the server: exit code 3 instead of 0 on shutdown -> {"outcome":"SETTLED","ms":5,"census":{responses:0,failures:0,...,"ending":"code 3"}}; exit code 3 instead of 0 during warm -> {"outcome":"SETTLED","ms":142,census all 0}; SIGKILL instead of exit 0 on shutdown -> SETTLED, census 0; plain server -> SETTLED in 7ms, census 0. MECHANISM: #exit (LintStage.ts:347-350) sets #ending and then `if (this.#destroyed && code === 0) return`, skipping #fail. #fail is the only thing that rejects a #failures entry, so the outstanding request registered at LintStage.ts:215-216 is never settled and never deleted. On path A #retire's `await this.#request('shutdown', undefined)` (LintStage.ts:112) never returns, so #destroy never reaches `await released` (LintStage.ts:104). On path B #warmth never settles, so #destroy hangs at LintStage.ts:94 before it can even run #fail. The claim's own wording is 'leaves no entry behind in #responses, #failures, #documents, #publishes, or #refusals on ANY path' - these are two such paths. NARROW READING, stated for the record: the two forget-then-refuse blocks themselves (LintStage.ts:169-171 and 222-226) do leave nothing behind. I exercised both and the census was clean - the #request block through the closes-input teardown (after-destroy: all five maps 0) and the #document block through a server that closes its input on didOpen (inspect2 'REJECTED: The Oxlint language server closed its input', all five maps 0). I also could not break the map balance under 40 documents sequentially, a 6-source subject, three concurrent inspections, concurrent kill, concurrent destroy, or 40 randomized destroy/inspect races: zero leaks, zero unhandled rejections. The refutation is not in those blocks; it is the unmatched insertion the #exit suppression creates.

### Claim 10 — PLAUSIBLE (seam `instrument`)

NO TEST PASSES AGAINST THE UNREPAIRED SOURCE. All six reddened when I ran their scenarios against e11c389 (15 s bound per await, so a deadlock reports as TIMEOUT rather than hanging):
1 override: exempt.findings = [{origin:'code',path:'tmp/probe/lint-override.config.ts',message:'Prefer named exports...'}] vs toStrictEqual([]) — RED
2 teardown: {"settled":{"ok":false,"message":"TIMEOUT signalled destroy after 15000ms"}} — RED (Vitest 20 s timeout)
3 reject: {"later":{"ok":false,"message":"TIMEOUT later inspect after 15000ms"}} — RED
4 code 7: rejects 'The Oxlint language server is not running' vs 'exited with code 7' — RED
5 closes input: {"refused":{"ok":true,"value":{"stage":"lint","elapsed":3,"findings":[]}}} — resolved, so rejects.toThrow('EPIPE') — RED
6 host: STATUS 13, stderr 'Warning: Detected unsettled top-level await', stdout empty — RED
The shipped suite is green here: npx vitest run --project src:server tests/src/server/stages/LintStage.test.ts → 9 passed (9), exit 0, no skips.
SINGLE-DEFECT REVERT MATRIX (green = the test still passes; the diagonal is what each test actually binds to):
            baseline  A-rev   B-rev   C-rev   D-rev   C4-rev
1 override   RED      -       -       -       -       RED
2 teardown   RED      RED     green   -       -       -
3 reject     RED      RED     RED*    -       -       -
4 code 7     RED      green   green   green   green   green
5 input      RED      green   green   RED     RED     RED
6 host       RED      RED     RED     green   green   green
(*3 under B-rev keeps its assertion but emits SIDE ["unhandledRejection: The lint stage has been destroyed"], which Vitest reports as an error and exits 1.)
What I could not break: half 1 of the claim. Every one of the six fails against the unrepaired source, executed.
Why this is not CONFIRMED: half 2 is a universal over reasons that five revert axes cannot exhaust, and two results sit against it. Test 4 is the one the report never proved (section 2 gives red-then-green for five tests and none for it) and it passes under EVERY single-defect revert — it reddens only when A and D are reverted together, because with A repaired #send's message coincides with #exit's, and with D repaired the prune runs before the notify that would overwrite it. Its green in the repaired tree is produced by #exit/#fail, which this commit did not touch. And test 6 carries one assertion that provably cannot fail (finding 4).

### Claim 11 — REFUTED (seam `conformance`)

src/core/types.ts:346 documents ProbeInterface.destroy as "A promise that settles when every engine has released its resources", and src/server/types.ts:62 documents StageInterface.destroy as "A promise that settles after the resident tool releases its resources". src/server/Probe.ts:327 wires them: `await Promise.all([this.#type.destroy(), this.#lint.destroy(), this.#runtime.destroy()])`, so a hanging LintStage.destroy() hangs ProbeInterface.destroy().

I drove the real class from a throwaway Node host under /workspace/probe/tmp/scratch/ (deleted; tree verified clean afterwards), against three protocol-faithful fixture servers differing only in how they answer teardown. Each run: construct LintStage, one successful inspect, then race destroy() against a 6000 ms timer.

CONTROL (answers shutdown, exits on the exit notification) — drawn from the population the repair covers:
  CONTROL-POLITE INSPECTED stage=lint findings=0
  CONTROL-POLITE DESTROY=SETTLED after=8ms

SUBJECT A (answers initialize and publishes diagnostics, never answers shutdown, never exits):
  SUBJECT-MUTE INSPECTED stage=lint findings=0
  SUBJECT-MUTE DESTROY=HUNG after=6007ms

SUBJECT B (answers shutdown, ignores the exit notification, never exits):
  SUBJECT-DEAF INSPECTED stage=lint findings=0
  SUBJECT-DEAF DESTROY=HUNG after=6007ms

The instrument can report SETTLED (control, 8 ms), so a HUNG reading is the subject, not the harness.

Mechanism, read from the source at dcd50a3:
- A: `#retire` (LintStage.ts:112) does `await this.#request('shutdown', undefined)` with no bound. `#request` settles only on a reply, on an error reply, or on `#fail`. `#destroy` already ran `#fail` at line 97 BEFORE `#retire`, so the shutdown entry registered inside `#retire` has nothing left to settle it. The SIGKILL in the `catch` at line 115 is never reached, because nothing rejects.
- B: `#retire` returns cleanly (shutdown answered, exit notified), then `#destroy` awaits `released` (LintStage.ts:99-104), which resolves only on the child's `exit` or `close`. A resident server that ignores `exit` fires neither, and there is no kill fallback on this path at all.

Both are unbounded absent an independent child death. The change therefore contradicts the destroy TSDoc it was written to honour. PROBE.md carries no sentence the change contradicts (its only teardown claim, at line 116, is about the withdrawn orphan finding), and no guide documents LintStage: guides/README.md records `guides/probe.md` as "Not created", so guide parity is inert here.

### Claim 12 — REFUTED (seam `conformance`)

The mechanical half is clean; the prose and state-modelling halves are not.

Clean, run at dcd50a3 in /workspace/probe:
- `npm run format:check` → "All matched files use the correct format. Finished in 3435ms on 140 files", EXIT=0.
- `npx oxlint --config .oxlintrc.json --deny-warnings .` → EXIT=0. That config errors on `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-non-null-assertion`, `typescript/consistent-type-assertions` with `assertionStyle: never`, `typescript/parameter-properties`, `typescript/explicit-member-accessibility` no-public, `typescript/ban-ts-comment` for ts-expect-error/ts-ignore/ts-nocheck, and the local `policy/no-mocking` and `policy/no-keyword-privacy` plugins.
- `npm run check` (root tsc plus the three scoped projects) → EXIT=0.
- `npm run test:policy` → "Test Files 1 passed (1) / Tests 86 passed (86)", EXIT=0.
- Diff scan for `any`, ` as `, `!`, ts-comment and eslint/oxlint suppressions, `vi.`/`jest.`/`spyOn`/`useFakeTimers` over `git diff e11c389..dcd50a3`: the only three matches are the word "as" inside English comments ("reports a signalled server as alive", "as a stage fault", "the same pass as one"). No banned construct.
- No nested function declaration or assignment: every added function form is an anonymous callback passed directly as an argument, which AGENTS.md exempts. The one module-scope declaration is `killFixtureServer` in the test file, which is not nested.
- Private-member naming is inside the names.md allowance ("Private methods: two or three words are acceptable"); `#retire`, `#reachable`, `#close`, `#ending` are all one word. Private members use `//` comments, not TSDoc, per typescript.md.
- No public collection lost its readonly: `Check.findings` stays `readonly Finding[]` and `#findings` returns `readonly Finding[]`.
- The HOST's `module.registerHooks` resolve rule rewrites relative `.js` specifiers to the sibling `.ts` files so Node loads the REAL source. It substitutes nothing, so it is not the "module replacement ... to simulate project-owned behavior" AGENTS.md bans. The fixture server is a protocol-faithful fixture server, which tests.md names explicitly as permitted.

What refutes the claim:
1. src/server/stages/LintStage.ts:108 — a comment introduced by this change states behaviour the code does not have. See the finding; my claim-11 runs prove the "never answers" case hangs. `.claude/rules/documentation.md` § Parity: "Falsify a prose claim the way you falsify a code claim ... Code rulings survive review because a test can break them; prose rulings survive because nothing tries." `.claude/rules/writing.md` § Claims and time: "Claim only what the reader can check." `.claude/rules/quality.md`: "Verify a comment or an agent's report against the call sites before relying on it."
2. src/server/stages/LintStage.ts:48 — `#ending` persists a fact Node already carries on the child. `.claude/rules/typescript.md` § Immutability: "Compute derived facts instead of persisting duplicate state." names.md § General vocabulary imports the AGENTS.md "Derive state" law by reference. Probe (control paired): a child killed by SIGKILL reports `exitCode=null signalCode=SIGKILL` inside its own exit handler and 50 ms later; the control child exiting 7 reports `exitCode=7 signalCode=null` at both readings; both read null while alive. So `exitCode`/`signalCode` carry the complete ending fact, are set before the handler runs, and are stable — `#ending` is derivable as a getter.
3. src/server/stages/LintStage.ts:348 — `signal ?? 'unknown'` is the sentinel AGENTS.md names by literal: "Absence is `undefined`. Never invent sentinels such as `'none'`, `'unset'`, `'unknown'`, `''`, or `-1`." The token predates the change; this change promoted it from a throwaway local into stored class state.
4. tests/src/server/stages/LintStage.test.ts:18,59,66,72,108 — module-scope test infrastructure that tests.md places in `tests/setupServer.ts`. See the separate ruling on the recorded deviation.

One mechanical fact the Orchestrator needs when weighing this: the policy sweep does NOT cover test-file declarations. `readPolicySources` globs `POLICY_SOURCE_GLOB = '{app,src}/**/*.{...}'` (tests/setupPolicy.ts:737); `POLICY_TEST_GLOB = 'tests/{app,src}/**/*.test.ts'` is read only at tests/setupPolicy.ts:815, inside `inspectPolicyMirrors`, which checks mirrors rather than declarations. A green policy run therefore vouches for nothing about item 4.

### Claim 13 — CONFIRMED (seam `conformance`)

`git diff --name-status e11c389..dcd50a3` → exactly two rows: `M src/server/stages/LintStage.ts`, `M tests/src/server/stages/LintStage.test.ts`.
`git status --porcelain` → empty. `git status --porcelain --ignored=traditional` → only `!! dist/` and `!! node_modules/`.
`find tmp` → `tmp` and `tmp/probe` only. No `tmp/scratch/`, and `tmp/probe/` is empty, so no sibling project's directory-listing assertion was polluted.
`git ls-files tmp` → empty. `git ls-files | grep -iE 'scratch|instrument|probe-|\.mjs$|\.cjs$'` → empty, so no instrument entered the commit by forced add either (the `tmp` line in .gitignore stops the accident; `git ls-files` rules out the deliberate case).
Test count moved 3 → 9 (`grep -cE '^\s*it\('` against `git show e11c389:...` and the worktree file), matching the report's "baseline 174 + 6 new".
I wrote my own instrument under /workspace/probe/tmp/scratch/, deleted it, and re-verified: `find tmp` returns `tmp` and `tmp/probe` only, `git status --porcelain` empty. I killed my one orphaned fixture child by recorded pid (`kill -9 898`, then `kill -0 898` → dead), never by pattern.

### Claim 14 — CONFIRMED (seam `liveness`)

The claim's premise is false in the shipped path: #reachable is TRUE during warm-up, not false. Measured by inserting a read-only accessor for the private getter through a load hook and reading it synchronously after the constructor returns and again on the next tick: 'during warm-up (sync after ctor): child=defined ending=undefined reachable=true' and the same on the next tick. #child is assigned at line 125, synchronously inside #warm() before its first await, and a freshly spawned child's stdin.writable is true (probe: 'CONTROL stdin.writable immediately after spawn: true'). The first inspection is unaffected: '[R] #close destroyed=false reachable=true -> SENT didClose' then 'FIRST inspection: stage=lint findings=0'. The one path where #reachable really is false while warming — resolveWorkspaceBinary throwing at line 120 before spawn, leaving #child undefined — reaches no consumer, because #reachable's sole consumer is line 188 in #close, #close runs only from #document, and #document runs only after inspect awaits #warmth at line 71: 'REJECTED(first-inspect) oxlint does not publish a bin field' then 'SETTLED(destroy)'. The caller receives the real diagnosis, not a #reachable artifact.

### Claim 15 — REFUTED (seam `liveness`)

Constructed case, run against the real dcd50a3 source: a protocol-faithful server that exits with code 0 while handling 'initialize', with destroy() called immediately after construction so #destroyed is true when the exit lands. Result: 'HUNG(destroy) after 4000ms'. Line 348 sets #ending, line 349 returns before line 350's #fail, so the pending 'initialize' request is never rejected, #warmth never settles, and #destroy blocks forever at line 94. A concurrent inspection wedges with it: 'HUNG(inspect) after 5000ms / HUNG(destroy) after 5000ms'. THREE controls isolate line 349 as the sole cause: same fixture exiting code 7 -> 'SETTLED(destroy)'; same fixture SIGKILLing itself -> 'SETTLED(destroy)'; and the mutation control, the identical code-0 fixture with `if (this.#destroyed && code === 0) return` deleted through a load hook -> 'SETTLED(destroy)' (and code 7 rejects the inspection with 'The Oxlint language server exited with code 7'). Reachability is not exotic: I measured the real oxlint 1.79.0 --lsp on this host and code 0 is its ONLY code-exit shape — stdin EOF 'exit code=0', 'exit' notification 'exit code=0', while SIGINT/SIGTERM/SIGHUP all die by signal. The suppression therefore blankets exactly the code oxlint uses, and swallows it whenever a request is still outstanding — the 'server that never answers shutdown' case #retire's own comment at 107-109 claims to handle.
