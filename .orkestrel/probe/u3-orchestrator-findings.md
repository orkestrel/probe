# Unit 3 — findings the Orchestrator carries into the audit round

These are read from the working tree while unit 3 was still running. Each carries the run behind it.
The audit lanes rule on them alongside their own.

## O1 — a boot arming failure kills the host process

`src/server/Probe.ts:70` assigns `this.#warmth = this.#warm()`. `#warm` emits `error` and then
re-throws (`:118`). Nothing observes `#warmth` until `prove` (`:82`) or `#destroy` (`:201`). A
failure during arming is therefore an unhandled rejection before any caller exists, and Node's
default policy ends the process.

Reproduced in isolation:

```text
$ node warmth.mjs
entry-started
entry-listening
Error: arming failed
    at #warm ...
EXIT=1
```

The bin entry constructs a probe and never calls `prove`, so a workspace whose arming fails gets
exit 1 with a raw Node stack instead of the probe's own diagnostic.

Direction: observe the stored promise at construction so the rejection is handled, and keep the
stored promise rejecting so `prove` still reports the arming failure to its caller.

## O2 — instrument debris ships in the bin entry

`src/bin/main.ts` writes `probe-entry-started` and `probe-entry-listening` to stderr, and
`dist/bin/main.js` carries both. They were added to locate the criterion 4 hang. A Model Context
Protocol stdio server's stderr is what a harness surfaces as server log output, so these are
product, not scratch. Remove both.

## O3 — a public return type is spelled inline

`src/server/factories.ts:37` returns `ReturnType<typeof createStdioServer>`. `@orkestrel/mcp`
declares that return as an anonymous object type (`index.d.ts:385`), so there is no upstream name to
import and the `ReturnType` construction itself is correct. Its placement is not: `AGENTS.md`
requires a reusable or public type to be declared in `*/types.ts` before implementation. Name it
there and use the name in the signature.

## O4 — a double round-trip stands in for one spread

`src/server/factories.ts:31` writes `Object.fromEntries(Object.entries(compileSchema(CLAIM_SHAPE)))`.
The only thing it changes is the type: `compileSchema` returns `JSONSchema`, and `createTool`
declares `parameters?: Readonly<Record<string, unknown>>`.

```text
$ tsc --noEmit --strict schema-probe.ts
schema-probe.ts(3,7): error TS2322: Type 'JSONSchema' is not assignable to type 'Readonly<Record<string, unknown>>'.
  Index signature for type 'string' is missing in type 'JSONSchema'.
TSC_EXIT=2
```

The same probe's line 5 spreads and reports nothing, so `{ ...compileSchema(CLAIM_SHAPE) }` satisfies
the identical requirement in one allocation. The pair of calls is a superfluous wrapper.

## O5 — every probe host inherits a failing exit code from boot

The resident Vitest sets `process.exitCode = 1` on the host process when a run reports a failure, and
the probe never contains it. Arming deliberately fails a control, so this fires at boot, before the
probe has served a claim.

```text
$ node arm-exit.mjs
exitCode right after arming, before any user claim: 1
EXIT=1
```

It is not the user's control that does it. A claim whose control passes leaves the same value,
because arming already set it:

```text
$ node exitcode.mjs
exitCode at start: undefined
exitCode after a claim whose control PASSES: 1
exitCode after a claim whose control FAILS: 1
exitCode after destroy: 1
```

The Model Context Protocol server process therefore always exits 1, which a harness can report as a
crash, and any consumer embedding `createProbe` in its own tool inherits the same.

`RuntimeStage` owns the side effect, so `RuntimeStage` contains it. Reading the value before the run
and restoring it after works, and preserves the findings:

```text
$ node contain.mjs
bare inspect:      findings=1 exitCode=1
contained inspect: findings=1 exitCode=undefined
EXIT=0
```

## O6 — the bin test starts a real server inside the test worker

`tests/src/bin/main.test.ts` does `await import('../../../src/bin/main.js')`. That entry is listed in
the manifest's `sideEffects`, and importing it runs `createProbeServer(createProbe()).start()`. The
test therefore boots a real probe, spawns a real Oxlint child, boots a nested Vitest, and attaches a
JSON-RPC reader to the worker's stdio.

The test passes and hides all of it:

```text
$ rm -f tmp/probe/arm-*.ts && npm run test:src:bin
Test Files  1 passed (1)
     Tests  1 passed (1)
  Duration  3.72s
EXIT=0
$ ls -A tmp/probe
arm-7cce5711-26e5-4965-a2a5-c7ae3a745ef0.ts
```

Arming takes about 4.3 s and the worker is torn down at 3.7 s, so the leaked file is the arming
dependency abandoned mid-run. The assertion the starter test makes — that the entry exports nothing —
is true whether or not any of that happened.

Drive the entry as a spawned child process instead, which is what unit 4b already owes. No test
imports a side-effectful entry.

## Measured latency, for the record

Taken against the built `dist` in `/workspace/probe`, deadline 60 s.

```text
boot + first prove: 4351 ms   (arming is the whole of it)
warm prove x5:      median 492 ms, min 485 ms, max 505 ms
  case type 56 ms    case lint 72 ms    case runtime 245 ms
  control type 56 ms control lint 76 ms control runtime 258 ms
```

One warm `prove` returns a six-check verdict with a receipt in under half a second.

## The latency structure, measured

One inspection runs its three stages concurrently, and a `prove` runs the case inspection and then
the control inspection in sequence. Measured against the built `dist`, five runs each after warming:

```text
one inspection (three stages concurrent): median 264 ms  min 247 ms  max 296 ms
runtime stage alone:                      median 187 ms
```

So a warm `prove` at 492 ms is two sequential 264 ms inspections, and each inspection is the runtime
stage with the type and lint stages hidden underneath it. The type stage at 56 ms and the lint stage
at 72 ms cost nothing observable while the runtime stage runs.

Running the case and the control concurrently would take a `prove` to roughly 264 ms. It is not free:
`RuntimeStage` serializes its inspections through one resident Vitest, so concurrency there needs a
second resident instance and the memory that costs. Record this as an optimization with a measured
ceiling, not as a defect.

## O7 — a deadline expiry leaves the abandoned test in the checkout

Measured against the built package with a 6 s deadline and a synchronous infinite loop:

```text
after a normal prove, tmp/probe holds: []
deadline rejected as designed: The runtime stage exceeded 6000 ms
after the expiry, tmp/probe holds: [ 'leak.test.probe-de705c2b-4dfb-4be7-9f46-68b34de7d4e9.ts' ]
a later ordinary claim served: type=0 lint=0 runtime=0
after destroy, tmp/probe holds: []
```

`RuntimeStage.#inspect` removes the revision file in a `finally`, and that `finally` does eventually
run, so the file is gone after `destroy`. Between the expiry and the teardown it sits in the
consumer's checkout, and it holds whatever the claim held — in this measurement, an infinite loop.
The file matches the `probe` project's include glob, so a developer running `npm run test:probe`
during that window hangs on a stranger's abandoned test.

The same run settles two of the design lane's referrals. Recovery works: the later ordinary claim was
served correctly after the stage was replaced. And the leak is a window rather than a permanent loss.

## The harness journey, driven independently

The Orchestrator spawned the built entry and drove it over newline-delimited JSON, which is what the
Model Context Protocol stdio transport speaks. An earlier attempt framed requests with
`Content-Length` headers and timed out; that was the instrument, not the server.

```text
handshake-era initialize -> {"name":"probe","version":"0.0.1"}
handshake-era tools/list -> prove
--- tools/call prove ---
probe 4e3d2dbf-ace3-431b-8a10-fb66e27d6def (692.649617 ms)
toolchain typescript 6.0.3, oxlint 1.79.0, vitest 4.1.11
case type: 0 findings (141.13012200000048 ms)
...
control runtime: 1 finding (318.02681200000006 ms)
  tmp/probe/wire.test.ts:2 expected 4 to be 5 // Object.is equality
receipt probe:4e3d2dbf-ace3-431b-8a10-fb66e27d6def:runtime:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11
```

The journey works end to end. It also shows the raw-float elapsed values an agent reads, against
documented examples that read `(17 ms)`.

## O8 — the server entry orphans its children when the harness stops it

`src/bin/main.ts` calls `start()` and installs no signal handler. `createStdioServer` returns
`{ start(): void; stop(): void }` and `stop` is never called, and `Probe.destroy` is never called
either.

Observed rather than inferred. After the Orchestrator's wire run sent `SIGTERM` to the spawned entry,
its Oxlint child was still running ten minutes later, alongside a Vitest worker from the bin test:

```text
$ ps -eo pid,etime,cmd
12884  10:15  node /workspace/probe/node_modules/oxlint/bin/oxlint --lsp
29067  54:39  node ... /workspace/probe/node_modules/vitest/dist/workers/forks.js
```

A child spawned without `detached` is not reaped when its parent exits, so every harness restart of
the server leaks one Oxlint process and one Vitest worker set. Over a working session that
accumulates.

`src/bin/main.ts` is off-limits to both repair rounds as briefed. This finding needs an owner.

## Confirmed shape for the named server interface

`createStdioServer` returns an anonymous object, so the interface fix round 2 declares must match it
exactly:

```text
$ sed -n '385,388p' node_modules/@orkestrel/mcp/dist/src/server/index.d.ts
export declare function createStdioServer(mcp: MCPDispatcherInterface, options?: StdioServerOptions): {
    start(): void;
    stop(): void;
};
```

## O9 — the runtime stage cannot see the candidate sources

`Case.files` is the agent's virtual candidate source. Two stages honour it and one does not.

```text
$ grep -rn "\.files" src/server/
src/server/stages/TypeStage.ts:116:		for (const source of subject.files) this.#overlay(source)
src/server/stages/TypeStage.ts:121:			for (const source of subject.files) {
src/server/stages/TypeStage.ts:133:			for (const source of subject.files) {
src/server/stages/LintStage.ts:118:		for (const source of [...subject.files, subject.test]) {
```

`TypeStage` overlays every candidate into its virtual filesystem and typechecks each against its
scoped project. `LintStage` lints each one. `RuntimeStage` materializes only the test:

```text
$ grep -n "writeFileSync\|subject\." src/server/stages/RuntimeStage.ts
102:		const file = createRevisionFile(this.#workspace, subject.test.path, randomUUID())
106:		const project = this.#project(vitest, subject.test.path)
107:		writeFileSync(file, subject.test.text, { encoding: 'utf8', flag: 'wx' })
```

So a test that imports a candidate module the agent supplied as text, and that does not already exist
on disk, typechecks clean, lints clean, and fails to resolve at runtime.

That defeats the premise the design states. The whole point is that an agent proves source it has
only thought of; if the runtime stage can only run against code already committed to disk, the
runtime evidence covers a different program than the type and lint evidence.

Reading is enough to state the gap. It still owes a measured confirmation, which the Orchestrator
takes as soon as no writing unit owns the tree: a claim whose `files` carries one module and whose
`test` imports it, run through a real `prove`.

The remedy is not obvious and is a design question rather than a repair. The runtime stage would have
to materialize each candidate at its declared path, which collides with the real file already there
when one exists, and the collision has to resolve without corrupting the developer's checkout. Route
this to a design round rather than to a fix round.

### The seam a remedy for O9 would use

`createVitest` takes a Vite configuration override as its third argument, and the runtime stage
currently passes only two:

```text
$ grep -n "declare function createVitest" node_modules/vitest/dist/node.d.ts
125:declare function createVitest(mode: VitestRunMode, options: CliOptions, viteOverrides?: UserConfig$1, vitestOptions?: VitestOptions): Promise<Vitest>;
```

A Vite plugin whose `resolveId` and `load` serve the candidate text for a matching path is the same
overlay the type stage already applies, moved to the runner. It needs no new dependency, writes
nothing to disk, and keeps the diskless law the design states.

Three questions decide the shape and belong to a design round rather than to a repair:

- What happens when a candidate's declared path names a file that already exists. The overlay must
  win for that run without the developer's checkout ever changing.
- How the overlay interacts with the per-revision invalidation the stage already performs.
- Whether the overlay applies only to the modules the test imports directly, or to the whole graph.

## O8 is withdrawn — it does not reproduce

The Orchestrator raised O8 from two orphaned processes seen in `ps`. Tested directly, with the
server's own children enumerated by parent id rather than matched by pattern, it does not reproduce:

```text
server pid 15129 | children while armed:
15137 /opt/node22/bin/node /workspace/probe/node_modules/oxlint/bin/oxlint --lsp
matching processes anywhere while armed:
15137 /opt/node22/bin/node /workspace/probe/node_modules/oxlint/bin/oxlint --lsp

server alive after SIGTERM+6s: dead
matching processes anywhere 6s after SIGTERM:
  (none)
```

The Oxlint child exits on its own when the server's stdin closes, and the runtime stage uses the
`threads` pool, whose workers are worker threads rather than child processes and die with their
parent by construction.

The two orphans that prompted the finding came from somewhere else. One was a
`vitest/dist/workers/forks.js` worker, and the resident runner does not use the forks pool at all, so
it came from an ordinary suite run. Both trace to O6 — the bin test importing the side-effectful
entry, which booted a probe inside a Vitest worker that was then torn down abruptly. Repair round 1
closed O6, and these went with it.

A pattern match answered a question about parentage, which it cannot answer. Enumerating by parent id
settled it in one command.

E8 is struck from repair round 2. Adding signal handling now would be hardening against a defect no
measurement shows, and `AGENTS.md` refuses a capability added without a real consumer.

## O9, sharpened — and the dangerous half is a false green

Reading the type stage's language-service host changes the shape of O9. Only four host callbacks
consult the overlay map:

```text
$ sed -n '179,190p' src/server/stages/TypeStage.ts
getScriptFileNames: () => [...(this.#files.get(project) ?? []), ...this.#overlays.keys()],
getScriptVersion: (file) => this.#version(file),
getScriptSnapshot: (file) => this.#snapshot(typescript, file),
…
fileExists: typescript.sys.fileExists,
readFile: (file) => this.#overlays.get(file) ?? typescript.sys.readFile(file),
readDirectory: typescript.sys.readDirectory,
directoryExists: typescript.sys.directoryExists,
```

`fileExists` and `directoryExists` go straight to disk. TypeScript resolves a module specifier by
asking `fileExists` down a candidate list, so an import of a file that exists only as overlay text
fails to resolve. The overlay is enough to typecheck the candidate's own text, because
`getScriptFileNames` carries it, and not enough for anything to import it.

So the three stages disagree in two different ways, and the two scenarios need separating.

| The claim's candidate                | Type stage                    | Lint stage | Runtime stage             |
| ------------------------------------ | ----------------------------- | ---------- | ------------------------- |
| Replaces a file already on disk      | judges the agent's text       | judges it  | **runs the on-disk text** |
| Is a file that does not exist yet    | **cannot resolve an import**  | judges it  | **cannot resolve it**     |

The second row fails loudly, which is survivable. The first row is the dangerous one and it is a
false green: the type stage typechecks the agent's new text, the runtime stage runs the old text
still on disk, both report clean, and a receipt is issued. The verdict says the claim was proven when
the runtime evidence was about a different program.

That is the exact failure the design says this mechanism exists to prevent, wearing the exact shape
the design's own warning names — a warm service returning a confident wrong answer about source it
has not caught up with.

Both rows still owe a measured confirmation, which the Orchestrator takes when no writing unit owns
the tree. The instrument must cover both scenarios, not only the new-file one.

### Row two of the O9 table is now measured, and its remedy is one line

The type stage's host was reconstructed exactly as shipped, given an overlay for a candidate that
exists only as text plus a test importing it, and asked for diagnostics. Then the same host with one
callback changed.

```text
fileExists goes straight to disk (as shipped):
   Cannot find module '../../src/core/o9virtual.js' or its corresponding type declarations.
fileExists CONSULTS the overlay:
   no diagnostics — the import resolved
```

So the type stage's half of row two is confirmed, and closing it is
`fileExists: (file) => this.#overlays.has(file) || typescript.sys.fileExists(file)`. `directoryExists`
needs the same treatment for a candidate in a directory that does not exist yet, which this probe did
not exercise because `src/core` is real.

That does not touch the runtime stage, which is the harder half and the one carrying the false green.

### A latency consequence to measure after round 2

Repair round 2 adds a second arming control so arming proves the type half of the staleness defect as
well as the runtime half. Arming is the whole of the probe's 4351 ms boot, so a second control
roughly doubles it. Measure the new boot cost and correct `PROBE.md` § What was built, which states
the single-control number.

### The runtime half of the O9 remedy is proven feasible

A Vite plugin serving a candidate that shadows a file which really exists, run against this
workspace's own Vitest in an isolated project:

```text
src/thing.ts on disk:   export const LABEL = 'on-disk'
the overlay supplies:   export const LABEL = 'from-overlay'
the test asserts:       expect(LABEL).toBe('from-overlay')

 Test Files  1 passed (1)
      Tests  1 passed (1)
--- and the file on disk is untouched ---
export const LABEL = 'on-disk'
```

`enforce: 'pre'`, a `resolveId` that rewrites a `.js` specifier to its `.ts` source and returns the
path when the overlay holds it, and a `load` that returns the text. No disk write, no new dependency,
and the developer's checkout is not modified.

Both halves of the remedy are now demonstrated. What the design round decides is shape, not
feasibility.

## Repair round 2's wire evidence, taken by the Orchestrator instead

Round 2 failed its wire instrument five times with empty stdout and empty stderr, and spent much of
its budget isolating a fault in its subject. The subject is fine. The Orchestrator ran the
known-good instrument against round 2's own working tree and build:

```text
[stdout line] {"id":1,"jsonrpc":"2.0","result":{"capabilities":{"tools":{}},"protocolVersion":"2025-06-18","serverInfo":{"name":"probe","version":"0.0.1"}}}
INITIALIZE OK -> {"name":"probe","version":"0.0.1"}
[stdout line] {"id":2,"jsonrpc":"2.0","result":{"tools":[{"description":"Proves a claim with type, lint, and runtime evidence.","inputSchema":{…
TOOLS/LIST OK -> prove
```

The built module loads and carries its full surface, and the entry is one import and one call:

```text
$ node -e "import('dist/src/server/index.js').then(m => console.log('LOADED, exports:', Object.keys(m).length))"
LOADED, exports: 18
$ cat dist/bin/main.js
import { createProbe, createProbeServer } from "../src/server/index.js";
createProbeServer(createProbe()).start();
```

Round 2's own debug run printed `before-start after-start`, so construction reaches `start()`.

It is not a defect in `@orkestrel/mcp` either. That package's `StdioClientTransport` is documented as
"newline-delimited JSON-RPC over `stdin`/`stdout`", the same framing the working instrument uses, so
its client and server agree.

So criteria 5 and 6 of round 2's brief are closed on the Orchestrator's evidence rather than on the
unit's. The unit's remaining acceptance evidence — the routed project, the two arming controls, the
named server interface, the schema primitive, the bundled manifest, and the centralized manifest read
— still needs its report or independent verification.

The lesson is one the orchestration rules already state and this round paid for anyway: run the first
use of any client, flag, or framing in a throwaway probe before putting it inside a unit's acceptance
path. A unit that cannot tell its instrument from its subject spends its budget on the wrong one.

## A regression the Orchestrator reported and then refuted

While verifying repair round 2 the Orchestrator saw `arm-runtime-*.ts` and `arm-type-*.ts` left in
`tmp/probe/` and called it a regression of round 1's cleanup. It is not.

The instrument that found it did not start from a clean directory. Re-run cleanly, arming leaves
nothing, and neither does a deadline expiry:

```text
before construction: []
BOOT (construction to arm event): 4392 ms
immediately after arming: []
after destroy: []

after arming: []
expiry: The runtime stage exceeded 6000 ms
after expiry: []
after expiry + 3s: []
after destroy: []
```

The residue came from the Orchestrator's own earlier wire check, which sent `SIGTERM` to a spawned
server. That path does leak, and it reproduces every time:

```text
clean start: 0 files
mid-arming, tmp/probe holds: [ 'arm-runtime-0ea86759-….ts', 'arm-type-0ea86759-….ts' ]
after SIGTERM, tmp/probe holds: [ 'arm-runtime-0ea86759-….ts', 'arm-type-0ea86759-….ts' ]
```

So the real finding is smaller and different: **a probe killed during arming leaves its two arming
dependencies behind**, because the `finally` that removes them never runs. Boot is 4392 ms, so that
window is open on every server start. The files are inert text in a gitignored scratch directory and
nothing reads them, which is why this is low severity rather than a defect that blocks acceptance.

It is not the same as the withdrawn O8. That one claimed orphaned processes and did not reproduce.
This one reproduces every time and claims only leftover files.

Two lessons, both cheap and both paid for twice now. Start an instrument from a known-clean state or
it reports the previous run. And check a suspected regression against the change that supposedly
caused it before naming it one.

## Boot did not double

The prediction that a second arming control would roughly double a 4351 ms boot was wrong. Measured
after round 2: 4392 ms to the `arm` event, against 4351 ms with one control. The type control costs
about 40 ms because it rides the same warm hosts the runtime control already started.

A warm `prove` moved from a 492 ms median to 530-621 ms across three runs, which is the routed
project adding a scoped type check rather than the arming change. `PROBE.md` § What was built needs
the warm number corrected and the boot number left alone.

## O9 measured in full — both failure modes, one of them a false proof

Run against the built package at `32cfa1b`.

**Row two, a candidate that does not exist on disk.** Fails loudly and issues nothing:

```text
case type:    Cannot find module '../../src/core/o9candidate.js' or its corresponding type declarations.
case lint:    0 findings
case runtime: Cannot find module '../../src/core/o9candidate.js' imported from …o9.test.probe-….ts
receipt: NONE
```

**Row one, a candidate that replaces a file already on disk.** Two outcomes, decided by whether the
test happens to observe what the agent changed. Same candidate in both:

```text
PROVE A  case: type=0 lint=0 runtime=0
PROVE A  RECEIPT: ISSUED  <-- for a candidate the runtime never ran

PROVE B  case: type=0 lint=0 runtime=1
PROVE B  runtime says: expected 'probe' to be 'CHANGED' // Object.is equality
PROVE B  RECEIPT: none
```

`PROVE A` is the ordinary refactor claim — "I changed this file and the tests still pass." Every stage
reports clean, the control fails where it declared, and a receipt is issued. `PROVE B` uses the same
candidate and asserts the change itself, and the runtime reports the on-disk value, which is the proof
that `PROVE A`'s runtime evidence was never about the agent's code.

So the defect has two faces and both are real:

- The test observes the change: a **false red**. The agent's correct code is reported as failing at
  runtime, and no receipt is issued. Misleading, and self-limiting.
- The test does not observe the change: a **false green with a receipt**. This is the common case,
  because most edits are refactors whose tests are meant to keep passing, and it is precisely the
  claim an agent most wants to make.

The receipt is what makes the second one serious. `computeReceipt` was built so a proof cannot be
issued unless the case is clean and the control failed where it said it would, which makes the
falsification law mechanical. Both conditions hold in `PROVE A`. The token is issued honestly by its
own rules and certifies runtime evidence about a program the agent did not write.

That is the strongest argument for closing this before the package is published. A wrong answer an
agent can see is a bug. A proof token that says a claim was verified when its runtime evidence came
from different source is a mechanism working against the reason it exists.

## The O9 remedy's feasibility proof was insufficient, and the design lane caught it

The Orchestrator earlier recorded the runtime half of the remedy as "proven feasible" from a Vite
plugin serving an overlay. That proof used a single-project Vitest configuration, where a top-level
plugin belongs to the only project there is. The probe's configuration declares six named projects,
and `RuntimeStage` always selects one by name.

The subjective design lane read Vitest's source and ruled that `viteOverrides` merges into the root
server only, so a plugin passed that way would never be consulted by the project that actually runs
the specification. It marked the reading as needing a probe. It is right:

```text
ROOT server has o9-marker   : true
projects: alpha, beta
  project alpha  has o9-marker: false
  project beta   has o9-marker: false
```

So the earlier claim was wrong for this codebase, and the Orchestrator withdraws it. A single-project
fixture cannot answer a question about project servers.

### The route the lane proposed is proven, at the right fidelity

Augment the target's own project definitions and pass them through `createVitest`'s `CliOptions`
rather than through `viteOverrides`. Measured against a two-project configuration, with a real file on
disk shadowed by overlay text:

```text
R2 projects after override: alpha
   alpha has o9-overlay: true
R3 resolveId fired for the overlaid module: true
R3 test outcome: passed
```

The test asserted the overlay's value and passed while `t/thing.ts` on disk still read `on-disk`. So
`CliOptions.test.projects` overrides the config file's projects, the augmented definition carries the
plugin into the project server, the hook fires for the specification's imports, and the developer's
file is untouched.

R1, R2, and R3 from the design round's risk table are settled. The remaining risks — leakage between
claims, cost, per-project file-set perturbation, and the unreached-candidate rule's effect on real
claim shapes — are not settled and stay with the round.

The lesson is the one this campaign keeps paying for: a fixture that is simpler than the subject
answers a simpler question. The first proof was run against a configuration the probe does not have.
