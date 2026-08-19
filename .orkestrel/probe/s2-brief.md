# Unit S2 — the deadline bounds the work, and a refusal says what it found

## Role and engine

`sol` on GPT-5.6 Sol, launched by the Orchestrator as a journaled bench exec. Opus 5 wrote the
coordinator's last two repairs, so this round crosses engines. You are the sole serial writer in
`/workspace/probe`.

## Objective

Close five defects in the coordinator. One is a live concurrency fault that fails a claim which did
nothing wrong; the rest are ways the probe stops answering, or refuses without saying why.

## Context

Read before acting:

1. `/workspace/probe/AGENTS.md` and every rule under `/workspace/probe/.claude/rules/`.
2. `/workspace/probe/src/core/types.ts` — `ProbeOptions.deadline` and `ProbeEventMap` are
   authoritative for what the deadline and the `expire` event promise.
3. `/home/user/scaffold/.orkestrel/probe/seam-sweep-findings.md` for full evidence, and
   `seam-sweep-triage.md` for why this unit runs second.

## Concurrency is reachable, so assume it

Two `prove` calls genuinely overlap from a real client. The stdio transport reads with a plain
synchronous data handler, nothing awaits the async message listener beneath it, `createProbeServer`
calls `probe.prove(input)` straight from the tool, and `Probe.prove` has no mutual exclusion. The
Orchestrator confirmed the transport half by reading the installed package:

```text
node_modules/@orkestrel/mcp/dist/src/server/index.js:1438 (the `data` handler) and node_modules/@orkestrel/mcp/dist/src/core/index.js:1372-1375 (`bindServer`'s unawaited `transport.listen(async …)`)
  this.#input.on("data", (chunk) => this.#receive(chunk.toString()))
  transport.listen(async (message) => { … })      // bindServer, never awaited
```

## Governing spec and skill

Governing spec: `/home/user/scaffold/PROBE.md`, in the ORCHESTRATOR's repository rather than your
working directory. Read its section on owning the deadline outside the worker before choosing what the
deadline bounds. If your sandbox refuses that path, proceed — this brief carries the facts.

Skill: none.

The probe's own guide, `guides/probe.md`, does not exist; `guides/README.md` records it as
"Not created". There is no guide-parity gate over this surface.

## Defects

### A — the deadline measures queue time, and its expiry destroys another claim's run

`#inspectRuntime` arms the timer, then calls `stage.inspect`, which appends to the stage's queue
rather than running. So the budget covers waiting as well as working, while `ProbeOptions.deadline`
documents it as bounding one runtime stage.

With two claims in flight, the second claim's timer runs down while the first claim's specification is
still executing. When it fires, the second claim rejects with `The runtime stage exceeded 30000 ms`
although its inspection never began, `expire` is emitted naming that claim, and `#recycle` destroys
the shared stage and installs a replacement — so the first claim's control, already bound to the
destroyed instance, fails with `The runtime stage has been destroyed`.

Two properties to reach, and say how you reached each: the deadline bounds the inspection's own
execution rather than its wait, and an expiry cannot fail a claim other than the one that consumed it.

### B — only the runtime stage is deadlined

`#inspect` races only the runtime member against the coordinator's deadline; the type and lint members
are awaited by a bare `Promise.all` with no bound. The lint stage's document promise settles only on a
`publishDiagnostics` notification for that URI or on a failure. A server that accepts the `didOpen`
and never publishes — an ignored path, an extension it does not lint, a stall without an exit — leaves
that promise unsettled, so `Promise.all` never settles, `prove` never returns, and the `tools/call`
never receives a response or an error.

Bound every stage, not one.

### C — a refusal discards the findings that explain it

Arming is the one failure that refuses service permanently. All four of its throw sites — `src/server/Probe.ts` lines 168, 175, 178, and 184, each with a different message — reduce a fully
populated set of checks to a bare sentence: `The probe boot control did not begin clean` names neither
the stage that reported, nor the path, line, or message it reported.

An operator whose root project does not include `tmp/` gets that sentence instead of the resolution
error the type stage actually produced. Carry the findings into the refusal.

### D — a `prove` rejection emits two `error` events

Found by the audit of the previous round, and it predates that round rather than being introduced by
it. A real arming failure produces one rejected call and two identical events: `#arm` emits and
rethrows, and `prove` emits the same error again on the way out. The first repair round asked for
exactly one event per rejection and produced the second while closing a case that had none.

Decide which site owns the emit, and make the count one for every rejection path — arming failure,
destroyed probe, stage fault, and expiry.

### E — the `expire` event's documentation is not true when it fires

`ProbeEventMap` says the event means the coordinator's deadline fired and the runtime worker was
recycled. The event is emitted before recycling starts, and recycling is conditional. Make the
sentence true, or move the emit. Do not leave them disagreeing.

## Scope

- **Owned**: `src/server/Probe.ts`; `src/core/types.ts` **only** for the `ProbeEventMap.expire` and
  `ProbeOptions.deadline` doc comments; and exactly two test files —
  `tests/src/server/Probe.test.ts` and `tests/src/server/index.test.ts`.
- **NOT yours, though an earlier draft's glob swallowed them**:
  `tests/src/server/stages/LintStage.test.ts` belongs to unit S3, and
  `tests/src/server/stages/RuntimeStage.test.ts` and `tests/src/bin/main.test.ts` belong to the runtime
  stage's units. If a criterion of yours appears to need one, stop and report rather than reaching —
  two units owning one file is how a serial campaign silently reverts itself.
- **Off-limits**: everything else. Specifically `src/core/helpers.ts`, `validators.ts`, `shapers.ts`,
  `constants.ts`, every file under `src/server/stages/`, `src/server/factories.ts`,
  `src/server/helpers.ts`, `src/server/types.ts`, `src/bin/main.ts`, `guides/**`, `package.json`,
  `vite.config.ts`, `configs/**`, and every dotfile.
- **Instruments**: write every throwaway instrument under `tmp/scratch/`, and delete it before you
  return. `tmp` is gitignored; a bare `scratch/` or a loose file at the repository root is NOT, so an
  instrument there enters the next commit if your run is interrupted before cleanup.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: do not commit, push, tag, publish, install a dependency, or run a destructive
  command. Do not add an npm package. Do not read, print, or copy any secret.

## Criteria

Every criterion owes a committed test, red before the fix and green after, with both counts recorded.

1. A claim whose inspection waits behind another claim's is not charged for the wait. Prove it with
   two overlapping `prove` calls where the first occupies the stage well past the second's deadline,
   and show the second is not rejected for exceeding it.
2. An expiry fails only the claim that consumed it. Prove that a claim already queued on a stage the
   expiry recycles is not failed by that recycle.
3. A stalled type or lint stage does not hang `prove`. Prove it by making one of them not settle and
   showing `prove` rejects within its budget.
4. An arming refusal names what was reported: at least the stage, and the message the check carried.
5. Every rejection path emits exactly one `error` event. Cover an arming failure, a `prove` after
   `destroy`, and an expiry.
6. The `expire` event's documented meaning is true at the moment it fires.
7. Every existing guarantee holds: `process.exitCode` untouched, all three stages abandon on
   `destroy`, expiry recovers and serves a later claim, integer `elapsed`, and no `*.probe-*` file
   after an expiry.
8. `npm run format:check`, `npm run lint:check`, `npm run check`, `npm run build`, and `npm test` each
   exit 0, run in that order. Report `npm test` separately if a sandbox blocks the vendored config
   proof, which is off-limits and environmental.
9. `npm test` reports no skipped and no todo test in the final tree.
10. `git diff --stat` touches only owned files.


## Tests written before you that may need to move

A proof unit committed a server and entry suite before this repair. It was written against the
behaviour that exists now, which includes the behaviour you are about to change. Expect some of its
assertions to fail under your fix, and treat that as ordinary rather than as a deviation.

The rule for handling one: if a test asserts the defective behaviour, change the test and say in your
report exactly which assertion moved and why the new one is right. If a test fails for a reason your
change does not explain, that is a real deviation and it stops the unit.

Those test files are yours to edit for this purpose only. Do not rewrite the suite, and do not delete a
test to make a gate pass — that is the one move this repository refuses outright.

The assertions most likely to move are the ones about deadline timing, the `expire` event, and the
count of `error` events, because defects A, D, and E change all three.

## Naming, so this brief's vocabulary does not become permanent

The defect letters and criterion numbers in this brief are addressing for this brief only. Name every
test for the behaviour it proves, never for the defect or the criterion that specified it. A private
label that reaches a test name outlives the brief and means nothing to the next reader.

## Standing condition — dispatch baseline

You are dispatched from a clean, committed baseline and you are the sole writer in this checkout. The
Orchestrator confirms `git status --porcelain` is empty before launching you; if it is not empty when
you start, that is a deviation worth reporting immediately rather than working around.

State any completion criterion about your own diff against the BASELINE COMMIT, never against the
working tree: `git diff --stat <baseline>..` is stable, and `git status` is not.

## Execution

Perform this assignment directly. Spawn nothing.

## Deviation contract

Stop and report when a fix needs an off-limits file, when two criteria contradict, or when a gate
reddens for a reason your change does not explain. Report expected, found, the exact command and its
output, whether the work is done, and at most one short hypothesis.

## Output

Return exactly: **Files written**, **Validation**, **Acceptance evidence**, **Deviation**,
**Decisions**.

## Amendment, 2026-08-19 — a fifth defect, and the baseline

### The duplicate `error` emit — this is defect D from the body, restated with the audit's evidence

Added from the third repair round's audit, which triggered a real arming failure and observed one
rejected call and two identical events. `#arm` emits and rethrows; `prove` emits the same error again
on the way out.

The first repair round asked for exactly one event per rejection and produced the second emit while
closing a case that had none. The audit confirmed the duplicate exists in the commit before round 3 as
well, so round 3 did not introduce it — the guarantee was never true.

A consumer counting error events double-counts every arming failure. It belongs here because this unit
owns `Probe.ts` and already carries the arming and error-path work.

Criterion: one rejected `prove` emits exactly one `error` event. Assert the count, not merely that an
event fired. Cover both the arming-failure path and an ordinary stage failure, because they reach the
emit through different doors and only one of them was examined.

### Baseline and standing conditions

- Start from the commit `git log --oneline -1` reports at dispatch. The tree is clean.
- Unit S1 lands before you and owns `src/server/stages/RuntimeStage.ts`. It changes what a clean
  runtime check means and how the runtime stage is constructed. Read that file as it is when you start;
  every line number this brief quotes for `Probe.ts` was read before S1 ran, so re-read those too.
- `src/server/stages/RuntimeStage.ts` is OFF-LIMITS to you. If the deadline repair appears to need it,
  stop and report — that is a unit boundary.
- The concurrency this unit must assume is real, not hypothetical. The stdio transport reads with a
  plain `data` handler and nothing awaits the async message listener beneath it, and `prove` has no
  mutual exclusion. Two claims can be in flight.

### Host facts your commands run under

- Working directory `/workspace/probe`. Nested process spawns are permitted.
- The whole-workspace `npm test` is safe and takes roughly three minutes.
- The `probe` Vitest project reads `tmp/probe/`, and sibling projects write there concurrently. Put any
  throwaway instrument in `tmp/scratch/`, and nowhere else, and delete it before returning. `tmp` is
  gitignored; a bare `scratch/` at the repository root is NOT, and both `format:check` and `lint:check`
  scan the tree, so an instrument left there reddens the gates.

## Standing condition — the shared `tmp/probe` directory

Four server test files write into one `tmp/probe/` directory, and `test:src` runs `src:core`,
`src:server`, and `src:bin` in a single Vitest invocation with no parallelism guard, so their files
run concurrently and see each other's writes.

This has already cost two units a repair round. It is a known condition, not a discovery.

Two rules follow, and they bind whatever you are writing:

- **Never assert that `tmp/probe/` is empty, or assert anything about its whole contents.** Assert that
  the specific files YOUR test created are gone. `.claude/rules/tests.md` requires exactly this: assert
  the membership a globbed set should have, never a total that a partly empty population satisfies.
- **Give every file your test writes a name unique to that test**, so a sibling running concurrently
  cannot collide with it or be mistaken for it.

Where a proof needs a whole workspace rather than a few files, take an owned scratch directory linked
to the real installed toolchain, as `tests/src/bin/main.test.ts` already does. Do not disable file
parallelism to make an over-broad assertion pass — that hides the defect and keeps the wrong assertion.

## Amendment 2, 2026-08-19 — the deadline mechanism is confirmed, and here is the evidence

Your first defect is no longer the sweep's assertion. The Orchestrator verified all three of its
structural facts by reading, which is the matching instrument for a claim about statement order. Do not
re-derive them; build your failing proof on top.

**Fact 1 — the timer is armed before the work is handed over.** `src/server/Probe.ts:211-217`:

```ts
	async #inspectRuntime(subject: Case, claim: Claim): Promise<Check> {
		const stage = this.#runtime
		const timeout = createTimeout({ ms: this.#deadline })
		timeout.start()
		try {
			return await Promise.race([
				stage.inspect(subject),
```

**Fact 2 — `inspect` queues rather than runs.** `src/server/stages/RuntimeStage.ts:61-68` chains onto a
tail promise:

```ts
		const inspection = this.#tail.then(() => this.#inspect(subject))
```

So a second call waits behind the first while its own timer is already counting. The budget
`ProbeOptions.deadline` documents as bounding one runtime stage covers queue time plus work.

**Fact 3 — the expiry path recycles the SHARED stage.** `src/server/Probe.ts:223` calls
`await this.#recycle(stage)`, and `#recycle` installs a replacement `#runtime`. The claim whose timer
fired tears down the stage a different, still-running claim is bound to.

**What is NOT settled, and what you owe.** Reading cannot demonstrate the consequence: that under two
real concurrent claims, claim B's expiry destroys claim A's live run and the failure is misattributed to
A. That interleaving is your required failing proof — red before the fix, green after, with the exact
command and both counts.

Concurrency here is reachable rather than theoretical. The stdio transport reads with a plain `data`
handler and nothing awaits the async message listener beneath it, and `prove` has no mutual exclusion.

**Design note, not a prescription.** The obvious repair is to arm the timer inside the stage, after the
queue admits the work. Consider what that does to a claim that never reaches the front of the queue: an
unbounded queue wait with no deadline is a different unbounded hang, not a fix. Whatever you choose,
state what bounds the total time a caller waits, because that is what `deadline` promises a caller.

## Also yours — a defect a later audit referred to you explicitly

`tests/src/server/Probe.test.ts` lines 293-297 assert over the WHOLE `tmp/probe` directory, filtered by
`name.startsWith('arm-') || name.includes('.probe-')`. Those prefixes are generic to every probe
instance, so the assertion collides with any concurrently running test that writes there — and four
server test files do, under a project with no parallelism guard.

An audit of unit S1 referred this to you by name, because that file is outside S1's scope and inside
yours. Repair it the way `.claude/rules/tests.md` requires: assert that the files THIS test created are
gone, identified by a token unique to this test, never that the directory is empty or that no file of a
generic shape exists.
