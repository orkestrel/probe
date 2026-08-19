# Brief verification — the eleven checks run against the real tree

Five undispatched repair briefs, one blind lane each, every factual claim verified by running it.
Four came back DEFECTIVE. 28 defects total, most of which would have stopped a unit on arrival or
given it an unreachable criterion.

| Brief | Verdict | Defects |
| ----- | ------- | ------- |
| S2 | **DEFECTIVE** | 7 |
| S3 | **DEFECTIVE** | 5 |
| S4 | **DISPATCHABLE** | 2 |
| S5 | **DEFECTIVE** | 8 |
| S6 | **DEFECTIVE** | 6 |

## S2 — DEFECTIVE

### S2.1 — The owned globs `tests/src/server/**` and `tests/src/bin/**` swallow three files that other units own, two of which a writing unit is editing right now, so S2 is not the sole serial writer the brief claims it is.

**Check.** Check 4 and 11 — owned list vs. files another unit consumes and is writing

**Evidence.**

Live edits, taken 6 and 27 seconds before the check:

$ git -C /workspace/probe status --porcelain
 M src/server/stages/RuntimeStage.ts
 M tests/src/bin/main.test.ts
 M tests/src/server/stages/RuntimeStage.test.ts

$ ls -l --time-style=+%H:%M:%S tests/src/bin/main.test.ts tests/src/server/stages/RuntimeStage.test.ts
-rw-r--r-- 1 root root 11484 07:37:27 tests/src/bin/main.test.ts
-rw-r--r-- 1 root root 10224 07:37:27 tests/src/server/stages/RuntimeStage.test.ts
$ date +%H:%M:%S
07:37:54

Those two files fall inside S2's globs, and they are the named property of the S1 fix unit (/home/user/scaffold/.orkestrel/probe/s1fix-brief.md § Scope):
  "**Owned**: `src/server/stages/RuntimeStage.ts`, `tests/src/server/stages/RuntimeStage.test.ts`, `tests/src/bin/main.test.ts`."

A third file inside S2's glob is S3's (/home/user/scaffold/.orkestrel/probe/s3-brief.md § Scope):
  "**Owned**: `src/server/stages/LintStage.ts`, and `tests/src/server/stages/LintStage.test.ts` for the tests these defects owe."

S2's own line 92-94 grants all of them: "`tests/src/server/**` and `tests/src/bin/**` for the tests these defects owe". S2 also marks `src/server/stages/RuntimeStage.ts` off-limits (line 185) while implicitly owning its test file — the source is fenced and its proof is not.

**Fix.**

Replace the two globs with the explicit file list S2 actually needs, matching the sibling briefs' form: `tests/src/server/Probe.test.ts` and `tests/src/server/index.test.ts`. If a criterion needs `tests/src/bin/main.test.ts` or `tests/src/server/stages/RuntimeStage.test.ts`, grant that file by name only after the S1 fix unit commits, and say in the brief that S3 owns `tests/src/server/stages/LintStage.test.ts`.

### S2.2 — The standing condition "The tree is clean" is false at check time, so criterion 10 (`git diff --stat` touches only owned files) cannot close no matter what the unit writes.

**Check.** Check 2 and 6 — a measured fact the brief asserts, and criterion 10 fixed to it

**Evidence.**

Brief line 180: "- Start from the commit `git log --oneline -1` reports at dispatch. The tree is clean."

$ git -C /workspace/probe status --porcelain
 M src/server/stages/RuntimeStage.ts
 M tests/src/bin/main.test.ts
 M tests/src/server/stages/RuntimeStage.test.ts
?? retention.jsonl

$ git -C /workspace/probe log --oneline -1
f9810f9 Stop the runtime stage certifying what it never ran

`src/server/stages/RuntimeStage.ts` is off-limits to S2 (brief line 185) and already carries a diff. Criterion 10 (brief line 125) reads that diff and fails on a file S2 never touched.

**Fix.**

Gate the dispatch on the S1 fix unit committing, then re-read `git status --porcelain` and confirm it is empty before launching. Restate criterion 10 against the baseline commit rather than the working tree: `git diff --stat <baseline-sha>..` touches only owned files. Name `retention.jsonl` as an expected untracked file so it does not read as a deviation.

### S2.3 — The brief never names `tmp/scratch/` and never warns that a bare `scratch/` at the repository root is not gitignored, so an instrument written to `scratch/` lands in the tracked tree and is collected by the gates.

**Check.** Campaign check — throwaway instrument location

**Evidence.**

$ git -C /workspace/probe check-ignore -v tmp/scratch/x.ts
.gitignore:11:tmp	tmp/scratch/x.ts
$ git -C /workspace/probe check-ignore -v scratch/x.ts; echo "exit=$?"
exit=1

S2 says only (lines 195-197): "Put any throwaway instrument in its own scratch directory, never in `tmp/probe`."

Every sibling brief names the path and the trap:
  s3-brief.md:250  "Put it in `tmp/scratch/`, and nowhere else."
  s3-brief.md:255  "A bare `scratch/` at the"
  s4-brief.md:155  "Put any throwaway instrument in `tmp/scratch/`, and nowhere else."
  s5-brief.md:208  "Put any throwaway instrument in `tmp/scratch/`, and nowhere else."
  s6-brief.md:134  "Put it in `tmp/scratch/`, and nowhere else."
  s1fix-brief.md:193-194  "Put any throwaway instrument in `tmp/scratch/`, and delete it before returning. `tmp` is gitignored; a bare `scratch/` at the repository root is NOT."

The risk is real for this unit: neither `.prettierignore` nor `.oxlintignore` excludes a root `scratch/`, and `format:check` and `lint:check` both run `.` tree-wide (package.json: "format:check": "oxfmt --config .oxfmtrc.json --check .", "lint:check": "oxlint --config .oxlintrc.json --deny-warnings .").

**Fix.**

Replace the sentence with the sibling wording: "Put any throwaway instrument in `tmp/scratch/`, and nowhere else, and delete it before returning. `tmp` is gitignored; a bare `scratch/` at the repository root is NOT."

### S2.4 — The concurrency evidence block labels both quoted lines `node_modules/@orkestrel/mcp/dist/src/server/index.js`, but the `transport.listen` line is in `dist/src/core/index.js`; that file contains no such line.

**Check.** Check 2 — quoted code attributed to a file that does not contain it

**Evidence.**

Brief lines 31-36 head the block with "node_modules/@orkestrel/mcp/dist/src/server/index.js" and quote two lines under it.

First line is真 there:
$ grep -n 'on("data"' node_modules/@orkestrel/mcp/dist/src/server/index.js
1438:		this.#input.on("data", (chunk) => this.#receive(chunk.toString()));

Second line is not:
$ grep -c "listen(async" node_modules/@orkestrel/mcp/dist/src/server/index.js
0
$ grep -n "listen(async" node_modules/@orkestrel/mcp/dist/src/core/index.js
1375:	transport.listen(async (message) => {
$ grep -n "function bindServer" -A 4 node_modules/@orkestrel/mcp/dist/src/core/index.js
1372:function bindServer(server, transport) {
1373-	let active = true;
1374-	const live = new Map();
1375-	transport.listen(async (message) => {

The substance holds — both lines exist and the async listener is unawaited — but this block is the sole evidence for "Concurrency is reachable, so assume it", which is the premise of defect A and criteria 1 and 2. A unit told to build on verified evidence greps the named file, finds nothing, and stops.

**Fix.**

Split the block into two labelled citations: `node_modules/@orkestrel/mcp/dist/src/server/index.js:1438` for the `data` handler, and `node_modules/@orkestrel/mcp/dist/src/core/index.js:1372-1375` for `bindServer`'s unawaited `transport.listen(async …)`.

### S2.5 — The same defect carries two letters. The body calls the duplicate-`error`-event defect D and the `expire` documentation defect E; the amendment calls the duplicate-`error`-event defect E. The `src/core/types.ts` grant is written as "defects D and E", so which documentation edits are permitted depends on which numbering the reader follows.

**Check.** Check 4 — the scope grant keys off a defect letter the amendment redefines

**Evidence.**

Body, brief line 74: "### D — a `prove` rejection emits two `error` events"
Body, brief line 84: "### E — the `expire` event's documentation is not true when it fires"
Amendment, brief line 161: "### Defect E — a `prove` rejection emits two `error` events, not one"

Scope, brief lines 92-93: "`src/core/types.ts` **only** for the `expire` and `deadline` documentation defects D and E"

Under the body's letters, D needs no `types.ts` edit at all (it is an emit-site change in `Probe.ts`), and the `deadline` documentation belongs to defect A, which the grant does not name. The deadline documentation is a real edit this unit owes: src/core/types.ts:258 reads "`deadline` is the coordinator's own milliseconds budget for one runtime stage", and defect A plus the design note (brief line 261, "state what bounds the total time a caller waits") change exactly what that sentence promises.

The same amendment also gives the one-`error`-event property three different coverage lists — brief line 116 names three paths, brief line 82 names four, brief line 176 names two.

**Fix.**

Delete the amendment's duplicate "### Defect E" section, since the body already carries it as D. Rewrite the scope grant to name the sentences rather than the letters: "`src/core/types.ts` **only** for the `ProbeEventMap.expire` and `ProbeOptions.deadline` doc comments." Keep one coverage list for the one-event criterion — the four paths at line 82.

### S2.6 — The brief names no governing guide or spec, and no skill (or an explicit none), while the spec section that rules on defect A exists and every sibling brief points its unit at it.

**Check.** Check 1 and the dispatch contract's required Context section

**Evidence.**

S2's Context (brief lines 16-22) lists only AGENTS.md, `.claude/rules/`, `src/core/types.ts`, and the two sweep files. It never cites PROBE.md.

The spec exists and is directly on point:
$ ls -la /home/user/scaffold/PROBE.md
-rw-r--r-- 1 root root 71917 Aug 19 05:32 /home/user/scaffold/PROBE.md
$ grep -n "deadline" /home/user/scaffold/PROBE.md | head -4
106:| Measurement only         | A deadline expiry leaves the abandoned test, loop and all, in the checkout     |
365:### Own the deadline outside the worker
375:Give the coordinator an out-of-process deadline that kills and recycles a worker.
714:coordinator outside the Vitest process can hold that deadline.

Sibling briefs supply it:
  s3-brief.md:20    "`/home/user/scaffold/PROBE.md`, not in your working directory."
  s1fix-brief.md:19 "Governing guide: `PROBE.md`, at `/home/user/scaffold/PROBE.md` — the orchestrator's repository, not"

The cross-repo read is the campaign convention and works: s1-brief.md:19 cites `/home/user/scaffold/.orkestrel/probe/seam-sweep-findings.md` and S1 completed.

**Fix.**

Add to Context: "Governing spec: `/home/user/scaffold/PROBE.md`, in the orchestrator's repository rather than your working directory. Read § 'Own the deadline outside the worker' (line 365) before choosing what the deadline bounds." Add "Skill: none."

### S2.7 — Defect C says "Both of its throw sites" reduce the checks to the quoted sentence, but only one throw site carries that message and `#arm` has four throw sites with four different messages.

**Check.** Check 2 — a count asserted about the code

**Evidence.**

$ grep -rn "did not begin clean" --include=*.ts --include=*.md . --exclude-dir=node_modules --exclude-dir=dist
./src/server/Probe.ts:168:				throw new Error('The probe boot control did not begin clean')

The four throw sites in `#arm`, read from /workspace/probe/src/server/Probe.ts:
168: 'The probe boot control did not begin clean'
175: 'The probe boot type control did not detect a mutated dependency'
178: 'The probe boot type control did not remain runtime-clean'
184: 'The probe boot runtime control did not detect a mutated dependency'

The brief inherited "both throw sites" from seam-sweep-findings.md:172, which cited lines 145 and 151 of an earlier revision of the file; the control half has since split into three.

The repair itself is reachable with owned files — `formatCheck` and `formatFinding` are exported from `@src/core` (src/core/helpers.ts:18 and :39, re-exported by src/core/index.ts), which `Probe.ts` already imports from for `computeReceipt`, so the off-limits mark on `src/core/helpers.ts` does not block criterion 4.

**Fix.**

Replace "Both of its throw sites" with "All four of its throw sites — `src/server/Probe.ts` lines 168, 175, 178, and 184 — reduce a fully populated set of checks to a bare sentence," and keep the line 168 message as the quoted example.

### What this lane confirmed correct

Verified correct, so nobody re-checks it.

FACTS AND QUOTED CODE (check 2)
- Amendment 2 Fact 1 is exact. `awk 'NR>=211 && NR<=217' /workspace/probe/src/server/Probe.ts` reproduces the brief's seven quoted lines character for character, including `const timeout = createTimeout({ ms: this.#deadline })` at 213 and `stage.inspect(subject),` at 217.
- Amendment 2 Fact 3 is exact. `/workspace/probe/src/server/Probe.ts:223` is `await this.#recycle(stage)`, inside the `if (!timeout.expired) throw error` branch, with `this.#emitter.emit('expire', claim)` at 222 preceding it — which is also the proof of defect E's ordering claim.
- Amendment 2 Fact 2 is exact against the committed tree. `git -C /workspace/probe show f9810f9:src/server/stages/RuntimeStage.ts` puts `inspect` at lines 61-68 with `const inspection = this.#tail.then(() => this.#inspect(subject))` at 63 and `#tail: Promise<void> = Promise.resolve()` at 39. I read the committed blob, not the working tree.
- Defect B is true. `/workspace/probe/src/server/Probe.ts:203-209` shows `#inspect` returning a bare `Promise.all([...])` over type, lint, and `#inspectRuntime`, with the deadline reaching only the third. `/workspace/probe/src/server/stages/LintStage.ts:140-162` shows `#document` settling only through `#publishes.set(uri, resolve)` or `#refusals.set(uri, reject)`, so a server that accepts `didOpen` and never publishes leaves it unsettled.
- Defect D is true. `/workspace/probe/src/server/Probe.ts:187-188` (`#arm` catch: emit then rethrow) and `:106-107` (`prove` catch: emit then rethrow) give one rejected call two identical `error` events.
- Defect E's quoted documentation is true. `/workspace/probe/src/core/types.ts:246` reads `/** The coordinator's deadline fired and the runtime worker was recycled. */`. Defect A's is true too: `:258` reads "`deadline` is the coordinator's own milliseconds budget for one runtime stage".
- The concurrency premise's other two legs hold. `/workspace/probe/src/server/factories.ts:66` is `return probe.prove(input)`, and `/workspace/probe/src/bin/main.ts:3` is `createProbeServer(createProbe()).start()`. `Probe` has no mutual exclusion around `prove`.
- The "Also yours" citation is exact. `/workspace/probe/tests/src/server/Probe.test.ts:293-297` is the `readdirSync(directory).filter((name) => name.startsWith('arm-') || name.includes('.probe-'))` assertion against `toStrictEqual([])`, and grep confirms `arm-` appears at 295 only, so the anchor stays findable after the unit adds tests above it.
- The standing condition's counts are right. Exactly four server test files write into `tmp/probe/`: Probe, LintStage, TypeStage, and RuntimeStage test files. `tests/src/server/helpers.test.ts` mentions `tmp/probe` five times but only as literal path arguments to pure helpers — it has no `writeFileSync`, `mkdirSync`, or `rmSync` — and `tests/src/server/index.test.ts` has zero mentions.
- The no-parallelism-guard claim is right. `vite.config.ts` `srcServer` test block (lines 92-98) sets `name`, `include`, `exclude`, `setupFiles`, `environment`, and `browser` and no `fileParallelism`, `maxConcurrency`, or `pool` option, and `test:src` runs `--project src:core --project src:server --project src:bin` in one invocation.
- The cited rule text exists. `/workspace/probe/.claude/rules/tests.md:34` is the membership-over-total rule the standing condition invokes.

CAMPAIGN-SPECIFIC CHECKS
- No nonexistent path is cited. The brief never mentions `PROBE.md` or `guides/probe.md`. `guides/probe.md` is confirmed absent — `guides/README.md` marks every row "Not created. Create this file when the workspace has a public surface: `guides/probe.md`", and `ls guides/` returns only README, contract, emitter, guide, mcp, scaffold, timeout, and tool. Its absence is separately useful: no guide documents `ProbeEventMap` or the arming message, so defects C and E have no off-limits documentation consumer and no parity gate to trip. `grep -rn "did not begin clean"` over the tree finds exactly one occurrence, in `Probe.ts` itself.
- The refuted M6 finding is NOT carried. `grep -n "TypeStage\|@remarks\|M6\|project selection" s2-brief.md` returns nothing, exit 1. `/home/user/scaffold/.orkestrel/probe/doc-truth-verification.md:11` records "| M6 | **REFUTED** |" and the § "M6 — REFUTED" body at line 345 requires no repair to `src/server/stages/TypeStage.ts:20-22`. Nothing in S2 asks for one.

CHECKS THAT FOUND NOTHING
- Check 1: the brief does not tell the engine to launch its own CLI. `.claude/agents/sol.md` is the bridge driver (tools `Bash, Read, Grep, Glob, mcp__codex__codex`, no write); the brief's reader is Sol inside `codex exec --sandbox workspace-write`, and its Host facts section speaks to that reader — working directory `/workspace/probe`, nested process spawns permitted.
- Check 3: the criteria fix properties, not measured numbers. The only measurement is "roughly three minutes" for `npm test`, which is guidance and not a criterion. I did not run the suite, because the S1 fix unit is mid-edit and a run would collide with it.
- Check 5: the "Also yours" obligation is small but is in an owned file the unit already rewrites for criteria 1-7, so its scope cannot error independently of the primary work.
- Check 7: no template/materialized split applies. The unit adds no Vitest project, and `vite.config.ts`, `configs/**`, and `package.json` are all off-limits with no criterion reaching them.
- Check 8: no criterion bundles a property with an expected consequence. Criteria 1 and 2 each pair one property with the interleaving that proves it; criterion 7 is a regression list over guarantees that already hold.
- Check 9: no control identifier is pushed toward a permanent name. The brief carries private labels A-E and criteria 1-10 but never instructs the unit to name a test after one. No sibling brief carries the naming instruction either, so this is campaign-wide practice rather than an S2 inconsistency.
- Check 10: the output mechanism fits the allowlist. The route is `workspace-write`, the brief asks for a returned five-heading report rather than a written file, and `Bash` for validation is granted at brief line 99.
- Check 11 on symbol removal: defect D removes an emit call, not an exported symbol, and defect C changes an error message string with zero consumers outside its own throw site (grep above). No importer count is at risk.
- Criterion 4 closes with owned files: `formatCheck`/`formatFinding` reach `Probe.ts` through the `@src/core` barrel it already imports, so the off-limits mark on `src/core/helpers.ts` does not block it.
- Criterion 1 closes with owned files despite the design note pointing at off-limits `RuntimeStage.ts`: `Probe.ts` can hold its own serialization tail and arm the timer at the moment it calls `stage.inspect`, which needs no stage edit. The note is explicitly labelled "Design note, not a prescription", so it is not a contradiction.

## S3 — DEFECTIVE

### S3.1 — Criterion 4 requires a committed test to assert emptiness of `#documents`, `#publishes`, and `#refusals`, which are ECMAScript private fields with no accessor anywhere on the public surface, so no test in the owned file can close it — and the brief itself makes the only escape a stop-and-report.

**Check.** 4 — acceptance criteria read line by line against the off-limits list (also 8, unobservable consequence)

**Evidence.**

$ grep -n "^\t get \|^\tasync \|^\t[a-zA-Z].*(.*).*{\|^\tconstructor" src/server/stages/LintStage.ts
52:	constructor(workspace: string = process.cwd()) {
61:	get stage(): Stage {
65:	async inspect(subject: Case): Promise<Check> {
75:	destroy(): Promise<void> {
(every remaining member is `#`-prefixed)

The three maps are private fields, LintStage.ts:37-39:
	 readonly #documents = new Map<string, string>()
	 readonly #publishes = new Map<string, (findings: readonly Finding[]) => void>()
	 readonly #refusals = new Map<string, (error: Error) => void>()

$ sed -n '20,41p' src/server/types.ts  — `StageInterface` declares exactly `stage`, `inspect(subject)`, `destroy()`. No map accessor.

Brief criterion 4: "The three maps — `#documents`, `#publishes`, `#refusals` — are empty after a failed `#document` call".
Brief preamble to the criteria: "Every criterion owes a committed test, red before the fix and green after."
Brief § How to drive a signal death in a test: "Do not add a public accessor to the stage purely so a test can reach the child ... If you cannot drive it without one, stop and report."

A `#` field is unreachable by `Reflect`, by a recorder, or by any test-infrastructure route, so the literal criterion has exactly one implementation the brief forbids.

**Fix.**

Restate criterion 4 as the observable the map emptiness produces: after a `#document` call that fails because the child is dead, a later `inspect` on a live stage still returns a check, and `destroy()` settles with no `unhandledRejection`, so no orphan survives the failed call. If the field state itself must be pinned, say so and grant the accessor explicitly instead of forbidding it.

### S3.2 — Criteria 1, 2, and 3 name `prove` and "a probe", whose implementation (`src/server/Probe.ts`) is named off-limits and whose mirrored test home (`tests/src/server/Probe.test.ts`) falls under "everything else"; a bounded-time assertion on `Probe.destroy()` additionally depends on off-limits code.

**Check.** 4 — every criterion must close using owned files alone

**Evidence.**

Brief criterion 2: "A `prove` against a signal-killed lint stage produces an error rather than hanging."
Brief criterion 3: "Destroying a probe whose lint child died earlier does not raise `unhandledRejection`..."
Brief criterion 1: "`destroy()` settles, and it settles within a bounded time you assert".

$ grep -n "#recycle\|#runtime = \|#lint = \|#type = " src/server/Probe.ts
68:		this.#type = new TypeStage(this.#workspace)
69:		this.#lint = new LintStage(this.#workspace)

$ awk 'NR>=259 && NR<=268 {print NR": "$0}' src/server/Probe.ts
259: 	async #destroy(): Promise<void> {
264: 			await Promise.all([this.#type.destroy(), this.#lint.destroy(), this.#runtime.destroy()])
No deadline, no race — a bounded-time assertion on `Probe.destroy()` is gated by `TypeStage.destroy` and `RuntimeStage.destroy` too, and `src/server/Probe.ts` is in the brief's explicit off-limits list.

$ find tests -name '*.test.ts' | grep Probe
tests/src/server/Probe.test.ts   (exists; covered by "Off-limits: everything else")

$ sed -n '12,13p' .claude/rules/tests.md
- Mirror module/application structure:
  `tests/{src,app}/[environment]/[domain]/[module].test.ts`.
The rule the brief orders the unit to read fixes a `Probe` test at the unowned path.

**Fix.**

State that criteria 1-3 close at the stage level in the owned test file — `stage.inspect()` and `stage.destroy()` on a `LintStage` whose Oxlint child was killed by pid — and replace `prove`/"a probe" with `inspect`/"a lint stage" in the criterion text. Grant `tests/src/server/Probe.test.ts` only if a coordinator-level proof is genuinely wanted, and then drop the bounded-time clause because `Probe.#destroy` is unbounded and off-limits.

### S3.3 — A sibling writing unit currently owns three files in the same checkout, and the brief neither names them nor scopes validation — it states the opposite, that a whole-workspace `npm test` is safe, which is the exact tree-wide read that orchestration.md forbids a concurrent executor and which the brief's own deviation contract converts into a stop.

**Check.** Standing conditions in § Context (dispatch anatomy: name every condition the unit will hit)

**Evidence.**

$ git -C /workspace/probe status --porcelain
 M src/server/stages/RuntimeStage.ts
 M tests/src/bin/main.test.ts
 M tests/src/server/stages/RuntimeStage.test.ts

Brief § Host facts your commands run under: "The whole-workspace `npm test` is safe and takes roughly three minutes."
Brief § Deviation contract: "Stop and report ... when a gate reddens for a reason your change does not explain."

$ grep -n '"test":\|"test:src":' package.json
66:		"test": "npm run test:src && npm run test:policy && npm run test:config"
67:		"test:src": "vitest run ... --project src:core --project src:server --project src:bin"
`test:src` collects `tests/src/server/**` and `tests/src/bin/**` (vite.config.ts:93, :130), so it runs both files the sibling is mid-edit on.

.agents/orchestration.md § Writing concurrency rule 1 serializes writers in the main checkout; rule 4: "Restrict concurrent executors to read-only, scoped validation. A tree-wide result may contain a sibling's in-flight failure."

The brief's only related note is wrong about which file is in flight: "A unit before you may have edited `tests/src/server/stages/LintStage.test.ts`."
$ git -C /workspace/probe log --oneline -3 -- tests/src/server/stages/LintStage.test.ts
938eb04 Prove the server, the stages, and the built entry   (two commits back, clean)

**Fix.**

Hold S3 until the live unit commits, and say in the brief that the tree is clean at dispatch. If S3 must run beside it, add a standing condition naming `src/server/stages/RuntimeStage.ts`, `tests/src/server/stages/RuntimeStage.test.ts`, and `tests/src/bin/main.test.ts` as another unit's in-flight files, and scope validation to `npm run test:src:server` rather than `npm test`.

### S3.4 — The brief's § Where a throwaway instrument goes justifies banning `tmp/probe/` with the claim that an instrument left there "is collected by a gate". No gate runs the `probe` project, and `.claude/rules/tests.md` — which the brief orders the unit to read first — states the opposite and designates `tmp/probe/` as the runtime-probe home.

**Check.** 2 — every factual claim verified by running it

**Evidence.**

Brief: "`tmp/probe/` is gitignored too but the `probe` Vitest project collects `tmp/probe/**/*.test.ts` ... so an instrument left there is collected by a gate or trips another project's directory-listing assertion."

$ grep -n 'prepublishOnly\|"test":\|"test:probe"' package.json
66:		"test": "npm run test:src && npm run test:policy && npm run test:config"
73:		"test:probe": "vitest run ... --project probe"
79:		"prepublishOnly": "npm run format:check && npm run lint:check && npm run check && npm run build && npm test"
`test:probe` appears in no gate chain.

$ sed -n '/## Probes/,/Three rules bind/p' .claude/rules/tests.md
"A **runtime probe** is collected by a Vitest project, so it lives in `tmp/probe/` and runs through the `probe` project. `tmp/` is ignored by git, so no probe enters a commit by accident, and every test script names its project, so no gate runs the `probe` project."

Collateral: no project collects the mandated location.
$ grep -n "name:\|include:\|projects:" vite.config.ts
183:				include: ['tmp/probe/**/*.test.ts'],
195:		projects: [srcCore, srcServer, srcBin, policy, config, probe],
Nothing includes `tmp/scratch/**`, and `vite.config.ts` is off-limits, so the brief's mandated location cannot host a Vitest-collected runtime probe at all.

(The ignore facts the brief gives are correct: `git check-ignore -v tmp/scratch/x.ts` → `.gitignore:11:tmp`; `git check-ignore -v scratch/x.ts` → exit 1.)

**Fix.**

Strike "is collected by a gate". Keep `tmp/scratch/` and add the missing operational fact: no Vitest project collects that path, so the instrument runs as a plain `node` script, and this is a deliberate departure from `.claude/rules/tests.md` § Probes taken because sibling projects write into `tmp/probe/` concurrently.

### S3.5 — The brief labels its defects A, B, C, D, and C4 and its criteria 1-6, then tells the executor to "give each criterion its test name", without saying a test is named for what it proves rather than for the control that specified it.

**Check.** 9 — brief control identifiers must not leak into permanent names

**Evidence.**

Brief § Defects headings: "### A — liveness is read from `exitCode` alone", "### B — an orphaned document promise ...", "### C — `child.stdin` carries no error listener", "### D — the cleanup handler throws ...", "## Also yours — C4 ...".
Brief § Output: "Under **Acceptance evidence**, give each criterion its test name".
No sentence anywhere in the brief fixes test naming. Searched: no occurrence of "named for what it proves" or any naming guard.

.agents/orchestration.md § Check the brief before you send it: "Keep the brief's control identifiers inside the brief. Label controls so the brief's own table can be read, and say in the brief that a test is named for what it proves, never for the control that specified it."

The existing file's naming convention is behavioural, so a label-named test would stand out permanently:
tests/src/server/stages/LintStage.test.ts:9  'reports a workspace lint finding for a gitignored test path'
tests/src/server/stages/LintStage.test.ts:30 'abandons an inspection and destroys idempotently'

**Fix.**

Add one line to § Output: "A, B, C, D, C4 and the criterion numbers are this brief's labels. Name every test for the behaviour it proves, never for the defect or criterion that specified it."

### What this lane confirmed correct

Verified correct — do not re-check.

CHECK 1 (executor and route). Passes. `.claude/agents/sol.md` pins `sol` as a bridge driver on `sonnet` that drafts to `tmp/codex/<unit>-brief.md` and returns paths; the brief body is written for the Sol engine that reads it inside `codex exec` ("You have a shell and you own the file"), and it never instructs an engine to launch its own CLI. Sandbox `workspace-write` per the role file supports the writes, spawns, and gate runs the brief asks for; nothing in the unit needs network.

CHECK 2 (facts). Every code citation I could run checks out:
- `wc -l src/server/stages/LintStage.ts` → 305. Brief says 305.
- `grep -n 'exitCode\|killed\|signalCode' src/server/stages/LintStage.ts` → exactly `89:` and `198:`, both `if (child === undefined || child.exitCode !== null)`. Verbatim match to the brief's quoted block.
- Method lines: `#destroy` 82, `#document` 140-162, `#file` 164-177, `#notify` 191, `#send` 196-204, `#fail` 291, `#exit` 300. All within the brief's stated positions.
- Defect B line citations all exact: three map writes at 144-146, `#notify` at 148, `return diagnostics.finally(` at 156, `#send` throw at 199, `#fail` call at 88.
- Defect D line citations exact: `didClose` `#notify` at 157, deletes at 158-160.
- Defect A's `#exit` claim exact: line 302 `const ending = code === null ? \`signal ${signal ?? 'unknown'}\` : \`code ${code}\``.
- Defect B's "`Probe.#recycle` replaces only `#runtime`" — `grep -n \"#recycle\|#runtime = \|#lint = \|#type = \" src/server/Probe.ts` → `#lint` constructed once at 69, `#recycle` reassigns only `#runtime` at 248.
- Defect C — `grep -n \"stdin\" src/server/stages/LintStage.ts` returns one line, 203 `child.stdin.write(...)`. No error listener. True.
- `src/core/types.ts:30` is verbatim "Workspace-relative path the stages resolve the text against." True.
- C4's `#file` quotation at 169-177 is accurate in content (the real `return` spans 174-177 rather than one line; a re-wrap, not a content error).
- C4's executed evidence reproduces exactly. Isolated repro with the same override shape returned `tests/probe-0d1f.ts:1:8: error import(no-default-export): Prefer named exports` and nothing for `sample.config.ts` — byte-identical files. `.oxlintrc.json` really carries `{"files": ["*.config.ts", "*.config.js"], "rules": {"import/no-default-export": "off"}}`.
- Criterion 5's premise is true: `tests/src/server/stages/LintStage.test.ts:9` is the live green test 'reports a workspace lint finding for a gitignored test path'.
- Standing condition's `test:src` claim is true: package.json:67 runs `src:core`, `src:server`, `src:bin` in one invocation; the `probe` project reads `tmp/probe/**/*.test.ts` (vite.config.ts:183).
- The `tests/src/bin/main.test.ts` pattern the standing condition points at is real (committed f9810f9, lines 220-222: `createScratch()`, `scratch.write('package.json', ...)`, `scratch.link('node_modules', resolve(ROOT, 'node_modules'))`).
Two minor imprecisions, neither misdirecting: the brief cites `src/core/types.ts` "lines 306-311" for `ProbeInterface.destroy` when the TSDoc is 308-312 and the declaration is 313 — the quoted sentence "settles when every engine has released its resources" is at line 311, inside the cited range. And the standing condition says "Four server test files write into one `tmp/probe/` directory" while five files under `tests/src/server/` reference it (Probe 17, RuntimeStage 11, TypeStage 6, helpers 5, LintStage 3); the count does not change either rule that follows.

CHECK 3 (measurement conditions). Passes. The signal-death probe reads Node semantics that do not vary across this container, and it carries a control from outside the population (`process.exit(3)` → `exitCode = 3`). The two measurements that could vary are correctly assigned to the unit: the `destroy()` time bound ("within a bounded time you assert") and the open question of whether Oxlint ever exits with a code ("yours to settle ... You have a shell and you own the file"). I deliberately did not run `npm test` to check the "roughly three minutes" figure, because the tree is torn by the live sibling unit.

CHECK 5 (small obligation riding along). Passes. C4 is a second defect bolted onto the unit, but it lives entirely in the two owned files: `#file` is called only from `#document` (LintStage.ts:141), and its criterion closes by reading the repo's own `.oxlintrc.json`, which needs no edit. No scope error in C4 can block the A/B/C/D work.

CHECK 6 (what the change does to the measured facts). Passes, and the brief did this check itself for the A/B interaction ("Fixing A makes `#send` throw in more cases, which widens B's reachability"). I checked the one it did not state: the C4 repair changes the synthesized path, and nothing off-limits reads it. Findings report the declared path from `#documents` (LintStage.ts:286), not the synthesized one, so `tests/src/server/Probe.test.ts` is unaffected; its `tmp/probe` listing filter (`name.startsWith('arm-') || name.includes('.probe-')`, line 293-296) matches `createRevisionFile`'s `${stem}.probe-${revision}${extension}` (src/server/helpers.ts:152), a different scheme LintStage never writes. `.oxlintrc.json`'s `src/core/**` and `*.config.ts` globs both still match after a basename-preserving rename — I proved the second by running oxlint on `tests/probe-0d1f-sample.config.ts`, which reported nothing.

CHECK 7 (both halves of a generated configuration). Inert. @orkestrel/probe generates no configuration it runs on; the unit adds no Vitest project and touches no template.

CHECK 10 (output mechanism vs allowlist). Passes. The executor is write-capable under `workspace-write`, so the returned five-section report, the throwaway instrument, and the gate runs are all within reach.

CHECK 11 (consumers, not declarations). Passes. No symbol is removed. `LintStage` importers are `src/server/index.ts`, `src/server/Probe.ts`, `tests/src/server/stages/LintStage.test.ts`, `tests/src/server/index.test.ts`; none binds to `#file`'s output or to the private maps, so the owned list is correctly sized for the behaviour that changes.

CAMPAIGN CHECK — nonexistent paths. Passes. The brief correctly places the guide at `/home/user/scaffold/PROBE.md` and warns it is outside the working directory (`ls /workspace/probe/PROBE.md` → no such file). It never cites `guides/probe.md`.

CAMPAIGN CHECK — instrument location. The directive is correct: `git check-ignore -v tmp/scratch/x.ts` → `.gitignore:11:tmp`; `git check-ignore -v scratch/x.ts` → exit 1, so a bare `scratch/` really would enter a commit. Only the rationale beside it is false (defect 4).

CAMPAIGN CHECK — refuted finding. Passes. The brief carries no M6 content. M6 is TypeStage's class `@remarks` about project selection (`.orkestrel/probe/doc-truth-verification.md` line 12, verdict REFUTED, "Repair. None required."); S3's subject is `LintStage` process lifetime plus the `#file` path-synthesis false red, which is a separate finding. `src/server/stages/TypeStage.ts` is in the brief's off-limits list, so the refuted repair cannot be performed even by accident.

## S4 — DISPATCHABLE

### S4.1 — NON-BLOCKING. The brief labels its defects A/B/C/D and its criteria 1-5, requires one test per criterion, and never states that a test is named for what it proves rather than for the control that specified it. Criterion 3 actively invites the leak.

**Check.** Check 9 — private control identifiers leaking into permanent artifacts

**Evidence.**

s4-brief.md:142 — "3. An escaping path anywhere in `files` — first, middle, last — leaves nothing behind. The middle case is what proves defect B is fixed rather than only defect A."
s4-brief.md:182-186 (Output) — "give each criterion its test name".
No line in the brief constrains test naming. Confirmed by search:
$ grep -ni "named for\|test name\|naming" /home/user/scaffold/.orkestrel/probe/s4-brief.md
185:criterion its test name, and for each red-then-green proof the exact command with both counts. No
The only hit is the Output section, which asks for the mapping in the report, not for a naming rule. An implementer writing one test per defect takes `defect B` as the obvious name, and `A`/`B`/`C` are vocabulary private to a swept brief.

**Fix.**

Add one line under `## Criteria`: "Name every test for the behaviour it proves. Never name one for a defect letter or a criterion number — those labels are private to this brief and do not survive it."

### S4.2 — NON-BLOCKING. The preamble demands a red-then-green proof for every criterion, but criterion 4 is a regression criterion whose proof is existing tests staying green, which cannot be red before the fix.

**Check.** Check 8 / internal consistency — the criteria preamble contradicts criterion 4

**Evidence.**

s4-brief.md:133-134 — "Every criterion owes a committed test, red before the fix and green after. Record the exact command and both counts."
s4-brief.md:143-145 — "4. A normal inspection still applies its overlays, still reports diagnostics against the candidate text, and still cleans up. The fix must not stop overlays working. Existing tests in `tests/src/server/stages/TypeStage.test.ts` cover this; keep them green."
Those existing tests are green at HEAD:
$ cd /workspace/probe && git status --porcelain
 M src/server/stages/RuntimeStage.ts
 M tests/src/bin/main.test.ts
 M tests/src/server/stages/RuntimeStage.test.ts
TypeStage.test.ts is unmodified at f9810f9, so no run of it can produce the red count the preamble requires. The brief partly resolves this itself at line 185 ("for each red-then-green proof", not "for each criterion"), and the deviation contract's stop trigger is "two criteria contradict" — the preamble is not a criterion — so a competent unit decides this locally rather than stopping.

**Fix.**

Amend the preamble to: "Every criterion that fixes a defect owes a committed test, red before the fix and green after; record the exact command and both counts. Criterion 4 is a regression criterion, proved by the existing tests staying green."

### What this lane confirmed correct

All three campaign traps are handled correctly by the brief — it does not fall into any of them.

PATHS (campaign trap 1 — CLEAR). `ls /workspace/probe/PROBE.md` → "No such file or directory"; `ls -la /home/user/scaffold/PROBE.md` → exists, 71917 bytes. Brief lines 19-21 name the orchestrator path explicitly, call it "not yours", and give a proceed-without-it fallback. `ls guides/probe.md` → "No such file or directory"; `grep -n "Not created" guides/README.md` → lines 6-7, 20-29 all record `guides/probe.md` as "Not created". Brief lines 23-25 state exactly this. No cited path is wrong.

INSTRUMENT LOCATION (campaign trap 2 — CLEAR). `git -C /workspace/probe check-ignore -v tmp/scratch/x.ts` → `.gitignore:11:tmp` (exit 0). `check-ignore -v scratch/x.ts` → exit 1 (NOT ignored). `check-ignore -v probe-instrument.ts` → exit 1 (NOT ignored). Brief lines 116-117 and 158 both name `tmp/scratch/` and state the bare-`scratch/` hazard correctly. The Standing condition's alternate route is also safe: `createScratch` at node_modules/@orkestrel/test/dist/src/server/index.js:169 defaults its parent to `tmpdir()`, outside the repository entirely.

REFUTED FINDING (campaign trap 3 — CLEAR). doc-truth-verification.md:11 and :345-359 record M6 as REFUTED. Brief section D (lines 94-105) strikes it, quotes the refutation accurately, and orders "Leave `src/server/stages/TypeStage.ts` lines 20-22 exactly as written." Verified those lines still carry the conditional clause: TypeStage.ts:20-22 reads "checked against the project a call names, or / against its own scoped environment project when a call names none". No repair is ordered for a refuted finding.

CODE FACTS (check 2 — all true). TypeStage.ts is 274 lines and has no concurrent writer (`git status --porcelain` shows only the three RuntimeStage/main files). The quoted block is verbatim: 148 `this.#overlay(subject.test)`, 149 the `for` loop, 150 `try {`, 164 `} finally {`, 165-168 the two deletes, 169 the close. `#overlay` at 172-176 sets `#overlays` (174) and `#versions` (175) — as the brief states. `#versions.clear()` is at line 109, inside `#destroy()`. `resolveWorkspaceFile` (src/server/helpers.ts:15-23) throws "Path escapes the workspace". `isSource` = `recordOf({ path: isNonEmptyString, text: isString })` (validators.ts:56) and `SOURCE_SHAPE` sets `stringShape({ min: 1 })` (shapers.ts:18), so nothing rejects an escaping path before the stage. `Probe.prove` (Probe.ts:86-109) emits and rethrows, never destroys. `#version` (line 237) consults `this.#overlays.has(file)` first, exactly as defect C's harmlessness argument requires. Defects A, B, and C match high-finding-verification.md:87-120 line for line.

SCOPE (checks 4, 6, 11 — clean). Every criterion closes inside the two owned files. `#overlay` is a private method with exactly two call sites (148, 149), both in the owned file; no public symbol is removed, so there are no importers to count. Only tests/src/server/index.test.ts mentions `TypeStage` outside the owned pair, and only for the barrel export, which this change does not touch. The off-limits list survives the change: the directed repair (an `applied` list local to `#inspect`) needs no edit to src/server/helpers.ts or src/core/**. Criterion 5's fallback ("assert the size" of the private `#versions`) is reachable within the owned test file — TypeStage.test.ts:110-183 already reads `#services` and `#resident` through `node:inspector/promises` `Runtime.getProperties`, so the technique is established precedent, not an invention the unit would have to justify.

HOST AND TOOLING FACTS (check 3). `test:src` is one `vitest run` with `--project src:core --project src:server --project src:bin` (package.json), and `grep -n "fileParallelism|maxWorkers|poolOptions|sequence" vite.config.ts tests/setup.ts tests/setupServer.ts` returns nothing — the "no parallelism guard" claim holds. The `probe` project includes `tmp/probe/**/*.test.ts` and no gate selects it. "Four server test files write into one tmp/probe" is exactly right: LintStage, TypeStage, RuntimeStage, and Probe create files there; helpers.test.ts uses `tmp/probe/...` only as a string argument to pure functions and has no `writeFileSync`/`mkdirSync`. `.claude/rules/tests.md:34` states the membership rule the Standing condition quotes, near-verbatim. main.test.ts:220-223 (at f9810f9) does use `createScratch()` plus `scratch.link('node_modules', resolve(ROOT, 'node_modules'))`, so the exemplar is real. Every Context file exists in the probe workspace: AGENTS.md and all seven named rule files under .claude/rules/.

CHECKS WITH NOTHING TO REPORT. Check 1: the brief addresses the Sol engine running inside the CLI, not a driver — it gives cwd, spawn permission, and suite timings, and never tells the engine to launch a CLI. Check 5: defects A, B, and C are one mechanism in one file; nothing unrelated rides along. Check 7: no generated configuration is involved — the new tests land in the existing `src:server` glob, so no vite.config.ts or package.json half is needed. Check 10: `sol` is a writing role with read/write/Bash; the output is a returned report, not a file, and the red-then-green proofs are Bash runs the allowlist covers.

MINOR, NOT WORTH AN EDIT. The verbatim quote is cited as "148-169" but its first line, `this.#revision += 1`, is line 147 — one line of leading context beyond the stated range. The brief already orders a re-read before editing (line 162), so this cannot misdirect.

FOR THE ORCHESTRATOR, NOT A DEFECT IN S4. s4-brief.md:109 owns `tests/src/server/stages/TypeStage.test.ts`, while s2-brief.md:92-94 owns `tests/src/server/**` "for the tests these defects owe and for any existing assertion your fix makes untrue" — an overlapping grant on that same file. S4's own owned list is correct; the overlap is a scheduling matter that the writing-concurrency serialization rule already covers, provided S2 and S4 do not run concurrently.

## S5 — DEFECTIVE

### S5.1 — Criterion 6 ("Defect C is ruled and implemented in one direction") cannot close in EITHER direction using the files the brief grants, so the unit stops whichever way it rules.

**Check.** 4 and 11 — criteria against the off-limits list; scope a symbol-removing change by its consumers

**Evidence.**

REMOVE branch. Removing `readonly reason: string` from `Control` breaks every object literal that supplies it, by excess-property check. Probe:

$ cd /workspace/probe && cat > tmp/scratch-check/excess.ts <<'EOF'
interface Case { readonly files: readonly string[] }
interface Control extends Case { readonly stage: string }
declare function prove(control: Control): void
prove({ files: [], stage: 'type', reason: 'x' })
EOF
$ npx tsc --noEmit --strict --ignoreConfig tmp/scratch-check/excess.ts
tmp/scratch-check/excess.ts(4,35): error TS2353: Object literal may only specify known properties, and 'reason' does not exist in type 'Control'.

The literals that would break:
$ grep -rn "reason" src/ tests/ --include=*.ts | grep -v '\*' | grep -c .
(12 write sites outside owned files)
  src/server/Probe.ts:142, :152        — granted ONLY on the ROUTE branch, not this one
  tests/src/server/Probe.test.ts:41, :51, :61, :71, :111, :147, :189, :210, :253, :289 — in neither list (unscoped)
  tests/src/bin/main.test.ts:57, :263  — in neither list, AND currently held by a live writer

Confirmed those literals are fresh object literals in argument position, so the excess-property check fires:
$ sed -n '34,43p' tests/src/server/Probe.test.ts
			const issued = await probe.prove({
				project: 'configs/src/tsconfig.core.json',
				case: { files: [clean], test },
				control: {
					files: [broken],
					test,
					stage: 'type',
					reason: 'the source assigns a string to a number',
				},
			})

ROUTE branch. Routing `reason` onto `Verdict` obliges the sole Verdict construction site:
$ sed -n '94,100p' src/server/Probe.ts
			const basis: Verdict = {
				id,
				toolchain: this.#toolchain,
				checks,
				control,
				elapsed: Math.round(performance.now() - started),
			}

That is a third edit to `Probe.ts`, beyond "the two arming-control literals at lines 142 and 152" — which the brief itself defines as a stop: "If the ruling needs more of `Probe.ts` than those two literals, stop and report."

**Fix.**

Grant `src/server/Probe.ts` in full and `tests/src/server/Probe.test.ts` unconditionally, under both rulings, and strike the "ONLY the two literals" restriction. `tests/src/bin/main.test.ts` carries two `reason` literals and is held by the live S1-fix unit, so either dispatch S5 after that unit lands and grant the file, or pre-decide the ruling in the brief and hand main.test.ts's two-line patch to that unit as a shared-file patch.

### S5.2 — The Host facts assert `tests/guides.test.ts` exists and executes flagship guide fences. That file does not exist in this workspace, and no guide-fence gate exists at all.

**Check.** 2 — every factual claim actually true

**Evidence.**

$ cd /workspace/probe && find tests -maxdepth 2 -name "*.test.ts" | sort
tests/config.test.ts
tests/policy.test.ts

$ ls -la tests/guides.test.ts
ls: cannot access 'tests/guides.test.ts': No such file or directory

$ grep -n "guides" vite.config.ts package.json
(no matches, rc=1)

The sentence is `.claude/rules/documentation.md`'s general statement ("That proof has a home: `tests/guides.test.ts` executes the flagship fences") transcribed as a fact about this workspace. It is load-bearing: the brief builds the instruction "If you find a documented behavior with no gate, say so in your report rather than assuming parity covers it" on the premise that some fence gate exists here.

**Fix.**

Replace the sentence with the measured fact: this workspace has no `tests/guides.test.ts` and no guide-fence gate, so NO documented behavior in the package has an executing gate. Keep the reporting instruction; it becomes stronger, not weaker.

### S5.3 — C1's prescribed repair — prefix every example test text with `import { expect, test } from 'vitest'\n` — makes Criterion 1 unreachable. It turns a currently lint-clean example text into two oxlint errors, and the lint stage lints `subject.test`, so the case is not clean and no receipt is issued.

**Check.** 8 and 2 — a criterion bundled with a prescribed repair the criterion refutes

**Evidence.**

The lint stage lints the test file, not only the candidates:
$ grep -n "subject.test" src/server/stages/LintStage.ts
130:		for (const source of [...subject.files, subject.test]) {

Executed against the workspace's own `.oxlintrc.json` (probe files written under tmp/scratch-check, removed afterwards):

$ printf 'test("greets", () => {})\n' > tmp/scratch-check/plain.ts
$ npx oxlint --no-ignore tmp/scratch-check/plain.ts ; echo exit=$?
exit=0                      # today's example text is lint-CLEAN

$ printf 'import { expect, test } from "vitest"\ntest("greets", () => {})\n' > tmp/scratch-check/probe-unused.ts
$ npx oxlint --no-ignore tmp/scratch-check/probe-unused.ts ; echo exit=$?
tmp/scratch-check/probe-unused.ts:1:10: error eslint(no-unused-vars): Identifier 'expect' is imported but never used. help: Consider removing this import.
tmp/scratch-check/probe-unused.ts:2:1: error vitest(expect-expect): Test has no assertions help: Add assertion(s) in this Test
exit=1                      # the brief's prescribed text is lint-RED

$ printf 'import { expect, test } from "vitest"\ntest("greets", () => {\n\texpect(1).toBe(1)\n})\n' > tmp/scratch-check/withassert.ts
$ npx oxlint --no-ignore tmp/scratch-check/withassert.ts ; echo exit=$?
exit=0                      # import PLUS an assertion is clean

Both rules are enabled unconditionally: `.oxlintrc.json` sets `@typescript-eslint/no-unused-vars` to "error" and lists "vitest" in `plugins` with `categories.correctness: "error"`; the `overrides` array scopes only `*.config.ts`, `configs/policy.ts`, `*.vue`, and src/app path rules, none of which reach the synthesized lint path `tests/probe-<uuid>.ts` (LintStage.ts:164-178).

**Fix.**

Prescribe the full replacement text, import and assertion together: `import { expect, test } from 'vitest'\ntest('greets', () => {\n\texpect(1).toBe(1)\n})\n`. State that the assertion must be self-contained — the runtime stage writes only `subject.test.text` to disk (RuntimeStage.ts:151 at f9810f9) and never writes the candidate files, so an example test that imports the candidate fails at module resolution.

### S5.4 — The brief tells the unit a whole-workspace `npm test` is safe, and names no standing condition, while a sibling writing unit holds three files dirty. The `implementer` role's first law is "Require a clean committed baseline", and it forbids tree-wide validation.

**Check.** 3 and 10 — measurement under the conditions the unit runs in; verification method against the executor's charter

**Evidence.**

$ cd /workspace/probe && git status --porcelain
 M src/server/stages/RuntimeStage.ts
 M tests/src/bin/main.test.ts
 M tests/src/server/stages/RuntimeStage.test.ts

$ git log --oneline -1
f9810f9 Stop the runtime stage certifying what it never ran

The role the brief dispatches to, /home/user/scaffold/.claude/agents/implementer.md:
  "Require a clean committed baseline, owned files, off-limits files, acceptance criteria, and a deviation contract."
  "Never ... run destructive commands or tree-wide mutating gates. Validate read-only and scoped to owned files."

Criterion 1 requires executing the runtime stage, whose implementation is one of the three dirty files, and `npm test` resolves to `test:src` over src:core, src:server, and src:bin (package.json:66-67) — which includes both dirty test files. The brief's own Deviation contract says to stop "when a gate reddens for a reason your change does not explain", which is exactly what a sibling's in-flight edit produces.

**Fix.**

Add a Standing condition naming the three dirty files, instructing the unit to read them only with `git -C /workspace/probe show f9810f9:<path>`, and replace "the whole-workspace `npm test` is safe" with the scoped commands the unit may run (`npm run test:src:core`, `npm run check:src:core`). If Criterion 1's end-to-end proof genuinely needs the runtime stage, serialize S5 after the S1-fix unit commits and re-baseline the brief from that commit.

### S5.5 — C2 cites `RuntimeStage.ts:242-243` for the code that sets `Finding.line` from the stack. At HEAD that code is at lines 319-320; lines 242-243 hold unrelated directory-skip logic. The citation is against the pre-S1 commit 938eb04.

**Check.** 2 — quoted line numbers drift

**Evidence.**

$ cd /workspace/probe && git show f9810f9:src/server/stages/RuntimeStage.ts | grep -n "line"
319:			if (!('line' in stack) || typeof stack.line !== 'number') return { path, message }
320:			return { path, message, line: stack.line }

$ git show f9810f9:src/server/stages/RuntimeStage.ts | sed -n '242,243p'
			if (entry.name === '.git' || entry.name === 'dist' || entry.name === 'node_modules') {
				continue

$ git show 938eb04:src/server/stages/RuntimeStage.ts | grep -n "line"
242:			if (!('line' in stack) || typeof stack.line !== 'number') return { path, message }
243:			return { path, message, line: stack.line }

The brief instructs "Verify each against the code before rewriting it", so the unit will follow this citation — into a file that is both off-limits and mid-edit by another writer.

**Fix.**

Cite `RuntimeStage.ts:319-320` and pin the read: `git -C /workspace/probe show f9810f9:src/server/stages/RuntimeStage.ts`. The finding itself stands; only the coordinates are stale.

### S5.6 — The Unknowns section asks whether `guides/` repeats defect A's claim and tells the unit to "repair both if it does", but `guides/**` is on the off-limits list, and the Context section already answers the question in the opposite direction.

**Check.** 4 and internal consistency — a criterion needing an off-limits file

**Evidence.**

Brief Context (lines 23-25): "The probe's own guide, `guides/probe.md`, DOES NOT EXIST yet. ... So there is no second copy of any documented claim to keep in step."
Brief Unknowns (lines 217-218): "The Orchestrator has not checked whether `guides/` makes the same claim. Check, and repair both if it does."
Brief Scope (line 177): "**Off-limits**: ... `guides/**` ..."

The question is answerable and already answered no:
$ cd /workspace/probe && ls guides/
README.md  contract.md  emitter.md  guide.md  mcp.md  scaffold.md  timeout.md  tool.md
$ grep -rln "GREETING\|const claim: Claim" guides/ ; echo rc=$?
rc=1
$ grep -rln "computeReceipt\|formatVerdict\|isClaim" guides/ ; echo rc=$?
rc=1

Every file in guides/ is a vendored mirror of another package. `guides/README.md` records the probe guide as "Not created" at three index entries, which the brief already states correctly.

**Fix.**

Strike the Unknown. Replace it with the measured fact: no file under `guides/` mentions the probe API, so defect A has exactly one home, and `guides/**` stays off-limits with no criterion touching it.

### S5.7 — The `elapsed` repair is scoped to "the same example", but the same wrong figure 337 is echoed in two further owned doc comments, which the verification record explicitly flagged.

**Check.** 2 and carry-every-finding — the repair drops two sites the verification named

**Evidence.**

$ cd /workspace/probe && grep -rn "337" src/core/
src/core/types.ts:207: *	elapsed: 337,
src/core/helpers.ts:60: * formatVerdict(verdict).split('\n')[0] // 'probe 01J8Z0 (337 ms)'
src/core/validators.ts:181: * isVerdict({ id: '01J8Z0', toolchain, checks: [], control: [], elapsed: 337 }) // true

/home/user/scaffold/.orkestrel/probe/doc-truth-verification.md, L3 — REPRODUCED:
  "The same wrong number was propagated to two further published doc comments, `src/core/helpers.ts:60` and `src/core/validators.ts:181`, so a fix confined to `src/core/types.ts:207` leaves two copies behind."
  "the code's verdict `elapsed` has a hard floor of `max(case) + max(control) = 513`"

All three files are owned, so this is a dropped instruction rather than a scope error — but Criterion 2 ("Every remaining @example in the owned files, executed, returns what its comment claims") does not catch it: `validators.ts:181` passes `isVerdict` at any number, and `helpers.ts:60` asserts against an unbound `verdict`.

**Fix.**

Name all three sites and the floor: raise `types.ts:207` above `max(case) + max(control) = 513` and update the echoed figure at `helpers.ts:60` and `validators.ts:181` to the same number in the same change.

### S5.8 — The brief labels its findings A, B, C, D-H, C1, C2, C3, C5 and obliges new tests, without saying a test is named for what it proves rather than for the control that specified it.

**Check.** 9 — private control identifiers leaking into permanent names

**Evidence.**

The brief owes tests: "`tests/src/core/**` for the tests these changes owe" (Scope), and Criterion 3 requires "Both directions, or the check is untested in the direction that matters". Criterion 6 obliges a ruling with an implementation. The labels are used as the unit's working vocabulary throughout — "defect A", "C1 is not closed until", "Criterion 1 is not closed until the example survives" — and are not defined anywhere outside this brief. The existing suite names tests for behavior, e.g. tests/src/core/index.test.ts:7 'publishes the contract, its guards, its shapes, and its pure leaves', so a test named 'C1' or 'defect A' would be a new and permanent private vocabulary.

**Fix.**

Add one line to Scope: "Name every test for the behavior it proves, never for this brief's finding label. A, B, C, C1-C5 are addressing for this brief only and must not appear in a test name, a comment, or a commit message."

### What this lane confirmed correct

Everything below I ran and found CORRECT; do not re-check it.

CAMPAIGN CHECKS — all three pass.
1. Paths. `/home/user/scaffold/PROBE.md` exists (71917 bytes); the brief cites it correctly as the orchestrator's repository and not the probe workspace (`ls /workspace/probe/PROBE.md` → No such file). `guides/probe.md` does not exist, and `guides/README.md` records it as "Not created" at all three index entries — the brief states both accurately.
2. Instruments. `git -C /workspace/probe check-ignore -v tmp/scratch/x.ts` → `.gitignore:11:tmp`, rc=0. `git check-ignore -v scratch/x.ts` → rc=1. The brief's Instruments paragraph is exactly right, and it directs every throwaway to `tmp/scratch/`.
3. The refuted finding. M6 (TypeStage class @remarks) is NOT carried. Its subject is `src/server/stages/TypeStage.ts:20-22`, which the brief never mentions and which sits under the off-limits `src/server/stages/**`. Verified against /home/user/scaffold/.orkestrel/probe/doc-truth-verification.md:345 "M6 — REFUTED".

FACTUAL CLAIMS VERIFIED TRUE (line numbers checked against the working tree at f9810f9).
- Defect A: the `Claim` @example is at `src/core/types.ts:93-102`; case and control both bind `greeting`, whose text `export const GREETING = "hi"` compiles, against a control declaring `stage: 'type'`. The `Control` @example at `types.ts:70-75` does use `'export const GREETING: number = "hi"\n'`. `computeReceipt` (helpers.ts:97-101) requires case-clean AND control-broke-at-declared-stage. The finding is real.
- Defect B: `shapers.ts:68` says the tool "admits a call with `compileGuard(CLAIM_SHAPE)`"; `factories.ts:65` admits with `isClaim(input)`. `grep -rn compileGuard src/` returns six hits, all inside doc comments (shapers.ts:13, 30, 51, 69, 75; validators.ts:98). `compileGuard` is called at `tests/src/core/validators.test.ts:74` — the brief's correction of the sweep's wording is right. No cycle blocks the repair: `shapers.ts` imports only `@orkestrel/contract` and `./constants.js`.
- Defect C: `grep -rn 'reason' src/` returns writes and declarations only — `types.ts:82`, `shapers.ts:58`, `validators.ts:89`, `Probe.ts:142`, `:152` — and no read.
- Criterion 3 is technically reachable with owned files: `StringShapeOptions` in node_modules/@orkestrel/contract/dist/src/core/index.d.ts:6008-6013 carries `pattern?: RegExp`, so `SOURCE_SHAPE` can express a path constraint alongside `isSource`'s `recordOf`.
- C1: no Vitest project sets `globals: true` (`grep -n globals vite.config.ts` → rc=1); `tsconfig.json:8` supplies `vitest/globals` to `types` only. `Probe.ts:129` does use `import { expect, test } from 'vitest'`. The five cited example sites are correct: `types.ts:49`, `:72`, `:96` and `validators.ts:66`, `:80`.
- C3: `helpers.ts:80-82` and `types.ts:65-66` both state the strict reading; `helpers.ts:100-101` inspects only the declared stage; `Probe.ts:177-179` enforces the strict reading for the package's own boot control. All four citations land exactly.
- C5: `types.ts:131` reads "Workspace-relative path the tool reported against."
- C2's prose finding (not its coordinates): `types.ts:118-119` does say `line` is absent for a runtime failure.
- C4 is correctly absent — critic-findings-routing.md routes it to S3, not S5.
- The S1 note is accurate: the committed `#project` (RuntimeStage.ts:170-177 at f9810f9) returns `undefined` instead of throwing, and `#inspect` converts that into a finding at :134-145. `inferTestProject`'s stale `@returns` is still at `src/server/helpers.ts:116`, in an owned file.
- Standing condition: `test:src` does run src:core, src:server, and src:bin in one invocation (package.json:67), and the `probe` project reads `tmp/probe/**/*.test.ts` (vite.config.ts:182). The two rules it states are sound.

CHECK 11 — importers counted, owned list adequate for the admission change. `isSource`/`isClaim`/`SOURCE_SHAPE`/`CLAIM_SHAPE` are consumed only by `src/server/factories.ts` (off-limits, needs no edit — it calls `isClaim` by name and the signature does not move) and by `tests/src/core/**` (owned). Every path fixture in every test is a contained relative path (`src/core/...`, `tests/...`, `tmp/probe/...`), so no unscoped file breaks when an escaping path starts being refused. Adding an exported guard would break `tests/src/core/index.test.ts:9-29`, which pins the barrel inventory — that file is owned.

CHECK 5 — no defect. The "Also yours" admission obligation is a correctness change riding in a documentation unit, but it closes entirely within `src/core/validators.ts`, `src/core/shapers.ts`, and `tests/src/core/**`, all owned. It is consistent with what S4 was told: /home/user/scaffold/.orkestrel/probe/s4-brief.md:111 and :124-130 defer it to S5 in the same terms.

CHECK 7 — inert. This unit generates no configuration it runs on; `vite.config.ts` and `configs/**` are off-limits and no criterion reaches them.

CHECK 1 — passes. The brief names `implementer` on Claude Opus 5, a Claude-native subagent, and carries no CLI-launch mechanics that only a bridge driver could execute. The role file /home/user/scaffold/.claude/agents/implementer.md pins `model: opus`, `effort: high`, `tools: Read, Grep, Glob, Edit, Write, Bash`, which covers the brief's stated tool needs and its Output shape.

MINOR, NOT WORTH A CYCLE — noted so nobody re-derives them. The "Role and engine" line says "Eight defects" while the Defects section carries nine items and the appended sections add five more. The Standing condition says "Four server test files write into one `tmp/probe/` directory"; the true count is five under `tests/src/server/` (LintStage, TypeStage, RuntimeStage, helpers, Probe) plus `tests/src/bin/main.test.ts` and `tests/config.test.ts`. Defect A's quoted fence omits the example's `const test: Source = ...` and `project:` lines while reading as verbatim. None of the three changes what the unit must do.

CLEANUP — I removed /workspace/probe/tmp/scratch-check after probing. `git status --porcelain` is unchanged from the three files the live writer holds.

## S6 — DEFECTIVE

### S6.1 — The brief offers the unit a design choice whose second option — "a named lifecycle capability the entry composes, exported from the server barrel" — reddens `tests/src/server/index.test.ts`, a file that appears in neither the owned nor the off-limits list, so no edit to the owned files can close a single criterion once the unit rules that way.

**Check.** Check 4 (criteria vs off-limits, line by line) and Check 11 (scope by consumers, not declarations)

**Evidence.**

Brief § Where the lifecycle goes offers: "A named lifecycle capability the entry composes, exported from the server barrel." Brief § Scope owns only `src/bin/main.ts`, `tests/src/bin/main.test.ts`, ONE of `src/server/factories.ts` or `src/server/types.ts`, "plus the matching test file for it"; off-limits names `src/core/**`, `src/server/Probe.ts`, `src/server/stages/**`, `src/server/helpers.ts`, `guides/**`, `PROBE.md`, `package.json`, `vite.config.ts`, `configs/**`, dotfiles — `tests/src/server/index.test.ts` is in neither list.

$ cd /workspace/probe && cat src/server/index.ts
export * from './types.js'
export * from './helpers.js'
export * from './factories.js'
(…)

$ cat tests/src/server/index.test.ts
import * as entry from '@src/server'
(…)
		expect(Object.keys(entry).sort()).toStrictEqual([
			'LintStage', 'Probe', 'RuntimeStage', 'TypeStage', 'createProbe', 'createProbeServer',
			'createRevisionFile', 'inferDocumentLanguage', 'inferTestProject', 'inferTypeProject',
			'matchesWorkspaceModule', 'messageFromUnknown', 'parseContentLength', 'readWorkspaceManifest',
			'relativeWorkspaceFile', 'resolveWorkspaceBinary', 'resolveWorkspaceFile', 'resolveWorkspaceModule',
		])

The barrel re-exports `factories.js` with `export *`, so any new exported function in the one owned server file adds a key and fails this `toStrictEqual`. `$ ls tests/src/server/` returns `Probe.test.ts helpers.test.ts index.test.ts stages` — the mirror file for `factories.ts` does not exist, so "the matching test file" cannot be read as granting `index.test.ts`.

**Fix.**

Add `tests/src/server/index.test.ts` to the Owned list, and say the unit updates its export set when its ruling adds an export.

### S6.2 — Option A as the brief describes it — "`start()` installs the handlers and `stop()` removes them" — is not implementable in the one owned server file, because `start` and `stop` are implemented by an object literal that `@orkestrel/mcp` returns; owning them means a `ProbeServer` class in `src/server/ProbeServer.ts`, which is in neither list.

**Check.** Check 4 (a file the change will break that appears in neither list is unscoped)

**Evidence.**

$ cd /workspace/probe && tail -3 src/server/factories.ts
	return createStdioServer(createMCPLegacy(mcp))
}

$ grep -n "function createStdioServer" -A 11 node_modules/@orkestrel/mcp/dist/src/server/index.js
1758:function createStdioServer(mcp, options) {
1761-	return {
1762-		start() { transport.start(); },
1765-		stop() { transport.close(); }
1768-	};

$ ls src/server/
Probe.ts  factories.ts  helpers.ts  index.ts  stages  types.ts

There is no probe-owned server class to extend. An object-literal wrapper built inside `createProbeServer` collides with AGENTS.md § Design laws ("No nested functions… The only exceptions are an anonymous callback passed directly as an argument and an anonymous function returned directly as a result") and with "No superfluous wrappers", so the conforming shape is a class, and `.claude/rules/architecture.md` puts one class in its own file.

**Fix.**

Either grant `src/server/ProbeServer.ts` and `tests/src/server/ProbeServer.test.ts` as owned, or restate option A as what the owned set can reach: the factory installs the handlers at construction, and `stop()` stays the transport's.

### S6.3 — The brief's only cited evidence for the core defect is a command whose stated output is wrong: the grep returns nothing at all, not "exactly one line".

**Check.** Check 2 (paste the command and its output for every factual claim)

**Evidence.**

Brief § The defect: "`grep -rn \"SIGTERM\\|SIGINT\\|process.on\" src/` returns exactly one line, and it is unrelated — a `child.once('exit')` inside `LintStage.ts`."

$ cd /workspace/probe && grep -rn "SIGTERM\|SIGINT\|process.on" src/ ; echo "exit=$?"
exit=1

Zero matches. The `child.once('exit', …)` the brief names is real (`src/server/stages/LintStage.ts:92`) but matches none of the three alternatives in that pattern. An executor re-running the brief's own command gets an empty result and has to decide whether the brief describes a different tree.

**Fix.**

Replace the sentence with the true result: "`grep -rn \"SIGTERM\\|SIGINT\\|process.on\" src/` returns no match at all (exit 1)."

### S6.4 — The Objective promises disconnect handling and describes today's behaviour as orphaning the resident hosts — the campaign withdrew that claim on measurement — and none of the six criteria tests a disconnect, so the unit is told to close something it is never asked to prove.

**Check.** Check 2 (factual claim) and Check 4 (every criterion closes on owned files)

**Evidence.**

Brief § Objective: "so a disconnect or a `SIGTERM` releases the resident hosts and their temporary files instead of orphaning them". Criteria 1, 2, 3 and 6 all name `SIGTERM`; no criterion names stdin close or client disconnect.

$ grep -n "withdrawn" /home/user/scaffold/.orkestrel/probe/seam-sweep-triage.md
106:a withdrawn claim about orphaned processes — the processes do exit, and the finding that stands is
(line 105-107: "the entry's shutdown finding overlaps a withdrawn claim about orphaned processes — the processes do exit, and the finding that stands is about discarded faults rather than leaked children")

$ sed -n '291,310p' /home/user/scaffold/.orkestrel/probe/u3-orchestrator-findings.md
"## O8 is withdrawn — it does not reproduce" … "server alive after SIGTERM+6s: dead" … "The Oxlint child exits on its own when the server's stdin closes, and the runtime stage uses the `threads` pool, whose workers are worker threads rather than child processes and die with their parent by construction."

**Fix.**

Strike "a disconnect or" and "instead of orphaning them" from the Objective, leaving the two findings that stand — leftover files and discarded faults. If disconnect is meant to stay in scope, add a seventh criterion naming it and have the unit measure today's disconnect behaviour first, because the record measured SIGTERM only.

### S6.5 — Criterion 2 requires a whole-directory assertion that the later-appended Standing condition forbids outright, so the unit cannot satisfy both as written.

**Check.** Check 8 / internal consistency between the criteria and the appended standing condition

**Evidence.**

Criterion 2: "The built entry, sent `SIGTERM` while idle after arming, exits cleanly and leaves `tmp/probe/` without probe-created residue."

§ Standing condition — the shared `tmp/probe` directory: "Two rules follow, and they bind whatever you are writing: **Never assert that `tmp/probe/` is empty, or assert anything about its whole contents.** Assert that the specific files YOUR test created are gone."

Proving "no probe-created residue" means enumerating and classifying the whole directory, which is the assertion the standing condition bans; its escape clause ("take an owned scratch directory") tells the unit where to run but never says a whole-contents assertion is permitted there.

**Fix.**

Restate criterion 2 as the membership form the standing condition requires: "leaves none of the files its own run created — the `arm-*` and revision files it can name — in the scratch workspace's `tmp/probe/`."

### S6.6 — The host fact "The existing entry tests drive a real pseudoterminal" is false of the one test S6 rewrites, and following it would move the killed-entry test behind `script`, where `child.kill('SIGTERM')` no longer reaches the entry the test is signalling.

**Check.** Check 3 (measurement taken under the conditions the unit will run in)

**Evidence.**

Brief § Host facts: "This sandbox buffers a Node-created child pipe until EOF. The existing entry tests drive a real pseudoterminal for that reason."

$ cd /workspace/probe && git show f9810f9:tests/src/bin/main.test.ts | grep -n "spawn("
130:			const child = spawn(
224:			const child = spawn(process.execPath, [BUILT_ENTRY], {

Line 130 is the protocol test and is the only pty user (`'/usr/bin/script', ['-qfec', 'stty -echo; exec "$PROBE_NODE" "$PROBE_ENTRY"', '/dev/null']`). Line 224 is the killed-entry test S6 owns: `spawn(process.execPath, [BUILT_ENTRY], { cwd: scratch.path, stdio: ['pipe', 'pipe', 'pipe'] })` — plain pipes, no pty, because it never reads stdout. Both spawns are unchanged at HEAD (6ce8544).

**Fix.**

Rewrite the fact as: "the protocol and stderr tests drive a real pseudoterminal because they read framed stdout; the killed-entry test spawns the built entry on plain pipes and must keep doing so, so `SIGTERM` reaches the entry rather than a `script` wrapper."

### What this lane confirmed correct

Verified correct, in /workspace/probe unless noted.

CAMPAIGN CHECKS — all three pass.
- Paths: `/home/user/scaffold/PROBE.md` exists (71917 bytes) and the brief correctly places it in the orchestrator's repository, not the probe workspace (`ls /workspace/probe/PROBE.md` → No such file). `guides/probe.md` does not exist (`ls guides/` → README.md, contract.md, emitter.md, guide.md, mcp.md, scaffold.md, timeout.md, tool.md), and `guides/README.md` does say "Not created. Create this file when the workspace has a public surface: `guides/probe.md`" in all four places. No nonexistent path is cited.
- Instrument location: the brief sends every instrument to `tmp/scratch/` and nowhere else. `git check-ignore -v tmp/scratch/x.ts` → `.gitignore:11:tmp`; `git check-ignore -v scratch/x.ts` → exit 1 (not ignored); `git check-ignore -v tmp/probe/y.test.ts` → `.gitignore:11:tmp`. The brief's three ignore claims are exactly right.
- Refuted finding M6 is NOT carried: `grep -n -i "TypeStage\|remarks\|M6" s6-brief.md` → exit 1. `doc-truth-verification.md:11` records M6 REFUTED; nothing in this brief asks for it.

CHECK 1 (executor and route). The reader is a native Claude subagent: `.claude/agents/implementer.md` has `model: opus`, `effort: high`. The brief names "`implementer` — Claude Opus 5, high reasoning effort" and carries no CLI-launch or bridge instructions, which is correct for a native role. Routing to Opus rather than Sol is justified in the brief (API-shape judgment).

CHECK 2 (facts that ARE true). `src/bin/main.ts` is exactly three lines and byte-identical to the quoted block (`wc -l` → 3). `createProbeServer` returns `ProbeServerInterface` with `start(): void` and `stop(): void` (`src/server/types.ts:71-84`); `createProbe` returns `ProbeInterface` with `destroy(): Promise<void>` (`src/core/types.ts:294-315`). The architecture citation is verbatim — `.claude/rules/architecture.md:52`: "A runtime entry—`src/bin/main.ts`… declares no module-scope constant and no module-scope function: it imports what it needs and runs." `dist/bin/main.js` exists and `npm run build` → `clean && build:src:core && build:src:server && build:src:bin` produces it. `/usr/bin/script` exists.

The quoted test survives the commit that landed mid-check. HEAD moved from f9810f9 to 6ce8544 ("Close the three breaks the runtime stage audit found") while I was working, and the working tree is now clean (`git status --porcelain` → empty), so the three-file writing conflict I first saw has resolved itself. Re-verified at HEAD: `tests/src/bin/main.test.ts:326` still reads `'records the arming dependency leak when the entry is killed during boot'`, `:346` `expect(arming).toHaveLength(2)`, `:352` `expect([...leaked].sort()).toStrictEqual(arming.sort())`. The diff f9810f9..HEAD touches no line of that test. One new test, `preserves worker diagnostics on stderr` (line 235), also kills the built entry with `SIGTERM` in its finally — it lives in the owned file, so S6's slower shutdown is in scope for it.

CHECK 4 (criteria I checked and found reachable). Criterion 1 closes on owned files: `Probe.#destroy` (`src/server/Probe.ts:257-266`) opens with `try { await this.#arming } catch {}`, so `probe.destroy()` during arming lets `#arm`'s `finally` (`:187-196`, `rmSync(typeDependency)` / `rmSync(runtimeDependency)`) run and remove both `arm-*` files without touching off-limits `Probe.ts`. Criterion 5 needs only `src/bin/main.ts`. Criterion 6 is already half-served by `destroy()`'s `#closing` guard (`:110-115`). Criterion 4 can be closed from the one owned server file by subscribing the emitters the sweep named. The `it('starts one probe server and exports nothing')` assertion on `main.ts` source (line 21-25) will break if the entry changes — it is inside the owned test file, correctly scoped.

CHECK 5. No small unrelated obligation rides along: fault observation and shutdown are the two halves of one sweep finding (`seam-sweep-findings.md`, "[MEDIUM] (protocol) The entry point wires no shutdown and no error observation") and both land on the same surface.

CHECK 7. Not applicable — this change generates no configuration. `vite.config.ts:130` already globs `tests/src/bin/**/*.test.ts` into the `src:bin` project, and `configs/src/tsconfig.bin.json` already includes `src/bin/**/*.ts`; neither half needs to move.

CHECK 9. No brief-private identifier leaks. The criteria are bare numbers, and the brief explicitly orders the test renamed to what it proves.

CHECK 10. Output mechanism matches the allowlist: `implementer` carries `tools: Read, Grep, Glob, Edit, Write, Bash`, the brief returns a report rather than writing one, and the instrument and rebuild steps it names are all inside that allowlist.

CHECK 11. The symbol-consumer sweep is clean for the entry: `grep -rn "createProbeServer" --include="*.ts" . --exclude-dir=node_modules --exclude-dir=dist` returns only `src/server/factories.ts`, `src/server/types.ts:66` (a TSDoc example), `src/bin/main.ts:1,3`, `tests/src/server/index.test.ts:12`, and `tests/src/bin/main.test.ts:23`. `grep -rn "bin/main\|src/bin"` over tests, configs, `vite.config.ts`, `package.json`, `.oxlintrc.json` reaches nothing else the change would break. Only `tests/src/server/index.test.ts` is unowned, which is defect 1.

## Cross-brief synthesis

Six cross-brief conflicts. The workspace is clean at HEAD `6ce8544` (the in-flight unit's work is committed), so every reading below is from the committed tree.

---

**1. S2 and S5 both repair the same sentence in `src/core/types.ts`, and neither is told the other exists.**

The `expire` event doc is one sentence: `src/core/types.ts:246` — `/** The coordinator's deadline fired and the runtime worker was recycled. */`

- S2 carries it as **defect E** ("Make the sentence true, or move the emit. Do not leave them disagreeing"), with **criterion 6**, and grants `src/core/types.ts` "**only** for the `expire` and `deadline` documentation defects D and E".
- S5 carries the identical finding as the fifth bullet of **D through H** ("says the runtime worker was recycled. The event fires before recycling starts, and recycling is conditional"), counted in **criterion 5**'s "six prose repairs".

S2 runs first. Its defect E permits either direction. If S2 moves the emit in `Probe.ts` so the existing sentence becomes true, S5 arrives instructed that the sentence is wrong and rewrites a correct sentence back into disagreement. If S2 rewrites the sentence, S5's criterion 5 has a prose repair with nothing to repair and one of its "six" cannot be evidenced.

`carry-ledger.md:15` and `:18` confirm the double carry is unintended: the S2 row lists five findings and does **not** include the expire doc; the S5 row lists it as "`expire` event doc (L)". The ledger assigns one carrier; the briefs create two.

**Edit:** strike defect E and criterion 6 from S2, and strike the `src/core/types.ts` grant for defect E from S2's owned list (keeping it for the `deadline` doc, defect D). Add one line to S5's D-H bullet naming `Probe.ts`'s emit ordering as fixed by S2 and telling S5 to read the post-S2 emit site before rewriting. Or, if the sentence must move with the emit, strike it from S5 and say so in S5's brief.

---

**2. S2's defect B closes S3's criterion 2 before S3 runs, and falsifies two facts S3's brief states as ground.**

`src/server/Probe.ts:203-209` is verbatim:

```ts
	#inspect(subject: Case, claim: Claim): Promise<readonly Check[]> {
		return Promise.all([
			this.#type.inspect(subject, claim.project),
			this.#lint.inspect(subject),
			this.#inspectRuntime(subject, claim),
		])
	}
```

Only the runtime leg is deadlined. S2's **defect B** says "Bound every stage, not one," and S2's **criterion 3** proves it. Three consequences for S3, which runs immediately after and is told nothing about S2:

- **S3's criterion 2 is already true when S3 starts.** "A `prove` against a signal-killed lint stage produces an error rather than hanging" — after S2 bounds the lint leg, that `prove` rejects on the lint deadline regardless of whether `LintStage` ever reports the death. S3's criteria preamble demands "red before the fix and green after". S3 cannot produce the red, and its deviation contract turns that into a stop.
- **S3's stated defect-A consequence is false by then.** S3 asserts "Only the runtime leg is deadlined, so the lint leg of the coordinator's `Promise.all` waits forever." True at HEAD, false after S2.
- **S3's closed vector list for defect B goes stale, and its open question gets the wrong answer.** S3 enumerates the reachable vectors — "Two vectors were tested by reading and neither reaches B, so do not build your proof on them" — and asks S3 to settle "whether B is reachable through shipped code or only hypothetically", with `.claude/rules/quality.md` fixing repair-now versus document-only on that answer. S2 adds a third vector: a deadline that wins the race abandons `LintStage.#inspect` mid-loop with its `#documents`/`#publishes`/`#refusals` entries still registered (`src/server/stages/LintStage.ts:140-162`). If S3 rules "hypothetical" on the pre-S2 reading, the defect ships.

S3's off-limits list names `src/server/Probe.ts`, so S3 cannot adjust the coordinator either way.

**Edit:** add a standing condition to S3 stating that S2 lands first and bounds every stage in `#inspect`; restate S3's criterion 2 as "the error names the child's death rather than a deadline expiry, and arrives before the coordinator's deadline could fire"; delete the "only the runtime leg is deadlined" sentence; and add S2's deadline-abandonment path as a third vector S3 must weigh when ruling on defect B's reachability. S3's criterion 6 needs the same tightening for the same reason — post-S2 the deadline message can preempt the exit-code message.

---

**3. S2's owned globs claim the named owned test file of S3, S4, and S6 — including the exact test S6 calls its failing proof.**

S2 owns `tests/src/server/**` and `tests/src/bin/**`. That swallows:

| File | Named owner | Runs |
| --- | --- | --- |
| `tests/src/server/stages/LintStage.test.ts` | S3 | after S2 |
| `tests/src/server/stages/TypeStage.test.ts` | S4 | after S2 |
| `tests/src/bin/main.test.ts` | S6 | after S2 |
| `tests/src/server/index.test.ts` | S6's "matching test file" (no `factories.test.ts` or `types.test.ts` exists) | after S2 |

The S6 collision is the damaging one. S6 says of `tests/src/bin/main.test.ts`: "**That test is yours, and it is the failing proof for this unit.**" The test is at HEAD, line 325, `it('records the arming dependency leak when the entry is killed during boot', …)`, asserting `expect([...leaked].sort()).toStrictEqual(arming.sort())`. S2 is separately licensed to edit that file — its "Tests written before you that may need to move" section anticipates exactly this — and S2 changes the arming path (defect C, the refusal message) and the error-emit count (defect D). If S2 moves or reworks that test, S6's only red proof is gone before S6 is dispatched.

The S3 and S4 collisions run the other way and are milder but real: S2 may edit those files to accommodate its coordinator change, then S3 and S4 own them and can revert the accommodation, reddening work S2 already recorded green.

**Edit:** narrow S2's globs to the files S2 actually needs — `tests/src/server/Probe.test.ts` and `tests/src/server/helpers.test.ts` — and add `tests/src/server/stages/**`, `tests/src/server/index.test.ts`, and `tests/src/bin/**` to S2's off-limits list with the owning unit named beside each. If S2's fix genuinely reddens one of those, that is a stop-and-report, and the Orchestrator routes the assertion move to the owning unit.

---

**4. S5's C3 ruling can redden two test files S5 is not granted, and the only unit owning one of them has already finished.**

S5's **C3** is a ruling with a code arm: "Rule it: tighten `computeReceipt`, or restate both sentences to the narrow reading… If you tighten it, `src/core/helpers.ts` is yours for that change." Tightening `computeReceipt` changes when a receipt issues. Receipts are asserted outside S5's owned scope:

- `tests/src/server/Probe.test.ts:12` — `'issues receipts only when every stage executes cleanly and returns admitted path findings'`, with assertions at `:74-80` (`expect(issued.receipt).toMatch(/^probe:/)`, three `toBeUndefined()`) and `:222`.
- `tests/src/bin/main.test.ts:187,198,209,303` — `expect.stringMatching(/^probe .+receipt probe:/s)`.

S5 owns only `tests/src/core/**`. Neither file is in S5's owned list, and neither is in S5's off-limits list — both are unscoped. `tests/src/server/Probe.test.ts` is owned by S2, which runs first and is finished by then; `tests/src/bin/main.test.ts` is owned by S6, which runs after and is told nothing about the C3 ruling, so it inherits a red its own change does not explain and its deviation contract makes it stop.

S5's criterion 6 ("Defect C is ruled and implemented in one direction") has the same shape for `Control.reason`, but C3 is the one with executed evidence of consumers outside the grant.

**Edit:** grant S5 `tests/src/server/Probe.test.ts` and `tests/src/bin/main.test.ts` for the assertion moves a tightening ruling forces, or move the C3 ruling out of S5 into its own unit that runs after S6 and owns all three test files. If the grant is given, add the same note to S6 so it reads any receipt-assertion change as expected rather than as a deviation.

---

**5. A finding the ledger says is carried twice is carried once. The admission half has no carrier.**

`carry-ledger.md` closes with:

> **`Case.test.path`** routed to two units, and that one is genuinely split. The behaviour half — `prove` throwing instead of returning a verdict — is S1's. The admission half is S5's, because `Case.test` is a `Source` and S5 owns the `isSource` and `SOURCE_SHAPE` path check. Both halves are named in their briefs, so the finding is carried twice rather than dropped once.

The behaviour half is real and landed — `tests/src/server/stages/RuntimeStage.test.ts:156`, `'reports a finding for a test path outside every real Vitest project'`.

The admission half is not in S5's brief. `grep -n "unmapped\|inferTestProject\|no project\|project" s5-brief.md` returns five hits, none of them an admission task: line 89 is `Claim.project`'s prior routing, lines 107-109 are the `inferTestProject` `@returns` **prose** repair, line 141 is `globals: true`, line 211 is `tmp/probe/`. S5's only admission work is the workspace-escaping check deferred from S4, and its criterion 3 covers escaping paths alone. An unmappable path is not an escaping path — `seam-sweep-findings.md:220` names `tests/greeting.test.ts` as the reachable case, which is contained.

`isSource` still admits it (`src/core/validators.ts:56` — `recordOf({ path: isNonEmptyString, text: isString })`), as does `SOURCE_SHAPE` (`src/core/shapers.ts:16-22` — `stringShape({ min: 1 })`).

**Edit:** either add the admission half to S5 as a named item with its own criterion, or strike the claim from the ledger and record the finding as closed by S1's behaviour half alone, with the reason. Do not leave the ledger asserting a carrier that does not exist — the next reader takes that paragraph as the completeness proof.

---

**6. S3 changes the lint path mapping that S5 is instructed to document as correct.**

S5's **C5** says: "`Finding.path` is not what the tool reported, at any stage. `types.ts:131` says 'path the tool reported against'. All three stages substitute a different path, and the substitutions are correct behaviour. Restate the sentence to describe the mapping rather than denying it."

S3's **C4** changes that mapping for the lint stage: "preserve the declared basename in the synthesized path, so the overrides the gate applies also apply here." The synthesis is `src/server/stages/LintStage.ts:164-178` (`#file`), and S3 owns the file. S3 runs before S5, and S5 is told nothing about it.

S5 would therefore write a permanent contract sentence describing a lint mapping S3 has just replaced. S5's criterion 5 ("name the code you read") gives it a chance to catch this, but the brief's prescribed content is stale on arrival.

**Edit:** add a line to S5's C5 naming S3 as changing `LintStage.#file`, and instruct S5 to read `src/server/stages/LintStage.ts` at its own dispatch rather than taking the brief's characterization of the substitution.

---

**One shared false claim, in two briefs, that only one lane caught.**

S3 and S6 carry a byte-identical "Where a throwaway instrument goes" paragraph asserting that an instrument left in `tmp/probe/` "is collected by a gate". Verified false: `package.json` defines `"test": "npm run test:src && npm run test:policy && npm run test:config"`, and the `probe` project (`vite.config.ts:182-183`, `include: ['tmp/probe/**/*.test.ts']`) is reached only by `test:probe`, which no gate runs. The S3 lane reported it; the S6 lane did not. One edit fixes both paragraphs — the real reason to use `tmp/scratch/` is the concurrent sibling writes, not gate collection.

**Not a defect, checked and cleared:** `guides/README.md` does record `guides/probe.md` as "Not created" (S4, S5, S6 are correct); `guides/probe.md` genuinely does not exist; `/home/user/scaffold/PROBE.md` is cited correctly by S3, S4, S5, and S6; the "four server test files write into one `tmp/probe/`" standing condition repeated in all five is accurate (`Probe.test.ts`, `stages/LintStage.test.ts`, `stages/RuntimeStage.test.ts`, `stages/TypeStage.test.ts` write; `helpers.test.ts` only passes the string to pure helpers); the S4→S5 escaping-path hand-off names `isSource` and `SOURCE_SHAPE` on both sides and both live in files S5 owns, with `src/core/index.ts` re-exporting by `export *` so the barrel needs no grant; and S4's struck defect D correctly refuses the refuted `TypeStage` `@remarks` finding, which no other brief re-raises.

## The gate list in a brief must be the full gate list — 2026-08-19

Unit H1's brief listed its gates as "`npm run lint:check` and `npm run check` pass" and omitted
`npm run format:check`. The unit ran what it was asked to run, its report said so plainly, and
`format:check` was red from `2ecddc2` until `282c902` — across two intervening commits, because neither
of those rounds ran it either.

`AGENTS.md` fixes the acceptance gate as five commands in order:

```text
npm run format:check → npm run lint:check → npm run check → npm run build → npm test
```

**A brief that names a subset silently redefines the gate.** Name all five, or name none and cite
`AGENTS.md` — never a subset, because a subset reads as deliberate.

The failure mode this produced is the one `AGENTS.md` already warns about, arriving through a door the
warning does not cover. It warns that `lint --fix` output is not formatter-clean, so a `format` that ran
before it leaves `format:check` red. That warning is addressed to a unit converging its own work. Here
the unit never ran the gate at all, so the warning had nothing to bite on.

**The shared-file half worked.** The unit that found it did not own `tests/src/server/helpers.test.ts`.
It confirmed the failure against a stashed baseline, established the red predated its own change, and
returned the exact patch for serial integration rather than reaching. That is the contract behaving
correctly, and it is why the defect surfaced at all.

## A bridge rewriting a brief can change a fact in it — 2026-08-19

Unit S4's first exec stopped without writing. Its report:

```text
Expected: /workspace/probe/PROBE.md exists as the governing specification.
Found:    ls: cannot access 'PROBE.md': No such file or directory
The work is not done. The required specification could not be read.
```

**The unit was right to stop.** The defect was upstream of it.

The original brief at `.orkestrel/probe/s4-brief.md:19-21` reads:

> Governing guide: `PROBE.md`, at `/home/user/scaffold/PROBE.md` — the orchestrator's repository, not
> yours. Read it there if your sandbox permits the path; **if it refuses, proceed without it**, because
> this brief carries every fact you need.

The bridge restaged it to `tmp/codex/s4-brief.md:23` as:

> Governing guide: `PROBE.md` at `/workspace/probe/PROBE.md`.

It changed the repository AND dropped the clause that made absence survivable. The engine read the
staged copy, looked where it was told, found nothing, and stopped — correctly, because a missing
governing specification is a stop condition.

### The rule

**Read the staged brief before launching, not the original.** A bridge that restages a brief is
rewriting it, and a rewrite can move a path, drop a clause, or drop a permission. The brief-check list
already says to "name the executor that will actually read the brief, and write its transport for that
reader"; this is the same rule one step later — the file that reader actually opens is the file to check.

Cost: one exec cycle, no tree damage, and a correct stop report that named the exact missing path. Cheap
only because the deviation contract worked.

## A scoped test run is still a shared-resource run — 2026-08-19

The S3fix2 audit brief barred whole-suite gates and explicitly permitted scoped runs:

> **Do not run `npm test` or any whole-suite gate** — it would read S4's in-flight state. Scoped runs
> against `tests/src/server/stages/LintStage.test.ts` are fine.

They were not fine. The audit ran that scoped project against the real `oxlint` binary, plus a standalone
script instantiating a real `LintStage`, **while unit S4 was running its own gates on the same tree**.
Both drive real Oxlint children and both write into one `tmp/probe/` directory.

S4 then reported failures in the full server project and — correctly — waited for diagnostics rather than
concluding they were its own.

`.agents/orchestration.md` § Writing concurrency rule 4 says a concurrent executor validates "read-only
and scoped to their own files". The permission above satisfied the letter and missed the mechanism:
scoping a *Vitest project* does not scope the *filesystem* those tests share, and `tmp/probe` is the
shared resource four server test files already contend over — a hazard S4's own brief documents as having
cost two earlier units a repair round.

**The rule:** a concurrent read-only lane runs no test that spawns a child or writes under `tmp/`,
whatever project it is scoped to. If it needs executed evidence, it gets it from the Orchestrator or it
waits for the writer to release the tree. "Scoped" must mean scoped to files nobody else touches, not
scoped to a project name.

## A brief reference must be an absolute path or staged beside the brief — 2026-08-19

The O9 unit 2 brief cited its governing ruling as a bare filename:

> the Orchestrator's reconciliation (`o9-reconciliation.md`, read it in full)

The exec is rooted at `/workspace/probe` and the file lives in the Orchestrator's repository, so the
unit reported it could not find that reference or `o9-amendment.md` anywhere.

This is the same class as the `PROBE.md` failure one unit earlier, arriving through a different door.
That one was a **wrong** absolute path introduced by restaging. This one is **no** path at all, written
that way in the source brief.

**The rule:** every file a brief tells an executor to read is named by absolute path, or is staged into
the same directory as the brief. A bare filename resolves against a working directory the brief's author
is not sitting in.

### Two things that limited the cost

The brief's own "What is settled, so you do not re-derive it" section carries the five decisions inline,
so the substance reached the unit even though the corroborating file did not. **A brief that summarizes
its references survives losing them**, which is an argument for writing them that way rather than
pointing.

And the recovery had its own trap. Staging the files into the checkout root would have resolved a
bare reference from the working directory — and polluted the tree, breaking the unit's own "only owned
files changed" criterion. They went to `tmp/codex/` beside the brief instead, which is gitignored. The
root copies were removed and `git status --porcelain` confirmed clean before continuing.
