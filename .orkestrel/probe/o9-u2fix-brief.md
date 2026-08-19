# O9-U2fix — close the audit round's confirmed findings

## Role and engine

`sol` (GPT-5.6 Sol), reached as a direct `codex exec`. You are the engine reading this brief inside
your own CLI: perform the assignment directly and spawn nothing.

You wrote O9-U2. This is your own work coming back. The audit that found these was two independent
Opus lanes, blind to each other, and both returned `VERDICT: FAIL`. Their reconciliation is
`/home/user/scaffold/.orkestrel/probe/o9-u2-audit-reconciliation.md` — read it, including its
amendment, before you start.

## Objective

Close the eight repairs below. Each is confirmed; none is a judgment call you need to re-litigate.

## Context

`/workspace/probe`, branch `claude/probe-package`, on top of commit `81a7485` plus unit B1's test
repair. Read `AGENTS.md`, `.claude/rules/architecture.md`, `.claude/rules/names.md`,
`.claude/rules/typescript.md`, and `.claude/rules/tests.md` first. No skill is named for this unit.

### 1. A string-declared project silently disables the whole mechanism

`src/server/stages/RuntimeStage.ts:226` returns a string project untouched, so no overlay plugin is
installed and the run certifies against disk. This is the defect O9-U2 exists to close, alive on the
arm the unit did not augment.

The mechanism, from the installed bundle: Vitest's `resolveTestProjectConfigs` routes a string to
`configFiles`/`nonConfigDirectories` (`node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js:11338-11364`),
initializes those at `:11202-11215` with **no** `plugins` key, and `initializeProject` at
`:11115-11127` forwards only `options.plugins`, so the root `viteOverrides` plugin never reaches that
project's server.

The arm is declared, not hypothetical:

```text
$ grep -n 'type TestProjectConfiguration' node_modules/vitest/dist/chunks/reporters.d.DtoKVV2s.d.ts
3616:type TestProjectConfiguration = string | TestProjectInlineConfiguration | Promise<UserWorkspaceConfig> | UserProjectConfigFn;
```

`RuntimeStage` runs against the **probed** workspace's config, not this one, so any consumer using
glob-string projects reaches it. `#project` does not save you: it resolves by name against
`vitest.projects`, so the project still resolves and the check still comes back clean.

**Refusing loudly is acceptable; passing silently is not.** Detect that a selected project carries no
overlay plugin and return an `origin: 'instrument'` finding naming the unsupported shape, or reach
those projects by a mechanism that survives a config-file project. Choose, and say why in your report.

### 2. The query strip is wider than the problem it solves

`src/server/stages/RuntimeStage.ts:251` splits on `[?#]` and serves overlay text for the bare path.
Stripping `?v=<hash>` is correct. Stripping `?raw`, `?url`, `?inline`, and `?worker` is not: those are
transform selectors, and `enforce: 'pre'` puts you ahead of `vite:asset`, whose `load` turns
`./value.ts?raw` into a default-exported string (`node_modules/vite/dist/node/chunks/node.js:21352-21368`).
A test importing a covered path with `?raw` currently receives the candidate's TypeScript as module
code. The split also drops a real path segment for a file whose **name** contains `#`.

Compare the whole id first. Serve a query-carrying id only for an explicit benign set, and never for a
transform-selecting query.

### 3. `#destroy` releases the overlay only on the success path

`src/server/stages/RuntimeStage.ts:163-176`. `#overlay.clear()` is the last statement, after an
unguarded `unlinkSync` at `:164` and `await vitest.close()` at `:172`. Either can throw, and
`src/server/Probe.ts:293-302` says in this package's own words that teardown of a hung stage can
reject. Clear `#overlay` and `#modules` in a `finally`, and guard the per-file unlink so one failure
does not abandon the rest.

### 4. `#load` rescans and reallocates for every module in the graph

`Overlay.paths` rebuilds an array from its Map on each access (`src/server/Overlay.ts:30-32`) and
`#load` iterates it per module id (`RuntimeStage.ts:254`), while `Overlay.covers` (`:68-70`) already
normalizes internally. Key the overlay by normalized path so `#load` is a direct `text()` lookup with
no scan and no allocation.

### 5. `#invalidate` declares a contract the class never uses

`src/server/stages/RuntimeStage.ts:364` takes `readonly string[]`; both call sites at `:353` and `:357`
pass a one-element literal. Take a `string`. The method still earns its existence — it holds the
invariant that invalidating means both `invalidateFile` and `watcher.invalidates.add`.

### 6. Do NOT delete the `path === undefined` guard

An auditor called the guard at `:252` unreachable because `split` with limit 1 always returns one
element. True at runtime, and wrong as an instruction:

```text
$ grep -n 'noUncheckedIndexedAccess' tsconfig.json
13:		"noUncheckedIndexedAccess": true,
```

The destructured element is typed `string | undefined`, so the guard is what makes the file compile.
It may disappear as a **consequence** of repair 2 changing how you read the id. It is never removed on
its own.

### 7. Naming

- `#configuration` (`:235`) is a noun for an operation. `.claude/rules/names.md` fixes methods as
  verbs. Rename it for what it does to the project config.
- `#plugin()` (`:242`) is a single-use object literal with no branch, no state beyond the `this.#load`
  binding, and no narrower contract. It fails the wrapper test in `.claude/rules/architecture.md`.
  Fold its literal into its one caller.
- The plugin name strings at `:207` and `:244` use `orkestrel:probe-runtime-overlay[-projects]`. This
  repository names its Vite plugins `orkestrel-output-boundary` and `orkestrel-environment-boundary`
  (`configs/helpers.ts:383`, `:522`) — hyphen, no colon, no package segment. Match that, and name each
  for its job rather than by a `-projects` suffix; the two do unrelated work.

`#augment`, `#wrap`, and `#load` are earned as written. Leave them.

### 8. The class `@remarks` must be true after repair 1

`src/server/stages/RuntimeStage.ts:31-33` says construction "augments each configured project". After
repair 1 it must say what the code actually does, in the same words the code enforces. `RuntimeStage`
is a barrelled public export, so this sentence ships.

### 9. Tests

The three tests you added all declare their fixture project as an inline object. Add coverage for the
**function** arm — the shape this repository's own `vite.config.ts:195` ships, passing
`[srcCore, srcServer, srcBin, policy, config, probe]`, each an arrow — and for the **string** arm,
asserting whatever repair 1 decides.

If you change `src/server/Overlay.ts`, it needs `tests/src/server/Overlay.test.ts`, which does not
exist. Create it and cover the entity's own contract.

## What was withdrawn, so you do not build it

An earlier reconciliation prescribed refusing a concurrent second `inspect`. **That is withdrawn.**
`src/server/types.ts:86-94` already states the caller obligation explicitly, tells the caller to
serialize or admit through one queue per stage, and already names overlay state as shared by a
concurrent second call. `Probe` discharges it with `concurrency: 1`. Do not add a refusal, a
specification-to-overlay map, or any other coordination machinery for this.

## Standing conditions

- `tests/src/server/Probe.test.ts:571` drives two concurrent `probe.prove` calls through one probe and
  asserts eight lint opens. It is **off-limits and it is your constraint proof**: if it goes red, your
  change over-reached, and the repair is to narrow your change — never to touch that test.
- Four server test files contend over a shared `tmp/probe`. Re-run a timing failure alone before
  believing it, and report both readings.
- `npm run build` emits baseline API Extractor and CJS `import.meta` warnings. Expected; not failures.

## Unknowns

What `test:policy` and `test:config` report. `npm test` chains with `&&` and has been stopping at the
bin test, so those two projects have not run in recent memory. Unit B1 lands before you and unblocks
the chain. If either fails, that is **not yours**: report it under the deviation contract and stop.

## Scope

Owned: `src/server/stages/RuntimeStage.ts`, `src/server/Overlay.ts`,
`tests/src/server/stages/RuntimeStage.test.ts`, `tests/src/server/Overlay.test.ts` (new).

Report-only: `src/server/types.ts`, `src/server/Probe.ts`, `tests/src/server/Probe.test.ts`.

Off-limits: everything else.

Tools: Read, Grep, Glob, Edit, Write, Bash. You are the sole writer in the tree.

## Execution

Perform this assignment directly. Spawn nothing.

## Acceptance criteria

1. A workspace whose `test.projects` are strings either has its candidates served, or receives an
   `origin: 'instrument'` finding naming the unsupported shape. It never certifies clean with the
   candidate unserved. A test proves the chosen behaviour.
2. A covered path imported with a transform-selecting query does not receive candidate source as
   module code. A test proves it.
3. `#destroy` releases `#overlay` and `#modules` even when the unlink or the close throws. A test
   proves it.
4. `#load` performs no scan over `Overlay.paths`.
5. `#invalidate` takes a `string`.
6. The three naming repairs in item 7 are applied, and the plugin name strings match the form in
   `configs/helpers.ts`.
7. The class `@remarks` describes what the code does after repair 1.
8. `tests/src/server/stages/RuntimeStage.test.ts` covers the function arm and the string arm.
9. If `src/server/Overlay.ts` changed, `tests/src/server/Overlay.test.ts` exists and covers its
   contract.
10. `npm run format:check`, `npm run lint:check`, and `npm run check` each exit 0. These are not
    timing-sensitive, so they are criteria.

**`npm run build` and `npm test` are observations, not criteria.** Run them, report each command and
its exit code, and report both readings for anything you re-run alone. Your own exec is load, so a
whole-suite timing failure taken from inside it is a question rather than an answer, and the
Orchestrator takes the authoritative run once you exit. Do not chase a timeout in a file you do not
own, and do not weaken a test to make one go away.

## Deviation contract

Stop and report — expected, found, exact evidence, done or not done, at most one short hypothesis — if
a repair needs a file you do not own, if `Probe.test.ts` goes red, or if `test:policy` or
`test:config` fails. How you name a method, where a helper sits, and which benign query set you accept
are yours to decide, record, and carry on from.

## Review evidence

A code change: the actual diff and the actual gate output, both required.

## Output

**What you changed and why, per numbered repair**, **Files written**, **Red-then-green proofs** with
exact commands and both counts, **Validation** (each gate and exit code), **Counts**, **Anything
re-run alone with both readings**, **Deviation**, **Decisions**. No process diary.
