# Unit S1 audit — falsify the runtime stage repair

## Role and engine

`reviewer` — Claude Opus 5, high reasoning effort. Unit S1 was written by GPT-5.6 Sol, so the auditor
is an engine that did not write it, per the cross-engine rule.

This lane is READ-ONLY. It carries no `Edit` and no `Write`. Every piece of executed evidence it needs
is supplied below by the Orchestrator, because a read-only lane cannot produce its own.

## Subject

Unit S1 repaired four defects in `src/server/stages/RuntimeStage.ts`:

- **A** — a skipped test produced a clean check, so a receipt was issued for a case that never ran.
- **B** — Vitest worker stdout was piped into the same `process.stdout` that frames the JSON-RPC
  channel, so a claim's test could corrupt or forge a protocol frame.
- **C** — the per-run eviction removed nothing, so runner state grew one entry per inspection forever.
- **D** — a `Case.test.path` outside every real Vitest project made `prove` throw instead of returning
  a verdict.

## Why this package makes a wrong proof worse than a crash

State this to yourself before you start, because it decides how you weigh a finding. This package
exists to issue a receipt saying a code change was proven. A crash is visible and someone fixes it. A
receipt issued for work that did not happen is believed, and it is believed precisely because the
package's whole purpose is to be believable.

So rank a defect that can produce a WRONG RECEIPT above a defect that can produce a hang, a leak, or a
crash — even when the crash looks more dramatic.

## The claims, numbered

Drawn from the actual diff, not from the unit's report. Each is a falsifiable property.

1. **A case whose test never runs cannot produce a clean check.** `#findings` now switches on
   `module.state()`: `passed` continues, `skipped` pushes a finding, `failed` pushes one when that
   module produced none, `pending` and `queued` push one, and any other value pushes an
   "unrecognized state" finding.
2. **A case whose test genuinely passes still produces a clean check and still earns a receipt.**
3. **Worker stdout no longer reaches `process.stdout`.** `#vitest` builds a `PassThrough`, calls
   `output.resume()`, and passes `{ stdout: output, stderr: output }` as `createVitest`'s fourth
   `VitestOptions` argument.
4. **That replacement stream cannot grow without bound.** `resume()` puts it in flowing mode with no
   consumer, so data is discarded rather than buffered.
5. **Eviction leaves no retained state.** `#evict` deletes matching `state.idMap` entries, removes the
   path from `state.pathsSet`, clears the specifications cache, invalidates the file, deletes the
   module-graph entries and their importer edges, tells the watcher, and removes the disk result row.
6. **Eviction proves itself.** `#evict` ends by throwing `Vitest retained the generated specification`
   when `state.filesMap`, `state.idMap`, or any module graph still holds the file.
7. **An unmapped test path returns a verdict rather than throwing.** `#project` returns `undefined`
   instead of throwing, and `#inspect` returns a `Check` carrying a finding.
8. **The per-module fallback is now per-module.** The old guard read `findings.length === 0`, which is
   the accumulator across every module, so a second failed module with no errors of its own got no
   fallback finding. It now reads `findings.length === before`.

## Attack claim 6 first, and attack it as a defect rather than a feature

`#evict` is called from `#inspect`'s `finally`, and it throws when it finds retained state. A throw
from a `finally` REPLACES whatever the `try` produced.

So when an inspection fails for a real reason and eviction also finds something retained, the caller
receives `Vitest retained the generated specification` and the real diagnosis is gone.

That is the same defect class this campaign is repairing in `LintStage` under unit S3, where a cleanup
handler throws and replaces the Oxlint crash diagnosis. If it is present here, S1 has introduced the
defect it is elsewhere fixing, in the same commit that fixes three others.

Determine whether it is reachable. Then rule on the mechanism rather than only the instance: a
self-check that fails loudly is a good instinct and a `finally` is the wrong place to spend it. Say
where it belongs.

`#evict` also `await`s `vitest.cache.results.writeToCache()` on every inspection, inside that same
`finally`. Rule on both the cost and the added throw site.

## Attack claim 1 at the state machine's premise

Every branch depends on `module.state()` returning the value the branch names. The claim collapses
entirely if Vitest reports a module whose tests were all skipped as `passed` rather than `skipped`.

Ask, for each: a file whose only test is `test.skip`, a file wrapped in `describe.skip`, a file of only
`it.todo`, a file where a name filter excluded every test, a file with no tests at all, and a test
skipped at runtime by `ctx.skip()` after it started. Which of these does the shipped code call clean?
Each one it calls clean is a receipt for a case that never ran, which is the defect this unit exists to
close.

The unit's tests are evidence of what it checked, not of what is true.

**The Orchestrator already read the declarations, and they settle half the question.**
`node_modules/vitest/dist/chunks/reporters.d.DtoKVV2s.d.ts:351-352`:

```ts
type TestSuiteState = "skipped" | "pending" | "failed" | "passed";
type TestModuleState = TestSuiteState | "queued";
```

So the union has exactly five members, and S1's state machine handles all five by name plus an
unrecognized fallback for a member a later Vitest might add. Against the declaration the switch is
complete. Do not spend the round re-deriving that; it is checked.

**What the declarations do NOT settle is the mapping, and that is the whole question.** The TSDoc on
`state()` reads only "Checks the running state of the test file" — it never says which source shape
produces which member. A module of all-skipped tests returning `"passed"` is fully consistent with this
type, and it would make the repair inert while every test S1 wrote still passes.

That mapping can only be settled by running it. Name the shapes you want run and what result would
change your verdict; the Orchestrator will run them and return the output to you.

## Your posture

Attempt to REFUTE each claim. A claim you cannot break is CONFIRMED, with the evidence that convinced
you. A claim you break is BROKEN, with the exact input, state, or interleaving that breaks it and the
smallest correct fix.

Derive your attacks from what the change asserts under adverse conditions the happy path never
reaches. For this subject specifically:

- **Skip detection.** `test.skip`, `describe.skip`, `it.todo`, a `skipIf` that evaluates true, a test
  skipped at runtime by `ctx.skip()`, a file where every test is filtered out by a name pattern, an
  empty test file, and a file whose only export is a `describe` with no `it`. Which of these produce
  a clean check? Each one that does is a receipt for a case that never ran.
- **Stream isolation.** A test that writes to `process.stdout.write` directly, one that writes with no
  trailing newline, one that writes something that PARSES as valid JSON-RPC for an id the client is
  waiting on, one that writes a very large payload, and one that writes from a `setTimeout` after the
  test body returned. Also: if the replacement stream is in-memory, what bounds it? An unconsumed
  in-memory stream is a leak wearing a fix's clothing.
- **Eviction.** The measurement S1 reports is over 15 inspections. Ask what it did not measure:
  distinct paths versus one repeated path, a failing inspection versus a passing one, an inspection
  that throws part-way, and whether anything grows that the counted maps do not cover.
- **The `+2` that stays flat.** S1 reports module-graph setup reaching `+2` on the first inspection and
  staying flat. Ask whether `+2` is genuinely shared setup or whether it is two entries that happen not
  to grow under the workload measured.

## What to check beyond the four defects

- **Reaching into a dependency's internals.** S1 reports that Vite's public `onFileDelete` hook
  disconnects imports but does not remove module-graph map entries, and that it therefore deletes those
  nodes and their edges directly. Rule on this. A repair that reaches past a dependency's public
  surface is a maintenance liability that breaks silently on upgrade. Is there a public route? If there
  is not, is the reach minimal, documented at the call site, and covered by a test that would fail
  loudly rather than silently when Vite changes shape? Say plainly whether you would ship it.
- **The no-suppression law.** `AGENTS.md` forbids `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, and
  `eslint-disable`. S1 hit `no-control-regex` in its stdout proof. Confirm it fixed the cause rather
  than suppressing it, and that no suppression entered any file.
- **The fenced test.** `tests/src/bin/main.test.ts` contains `records the arming dependency leak when
  the entry is killed during boot`. S1 was told that test is not its and that reddening it is a
  deviation. Confirm its assertion and its name are unchanged.
- **Test isolation.** Four server test files share one `tmp/probe/` directory and `test:src` runs
  projects in parallel with no parallelism guard. Confirm no test S1 wrote or changed asserts that
  `tmp/probe/` is empty or asserts anything about that directory's whole contents. The correct form is
  asserting that the files the test itself created are gone.
- **Assertions that cannot fail.** For each new test, ask what value would make it red. A test asserting
  a count stays at `+0` passes trivially if the thing it counts is never populated. Confirm each proof
  was observed red before the fix, and that the red was the assertion the test names rather than a
  collection error or an import failure.

## Evidence supplied to you

You have no `Bash`. Every piece of executed evidence is therefore supplied as a file you can `Read`:

- `/home/user/scaffold/.orkestrel/probe/s1-diff.md` — the complete `git diff`, `git diff --stat`, and
  `git status --short`, captured after S1 exited and before any commit.
- `/home/user/scaffold/.orkestrel/probe/s1-report.md` — S1's returned report in full, including its
  15-inspection retention curve before and after, and its red-then-green commands.
- `/home/user/scaffold/.orkestrel/probe/s1-gates.md` — the five gates run by an independent verifier
  outside the bench sandbox, plus a suppression grep and a `tmp/probe` listing.

You may also `Read` and `Grep` anything under `/workspace/probe`, including
`node_modules/vitest/dist/**` for installed declarations. The working tree there is S1's post-change
state.

Do not ask for a command to be run as a condition of your verdict. Name what you would have run and
what result would change it, and the Orchestrator runs it and returns to you. Give your verdict on the
evidence you have, marking any claim `UNPROVEN` that genuinely needs a run you cannot do.

## Scope

Read-only. You own no files and edit nothing. You may read anything in `/workspace/probe`.

## Execution

Perform this assignment directly. Spawn nothing.

## Output

For each numbered claim, exactly one block:

```text
CLAIM <n>: CONFIRMED | BROKEN | UNPROVEN
Evidence: <the file:line spans and quoted code that decided it>
Break: <the exact input, state, or interleaving — only for BROKEN>
Fix: <the smallest correct repair — only for BROKEN>
```

Then:

- **Beyond the claims** — findings outside the numbered list, strongest first, each with file:line.
- **Ruling on the Vite internals reach** — ship or do not ship, with the reason.
- **What you could not attack** — claims you could not falsify either way, so the next round knows what
  has already been tried.

End with exactly one terminal line: `VERDICT: PASS` or `VERDICT: FAIL`.

Do not manufacture a finding. An all-confirmed round is a legitimate result. If you find nothing, say
so and put the claims on trial instead: state whether any of them could have been falsified by the
evidence this round actually had, because a claim that could not be is descriptive rather than
falsifiable, and that is a finding about the brief.
