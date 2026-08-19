# Unit S3 — the lint stage survives its child's death

## Role and engine

`sol` — GPT-5.6 Sol, high reasoning effort. This is objective, constraint-heavy correctness work over
process lifetime and promise settlement, which is the engine's assignment.

## Objective

Make `LintStage` report its child's death instead of hanging on it, and make destroying a probe whose
Oxlint server already died a clean shutdown rather than a process kill.

## Context

Read before acting, in this order: `AGENTS.md`; `.claude/rules/names.md`, `typescript.md`,
`architecture.md`, `patterns.md`, `tests.md`, `quality.md`, `writing.md`; then this brief. No skill is
named for this unit.

Governing guide: `PROBE.md`, which lives in the ORCHESTRATOR's repository at
`/home/user/scaffold/PROBE.md`, not in your working directory. Read it there if your sandbox permits
the path; if it refuses, proceed without it — this brief carries every fact you need. `src/core/types.ts`
lines 306-311 document `ProbeInterface.destroy` as settling when every engine releases its resources.
That sentence is the contract two of these defects break.

The subject is `src/server/stages/LintStage.ts`, 305 lines. It drives Oxlint as a language server over
a child process, speaking LSP with `Content-Length` framing. Note that the package speaks two framings:
this stage's LSP to Oxlint, and the entry's newline-delimited JSON-RPC to the MCP client. Do not
conflate them.

Relevant methods, by line: `#destroy` at 82, `#document` at roughly 140-160, `#notify` at 191, `#send`
at roughly 196-203, `#fail` at roughly 290, `#exit` at roughly 300.

## Defects

### A — liveness is read from `exitCode` alone, so a signal-killed server hangs `prove` and `destroy`

`src/server/stages/LintStage.ts:89` and `:198`.

`grep -n 'exitCode\|killed\|signalCode' src/server/stages/LintStage.ts` returns exactly two lines:

```text
89:		if (child === undefined || child.exitCode !== null) return
198:		if (child === undefined || child.exitCode !== null) {
```

Both treat `exitCode !== null` as "the child is dead". Node leaves `exitCode` at `null` when a child
dies by signal and sets `signalCode` instead, so both sites read a signal-killed server as alive.

**This is reproduced, not inferred.** The Orchestrator ran it with a discriminating control:

```text
exit event      code=null signal=SIGKILL
child.exitCode  = null
child.signalCode= SIGKILL
GUARD exitCode !== null => false (false means the guard reads a dead child as alive)
write after death threw = false
CONTROL clean exit: exitCode = 3 signalCode = null
CONTROL guard exitCode !== null => true (must be true, or the guard never works at all)
```

The control is an ordinary `process.exit(3)`, drawn from outside the population the finding covers. It
returns `exitCode = 3`, so the guard detects that death correctly. The guard works; it works only for
the exit path.

The `write after death threw = false` line is the reason this hangs rather than errors. Writing to the
dead child's stdin does not throw, so the guard is the only thing that could report the death. When it
reads false, the write silently succeeds against a dead pipe and no reply ever arrives.

Two consequences follow, and the fix owes a test for each.

- `destroy()` deadlocks. Line 89 does not return, line 90 registers a `shutdown` request, the write
  goes nowhere, the child's `exit` event already fired so `#fail` never runs again, and nothing settles
  that promise. `Probe.#destroy`'s `Promise.all` therefore never settles either.
- A later `prove` hangs. `#document` registers its resolvers, `#notify` silently succeeds, no
  `publishDiagnostics` arrives, nothing calls `#fail`. Only the runtime leg is deadlined, so the lint
  leg of the coordinator's `Promise.all` waits forever. A killed linter produces neither a verdict nor
  an error.

`#exit` already knows the difference — it formats `signal ${signal}` when `code === null`.

### B — an orphaned document promise ends the host process on destroy

`src/server/stages/LintStage.ts:148`.

`#document` registers the document in three maps inside the promise executor (lines 144-146), calls
`#notify('textDocument/didOpen', ...)` at line 148, and attaches cleanup only at line 156 via
`return diagnostics.finally(...)`.

When the child has already exited, `#send` throws at line 199 and that throw escapes `#document`
before the `finally` is ever attached. The three map entries stay. The `diagnostics` promise is left
pending with no handler, kept alive by the `resolve`/`reject` closures stored in `#publishes` and
`#refusals`. Nothing recycles the lint stage — `Probe.#recycle` replaces only `#runtime` — so every
subsequent `prove` repeats it.

The leak then becomes a kill. `destroy()` reaches `#destroy` line 88, which calls `#fail`, which
rejects every entry in `#refusals`. Each orphan rejects with no handler attached, so Node raises
`unhandledRejection` for each and terminates the host. Tearing down a probe whose Oxlint server died
earlier kills the process instead of shutting it down.

Note the interaction with defect A: fixing A changes when B triggers but does not fix B. A correct
liveness read makes `#send` throw in more cases, not fewer, so B gets easier to reach. Fix both.

### C — `child.stdin` carries no error listener

An `EPIPE` from a write racing the child's death becomes an uncaught exception in the resident host
rather than a stage fault the coordinator could recycle around. The probe above shows the ordinary
post-death write does not throw synchronously, so this is the asynchronous stream-error path, which is
a different door to the same room.

### D — the cleanup handler throws and replaces the real diagnosis

When the child dies mid-inspection, the `didClose` cleanup at line 157 calls `#notify`, which reaches
`#send`, which throws. That throw replaces the real error — the exit code and signal, which are the
only evidence of why the stage stopped — with a generic "not running" message, and `#documents` is
never pruned because the deletes at 158-160 sit after the throwing call.


## Also yours — C4, a false red the completeness critic found after this brief was written

**This is not one of the four defects above. It is a correctness defect, and it is the most consumer-
visible one in the file.**

`src/core/types.ts:30` calls `Source.path` "workspace-relative path the stages resolve the text
against". `src/server/stages/LintStage.ts:169-177` discards the declared filename and synthesizes
`tests/probe-<uuid>.ts` for every candidate outside `src/**` and `app/**`:

```ts
const [axis, environment] = declared.split('/')
const directory =
    (axis === 'src' || axis === 'app') && environment !== undefined && environment !== ''
        ? `${axis}/${environment}`
        : 'tests'
return resolveWorkspaceFile(this.#workspace, `${directory}/probe-${randomUUID()}${extname(declared)}`)
```

Oxlint applies glob-keyed overrides from `.oxlintrc.json`. A synthesized name matches different globs
than the declared one, so the rule set diverges. Executed over two files with byte-identical content:

```text
tests/probe-0d1f.ts:1:8: error import(no-default-export): Prefer named exports
```

`sample.config.ts` reports nothing, because `.oxlintrc.json` exempts `*.config.ts` from that rule.

**So the probe reports a lint finding the real gate exempts.** A candidate that would pass the gate is
refused, which is a false red — and `Toolchain`'s own `@remarks` names preventing exactly this as the
reason that design exists.

Repair direction: preserve the declared basename in the synthesized path, so the overrides the gate
applies also apply here. Verify by driving two candidates whose only difference is a filename the
config exempts, and assert the probe's findings match what the workspace's own oxlint reports for the
declared name.

Criterion: a candidate whose declared path the workspace's lint config exempts from a rule does not
receive a finding for that rule. Assert both directions — the exempt path clean, and a non-exempt path
still reporting — or the test only proves the rule was disabled.


## The two high findings interact, and one repair widens the other

Verified by the Orchestrator before dispatch. Do not treat A and B as independent.

`#send` throws only when `child === undefined || child.exitCode !== null`. Defect A proves `exitCode`
stays `null` on signal death, so today a signal-killed child does NOT make `#send` throw — the write
goes to a dead pipe and the inspection hangs. That is defect A's symptom, and it is the reason defect
B's orphan path is not reached by that vector.

**Fixing A makes `#send` throw in more cases, which widens B's reachability.** Repair them together, and
write B's test against the post-A behaviour.

Two vectors were tested by reading and neither reaches B, so do not build your proof on them:

- A workspace with no Oxlint binary: `#inspect` opens with `await this.#warmth`, so a failed warm
  rejects the inspection before `#document` is called.
- A signal-killed child, for the reason above.

**The open question, which is yours to settle:** whether Oxlint exits with a CODE in practice — an
internal panic, a malformed configuration, a resource failure — rather than only by signal. That
determines whether B is reachable through shipped code or only hypothetically.

`.claude/rules/quality.md` fixes what each answer means. Reachable through shipped code: repair it now.
Reachable only through a hypothetical foreign implementation: document the obligation on the interface
that owns it and prove the documentation, rather than building coordination machinery against a
requirement nobody wrote down. Report which you found and the evidence.

You have a shell and you own the file, so you can instrument `#child` directly. That is the measurement
the Orchestrator could not take from outside.

## Scope

- **Owned**: `src/server/stages/LintStage.ts`, and `tests/src/server/stages/LintStage.test.ts` for the
  tests these defects owe.
- **Off-limits**: everything else. Specifically `src/core/**`, `src/server/Probe.ts`,
  `src/server/stages/RuntimeStage.ts`, `src/server/stages/TypeStage.ts`, `src/server/factories.ts`,
  `src/server/helpers.ts`, `src/bin/main.ts`, `guides/**`, `PROBE.md`, `package.json`,
  `vite.config.ts`, `configs/**`, and every dotfile.
- If a fix genuinely needs `src/server/types.ts` or `src/server/helpers.ts`, stop and report rather
  than reaching. A liveness fix that wants a shared helper is exactly the case to report.
- **Instruments**: write every throwaway instrument under `tmp/scratch/`, and delete it before you
  return. `tmp` is gitignored; a bare `scratch/` or a loose file at the repository root is NOT, so an
  instrument there enters the next commit if your run is interrupted before cleanup.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: do not commit, push, tag, publish, install a dependency, or run a destructive
  command. Do not add an npm package — the fixes here need none. Do not read, print, or copy a secret.

## Criteria

Every criterion owes a committed test, red before the fix and green after. Record the exact command and
both counts.

1. A `LintStage` whose Oxlint child was killed by signal reports that death rather than hanging.
   `stage.destroy()` settles, within a bounded time you assert rather than "eventually".
2. `stage.inspect()` against a signal-killed lint stage produces an error rather than hanging.
3. Destroying a lint stage whose child died earlier does not raise `unhandledRejection` and does not
   end the host. Assert this by observing the process, not by reasoning about handler attachment.

   **All three close at the STAGE level, in your own owned test file.** `src/server/Probe.ts` and
   `tests/src/server/Probe.test.ts` are off-limits, so do not write a criterion that needs `prove`.
   Drive `new LintStage(workspace)` directly and kill its Oxlint child by pid.
4. No orphan survives a failed `#document` call. Those three maps are ECMAScript private fields with
   no accessor, so assert the OBSERVABLE they produce rather than the fields themselves: after a
   `#document` call that failed because the child was dead, a later `inspect` on a live stage still
   returns a check, and `destroy()` settles without raising `unhandledRejection`. Do not add a public
   accessor so a test can read a private field — that widens the published surface to serve a test.
5. A stage whose child is alive still lints normally and still reports real findings. The fixes must
   not make every lint fail. `tests/src/server/stages/LintStage.test.ts` already has a test that proves
   this; keep it green.
6. When the child dies mid-inspection, the error the caller receives names the exit code or the signal,
   not a generic "not running".

## How to drive a signal death in a test

The stage owns its child privately, so reach it the way a real failure would: let the stage warm, then
kill the Oxlint process by pid from outside. `pgrep`/`ps` against the workspace, or the child's own pid
if you can reach it without breaking encapsulation, are both acceptable. Do not add a public accessor
to the stage purely so a test can reach the child — that widens the published surface to serve a test,
which this repository refuses. If you cannot drive it without one, stop and report; that is a design
question for the Orchestrator, not a scope call for you.

`.claude/rules/tests.md` bans mocks and framework spies for project-owned behavior. A real child killed
by a real signal is the real thing, so this is not an exception to that rule — it is the rule.

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

Perform this assignment directly. Spawn no subagent.

## Host facts your commands run under

- Working directory `/workspace/probe`. Nested process spawns are permitted.
- The whole-workspace `npm test` is safe and takes roughly three minutes.
- The `probe` Vitest project reads `tmp/probe/`, and several tests write there. Put any throwaway
  instrument in its own scratch directory, never in `tmp/probe`, or a sibling project's run will see
  your files and fail a directory-listing assertion. That collision is real and cost an earlier unit a
  repair round.
- A unit before you may have edited `tests/src/server/stages/LintStage.test.ts`. Read it as it is now
  rather than trusting any line number quoted for it.

## Where a throwaway instrument goes

Put it in `tmp/scratch/`, and nowhere else.

`tmp` is gitignored, so nothing there can enter a commit, and `.claude/rules/tests.md` forbids
committing a probe. `tmp/probe/` is gitignored too, and no gate selects the `probe` project that collects it — but sibling
projects write into that directory concurrently, so an instrument left there trips another project's
directory-listing assertion. Note the operational consequence: nothing collects `tmp/scratch/`, so an
instrument there runs as a plain `node` script rather than as a Vitest file. That is a deliberate
departure from `.claude/rules/tests.md` § Probes, taken because of the concurrent writes. A bare `scratch/` at the
repository root is NOT ignored — `git check-ignore` refuses it — so an instrument there walks into the
next commit.

Delete the instrument before you return, whatever it proved. If it settled a claim, promote it to a
real test in the mirrored location instead.

## Unknowns

Two things the Orchestrator does not know, named so you do not have to guess a plan around them.

- Whether defects A and C share one repair. If holding an explicit liveness boolean set by the `exit`
  handler also makes the `stdin` error listener redundant, say so and implement one mechanism. If they
  are genuinely two, implement two. Report which you found.
- Whether criterion 3 is drivable in-process or needs a child process. `unhandledRejection` terminates
  the host, so a test that triggers it in the Vitest worker may take the worker down rather than
  reporting. If it needs a spawned child, spawn one and say so in your report.

## Deviation contract

Stop and report when a fix needs an off-limits file, when two criteria contradict, when driving a
criterion needs a public API addition, or when a gate reddens for a reason your change does not
explain. Report expected, found, the exact command and its output, whether the work is done, and at
most one short hypothesis.

Where the conflict is ancillary — which test file a helper sits in, the order of two assertions — decide
it, record the decision, and carry on. Do not stop the unit over a detail you are equipped to settle.

## Output

Return exactly: **Files written**, **Validation**, **Acceptance evidence**, **Deviation**, **Decisions**.

Under **Validation**, name each gate you ran and its exit code. Under **Acceptance evidence**, give each
criterion its test name, and for each red-then-green proof the exact command with both counts. No
process diary.

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
