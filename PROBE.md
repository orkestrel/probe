# PROBE.md

> How an agent proves a thought in this repository, and the mechanism that makes proving cheaper
> than reasoning about it.

## Ruling

Add the two missing signals to the probe path this repository already has, as a vendored instrument
pair that copies the policy sweep. Write `tests/setupProbe.ts` and `tests/probe.test.ts` beside the
existing `tests/setupPolicy.ts` and `tests/policy.test.ts`, vendor both, and let the existing
`probe` Vitest project run them. That costs 2 new files and 7 edits, needs no resident process, no
socket, no daemon, and no new command, and it answers a probe with all three signals in a measured
4244 ms against today's 3874 ms for one signal.

Take residency through a Model Context Protocol (MCP) tool built on `@orkestrel/mcp`, never through
a daemon of our own. A resident service answers in a measured 337 ms against the instrument pair's
4244 ms, so residency is worth having; what makes the MCP form the right one is that the harness
owns the process, so the endpoint, the startup race, the stale socket, the reaping, and the client
process all stop being ours to write. Compose it as `createStdioServer(createMCPLegacy(mcp))`: the
undecorated server answers a harness's `tools/list` with `Invalid params: malformed modern request
metadata`, because the package dispatches by wire era.

Ship that engine as `@orkestrel/probe`, a layer 4 package depending on `@orkestrel/mcp` and
declaring `typescript`, `vitest`, and `oxlint` as peer dependencies. The peers are what make the
verdict trustworthy: the probe and the gate then read one installed compiler, so they cannot
disagree. They are also what makes the engine publishable at all, because those three are
development dependencies that scaffold's own published code may not import. Do not build it as a
single executable: an executable freezes a second toolchain, and this checkout already shows
`oxlint` declared at `^1.77.0` and installed at 1.78.0.

Do not build a one-shot command or a socket daemon. The command buys one second over the instrument
pair for a whole new surface, and the socket daemon is 40 ms slower per call than the MCP tool
while carrying a lifetime the harness would have owned for free.

Two warnings belong in the ruling rather than in a footnote, because each one sinks a design that
does not account for it. A warm service returns confident wrong answers about freshly edited
source, in both the type stage and the runtime stage, until it is made to revalidate every
dependency. And retiring the current probe project is a fleet campaign, not an edit: `src/core/compilers.ts:361-362`
and `:801-802` emit `test:probe` and the `probe` project unconditionally into every generated
workspace, and `tests/config.test.ts` uses `probe` as its own negative control at lines 131, 228,
and 234-236 while being vendored to 44 targets from `src/core/constants.ts:144`.

## What was built, and what it measures

The ruling above was written before the package existed. `@orkestrel/probe` now exists, and this
section records what it does rather than what it was expected to do. Where a measurement here
disagrees with a number earlier in this document, this section is the later reading.

The package publishes at 87.5 kB packed and 359.8 kB unpacked across 17 files, against the 118.9 MB
floor measured for the single-executable form this document rejects.

A harness reaches it as a Model Context Protocol server over stdio. Driven end to end from a spawned
child process, the journey works:

```text
handshake-era initialize -> {"name":"probe","version":"0.0.1"}
handshake-era tools/list -> prove
--- tools/call prove ---
probe 4e3d2dbf-ace3-431b-8a10-fb66e27d6def
toolchain typescript 6.0.3, oxlint 1.79.0, vitest 4.1.11
case type: 0 findings        case lint: 0 findings        case runtime: 0 findings
control type: 0 findings     control lint: 0 findings     control runtime: 1 finding
  tmp/probe/wire.test.ts:2 expected 4 to be 5 // Object.is equality
receipt probe:4e3d2dbf-...:runtime:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11
```

The transport speaks newline-delimited JSON. An earlier instrument framed its requests with
`Content-Length` headers, the way a Language Server Protocol client does, and hung; that was the
instrument rather than the server, and it is worth stating because the probe's own lint stage does
speak the header form to Oxlint.

Latency, measured warm against the built package:

| Measurement                             | Median     |
| --------------------------------------- | ---------- |
| Boot, including arming                  | 4392 ms    |
| One `prove`, six checks and a receipt   | 530-621 ms |
| One inspection, three stages concurrent | 264 ms     |
| The runtime stage alone                 | 187 ms     |

The type stage at 56 ms and the lint stage at 72 ms cost nothing observable, because they finish
while the runtime stage is still running. A `prove` is two inspections in sequence, the case and then
the control, which is where its half-second comes from.

Two of those numbers moved during the repair and are worth stating, because one prediction was wrong.
Arming gained a second control so it proves the type half of the staleness defect as well as the
runtime half, and boot was expected to roughly double as a result. It did not: 4392 ms against
4351 ms, because the type control rides hosts the runtime control already warmed and costs about
40 ms. The warm `prove` did move, from 492 ms to 530-621 ms, and that is the routed `project` adding a
scoped type check rather than anything arming did.

### What the build found that the design did not

Five hazards were reproduced during the design pass and are recorded as laws earlier in this
document. Building the package surfaced nine more, and the way they surfaced is the point: every one
of them was invisible to a green gate suite, and most were invisible to reading as well.

Two independent audit lanes and the Orchestrator's own measurement each found defects the others
missed. The lanes agreed on exactly one — that a failure during boot arming is an unhandled rejection
that ends the host process — and each found things the other two did not.

| Found by                 | Defect                                                                         |
| ------------------------ | ------------------------------------------------------------------------------ |
| All three                | A boot arming failure ends the host process instead of refusing service        |
| Measurement only         | The resident runner leaves every probe host exiting 1, from boot               |
| Measurement only         | A deadline expiry leaves the abandoned test, loop and all, in the checkout     |
| Design lane only         | A required contract field, `project`, is read by nothing                       |
| Design lane only         | Arming proves the runtime half of the staleness defect and never the type half |
| Design lane only         | The published bundle carries the whole development manifest                    |
| Design lane only         | The published declaration imports a value purely to spell a type               |
| Reading, after the lanes | The runtime stage never materializes the agent's candidate sources             |

One further defect was raised and then withdrawn, and the withdrawal is the lesson. The entry
appeared to orphan its linter child when a harness stopped it, raised from two processes seen in a
`ps` listing. Enumerating the server's own children by parent id rather than matching by pattern
settled it: the child exits when the server's stdin closes, the runtime stage's workers are threads
that die with their parent, and six seconds after `SIGTERM` nothing survives. Both orphans came from
the bin-test defect in the table. A pattern match had been asked a question about parentage, which it
cannot answer.

The last row is the largest, and it is a design question rather than a repair. `Case.files` is the
source an agent supplies without writing it to disk, and the three stages disagree about it in two
different ways.

The type stage overlays each candidate into a map its language-service host reads from. Only four of
that host's callbacks consult the map; `fileExists` and `directoryExists` go straight to disk. Since
TypeScript resolves a module specifier by asking `fileExists` down a candidate list, the overlay is
enough to typecheck a candidate's own text and not enough to make it importable. The runtime stage
consults nothing: it writes the test and runs it against the working tree.

| The claim's candidate             | Type stage                   | Lint stage | Runtime stage             |
| --------------------------------- | ---------------------------- | ---------- | ------------------------- |
| Replaces a file already on disk   | judges the agent's text      | judges it  | **runs the on-disk text** |
| Is a file that does not exist yet | **cannot resolve an import** | judges it  | **cannot resolve it**     |

Both rows are measured against the built package, not reasoned about. The second fails loudly and
issues nothing, which is survivable. The first has two outcomes, and which one an agent gets is
decided by whether its test happens to observe what it changed. The same candidate produces both:

```text
PROVE A  case: type=0 lint=0 runtime=0
PROVE A  RECEIPT: ISSUED  <-- for a candidate the runtime never ran

PROVE B  case: type=0 lint=0 runtime=1
PROVE B  runtime says: expected 'probe' to be 'CHANGED' // Object.is equality
PROVE B  RECEIPT: none
```

`PROVE A` is the ordinary refactor claim — "I changed this file and the tests still pass." Every stage
reports clean, the control fails where it declared, and a receipt is issued. `PROVE B` uses the same
candidate and asserts the change itself; the runtime reports the value still on disk, which is the
proof that `PROVE A`'s runtime evidence was never about the agent's code.

So a test that observes the change gets a **false red**: correct code reported as failing, no receipt,
misleading but self-limiting. A test that does not observe it gets a **false green with a receipt**,
and that is the common case, because most edits are refactors whose tests are meant to keep passing.

The receipt is what makes the second one serious. `computeReceipt` exists so a proof cannot be issued
unless the case is clean and the control failed where it said it would, which is what makes the
falsification law mechanical rather than advisory. Both conditions genuinely hold in `PROVE A`. The
token is issued honestly by its own rules, and it certifies runtime evidence about a program the agent
did not write.

That is the failure this document says the mechanism exists to prevent, wearing the shape its own
warning names — a warm service returning a confident wrong answer about source it has not caught up
with. It is worse than the stale-cache defects the design pass reproduced, because no revalidation
closes it: the runtime stage is not stale, it is reading a file the agent never claimed.

Closing it means serving candidates as virtual modules through the runner rather than writing them
out — the same overlay the type stage already applies, moved to the runner. The type stage's host also
needs `fileExists` and `directoryExists` to consult the overlay, which is measured: as shipped an
overlay-only candidate reports `Cannot find module`, and with those two callbacks changed the import
resolves.

The runner half took two attempts to establish, and the first was wrong. A plugin passed to
`createVitest` as a Vite configuration override never reaches the project that runs the test, because
that override merges into the root server only and every Vitest project builds its own:

```text
ROOT server has o9-marker   : true
project alpha  has o9-marker: false
project beta   has o9-marker: false
```

`RuntimeStage` always selects a project by name, so it would never consult such a plugin. The route
that works is to augment the target's own project definitions and pass them through `createVitest`'s
options instead, which is measured against a two-project configuration:

```text
R2 projects after override: alpha
   alpha has o9-overlay: true
R3 resolveId fired for the overlaid module: true
R3 test outcome: passed
```

The test asserted the overlay's value and passed while the file on disk was unchanged.

What the mechanism cannot decide is the shape, and that is what the design round rules on: whether a
candidate is keyed by its declared path or by a revision-suffixed identity, whether the overlay covers
the whole module graph or only direct imports, what happens to a candidate no stage ever loaded, and
what the verdict says when a target's project definitions cannot be augmented at all.

### The lesson worth keeping

Every defect in the table survived five green gates. The suite was green when the server always
exited 1, when a required field was read by nothing, and
when the runtime stage was judging a different program than its siblings.

That is the same argument this document makes for the probe itself, turned on the probe. Green gates
prove that nothing asked a question that failed. They do not prove that the right questions were
asked, and the cheapest way to find out is to run the thing and read what comes back.

## What is wrong today

Three facts describe the current probe path, each measured on 2026-08-18 in this checkout.

| Property      | Measurement                | Command                                                                               |
| ------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| Latency       | 3874 ms cold, 2751 ms warm | `npm run test:probe`                                                                  |
| Type checking | absent                     | a probe containing `const wrong: number = 'not a number'` runs and exits 0            |
| Linting       | impossible                 | `oxlint --config .oxlintrc.json tmp/probe/x.test.ts` reports `No files found to lint` |

The type gap is the serious one. A probe is the instrument an agent uses to settle a question about
behavior, and the current instrument accepts code that does not compile. The lint gap follows from
`.gitignore:11`, which ignores `tmp`; Oxlint honors version-control ignore files, and `--no-ignore`
does not change the result.

So today's probe delivers one of the three signals a developer gets from the gates, at a cost of
roughly 4 seconds per question.

## What the optimal design is, and what physics permits

The most aggressive design answers a claim with all three signals in single-digit milliseconds,
holds nothing on disk, isolates every probe from every other, and denies the agent any path that
skips it. Measurement moves three of those four from aspiration to fact, and bounds the fourth.

The following table records what each stage costs warm, and whether it needs a file to exist.

| Stage   | Cold              | Warm       | Needs a real file | Evidence                                           |
| ------- | ----------------- | ---------- | ----------------- | -------------------------------------------------- |
| Type    | 1198 ms           | 11–90 ms   | no                | `ts.createLanguageService` over a virtual snapshot |
| Lint    | 269 ms initialize | 1–5 ms     | no                | `oxlint --lsp` with `textDocument/didOpen`         |
| Runtime | 771 ms            | 243–290 ms | yes               | `createVitest` plus `runTestSpecifications`        |

Two stages are therefore diskless in the strict sense. The TypeScript `LanguageService` instance
reads a snapshot the host supplies from memory, and the Oxlint LSP process lints a document whose
Uniform Resource Identifier (URI) names a path that does not exist. Five virtual documents linted
correctly against `.oxlintrc.json` while `existsSync` reported `false` for every one of them.

The runtime stage is not diskless, and three independent attempts establish that rather than
assume it:

- A Vite virtual module resolved through a plugin fails with `Cannot find module '/@probe/v1.test.ts'`.
- A path-shaped identifier inside the project root, served entirely by a plugin and never written,
  fails with `Cannot find module '/home/user/scaffold/tmp/probe/__ghost__.test.ts'`.
- A file written to `/dev/shm` executes and resolves `@src/core`, because Vitest resolves through
  Vite while the worker still requires a real path.

A fourth measurement fixes where that file must live. A `/dev/shm` path fails type checking with
`Cannot find module 'vitest'`, because Node resolution walks upward from the file and tmpfs has no
`node_modules` ancestor. A project-rooted virtual path reports 0 diagnostics for the same source.

The consequence is the architecture: one claim, three resolvers, each given the path shape it
needs. The type stage receives a project-rooted virtual path that is never written. The lint stage
receives a virtual document URI. The runtime stage receives the one real file, and that file is the
only thing the mechanism writes.

## The certified prototype

A prototype holding all three stages warm answers a claim in a median of 337 ms, against 3874 ms
for the current path that checks one third as much. That is 11.5 times faster while returning three
signals rather than one.

The figures below come from 12 warm calls against one resident service holding a TypeScript
`LanguageService` instance, an Oxlint LSP process, and a Vitest instance. Every control behaved.

| Measure       | Warm                      |
| ------------- | ------------------------- |
| Type stage    | 57–83 ms                  |
| Lint stage    | 15–22 ms                  |
| Runtime stage | 259–346 ms                |
| Combined      | 315–440 ms, median 337 ms |

The runtime stage dominates, and it is the only stage that touches a filesystem. An earlier
prototype that spawned the Oxlint binary per call instead of holding the LSP process measured
614–651 ms, so the resident lint process accounts for roughly 280 ms of the improvement.

Ten controls certify the prototype, five run serially and the same five run concurrently. Each
control names the verdict it must produce, and a run where a control produces any other verdict is
a failed instrument rather than a passing mechanism.

| Control     | Types | Lint | Runtime |
| ----------- | ----- | ---- | ------- |
| `clean`     | 0     | 0    | pass    |
| `typeerr`   | >0    | 0    | pass    |
| `linterr`   | 0     | >0   | pass    |
| `testfail`  | 0     | 0    | fail    |
| `ALL-THREE` | >0    | >0   | fail    |

The `ALL-THREE` control is the one that matters most. A mechanism that stops at the first failing
stage hides the other two, and an agent reading such a result fixes one defect and believes it is
finished. All three stages must run and all three must report.

Sustained load shows no degradation. Twenty sequential probes on one warm process averaged 637 ms
across the first five and 644 ms across the last five, a drift of 7 ms, with a resident set size of
456 MB.

## Warm residency forces five laws

Residency is the entire performance argument, and residency is also what creates every correctness
hazard in this design. Each hazard below was reproduced, not predicted.

The first law is the one that decides whether the mechanism is worth building. A probe exists to
interrogate source the agent just edited, and a warm service answers about source it read earlier
unless it is made to revalidate. That failure is silent, it reports green, and it appears in both
the type stage and the runtime stage.

### Address every revision, and never reuse a path

A first measurement reused one file path and called `rerunFiles`. It reported 2–4 ms and reported
`pass` for a test asserting `expect(2).toBe(3)`. The same failing assertion at a fresh path through
`runTestSpecifications` reported `fail` in 270 ms.

Use `runTestSpecifications` with a fresh identity per revision. Never use `rerunFiles`.

### Revalidate every dependency, in both stages

A fresh identity protects the probe and nothing it imports. Both warm stages were measured against
a dependency mutated on disk between calls, and both returned a confident wrong answer.

The runtime stage, using a fresh test path every time and mutating one imported helper:

| Run | Helper content                 | Assertion          | Result | Reading             |
| --- | ------------------------------ | ------------------ | ------ | ------------------- |
| 1   | `ORIGINAL`                     | expects `ORIGINAL` | pass   | correct             |
| 2   | `CHANGED`                      | expects `CHANGED`  | fail   | stale graph         |
| 3   | `CHANGED`                      | expects `ORIGINAL` | pass   | serves stale source |
| 4   | `THIRD` after `invalidateFile` | expects `THIRD`    | pass   | corrected           |

The type stage, using a host that versions the probe and returns a constant version for every
dependency:

| Run | Dependency          | Probe expects | Diagnostics | Reading             |
| --- | ------------------- | ------------- | ----------- | ------------------- |
| 1   | `value: string`     | `string`      | 0           | correct             |
| 2   | `value: number`     | `string`      | 0           | serves stale source |
| 3   | same, host re-stats | `string`      | 1           | corrected           |

Run 3 of the first table and run 2 of the second are the same defect. The source on disk had
changed, the probe asserted the old behavior, and the warm service returned green. A probe daemon
that certifies a claim which is false against current source is worse than no probe, because the
agent carries a proven-wrong belief into everything downstream, and the proof is what persuaded it.

Two consequences follow, and the second is the one a designer misses.

Call `invalidateFile` for every workspace module whose modification time moved since the previous
call, and version every dependency snapshot the type host serves by its modification time. Neither
stage revalidates on its own.

Content addressing does not fix this. Deriving a probe's identity from the digest of its own bytes
makes two different probes distinct, and says nothing about the files they import. A probe whose
bytes never change, run twice around an edit to a helper, has one digest and two correct answers.
Identity solves collision; only revalidation solves staleness.

### Own the deadline outside the worker

An infinite loop is not contained. A probe running `while (true) {}` under `testTimeout: 2000`
never returned; the process reached the launch stage, never reached the result stage, and the
wrapper killed it at 100 seconds with exit code 124.

The cause is structural rather than a configuration error. Vitest enforces a test timeout inside
the worker, and a tight synchronous loop blocks the event loop that timer needs. A timeout
expressed in worker configuration cannot fire while the worker spins.

Give the coordinator an out-of-process deadline that kills and recycles a worker.

### Typecheck against the scoped project, never the root

The root `tsconfig.json` file is the wrong project for a probe, and using it makes the type stage
report green where the real gate reports red. One probe using `process.cwd` and `setTimeout`,
checked against both projects, produced this split.

| Project                          | Diagnostics | Message                      |
| -------------------------------- | ----------- | ---------------------------- |
| `tsconfig.json`                  | 0           | none                         |
| `configs/src/tsconfig.core.json` | 1           | `Cannot find name 'process'` |

The root project admits Node, DOM, and Vitest globals that the scoped projects remove, and `core`
is host-independent by the boundary rule in `AGENTS.md`. A core probe checked against the root
project therefore passes while the same code fails `npm run check:src:core`.

A probe carries two kinds of file, and they belong to different projects. The projects differ
exactly where it matters, which the following table records.

| Project                            | Includes        | `types`                                 |
| ---------------------------------- | --------------- | --------------------------------------- |
| `tsconfig.json`                    | everything      | `node`, `vite/client`, `vitest/globals` |
| `configs/src/tsconfig.core.json`   | `src/core/**`   | none                                    |
| `configs/src/tsconfig.server.json` | `src/server/**` | `node`                                  |

Check the probe's test file against the root project, because a test needs the Vitest and Node
globals the root project supplies. Check any candidate source file the probe carries against the
scoped project for its environment, because that is the project the real gate runs. A candidate
`core` file checked against the root project accepts `process` and then fails
`npm run check:src:core`.

### Arm the instrument at boot, against the failure that actually threatens it

Run a known-failing control at startup and refuse to serve any probe until that control has
reported red. This is the one enforcement mechanism in the whole design that cannot be talked
around, because its subject is the instrument rather than the agent, and it makes the law in
`.claude/rules/quality.md:61` mechanical instead of advisory.

Choose the control by the failure that threatens this service. A control asserting
`expect(2).toBe(3)` imports nothing, so it proves the runner can still report red and proves
nothing about the module graph — and staleness, not a broken runner, is the failure this design
spends most of its effort on. A service serving stale source passes that control on every boot
while returning wrong answers all session.

Arm with a control that imports a dependency the service mutates during arming, and require the
verdict to change when the dependency changes. That control fails when revalidation fails, which
is the failure worth refusing to start over.

## What isolation the runtime already provides, and what it does not

Vitest's per-file worker isolation covers more than expected and less than the wanted design. The
table records what a hostile probe achieved against a warm service.

| Hostile probe               | Outcome                                         |
| --------------------------- | ----------------------------------------------- |
| Module-level `throw`        | contained, reports `fail`, service survives     |
| Unhandled promise rejection | contained, service survives                     |
| Poisoning `globalThis`      | does not leak; the next probe reads `undefined` |
| Poisoning `process.env`     | does not leak; the next probe reads `undefined` |
| Infinite loop               | **not contained** — hangs the service           |
| Writing into the checkout   | **not contained** — the file appeared           |
| Binding a loopback port     | **not contained** — the listener bound          |
| Reaching the public network | **not contained** — DNS and HTTPS both answered |

Read that table as a boundary between two different kinds of isolation. Vitest's per-file worker
isolation covers module state, globals, and environment, and those need no new mechanism. It does
not cover capabilities. Central processing unit (CPU) exhaustion needs the out-of-process deadline.
Filesystem and network access have no in-process answer in Node, so either an operating-system
boundary supplies one or the limit is documented honestly rather than claimed away.

The wanted phrase "its own environment and isolated" therefore splits in two. State isolation
arrives with the runtime already. Capability isolation does not arrive at all, and no design in
this document delivers it.

Concurrency works and is bounded by hardware. Five concurrent probes completed in 1636 ms against
roughly 3100 ms serially, and each returned its own correct verdict with no cross-talk. That is
about 1.9 times faster rather than 5 times, because this container reports 4 processors.

## Transport: the watcher is fast and cannot answer

A watcher that picks up a file the agent writes is an appealing design, and its notice latency is
not the problem. Measurement puts `fs.watch` notice at 0–1 ms and a Unix socket round trip at
1.26 ms. Neither is a bottleneck beside a runtime stage that costs two orders of magnitude more.

The difference is the return channel. A watcher notices the write and has nowhere to put the
verdict, so the agent either polls for a result, which `AGENTS.md` forbids outright, or races a
result file. The agent's own tool call is already a synchronous request and response: it writes the
claim and reads the verdict on standard output in one action, and it pays 38–43 ms of Node startup
to do so.

Keep the warm service, which is the load-bearing half of the watcher intuition, and reach it with a
thin synchronous client rather than a watcher.

## Enforcement, stated honestly

The want is to remove the agent's option to skip proving. One tier of the three is real, and the
hook mechanisms that look like the other two were driven headless on Claude Code 2.1.234 and
measured rather than assumed.

**Make proving cheaper than reasoning. This tier is real and it is most of the value.** A 337 ms
answer against a 3874 ms one changes behavior more than any instruction does, and the current cost
is worse than that comparison shows: today an agent also writes a file, invents a path, and cleans
up afterwards. Removing those is the larger half of the improvement. Nothing measured here touched
this tier, and it is the only enforcement claim that survived attack.

**Make the verdict independent of the agent's prose. This tier is partly real, and its reporting
half is not.** Deriving the exit code from the result works: issue a receipt only when the claim
passes every stage and its negative control fails at the stage it names, which mechanizes
`.claude/rules/quality.md:61`. What does not work is the assumption that a hook then carries that
verdict to a person. A `Stop` hook's standard output on exit 0 and its standard error on exit 1
appear in neither the run result nor any channel outside the interactive transcript, which is
precisely the channel the reader does not watch. Any durable record must therefore be a file the
service writes, and the reader must go and read it.

**Deny the skip. This tier is not reachable, and three measurements say so.**

- A single write to `.claude/settings.json` disarms every hook, in session, with no restart.
  Rewriting the file to `{"hooks":{}}` mid-session stopped the `Stop` hook from firing at all.
  Every hook-based enforcement design shares this one point of failure, and the process being
  restrained is the process that can perform the write.
- A blocking `Stop` hook is advice, not a wall. A hook exiting 2 with a message demanding a probe
  did fire and did block, and the model then disputed the message in its own words as spurious or
  possibly injected feedback, and declined it.
- `.agents/orchestration.md` bars the mechanism independently. Its permission floor states that
  agents run to completion and that routine work is not gated behind approval prompts, so a
  blocking `Stop` hook is refused by this repository's own contract before its effectiveness
  matters.

Two hook facts do hold up, and they are worth keeping for what they actually are. A `PreToolUse`
deny fires even under `bypassPermissions`, which `.claude/settings.json:5` sets, and both
`PreToolUse` and `PostToolUse` fire for a subagent's tool calls. Those make a recorder possible.
They do not make a policeman possible.

State the conclusion plainly rather than shipping a mechanism that appears to close the gap: the
mechanism makes proving cheap, records what was proven, and cannot compel a proof. An agent that
intends to skip will skip.

## The surface

This section describes the surface of the resident option, which is option 4 in the implementation
costing that follows. The recommended first shipment needs none of it: an agent writes a specimen
into `tmp/probe/` with its ordinary file tool and runs `npm run test:probe`, and the two new
inspections report beside the run that already happens. The contracts below are what a claim looks
like once a resident service answers it.

The agent invokes one command, writes a claim to standard input, and reads a result from standard
output.

```sh
node .agents/probe/client.mjs prove
```

The result carries every stage, so no stage can mask another, and it carries a receipt only when
the claim passed and its control failed. Promotion is a separate explicit action that accepts a
receipt and writes the proven test into its mirrored path.

Define these contracts in a `types.ts` file before implementing them, per the Types Then Tests
Driven Development order in `AGENTS.md`. Every entity member takes one word, every collection is
readonly, and the result stores no pass flag because pass derives from the stage outcomes.

```ts
export type Stage = 'type' | 'lint' | 'runtime'

export interface Source {
	readonly path: string
	readonly text: string
}

export interface Case {
	readonly files: readonly Source[]
	readonly test: Source
}

export interface Control extends Case {
	readonly stage: Stage
	readonly reason: string
}

export interface Claim {
	readonly project: string
	readonly case: Case
	readonly control: Control
}

export interface Finding {
	readonly path: string
	readonly message: string
	readonly line?: number
}

export interface Check {
	readonly stage: Stage
	readonly elapsed: number
	readonly findings: readonly Finding[]
}

export interface Toolchain {
	readonly typescript: string
	readonly oxlint: string
	readonly vitest: string
}

export interface Verdict {
	readonly id: string
	readonly toolchain: Toolchain
	readonly checks: readonly Check[]
	readonly control: readonly Check[]
	readonly elapsed: number
	readonly receipt?: string
}
```

A `Verdict` carries the `Toolchain` it was produced by, and the receipt token repeats those three
versions. A receipt read away from its verdict still states which compiler, linter, and runner stood
behind it, so a proof cannot be quoted after the toolchain that produced it has moved on.

A `Finding` carries no stage of its own. It only ever appears inside a `Check` that already names
one, so a second copy is the duplicated label `AGENTS.md` refuses under `Derive state`. An earlier
draft of this surface gave `Finding` a `stage`, and the implementation was right to drop it.

The `control` field is what makes this surface different from a test runner, and it is not
optional. A claim arrives with the negative control that must break, and the `stage` field names
where it must break. The service issues a `receipt` only when every check on the claim is clean and
the control fails at its declared stage, which makes the law in `.claude/rules/quality.md:61`
mechanical rather than advisory. A probe that cannot state what would falsify it cannot be proven.

## Build the diskless pair first

The recommendation is to build the type and lint stages first, together, and the runtime stage
second. The intuition that runtime comes first is reasonable and the measurements contradict it.

The recommended implementation is this order made concrete. The instrument pair adds exactly the
type and lint inspections, and it adds them to a runtime path that already runs, so the first
shipment is the diskless pair and nothing else is rebuilt to get it.

Four facts decide the order.

- The runtime stage is the only one that already works. Its gap is latency. The type and lint
  stages do not exist at all, so their gap is capability, and capability outranks latency.
- The type and lint stages cost 72–105 ms combined against 259–346 ms for runtime.
- The type and lint stages need no file, no tmpfs, no cleanup, and no worker pool. They are a pure
  function of a code string, and every hazard involving a filesystem, a deadline, or a worker
  belongs to the runtime stage alone.
- Staleness is the one hazard both share, which is an argument for the same order rather than
  against it. Solve revalidation first in the stage where a wrong answer costs 80 ms to reproduce
  and the fix is a version function, then carry the solved problem into the stage where reproducing
  it costs a worker pool.

Resist one tempting version of this argument. An earlier draft of this document claimed every hard
defect belonged to the runtime stage, which was wrong: the type stage serves stale dependencies
exactly as the runtime stage does, and the measurement that proved it came after the claim. The
order survives, and the reason it survives is not the reason first written down.

Order of construction is not order of delivery. Ship all three stages in one release, and build the
part that cannot be silently wrong first.

If a single stage must go first, choose type checking. It catches the contract errors that dominate
in a types-first repository, and a probe whose types are wrong fails at runtime with a message
worse than the diagnostic it should have received.

## How simple is this to implement

Four shapes were costed. Propagation across the fleet is not weighed, because vendoring is what
this package exists to do; what is weighed is how much mechanism has to be written once and how
much of it can fail.

| Option                            | New files | Edits | Cold         | Warm    | Residency        |
| --------------------------------- | --------- | ----- | ------------ | ------- | ---------------- |
| 1. Vendored instrument pair       | 2         | 7     | 4244 ms      | none    | none             |
| 2. One-shot runner command        | 2         | 8     | 3182–3459 ms | none    | none             |
| 3. Resident service over a socket | ~6        | ~10   | ~2 s         | ~380 ms | ours to own      |
| 4. MCP tool on `@orkestrel/mcp`   | ~3        | ~5    | ~1.5 s       | ~340 ms | the harness owns |

Every cold and warm figure for options 1 and 2 is measured. Option 3's warm figure adds the
measured 337 ms service to the measured 38–43 ms client process boot and the measured 1.26 ms
socket round trip. Option 4's warm figure adds the measured 0.32 ms transport round trip to the
same service, with no client process to boot. The two cold projections are derived from the
measured initialization costs and are labelled as projections wherever they appear.

Two options are dominated and neither belongs in the choice.

Option 2 buys about one second over option 1 and costs a whole new command surface. It is also the
option that propagates worst: a new npm script lands in `package.json`, which
`src/core/Compiler.ts:174` treats as birth-owned, so `A birth-owned path is never compared` and the
script reaches new workspaces while never reaching the 44 that exist.

Option 3 is option 4 with more parts. Owning a socket means owning an endpoint path, a startup lock
against two clients racing to spawn one service, stale-endpoint recovery, a reaping story, and a
client process on every call. A harness-started MCP server has none of those, because the harness
starts exactly one and ends it with the session.

### Why the instrument pair is the recommendation

The decisive argument is design fit rather than latency: this repository has already solved this
exact problem once, and every hard part of the probe mechanism is a part the policy sweep already
ships.

- `tests/setupPolicy.ts` and `tests/policy.test.ts` are a vendored TypeScript instrument pair that
  runs inside a Vitest project in every target, against that target's own installed tools. All
  three instrument files are vendored at `src/core/constants.ts:142-144`.
- `tests/config.test.ts:591-601` already resolves `node_modules/.bin/oxlint` and `.oxlintrc.json`,
  spawns the binary with `--format json` against a scratch directory, and does it twice — once for
  a violations case and once for a clean case. The lint stage is a copy of that, not an invention,
  and it arrives with a control pair already written.
- `createPolicyScratch` at `tests/setupPolicy.ts:66` creates that scratch directory outside the
  repository. It is the mechanism that answers the gitignore refusal, and every target already has
  it.
- `tests/setupPolicy.ts:12` already declares `import * as ts from 'typescript'`. The vendored
  instrument already drives the TypeScript compiler, so the type stage has a precedent too.

So the lint stage has a vendored precedent, the type stage has a vendored precedent, the scratch
mechanism is vendored, the Vitest project exists, and the command exists. What is missing is the
type inspection over probe specimens and the file that runs both.

### The engine cannot be published, which decides where it lives

`typescript`, `vitest`, `oxlint`, and `vite` are declared only in `devDependencies`. Published code
under `dist/src` that imported any of them would name a dependency the package does not ship, so
the engine cannot live in `src/server` and be exported. `src/core` refuses it twice over, because
`.oxlintrc.json` denies every `node:` specifier there to keep core host-independent.

That leaves a vendored file, and the choice within vendoring matters. A vendored `.mjs` is
typechecked by nothing and linted by nothing, and it would be the file carrying the most logic. A
vendored `.ts` under `tests/` is typechecked by the root project, whose `tsconfig.json` declares no
`include` and excludes only `node_modules`, `dist`, and `tmp`. The instrument pair therefore lands
inside the gates rather than beside them, which is the same reason `tests/setupPolicy.ts` is a
`.ts` file.

The pair also escapes every law in this document except one. A fresh process cannot serve a stale
dependency, cannot leak state between probes, needs no eviction, and needs no boot arming, because
it has nothing warm to arm. Only the scoped-project law still binds. That is the whole minimalism
case, and it is the reason to start here even though 4244 ms is not fast.

Be honest about the two extra signals' price and about one hazard the pair leaves open. The two
inspections cost roughly 370 ms on top of the run that already happens. Nearly all of that is
refundable: `package.json:82` passes `--no-cache`, which a workbench does not need, and removing it
measured 2779 ms against 2508 ms across three runs each, a saving of about 270 ms. The open hazard
is the uncontained infinite loop, which behaves exactly as it does today, because only a
coordinator outside the Vitest process can hold that deadline.

### The socket daemon and the MCP tool are one design, not two

Options 3 and 4 differ in transport and in who owns the process. The engine is the same code and
carries the same obligations: both are resident, so both implement all five laws, and neither is
more accurate than the other. Choosing between them is choosing who runs the process.

| Concern          | Socket daemon                                                            | MCP tool                       |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------ |
| Process lifetime | ours: start, stop, reap, recover                                         | the harness starts and ends it |
| Second caller    | a startup lock, or two services race                                     | the harness starts exactly one |
| Endpoint         | a socket path, and a stale one to clean up                               | the process's own stdio        |
| Client           | a Node process per call, measured 38–43 ms                               | none                           |
| Agent's call     | a Bash command, with the quoting that implies                            | a tool call carrying JSON      |
| Portability      | a Unix socket path does not bind on Windows, where Node uses named pipes | stdio everywhere               |
| Warm transport   | 1.26 ms round trip, measured                                             | 3.08 ms round trip, measured   |
| Warm total       | about 380 ms                                                             | about 340 ms                   |

The socket is slower despite the faster wire, because its client pays process startup on every
call and the MCP server is already running. It also has five failure modes the MCP tool does not
have, and each one is code somebody writes and maintains.

So the socket daemon is dominated on latency, on machinery, and on portability. Nothing measured
here recommends it. Its only genuine advantage is reaching a caller with no MCP client at all, such
as a plain terminal or a continuous-integration job — and the instrument pair already serves that
caller through `npm run test:probe`, which is why the recommended pairing needs no socket.

### Use the fleet's own MCP package, and wrap it in the legacy decorator

`@orkestrel/mcp` version 0.0.17 publishes this capability, so building a second JSON-RPC
implementation inside this package is the duplication `AGENTS.md` refuses. Two facts price the
decision and one is a trap.

- The weight is 10 `@orkestrel` packages and 6.3 MB, measured by installing it into an empty
  project. It resolves with no unmet peer warning, because `router` and `server` are required peers
  that npm installs. Declaring it is a dependency decision that belongs to the user.
- The protocol overhead is 3.08 ms median warm, against 0.32 ms for a hand-written 12-line stdio
  server. That difference is 0.8 percent of one probe and is not a reason to hand-write anything.
- The trap: `createMCPServer` alone refuses a handshake, answering `initialize` and a bare
  `tools/list` with `Invalid params: malformed modern request metadata`. Compose
  `createStdioServer(createMCPLegacy(mcp))` and both eras answer.

### Which protocol revision this speaks, and why both

The current Model Context Protocol revision is `2026-07-28`, and it removed the handshake. Every
request now declares its own revision through the `io.modelcontextprotocol/protocolVersion` key in
`_meta`, `server/discover` replaces `initialize`, and the wire is stateless. `@orkestrel/mcp` calls
that era **modern** and implements it in the core server, so `createMCPServer` alone is not an old
server — it is a current-revision server that correctly refuses a handshake.

`createMCPLegacy` is not a compatibility shim over something dying. It is the interoperability path
the specification itself provides for revisions `2025-11-25` and earlier, whose defining feature is
the `initialize` handshake. Every named revision in that era, and the packages that speak it, are
what most clients ship today.

The decorator is **additive**, which is the fact that decides the design. A server driven over
stdio was measured in both shapes:

| Request                          | `createStdioServer(mcp)` | `createStdioServer(createMCPLegacy(mcp))` |
| -------------------------------- | ------------------------ | ----------------------------------------- |
| handshake `initialize`           | refused                  | answered                                  |
| handshake `tools/list`           | refused                  | answered                                  |
| modern `tools/list` with `_meta` | answered                 | answered                                  |
| modern `server/discover`         | answered                 | answered                                  |

So the decorated server speaks the current revision and the handshake era at once, and choosing it
is not choosing the past. Build a modern request with all three reserved keys —
`io.modelcontextprotocol/protocolVersion`, `io.modelcontextprotocol/clientCapabilities`, and
`io.modelcontextprotocol/clientInfo` — because a request carrying only the version key is refused
as malformed metadata by both shapes, and that refusal reads exactly like an unsupported era.

Use stdio because a harness spawns a local server as a child process and speaks JSON-RPC over its
pipes. Streamable HTTP is the transport for a remote server and wants a URL, a port, and the
`MCP-Protocol-Version` header; neither belongs in a per-workspace tool whose registration must be
one identical vendored row in 44 repositories.

### Give the engine its own package, because peers are what keep the verdict honest

Make the resident engine `@orkestrel/probe`, a fleet package at layer 4, rather than a vendored
file inside scaffold. The name is free on the registry. Its runtime dependency is
`@orkestrel/mcp`, which sits at layer 3, and it declares `typescript`, `vitest`, and `oxlint` as
peer dependencies.

The peer choice is the whole argument, and it answers a real defect rather than a preference. A
probe is worth running only if its verdict predicts the gate's verdict, and that holds only when
the probe and the gate read the same installed compiler. Peers give exactly that: one installed
copy in the target, used by `npm run check` and by the probe alike, so the two cannot disagree.
`BASE_DEV_DEPENDENCIES` already declares those three ranges and
`src/core/compilers.ts:1826` calls them "pinned by the shared toolchain, which every workspace
carries at one version".

Merging the engine into scaffold instead was considered and refused on two grounds. The dependency
sets barely meet: scaffold's runtime set is `console`, `contract`, `emitter`, `markdown`, and
`template`, while probe's is `contract`, `emitter`, `mcp`, `tool`, and `timeout`, so the overlap is
only the two packages every fleet member carries. More decisively, scaffold reaches all 44 targets
as a development dependency, so peers declared there would push a `typescript`, `oxlint`, and
`vitest` obligation onto every target and onto scaffold's own consumers, for a capability most of
them never call.

A package also solves a problem no vendored file solves. The engine cannot live in scaffold's
published surface, because `typescript`, `vitest`, and `oxlint` are scaffold's development
dependencies and published code may not import them. A vendored `.mjs` escapes that rule and pays
for it by being typechecked by nothing and linted by nothing. A package declaring those three as
peers may import them legitimately, so the engine becomes ordinary published source under its own
gates. That is the difference between a mechanism this repository can hold to its own standards and
one it cannot.

Its runtime dependencies are `@orkestrel/contract`, `@orkestrel/emitter`, `@orkestrel/mcp`,
`@orkestrel/tool`, and `@orkestrel/timeout`, the last carrying the coordinator-owned deadline that
the uncontained infinite loop needs. It declares no `@orkestrel/router` or `@orkestrel/server`
dependency of its own; those stay required peers of `@orkestrel/mcp` and enter through it, and a
second pin on either would install the two copies the catalog's own versioning rule exists to
prevent.

It takes `core`, `server`, and `bin`, mirroring `@orkestrel/mcp`, whose dispatch core sits in
`src/core` while its transports sit one layer out in `src/server`. The contracts, the claim shape,
the guards, and the two pure functions — the verdict formatter and the receipt computation — are
host-independent and belong in `core` by the boundary rule. The TypeScript service, the Oxlint
process, Vitest, revalidation, and the MCP composition are Node and belong in `server`. The `bin`
entry is the stdio server the harness launches.

Declare the peers as floors rather than carets: `>=6.0.0`, `>=1.77.0`, `>=4.1.0`. A ceiling is the
one thing a probe must never impose, because the probe's job is to run whatever the target's gate
runs, and a caret that refused a target's newer linter would make the probe the reason a workspace
could not upgrade. The measured drift — `^1.77.0` declared, 1.78.0 installed — is the mechanism
working rather than failing.

Do not fight the drift; report it. Resolve the three installed versions at construction, expose
them as `toolchain`, and carry that `toolchain` on every verdict, so a receipt names the toolchain
that issued it.

Keep all three peers required, never optional. An optional peer is a mechanism for shipping a
verdict with a stage quietly missing, which is exactly what the `ALL-THREE` control exists to
prevent. A verdict exists only when all three stages ran; a stage that cannot start throws a coded
error and the tool returns a tool error, so there is no empty check and no sentinel to misread.

Propagation is one row. `BASE_DEV_DEPENDENCIES` already carries `@orkestrel/guide`,
`@orkestrel/scaffold`, and `@orkestrel/test`, so `@orkestrel/probe` joins three siblings rather
than opening a new mechanism. Scaffold does not depend on probe: it emits the dependency row and
the `.mcp.json` registration, which is knowledge rather than a dependency, so no cycle appears in
the publish order.

Declaring the peers is not sufficient on its own, and the gap is worth closing at boot. npm installs
a missing required peer automatically, so a declaration does not prove that the copy the probe
loads is the copy the gate runs. Resolve all three from the target workspace root at startup, and
refuse to serve when that resolution disagrees with what the gate commands would load. A probe that
cannot prove it shares the gate's compiler is worth less than no probe, because it is believed.

Scaffold admits those three peers as of the peer-partition change, and it took neither of the two
paths this document first offered. `DEPENDENCY_NAME_PATTERN` did not widen. The gate partitions
`blueprint.peers` by the literal `@orkestrel/` prefix instead: a peer in that scope stays a
caret-pinned fleet peer, and every other peer takes `FOREIGN_NAME_PATTERN` and the new
`FLOOR_RANGE_PATTERN`, which admits only a canonical `>=X.Y.Z`. Partitioning by the prefix rather
than by a pattern match is what keeps a malformed reserved name on the fleet branch, where it
fails, instead of escaping into the wider door.

That change also closed a defect it would otherwise have opened. A peer overwrote the development
pin it shared a name with, so a `typescript >=6.0.0` peer replaced the shared `^6.0.3` in every
generated workspace. A peer now never overwrites a pin the merge already placed.

The externalization needed nothing: `vite.config.ts` reads `peerDependencies` from the manifest and
externalizes every name it finds.

### How you actually use it

Declare `@orkestrel/probe` as a development dependency of each package you work in, and add one
row to `.mcp.json`. Nothing else is a daily action: the harness starts the server when you open the
repository, and the agent gets a `prove` tool.

```json
{
	"mcpServers": {
		"probe": {
			"command": "node",
			"args": ["node_modules/@orkestrel/probe/dist/bin/main.js"]
		}
	}
}
```

Across the fleet neither step is manual. `BASE_DEV_DEPENDENCIES` gains one row beside
`@orkestrel/guide`, `@orkestrel/scaffold`, and `@orkestrel/test`, and `.mcp.json` is a `HOST_PATHS`
member that `repair` writes, so every target receives the dependency and the registration from a
scaffold release. A project outside the fleet does the same two things by hand.

A shared installation is technically possible and is still the wrong choice. The engine resolves
the toolchain from the working directory rather than from its own location, verified here: a module
placed under `node_modules` read the workspace's `typescript` 6.0.3, `vitest` 4.1.10, and `oxlint`
1.78.0 through `createRequire` against the project's `package.json`. So a globally installed probe
would find the right tools. It loses on two counts that matter more than the disk it saves. Its
registration would name a machine-specific path, which cannot be vendored to 44 repositories as one
identical row, and npm could not check its peer declarations, because peers are satisfied by the
consumer's tree and a global install has no consumer. The development dependency is the only form
whose `.mcp.json` entry is byte-identical everywhere.

Register `node node_modules/@orkestrel/probe/dist/bin/main.js` rather than the `probe` shim npm
writes into `node_modules/.bin`. That shim is a `.cmd` and `.ps1` pair on Windows, and an MCP client
spawns its server without a shell, which is the same trap the Oxlint resolution avoids.

The developer's own path does not change and does not need the server. `npm run test:probe` runs
the instrument pair over `tmp/probe/`, which is what a terminal, a continuous-integration job, and
anyone without an MCP client uses. Both paths call the same inspections, so they cannot drift into
disagreeing.

### Do not ship it as a single executable

`@orkestrel/sea` is real and light, and it is the wrong tool for this. Three measurements settle
it, and the first is fatal on its own.

- **A frozen toolchain stops predicting the gate.** The probe's value is that its verdict matches
  what `npm run check` and `npm run lint:check` will say. An executable carries its own compiler,
  and this checkout already shows the divergence: `BASE_DEV_DEPENDENCIES` declares
  `oxlint: '^1.77.0'` while the installed binary is 1.78.0. An executable built against one and run
  beside the other reports on neither.
- **Portability multiplies the artifact.** Oxlint is a native Rust binary with 19 platform-specific
  bindings; this host installed `binding-linux-x64-gnu` and `binding-linux-x64-musl`. One
  executable cannot carry all 19, so portability means one build per platform.
- **The size is not affordable.** A Single Executable Application's floor is the Node binary,
  measured at 118.9 MB on this host, before `typescript` at 24 MB, `oxlint` at 2.4 MB, and `vitest`
  at 2.2 MB. The dependency it would replace is 6.3 MB of packages. Only the 118.9 MB is a hard
  floor, because a Single Executable Application compresses its JavaScript payload, so read the
  rest as installed-content arithmetic rather than a final artifact size. The direction is not in
  doubt at any compression ratio.

The size arithmetic is not even the sharpest form of the argument. Work each stage against a
Single Executable Application and the design collapses into a dilemma. A bundled compiler can be
skipped in favour of the target's, resolved through `createRequire`, in which case the embedded
24 MB is never read and the executable carries dead weight. Or it can be used when the target's is
missing, in which case the probe answers from a compiler the gate does not run, which is the exact
failure the whole mechanism exists to prevent. An executable is therefore either useless or
dishonest, and its size only decides how expensive that is.

`@orkestrel/sea` remains the right tool for shipping a standalone program whose whole point is to
carry its own runtime. A probe is the opposite: its whole point is to borrow the target's.

### Start it with the harness, and warm it behind the reply

The harness starts the server, because `.mcp.json`, `.cursor/mcp.json`, and `.codex/config.toml`
are vendored and `.claude/settings.json:3` sets `enableAllProjectMcpServers: true`. This mechanism
is not theoretical here: `.mcp.json` registers `codex mcp-server` today and that server's tools are
live in this session.

Name the server `probe` and its tool `prove`, so a harness surfaces it to the model as
`mcp__probe__prove` — the server is the noun and the tool is the verb, and the agent's tool list
reads correctly with no gloss. `check` is refused because it collides with `npm run check` and with
the `Check` type, and `run` is refused outright by the fixed lifecycle vocabulary in
`.claude/rules/names.md`.

Warm the engines when the process starts, without making any reply wait for them. Warming begins at
construction and `prove` awaits it, so there is no `start` method to call: the harness owns the
process, and a restart is a new process rather than a second lifecycle to model. A server measured
this way answers `initialize` in 57.6 ms, finishes warming 3119 ms later, and answers the first
real probe in 222 ms. An agent's first probe never arrives in the first three seconds of a session,
so the cold cost lands where nobody is waiting.

One implementation detail decides that number, and it is easy to get wrong. Importing `typescript`
and `vitest` at module scope delayed the same `initialize` reply to 869 ms, because the runtime
loads them before the server can answer. Load them with a dynamic `import` inside the warmer, and
the reply drops to 57.6 ms.

Two further lifecycle rules follow from what was measured.

- A probe arriving mid-warm awaits the warm promise rather than starting a second one. Measured at
  T+0 the call answered correctly after 3346 ms, having waited rather than duplicated.
- Revalidate on every call, and the earlier defect stops reproducing. In the server shape, with a
  modification-time sweep calling `invalidateFile` on what moved, a dependency changed mid-session
  produced `pass`, then `pass` against its new value, then `fail` against its old one, in 257 ms
  and 334 ms. That is the sequence that returned a false green without the sweep.

The server stops with the session, because the harness owns it. A second client gets a second
process, and therefore a second warm engine at the measured 456 MB resident.

Register the installed path rather than a fetcher. Write the command as
`node node_modules/@orkestrel/probe/dist/bin/main.js`, never `npx -y @orkestrel/probe`: `npx`
resolves from its own cache, which is the one state in which the probe loads a copy the target did
not install, and the whole peer argument is that it must not.

### Reach the target's tools the way that survives Windows

Resolve every tool from the target's own `package.json`, and spawn the resolved file rather than
the shim. `node_modules/.bin/oxlint` is a symbolic link on this host and a `.cmd` and `.ps1` pair
on Windows, and `spawn` without a shell cannot execute the Windows form. Reaching for `shell: true`
re-introduces the quoting this repository already refuses.

The portable form was verified here: `createRequire` against the target's `package.json` resolves
`oxlint/package.json`, whose `bin` field names `bin/oxlint`, which is an ordinary JavaScript entry.
Spawning `process.execPath` against that file ran the linter and returned its report. The same
resolution is what guarantees the probe runs the target's linter rather than one of its own, so the
portability fix and the honesty requirement are the same line of code.

### The upgrade path does not change the inspections

Write the two inspections as exported functions in `tests/setupProbe.ts`. Option 1 calls them from
a test file. Option 4 calls the same functions from an MCP tool. Residency changes who holds them
warm, not what they do, so choosing option 1 now does not spend work that option 4 discards.

Take option 4 when a real journey shows agents avoiding a 4-second probe. That is the trigger, and
it is observable rather than a matter of taste.

### The edits, in order

Each edit names its file, and each sits at a point this repository already uses.

1. `tests/setupProbe.ts` — new. The two inspections plus their formatter, mirroring
   `tests/setupPolicy.ts`.
2. `tests/probe.test.ts` — new. Two control tests that must fail, then the population sweep over
   the specimens.
3. `src/core/constants.ts` — two `HOST_PATHS` rows, beside the three at lines 142-144.
4. `src/core/templates.ts:433-447` — the `probe` factory gains the gate file in its `include`.
5. `vite.config.ts` — the materialized copy of that template, which the `config` project compares.
6. `tests/config.test.ts:131` — the vendored expectation for the `probe` project's shape.
7. `.claude/rules/tests.md:92-117` — the probe law gains the two signals the path now carries.
8. `.claude/rules/workspace.md:152-155` — the probe project paragraph, which states that no gate
   selects the project.
9. `guides/scaffold.md` — parity for anything newly exported.

Nothing in that list is a new mechanism. Items 3 through 6 are the same four points every vendored
instrument already touches.

Three further edits are needed only if the `--no-cache` refund is taken, and each one exists
because the current command string is asserted rather than inferred.

- `package.json:82` and `src/core/compilers.ts:361-362` carry the command itself.
- `tests/src/core/compilers.test.ts:129-134` asserts the exact string, including `--no-cache`, and
  asserts that `npm test` does not contain `test:probe`.
- `src/bin/CLI.ts:744` and `:748` exempt `test:probe` and the `probe` project from the gate
  reachability check, and that exemption stays: the workbench is still not a gate.

`.claude/settings.json:72-73` already allows `npm run test:probe`, so the invocation needs no new
permission.

## Rejected

Each design below was considered and killed for the stated reason.

- **Keep `test:probe`.** It costs 2751 ms warm, does not typecheck, cannot be linted, and no gate
  reaches it.
- **A pure virtual module for the runtime stage.** Measured twice: the worker cannot resolve a
  specification that does not exist.
- **Writing the runtime file under `tmp/probe/`.** `.gitignore:11` makes it unlintable, and the
  directory then needs sweeping.
- **`npx oxlint` per probe.** 636–672 ms against 257–258 ms for the direct binary, and 1–5 ms for
  the LSP process that replaces both.
- **`rerunFiles` against a stable path.** It returned a false pass for a failing assertion.
- **A watcher that runs probes the agent writes.** Fast to notice and structurally unable to
  return a verdict without polling.
- **Vitest `isolate: false` for speed.** It buys 7 ms of the 228 ms runtime stage and gives up the
  module, global, and environment isolation that the same runtime already provides for free. The
  one measured hazard it introduces is the class this document spends the most effort closing.
- **A git worktree or container per probe.** Both discard residency, which is the entire
  performance argument.
- **Hand-rolling a Model Context Protocol (MCP) server inside this package.** Reachable, and still
  refused. A working stdio server handling `initialize`, `tools/list`, and `tools/call` measured 12
  lines and a 0.32 ms round trip using only `node:readline`, so the earlier reading that MCP was
  unreachable was wrong. It is refused because `@orkestrel/mcp` publishes the capability and
  `AGENTS.md` requires reusing a declared ecosystem primitive, and because the measured saving is
  2.76 ms on a call that costs about 340 ms.
- **A resident service over a Unix socket.** Dominated by the MCP tool on every axis measured:
  40 ms slower per call because its client boots a process, five failure modes heavier because it
  owns a lifetime the harness would otherwise own, and unable to bind on a Windows host where Node
  uses named pipes rather than filesystem paths.
- **A `scaffold` bin verb.** `src/bin/constants.ts:22-28` plus the type, options, parse, and
  dispatch sites make a new verb a five-file change for a mechanism that is not a workspace
  operation.

## Risks

Five hazards were reproduced during this design pass, and each carries a prescribed fix stated as a
law earlier in this document: the cache phantom, stale dependencies in the runtime stage, stale
dependencies in the type stage, the uncontained infinite loop, and the wrong TypeScript project.
Treat those as closed by the laws rather than as open risks, and treat each reproduction as a
regression test the engine owes.

The risks below stay open, ranked, and each names the cheapest probe that settles it.

1. **A probe holds full filesystem and network capability, and no fix is identified.** Reproduced:
   a probe wrote a file into the checkout, bound a loopback port, resolved DNS, and completed an
   HTTPS request. This is the one reproduced defect with no remedy inside Node. Determine whether
   an operating-system boundary available in every target environment bounds those capabilities
   without discarding residency.
2. **Vitest retains one result record per probe, without bound.** Reproduced over 150 probes: the
   count returned by `state.getFiles` was 50, then 100, then 150, tracking probes exactly. Resident
   memory itself is not the problem, because it plateaued rather than climbed — 259 MB, 264 MB, and
   236 MB at those three points, against 159 MB at start — and latency stayed flat at 228 ms,
   231 ms, and 228 ms with no wrong verdict in 150 runs. Evict each probe's result after returning
   it, and re-run this measurement over several thousand probes.
3. **The runtime stage's floor resists configuration, and the reason is not fully attributed.**
   Five pool configurations, six calls each, moved it very little.

   | Configuration               | Warm median |
   | --------------------------- | ----------- |
   | `forks` (default)           | 260 ms      |
   | `threads`                   | 228 ms      |
   | `threads`, `isolate: false` | 221 ms      |
   | `forks`, `isolate: false`   | 256 ms      |
   | `threads`, single thread    | 230 ms      |

   Disabling isolation saves 7 ms, which establishes that the floor is transform and module-graph
   work rather than worker startup. Take the `threads` pool for its 32 ms, and attribute the
   remaining 220 ms before assuming it is fixed.

4. **A `prove` pays the runtime floor twice, because the case and the control run in sequence.**
   Measured against the built package: one inspection runs its three stages concurrently at a median
   of 264 ms, the runtime stage alone is 187 ms of that, and a warm `prove` is 492 ms — two
   inspections back to back. The type stage at 56 ms and the lint stage at 72 ms cost nothing
   observable, because they finish while the runtime stage is still running.

   Running the case and the control concurrently would take a `prove` to roughly 264 ms. It is not
   free: `RuntimeStage` serializes its inspections through one resident Vitest, so this needs a
   second resident instance and the memory that costs. Measure that memory before taking it.

## Open questions

- Whether an operating-system sandbox available in every target environment can bound filesystem
  and network effects without discarding residency.
- Whether the mechanism belongs in the vendored `dist/host` surface, which
  `src/core/constants.ts:123-156` propagates to 44 target repositories, or stays in this repository
  until it has run for a while here. `src/server/index.ts` publishes a file-materialization surface
  today, so a resident service is not an obvious member of it.
- Whether to declare the fleet's published MCP capability as a dependency, which is the decision
  that turns the shell client into a tool call across all three harnesses.
- How to retire the current probe project without breaking the fleet. Two obstacles are measured
  and neither is optional: `src/core/compilers.ts:361-362` and `:801-802` emit `test:probe` and the
  `probe` project into every generated workspace, and the vendored `tests/config.test.ts` uses
  `probe` as its own negative control, throwing `The configured projects carry no probe control`
  when it is absent. Retirement is a scaffold release plus a 44-target propagation, which is the
  same shape as the campaign that preceded this document.
- What replaces the probe law in `.claude/rules/tests.md:92-117` and the probe project paragraph in
  `.claude/rules/workspace.md:152-155`, both of which describe the mechanism this ruling retires.
  Note while rewriting them that `npm run test:probe` exits 1 when `tmp/probe/` holds no file, so
  the script the law points at fails whenever an agent has cleaned up after itself.
