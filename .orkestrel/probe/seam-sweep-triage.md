# Six-lens sweep — triage into repair units

29 findings survived refutation. Full evidence for each is in `seam-sweep-findings.md`; this file
groups them by the file that owns the fix, so each unit writes a disjoint set and can be audited on
its own.

Order is by damage, not by file. Two units close false-proof paths and go first, because for this
package a wrong proof is worse than a crash: a crash is visible and a receipt is believed.

## Unit S1 — the runtime stage stops certifying what it did not run (`RuntimeStage.ts`)

The heaviest unit. Three high findings, two of which issue receipts for cases that never executed.

- **A skipped test yields a clean check.** `#findings` collects module errors and
  `allTests('failed')`. A `.skip`, a `todo`, or a skipped `describe` produces neither, so the check is
  clean and a receipt is issued for a case whose test never ran. This is the same defect class the
  package exists to prevent, reached without touching `Case.files` at all.
- **The per-run eviction removes nothing.** The design's own risk register says to evict each result
  after returning it. The calls that were meant to do that do not, so runner state and the workspace
  results cache grow one entry per inspection for the life of the process.
- **Worker stdout shares the stream that frames JSON-RPC.** Anything a test prints can corrupt a
  protocol frame on the entry's stdio channel.
- Plus one low: a `Case.test.path` both the shape and the guard admit can make `prove` throw rather
  than return a verdict.

Acceptance leads with the skipped-test control, because it is the cheapest demonstration that a
receipt can be wrong: a case whose only test is skipped must not earn one.

## Unit S2 — the deadline bounds the work, not the queue (`Probe.ts`)

One high and three medium, all one root plus its neighbours.

- **The deadline is armed before the inspection is queued.** `#inspectRuntime` starts the timer, then
  calls `stage.inspect`, which appends to the stage's queue rather than running. So the budget covers
  queue time, while `ProbeOptions.deadline` documents it as bounding one runtime stage.
- **Under two concurrent claims that misattributes and then destroys.** A second claim's timer can
  fire while its inspection has barely started; the expiry path destroys the shared stage and installs
  a replacement, failing a different claim already bound to the destroyed instance.
- **Only the runtime stage is deadlined**, so a stalled type or lint stage turns a `tools/call` into an
  unbounded hang.
- **The boot control discards the findings that explain why arming failed**, so a refusal says a
  control was not detected and not what the stage actually reported.

Concurrency is reachable and this unit must assume it: the stdio transport reads with a plain data
handler and nothing awaits the async message listener beneath it, and `prove` has no mutual exclusion.

## Unit S3 — the lint stage survives its child's death (`LintStage.ts`)

Two high and four medium, all one subject: what happens when the Oxlint server goes away.

- **A signal-killed server makes `prove` and `destroy` hang forever**, because liveness is read from
  `exitCode` alone.
- **An orphaned document promise ends the host** when the probe is destroyed and nothing handles the
  rejection.
- **`child.stdin` carries no error listener**, so an `EPIPE` from a write racing the child's death is
  an uncaught exception rather than a stage fault the coordinator could recycle around.
- **The cleanup handler throws and replaces the real diagnosis**, so the exit code and signal — the
  only evidence of why the stage stopped — are discarded and the document map is never pruned.

This unit is where a resident service earns the word resident. Every finding here is a way the probe
stops being available without saying so.

## Unit S4 — the type stage's overlay cannot outlive its inspection (`TypeStage.ts`)

- **Overlays are applied outside the `try`**, so one bad path in a claim pins a stale in-memory copy of
  a real workspace file for the life of the process. That is the stale-source defect the design's five
  laws exist to prevent, reached through the cleanup path rather than through caching.
- **`#versions` is never pruned** while `#overlays` is, so the stage retains one entry per distinct
  claim path forever.
- Its class documentation describes a project selection the coordinator no longer uses.

This unit is a prerequisite for the candidate-source overlay work, which rebuilds the same lifetime.

## Unit S5 — the contract stops describing a package that does not exist (`src/core/*`, `src/server/types.ts`, `helpers.ts`)

Two high and six more. Documentation defects reach every consumer, and two of these are worse than
wrong prose.

- **The canonical `Claim` example declares a control byte-identical to its case**, so the documented
  example of the package's central idea can never earn a receipt. Anyone copying it gets a refusal.
- **`CLAIM_SHAPE` documents a derivation that does not exist.** It says the tool admits calls with
  `compileGuard(CLAIM_SHAPE)`; the tool admits them with `isClaim`, and `compileGuard` is never called
  anywhere in the package. The single-source story the shape's own comment tells is not true, and only
  a test holds the two together.
- **`Control.reason` is required, validated at three layers, and read by nothing** — the same defect
  as `Claim.project` before it was routed, and it needs the same ruling: route it or remove it.
- Five more where a sentence describes behaviour the code does not have: an mtime-keyed revalidation
  that actually hashes contents, a root-project fallback whose only consumer throws, a teardown
  guarantee the coordinator refuses to trust, a `Verdict.id` described as a revision identity, and an
  `expire` event whose text claims a recycle that has not happened yet and may not.

## Unit S6 — the entry owns its own shutdown (`src/bin/main.ts`)

The entry wires no shutdown and no error observation, so a disconnect orphans the process and every
fault the probe contains is discarded. Note the architecture rule: a runtime entry declares no
module-scope constant and no module-scope function, so the lifecycle belongs on the server surface.

## What this does to the plan

These sit before the candidate-source implementation. S1 and S2 close false-proof paths that need no
new mechanism, S3 and S4 repair the resident lifetime the overlay work builds on, and S4 in particular
is a prerequisite because the overlay rebuilds the lifetime it fixes.

Two findings are already known and stay where they are: the type stage's `fileExists` gap is the
candidate-source defect and belongs to that design's units, and the entry's shutdown finding overlaps
a withdrawn claim about orphaned processes — the processes do exit, and the finding that stands is
about discarded faults rather than leaked children.

## Added to S2 by the third repair round's audit

**A `prove` rejection emits two `error` events, not one.** The audit triggered a real arming failure
and observed one rejected call and two identical events: `#arm` emits and rethrows, and `prove` emits
the same error again on the way out.

The first repair round asked for exactly one event per rejection and produced the second emit while
closing a case that had none. The audit confirmed the duplicate exists in the commit before round 3
as well, so round 3 did not introduce it — the guarantee was simply never true.

A consumer counting error events double-counts every arming failure. It belongs to S2, which owns
`Probe.ts` and already carries the arming and error-path work.

## The third round's design decision, endorsed

The audit ruled the fixed resident set plus one recycled slot the right bound: it preserves declared
projects, admits an undeclared one without letting caller strings grow resident memory, and gives
repeated use of one undeclared project locality. It measured the cost the round predicted —
alternating two undeclared projects rebuilds a service each time at 432-573 ms — and ruled it
acceptable for an exceptional path provided it stays documented, because it is caller-driven CPU work.

It refused a least-recently-used cap for the reason the round gave, and refused rejecting undeclared
projects because that removes an admitted capability.

## Added to S6 by the Orchestrator's verification of unit 4b

**Unit S6 also owns `tests/src/bin/main.test.ts`, and its first act there is to rewrite one test.**

Unit 4b wrote `records the arming dependency leak when the entry is killed during boot`
(`tests/src/bin/main.test.ts` lines 166-197). It sends `SIGTERM` to the built entry mid-arming and
asserts the arming files that existed before the signal still exist after it:

```text
expect([...leaked].sort()).toStrictEqual(arming.sort())
```

That assertion makes the leak required rather than recorded, and its name says the opposite of what it
asserts. The entry installs no signal handler — `src/bin/main.ts` is three lines and `grep -rn
"SIGTERM\|SIGINT\|process.on" src/` returns only an unrelated `child.once('exit')` in `LintStage.ts` —
so `SIGTERM` takes its default disposition and nothing cleans up. `SIGTERM` is catchable, so this is
repairable, which is exactly what S6 is for.

Leave the test in place until S6 runs. It is the honest record of current behavior and it is the
failing proof S6 needs: wiring shutdown reddens it, and that red is the evidence the repair works.

S6 must not read that red as a regression it caused. Rewrite the test in the same change to assert
what the repair makes true — the arming files are gone after the entry handles `SIGTERM` and exits —
and keep the pre-signal `expect(arming).toHaveLength(2)` step, which is what proves the files existed
to be cleaned up.

Unit 4b is not at fault here. Its brief was to prove the entry, it found behavior nobody had recorded,
and it recorded it rather than hiding it or quietly widening its scope to fix it.

## Added by the Orchestrator, 2026-08-19 — a systemic test-isolation defect no sweep finding covers

**Four server test files share one `tmp/probe/` directory, and `test:src` runs them in parallel.**

This is not one test's bug. It has now cost two units a repair round — unit 4b found it and fixed only
its own instance, and unit S1 hit it again while capturing its red baseline. Every remaining unit that
touches a server test will meet it. It is recorded here rather than in `seam-sweep-findings.md` because
no sweep lens found it: the sweep read source, and this lives in the interaction between the test suite
and the Vitest configuration.

**The mechanism, verified.**

```text
test:    npm run test:src && npm run test:policy && npm run test:config
test:src: vitest run ... --project src:core --project src:server --project src:bin
```

`test:src` runs three projects in ONE Vitest invocation, and
`grep -rn "fileParallelism|singleFork|singleThread|maxWorkers|sequence|isolate" vite.config.ts configs/`
returns nothing, so Vitest's defaults apply and files run in parallel workers.

Four files write into the same shared directory — `tests/src/server/stages/LintStage.test.ts`,
`TypeStage.test.ts`, `RuntimeStage.test.ts`, and `Probe.test.ts` — with paths like
`tmp/probe/runtime-passing.test.ts` and `tmp/probe/type-case-${id}.test.ts`.

`tests/src/server/Probe.test.ts:180` then reads that shared directory and asserts about its whole
contents. Run alone it passes. Run beside its siblings it sees their files. Tests that pass alone and
fail together, which is the signature.

**One thing that is NOT wrong, and is worth stating so nobody repairs it.** The `probe` Vitest project
includes `tmp/probe/**/*.test.ts`, which is exactly the pattern these tests write. It never collects
them, because `npm test` is `test:src && test:policy && test:config` and names no `probe` project. That
containment is deliberate and load-bearing — do not "fix" it by narrowing the glob.

**The repair, and why this shape.** `.claude/rules/tests.md` already rules it: assert the membership a
globbed set should have, not a total that a partly empty population satisfies. So a cleanup proof
asserts THE FILES THIS TEST CREATED are gone, never that the directory is empty.

Prefer that over disabling file parallelism. Serializing the server project would hide the defect and
cost every future run the wall-clock, and the assertion would still be wrong — it would just stop being
observably wrong.

Unit 4b's alternative, an owned scratch workspace linked to the real installed toolchain, is correct
where a proof needs a whole workspace rather than a few files. Both are acceptable; a directory-wide
emptiness assertion is not.

**Carrier.** Unit S1 owns `tests/src/server/**` and is hitting this now; it carries its own instances.
Any instance S1 leaves behind passes to unit S2, which owns `Probe.ts` and its test. Every remaining
brief carries this as a standing condition so no unit rediscovers it.

### Correction to the preceding entry — the collision is cross-project, not within `src:server`

Verified by reading both call sites, 2026-08-19. The earlier entry said four server test files collide
with each other. That is true and it is not the whole mechanism, and the difference decides whether a
repair works.

The worst collider is in a DIFFERENT project:

```text
tests/src/server/Probe.test.ts:268   const directory = fileURLToPath(new URL('../../../tmp/probe/', import.meta.url))
tests/src/bin/main.test.ts:134       cwd: ROOT
```

`Probe.test.ts` asserts that no file in the real workspace's `tmp/probe/` starts with `arm-` or
contains `.probe-`. `main.test.ts` spawns the built entry with `cwd: ROOT` — the real workspace — so
that entry arms and writes `arm-type-*` and `arm-runtime-*` into exactly the directory the assertion
is reading. `src:server` and `src:bin` are separate projects and `test:src` runs both in one Vitest
invocation, so they overlap in wall-clock.

Only the killed-entry test at `main.test.ts:220` takes an owned scratch workspace. Every other bin test
drives the entry in the real workspace.

**Why the correction matters.** `npm run test:src:server` passes and `npm test` fails, which is what
unit 4b saw and what unit S1 hit. A unit told "four server test files collide" fixes those four,
watches `test:src:server` go green, and ships something `npm test` still reddens. The filter prefixes
`arm-` and `.probe-` are generic to every probe instance, so they cannot distinguish this test's files
from any other test's.

**The repair is unchanged and now has a sharper reason.** Assert that the files THIS test created are
gone, identified by a token unique to this test — not by a prefix every probe instance writes. A
directory-wide filter on a generic prefix is the defect, whichever project writes the colliding file.

### Amendment to the correction — it fails within one project too, and a rival explanation is open

The correction above claimed the worst collider sits in a different project. That overstated what the
evidence showed. Minutes later `npm run test:src:server`, which runs `tests/src/server/**` and nothing
else, failed on the same assertion: `Tests 1 failed | 30 passed (31)`.

So both mechanisms are live. Within `src:server`, the server test files construct probes that arm into
the shared directory while `Probe.test.ts` asserts nothing there starts with `arm-`. Across projects,
`main.test.ts` adds an entry armed with `cwd: ROOT`. The cross-project path is real and it is not the
only one, and the repair — assert the files this test created, identified by a token unique to it — is
unchanged by which one fires.

**A rival explanation is NOT yet excluded, and it is the more serious one.** The assertion says no
arming file survives a destroy. Unit S1 rewrote the eviction. If its change broke arming cleanup, this
is a regression in the unit rather than a test-isolation defect, and reading it as a collision would
ship the regression with the test weakened to hide it.

The discriminating measurement is to run that one test file alone with no sibling running, and see
whether it passes. Nobody has run it. The Orchestrator deliberately did not: running a suite in the
live tree while a writing unit holds it would write into the same shared directory and manufacture the
collision being tested for, which is an instrument that creates its own result.

Unit S1 holds the tree and is isolating the failure now, so the measurement belongs to it. Until it
comes back, both readings are open and neither belongs in a brief as fact.

Recorded because a collision diagnosis is the comfortable answer here — it is already written down,
it explains the symptom, and it costs the unit nothing. That is exactly when a real symptom carrying a
wrong diagnosis gets accepted.

### Resolved — the rival explanation is excluded, and the writer was the unit's own new proof

Unit S1 isolated it and the answer is neither reading recorded above. Verified independently by the
Orchestrator from three angles that could each have disagreed.

**The writer.** S1's own new stdout proof, at `tests/src/bin/main.test.ts:74-98`, declares candidate
tests at `tmp/probe/wire-without-newline.test.ts` and `tmp/probe/wire-with-newline.test.ts`. Running
them makes the probe write revision files beside them, named `<test>.probe-<uuid>.ts`.

**The reader.** `tests/src/server/Probe.test.ts:293-297` filters that same directory for
`name.includes('.probe-')` and asserts the result is empty.

**Caught in the act.** The filesystem watcher recorded the exact collision while it happened:

```text
FILES /workspace/probe/tmp/probe/wire-with-newline.test.probe-00247c42-9c92-47f3-8566-65b95ba30a32.ts,
      /workspace/probe/tmp/probe/wire-with-newline.test.probe-30006217-0320-48d8-a955-ca8450573852.ts
```

Two live revision files, named exactly what the assertion's filter matches, present while the server
suite audited cleanup.

**The rival explanation is excluded.** S1's eviction rewrite did NOT break arming cleanup. These files
were being created by a concurrently running proof, not left behind by a destroy that failed to clean
up. That distinction is the whole question — one is a test-isolation defect and the other would have
been a regression shipping under a weakened assertion.

**S1's repair.** Isolate its spawned entry in an owned scratch workspace, keeping the same built binary
and linked toolchain, so the real process and real arming behaviour are preserved and only the
directory changes. That is unit 4b's pattern, arrived at independently.

**What stands from the earlier entries.** The generic-prefix defect in `Probe.test.ts` is real and
unrepaired: `arm-` and `.probe-` match every probe instance's files, so that assertion is a collision
waiting for the next test that writes there. S1 removed today's writer rather than the assertion's
weakness. The pre-existing collider at `main.test.ts:134`, an entry armed with `cwd: ROOT`, is also
still there. Unit S2 owns `Probe.test.ts` and carries the assertion repair.
