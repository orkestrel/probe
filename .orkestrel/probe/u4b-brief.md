# Unit 4b — server and entry proofs

## Role and engine

`implementer` on GPT-5.6 Sol. You are the sole serial writer in `/workspace/probe`.

## Objective

Prove the server helpers, the three inspection stages, the coordinator, and the built entry against
the real toolchain. Every stage here drives a real TypeScript language service, a real Oxlint
process, and a real Vitest instance. Use no mock, no behavioral fake, no module replacement, no
framework spy, and no fake clock.

## Context

Read before acting, in this order:

1. `/workspace/probe/AGENTS.md` and every rule under `/workspace/probe/.claude/rules/` that governs
   the files you touch, `.claude/rules/tests.md` above all.
2. `/workspace/probe/src/server/types.ts` and `/workspace/probe/src/core/types.ts`, authoritative for
   these contracts.
3. `/workspace/probe/src/server/helpers.ts`, `stages/TypeStage.ts`, `stages/LintStage.ts`,
   `stages/RuntimeStage.ts`, `Probe.ts`, `factories.ts`.

No skill is named for this unit.

### The two defects that already happened here

Both were reported green by an earlier unit and were live. Each owes a regression guard, and each
guard must be shown red against the defect before it is accepted.

- **A resident service serves stale source.** A dependency file mutated on disk between two
  inspections must change the verdict. `RuntimeStage` closes this through `#revalidate`, which
  content-hashes the workspace and calls `invalidateFile` on what moved. `TypeStage` closes it
  through its snapshot versions. Prove both stages separately: inspect, mutate the dependency on
  disk, inspect again, and assert the second verdict differs from the first.
- **A gitignored path lints clean.** `tmp/` is gitignored, and Oxlint refuses a gitignored path,
  which reported zero findings for source that plainly violates a rule. Prove `LintStage` reports a
  finding for a test path under `tmp/probe/`, which is exactly where the coordinator's own arming
  test lives.

### The regression guards the repair rounds owe you

Two repair rounds ran between unit 3 and this one, each closing defects that a green suite had
hidden. Each closed defect owes a committed test here, because a fix with no test is a fix that comes
back. The repair rounds proved theirs with throwaway scripts they then deleted; you make them
permanent.

- The resident Vitest sets `process.exitCode` to 1 when a run reports a failure. Arming deliberately
  fails a control, so before the repair every probe host exited 1 before serving a claim. Prove
  `process.exitCode` survives arming and any `prove` untouched, and that a host which set a non-zero
  code keeps it.
- A deadline expiry left the abandoned revision file in `tmp/probe/` until `destroy`, holding whatever
  the claim held — in the measurement, an infinite loop that the `probe` project's glob would pick up.
  Prove `tmp/probe/` is clean immediately after an expiry, not only after teardown.
- A failure during arming was an unhandled rejection with no caller, which ended the host process.
  Prove a probe whose arming fails leaves the process alive and rejects `prove` with that failure.
- `destroy` waited behind an in-flight inspection in two stages and abandoned one in the third. Prove
  all three abandon.
- A probe killed during arming leaves its two arming dependencies in `tmp/probe/`, because the
  `finally` that removes them never runs. Reproduced every time. Prove the leak exists so a later fix
  has something to close, or prove it closed if a fix lands first. Do not claim the entry orphans a
  process: that was measured and refuted.
- Arming proved only the runtime half of the staleness defect. Prove it refuses when the type host
  serves stale source, as well as when the runtime does.

### One inherited test is vacuous

`tests/src/server/index.test.ts` carries a second assertion that iterates `Object.entries(entry)` and
asserts each value is defined. It passes over an empty population and can only fail if a module
exports a literal `undefined`, which no declaration here produces. `.claude/rules/tests.md` requires
an assertion that fails rather than passes when its population is empty. Replace it with one that
does, or delete it — the population assertion above it already pins the surface.

### What the two repair rounds changed under you

This brief was written against the pre-repair tree. Both rounds have landed and the surface moved.
Verified at commit `32cfa1b`:

```text
$ node -e "console.log(Object.keys(require('./dist/src/server/index.cjs')).length)"
18
$ grep -n "^export interface " src/server/types.ts
18:export interface StageInterface {
55:export interface WorkspaceManifest {
72:export interface ProbeServerInterface {
$ grep -n "inspect(" src/server/types.ts
29:	inspect(subject: Case, project?: string): Promise<Check>
```

Three consequences for what you write:

- The server barrel now publishes 18 runtime names. `readWorkspaceManifest` is the new one, and the
  population assertion in `tests/src/server/index.test.ts` already names it.
- A third repair round has since narrowed `StageInterface.inspect` back to one parameter and moved
  the optional `project` onto `TypeStage.inspect` alone, where it is real. Prove both paths on the
  class: a stage given a project checks against it, and a stage given none falls back to inferring one
  from the candidate's path. Do not reach the parameter through `StageInterface`; nothing does.
- That round also bounded the type stage's language service cache at the resident project set plus
  one recycled slot, because the caller's project string reaches the key. Prove the bound holds: many
  spellings of one project stay at one service, and a project outside the declared set does not grow
  it past that slot. Observe the private state without adding a public accessor — a debugger session
  reading private properties is the method the repair used.
- Arming now runs two controls, one for each resident host. Boot is 4392 ms and a warm `prove` is
  530-621 ms, measured. Size every timeout from those, not from the older 492 ms figure.

### The timeout constraint, already measured

The `src:server` project carries no `testTimeout`, so it runs at Vitest's five-second default:

```text
$ grep -n "testTimeout" vite.config.ts
136:				testTimeout: 15_000,
171:				testTimeout: 45_000,
```

Line 136 is `src:bin` and line 171 is `config`. Neither is `src:server`. `vite.config.ts` is a
scaffold content-owned file, so editing it reports as drift in `scaffold audit` and is reverted by
`scaffold overwrite`. It is off-limits to you.

Close this with a per-test timeout instead, which Vitest 4 accepts as an options object:

```text
$ sed -n '776,781p' node_modules/@vitest/runner/dist/tasks.d-DEYaIMIu.d.ts
interface TestOptions {
	/**
	* Test timeout.
	*/
	timeout?: number;
```

Write `it('name', { timeout: 60_000 }, async () => { … })` on every test that constructs a `Probe` or
warms a stage, and leave the fast tests at the default. Measure the real elapsed time of one warm
construction first and set the budget from that measurement plus explicit slack, not from a guess.

### Facts about the subject you would otherwise rediscover

- `Probe` warms at construction. `prove` awaits that warmth, so there is no `start` method and a
  second concurrent call waits rather than starting a second engine.
- Arming writes `tmp/probe/arm-<id>.ts` and removes it in a `finally`. `RuntimeStage.#inspect`
  writes a per-revision sibling test file and removes it in a `finally`. A test that terminates a
  probe process by force leaks both; a test that lets `destroy` run does not.
- `RuntimeStage.#project` refuses a path it cannot map to a real Vitest project, by design. The
  projects are `src:core`, `src:server`, `src:bin`, `policy`, `config`, and `probe`. Only
  `tmp/probe/**` and `tests/{src,app}/<environment>/**` map.
- `Probe.#inspectRuntime` owns the deadline outside the worker, so it expires against a synchronous
  infinite loop that an in-worker timeout cannot interrupt. On expiry it emits `expire`, destroys the
  hung stage, and installs a replacement.
- The built entry is `dist/bin/main.js`. `npm run build` produces it. It imports
  `../src/server/index.js`, so it runs only from inside `dist/`.

## Unknowns

- Whether `npm test` is green in your environment. The vendored `tests/config.test.ts` spawns Oxlint
  through a child process, and that spawn has failed under a restricted sandbox. That file is
  off-limits and is not yours to repair. Run `npm run test:src:server` and `npm run test:src:bin` for
  your own criteria, and report the `npm test` result separately with its exact failure excerpt so
  the Orchestrator can rule on whether it is environmental.
- The real elapsed time of a warm `Probe` construction in your environment. Measure it as your first
  step and report the number.

## Scope

- **Owned**: `tests/src/server/**` and `tests/src/bin/**`.
- **Read but do not edit**:
  `/home/user/scaffold/.orkestrel/probe/u3-orchestrator-findings.md` carries the measured evidence
  behind every regression guard above, including the exact commands and outputs.
- **Off-limits**: everything else. Specifically `src/**`, `tests/src/core/**`, `guides/**`,
  `tests/config.test.ts`, `tests/policy.test.ts`, `tests/setup*.ts`, `package.json`,
  `vite.config.ts`, `configs/**`, and every dotfile.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: do not commit, push, tag, publish, install a dependency, or run a destructive
  command. Do not add an npm package. Do not read, print, or copy any secret.

## Criteria

1. Every pure helper in `src/server/helpers.ts` has a test covering each of its branches:
   `inferTypeProject` for a `src` path, an `app` path, and the throw for a path that is neither;
   `inferTestProject` for `tmp/probe`, `tests/src/<environment>`, `tests/app/<environment>`, and each
   `undefined` branch; `inferDocumentLanguage` for `.tsx`, `.jsx`, `.js`, `.mjs`, `.cjs`, and the
   default; `createRevisionFile` preserving the extension and the directory, including a path with no
   extension; `parseContentLength`; `matchesWorkspaceModule`; `messageFromUnknown` for an `Error`, a
   string, and a value that is neither; and the four `resolveWorkspace*` helpers including their
   refusals.
2. `TypeStage` reports at least one finding for a candidate source file with a real type error, and
   none for a clean one.
3. `TypeStage` changes its verdict when a dependency the candidate imports is mutated on disk between
   two inspections, with no new stage constructed in between.
4. `LintStage` reports at least one finding for source that violates a real rule in the workspace
   Oxlint configuration, at a test path under `tmp/probe/`.
5. `RuntimeStage` reports a finding for a failing expectation and none for a passing one.
6. `RuntimeStage` changes its verdict when a dependency the test imports is mutated on disk between
   two inspections, with no new stage constructed in between.
7. `RuntimeStage` refuses a test path it cannot map to a real Vitest project, and the rejection names
   the path.
8. Each stage's `destroy` is idempotent: calling it twice returns without throwing, and the second
   call does not hang.
9. A `Probe` carries its resolved `toolchain` on every verdict, and those three versions equal the
   versions the workspace `node_modules` actually publish.
10. A `Probe` issues a receipt for a claim whose case is clean and whose control fails at its declared
    stage, and issues none for a claim whose control passes.
11. A `Probe` whose runtime inspection hits a synchronous infinite loop rejects within its configured
    deadline, emits `expire`, and then serves a subsequent ordinary claim correctly. Set a short
    deadline for this test so it does not spend the default thirty seconds.
12. `Probe.destroy` is idempotent, and `prove` after `destroy` rejects.
13. After a test that lets `destroy` run, `tmp/probe/` contains no file matching `arm-*` and none
    matching `*.probe-*`.
14. The built entry answers, over a real spawned child process on stdio, all four request shapes: a
    handshake-era `initialize`, a handshake-era `tools/list`, a current-revision `tools/list` carrying
    all three reserved metadata keys, and a `tools/call` of `prove`. The `tools/call` result carries
    the verdict as a raw text content block, not as a JSON-quoted string.
15. `npm run test:src:server` and `npm run test:src:bin` each exit 0 and report no skipped and no todo
    test.
16. `npm run lint:check` and `npm run format:check` both exit 0.
17. `npx tsc --noEmit --project tsconfig.json` exits 0.

For criteria 3, 4, and 6, record the failing proof before the passing one: state the exact command and
the failing count you observed against the defect, then the same command green. A regression guard
that never ran red does not bind to the defect it claims. Where the defect is already fixed in the
tree, produce the red by mutating the fix in your working copy, recording the red, and restoring it.

Name each test for the behaviour it proves. Never name a test for a criterion number in this brief.

## Execution

Perform this assignment directly. Spawn no subagent.

## Deviation contract

Stop and report when reality conflicts with the primary objective: a criterion you cannot close with
the owned files alone, a stage whose documented behaviour the code contradicts, or a defect in
`src/**` that no test in an owned file can work around. Report expected, found, the exact command and
its output, whether the work is done, and at most one short hypothesis. Do not improvise a fix in an
off-limits file.

Decide an ancillary question yourself and record it: which file a test group lives in, the order of
`describe` blocks, the fixture text a stage inspects, and the wording of a test name are yours.

## Output

Return exactly these five sections, and no process diary.

1. **Files written** — each path with a one-line statement of what it proves.
2. **Validation** — each command from criteria 15 through 17 with its exit code, plus the `npm test`
   result and its exact failure excerpt if it failed.
3. **Acceptance evidence** — for criteria 1 through 14, the criterion number and the name of the test
   that closes it. For 3, 4, and 6 additionally give the red command, its failing count, and the same
   command green.
4. **Deviation** — the contract above, or `None`.
5. **Decisions** — ancillary decisions you made, or `None`.
