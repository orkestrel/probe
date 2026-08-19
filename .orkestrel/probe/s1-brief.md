# Unit S1 — the runtime stage stops certifying what it never ran

## Role and engine

`implementer` on Claude Opus 5. You are the sole serial writer in `/workspace/probe`.

## Objective

Close four defects in the runtime stage. Two of them issue receipts for cases that never executed,
which for this package is the worst failure available: a crash is visible, and a receipt is believed.

## Context

Read before acting:

1. `/workspace/probe/AGENTS.md` and every rule under `/workspace/probe/.claude/rules/`.
2. `/workspace/probe/src/core/types.ts` — `Check`, `Verdict`, and `Finding` are authoritative.
3. `/workspace/probe/src/core/helpers.ts` — `computeReceipt` is what these defects defeat.
4. `/home/user/scaffold/.orkestrel/probe/seam-sweep-findings.md` for the full evidence, and
   `seam-sweep-triage.md` for why this unit runs first.

The tree is green at its current commit. Inside a bench sandbox `npm test` may fail on the vendored
`tests/config.test.ts`, which cannot spawn a nested process there; that file is off-limits and the
failure is environmental.

## Defects

### A — a skipped test yields a clean check, so a receipt is issued for a case that never ran

`#findings` collects module errors, `allTests('failed')`, and unhandled errors. A specification whose
tests are all `test.skip`, `test.todo`, or inside a `describe.skip` produces none of those, and Vitest
reports the module state as `passed`. So `#findings` returns `[]`, which `src/core/types.ts` defines as
the clean result, and `computeReceipt` requires only that every case check be clean.

The consequence, stated plainly: an agent submitting

```ts
import { test } from 'vitest'
test.skip('greets', () => { expect(1).toBe(2) })
```

with a control declaring `stage: 'type'` receives a full receipt. The receipt asserts runtime
evidence and the runtime stage executed nothing.

The structural guard that exists — `module.state() === 'failed' && findings.length === 0` — fires only
where findings already exist and never where nothing ran.

The Orchestrator confirmed this by running the exact shape through the same Vitest API the stage uses,
and found one detail the finding got wrong in a way that helps you:

```text
t/skip.test.ts   moduleState=skipped  findings=0  -> CLEAN CHECK
```

The module state is `skipped`, not `passed`. So a clean signal is available and the repair does not
need to count tests: a module state the stage does not recognise as "ran and passed" is the thing to
refuse. Check every state Vitest can report rather than only the two you expect, because a state you
do not handle is exactly how this defect arrived.

Close it so a case that executed no test cannot be clean. Decide and state whether a skipped test is a
finding or a refusal, and make the message say which of the two happened: nothing ran, or something
ran and passed.

### B — worker output shares the stream that frames the protocol

The entry runs the Model Context Protocol transport over `process.stdout` as newline-delimited
JSON-RPC, and the runtime stage runs claim-supplied test code in worker threads of that same process
whose stdout Vitest pipes back into `process.stdout`. A test containing `process.stdout.write('x')`
puts `x` in front of the next response, the client's line framer drops the malformed line, and the
`tools/call` it belonged to never resolves.

The corrupting input is the tool's own advertised argument, so any connected client reaches this with
a legitimate claim about code that prints.

An independent verifier reproduced this and corrected it in one way that matters: there are **two**
failure modes, selected by whether the test's write ends in a newline. A write with no trailing
newline **prefixes** the next protocol line and makes that line unparseable, so the response destroyed
belongs to a different request than the one that caused it. A write with a newline injects a whole
spurious line of its own.

`createVitest` takes a fourth parameter carrying `stdout` and `stderr`, and the stage passes only two.
Give the resident runner streams that are not the protocol channel, and prove both failure modes are
gone — a test writing without a newline and a test writing with one.

### C — the per-run eviction removes nothing

The stage's own documentation says it "runs that specification, evicts its result, and deletes the
file". Every inspection writes a uniquely named specification, so every key it creates can never
recur, and the `finally` that is meant to evict does not: of the three calls it makes, only
`clearSpecificationsCache` removes a key. `state.clearFiles` re-registers a placeholder task rather
than deleting, and `invalidateFile` clears a transform result while leaving the module node in place.

So runner state grows by one entry per inspection for the life of the process, with results, error
stacks, and logs retained.

An independent verifier reproduced this and measured it, correcting the magnitude upward. The files
map and the Vite module graph grow by one entry per inspection as claimed. The runner's **id map grows
by one plus every suite plus every test** — measured at +2 for a single-test file and +4 for one
`describe` block — so the growth scales with the size of the claims served, not just their number.

It also identified which of the three calls works: `clearSpecificationsCache` is the only one that
deletes a key. The other two re-register a placeholder and clear a transform result.

The property to reach is that a resident probe's runner state does not grow without bound across
inspections. Evicting by the revision path directly is the verifier's suggested direction; choose your
own if you find better, measure the growth curve before and after over at least fifteen inspections
including one with several suites and tests, and state the cost. If no bound is reachable without
recycling the runner, say so and implement the recycle rather than documenting the leak.

### D — a test path that makes `prove` throw instead of returning a verdict

Both the shape and the guard admit a `Case.test.path` the runtime stage cannot map to a project, and
the stage throws rather than returning a verdict. An input the contract advertises as valid must not
produce an internal error. Decide between refusing it at the contract and reporting it as a finding,
consistent with what you chose in defect A.

## Scope

- **Owned**: `src/server/stages/RuntimeStage.ts`, `src/server/types.ts`, and
  `tests/src/server/**` and `tests/src/bin/**` for the tests these defects owe and for any existing
  assertion your fix makes untrue.
- **Off-limits**: everything else. Specifically `src/core/**`, `src/server/Probe.ts`,
  `src/server/stages/TypeStage.ts`, `src/server/stages/LintStage.ts`, `src/server/factories.ts`,
  `src/server/helpers.ts`, `src/bin/main.ts`, `guides/**`, `package.json`, `vite.config.ts`,
  `configs/**`, and every dotfile. If a fix genuinely needs `src/core/helpers.ts` or
  `src/server/factories.ts`, stop and report rather than reaching.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: do not commit, push, tag, publish, install a dependency, or run a destructive
  command. Do not add an npm package. Do not read, print, or copy any secret.

## Criteria

Every criterion owes a committed test, and each test is red before the fix and green after. Record the
exact command and both counts.

1. A case whose only test is skipped does not produce a clean check, and no receipt is issued for it.
   Cover `test.skip`, `test.todo`, and `describe.skip`.
2. A case whose test genuinely passes still produces a clean check and still earns a receipt. The fix
   must not make every claim fail.
3. A claim whose test writes to stdout does not corrupt a protocol response. Cover both failure
   modes: a write with a trailing newline and a write without one. Prove it over the real spawned
   entry, reading the client side, not by inspecting configuration. The working client is
   `/home/user/scaffold/.orkestrel/probe/instruments/wire.mjs`; read its README before writing your
   own, because two units have already lost time to that.
4. Runner state does not grow without bound across inspections. Paste the growth curve before and
   after, over at least fifteen inspections, including one claim carrying several suites and tests so
   the per-test component of the growth is visible.
5. A `Case.test.path` the contract admits never makes `prove` throw an internal error.
6. Every existing guarantee holds: `process.exitCode` untouched, all three stages abandon on
   `destroy`, expiry bounded and recovering, integer `elapsed`, no `*.probe-*` file after an expiry,
   one `error` event per `prove` rejection.
7. `npm run format:check`, `npm run lint:check`, `npm run check`, `npm run build`, and `npm test` each
   exit 0, run in that order.
8. `npm test` reports no skipped and no todo test in the final tree.
9. `git diff --stat` touches only owned files.


## Tests written before you that may need to move

A proof unit committed a server and entry suite before this repair. It was written against the
behaviour that exists now, which includes the behaviour you are about to change. Expect some of its
assertions to fail under your fix, and treat that as ordinary rather than as a deviation.

The rule for handling one: if a test asserts the defective behaviour, change the test and say in your
report exactly which assertion moved and why the new one is right. If a test fails for a reason your
change does not explain, that is a real deviation and it stops the unit.

Those test files are yours to edit for this purpose only. Do not rewrite the suite, and do not delete a
test to make a gate pass — that is the one move this repository refuses outright.

The assertions most likely to move are the ones about what a clean check means and what a
receipt requires, because that is precisely what defect A changes.

## Execution

Perform this assignment directly. Spawn no subagent.

## Deviation contract

Stop and report when a fix needs an off-limits file, when two criteria contradict, or when a gate
reddens for a reason your change does not explain. Report expected, found, the exact command and its
output, whether the work is done, and at most one short hypothesis.

## Output

Return exactly: **Files written**, **Validation**, **Acceptance evidence**, **Deviation**,
**Decisions**.

## Amendment, 2026-08-19 — the proof suite now exists, and here it is

The preceding section was written before the proof unit landed. It has landed. These are the facts
rather than the expectation.

**Baseline commit.** `938eb04 Prove the server, the stages, and the built entry`. Start from it. The
tree is clean at dispatch; `git status --short` returns nothing.

**The files that section refers to, by name.** `git ls-files tests/src/server tests/src/bin`:

```text
tests/src/bin/main.test.ts
tests/src/server/Probe.test.ts
tests/src/server/helpers.test.ts
tests/src/server/index.test.ts
tests/src/server/stages/LintStage.test.ts
tests/src/server/stages/RuntimeStage.test.ts
tests/src/server/stages/TypeStage.test.ts
```

`tests/src/server/stages/RuntimeStage.test.ts` is the one your defects mostly land in. It has four
tests today: a verdict pair, a dependency-revalidation proof, `refuses a test path outside every real
Vitest project`, and `abandons an inspection and destroys idempotently`. Extend it; do not replace it.

**One test in `tests/src/bin/main.test.ts` is NOT yours.** `records the arming dependency leak when
the entry is killed during boot` asserts that arming files survive `SIGTERM`. It reads like a defect
being certified, and it is — but it belongs to unit S6, which wires the entry's shutdown and rewrites
that assertion in the same change. Leave it exactly as it is. If your change reddens it, that IS a
deviation worth reporting, because nothing in your scope should reach it.

**Gate baseline at dispatch.** All five gates pass at `938eb04`, verified by an independent verifier:
`format:check`, `lint:check`, `check`, `build`, and `test` each exit 0, with 12 test files and 157
tests, and zero skipped, todo, or failed. So any red you see is yours, which is what makes the
red-then-green evidence this brief asks for meaningful.

**Host facts your commands run under.** You are in `/workspace/probe`. Nested process spawns are
permitted here. The whole-workspace `npm test` is safe to run and takes roughly three minutes. The
`probe` Vitest project reads `tmp/probe/`, and several tests write there, so if you build a throwaway
instrument put it in its own scratch directory rather than in `tmp/probe`, or a sibling project's run
will see your files and fail on a directory-listing assertion. That collision is real and cost the
previous unit a repair round.
