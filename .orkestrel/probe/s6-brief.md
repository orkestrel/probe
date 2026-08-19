# Unit S6 — the entry owns its own shutdown

## Role and engine

`implementer` — Claude Opus 5, high reasoning effort. The defect is small; the design question is
where the lifecycle belongs on a published surface, which is API-shape work.

## Objective

Give the probe a shutdown it does not have, so a `SIGTERM` releases the resident hosts and removes the
temporary files they left, and so a contained fault is reported rather than discarded.

Two limits on that objective, both from measurement. The campaign WITHDREW the claim that the entry
orphans its child processes — they do exit — so the findings that stand are the leftover files and the
discarded faults. And the record measured `SIGTERM` only; nobody measured what a transport disconnect
does today. If you want disconnect handling in scope, measure today's behaviour first and report it,
rather than repairing a defect nobody has observed.

## Context

Read before acting, in this order: `AGENTS.md`; `.claude/rules/names.md`, `typescript.md`,
`architecture.md`, `patterns.md`, `tests.md`, `quality.md`, `writing.md`; then this brief. No skill is
named for this unit.

Governing guide: `PROBE.md`, at `/home/user/scaffold/PROBE.md` — the orchestrator's repository, not
yours. Read it there if your sandbox permits the path; if it refuses, proceed without it, because this
brief carries every fact you need.

The probe's own guide, `guides/probe.md`, DOES NOT EXIST yet. `guides/README.md` records it as
"Not created". So there is no second copy of any documented claim to keep in step, and no parity gate
covering this surface. A later unit creates it.

## The defect

`src/bin/main.ts` is three lines:

```ts
import { createProbe, createProbeServer } from '@src/server'

createProbeServer(createProbe()).start()
```

`grep -rn "SIGTERM\|SIGINT\|process.on" src/` returns NO match at all and exits 1. So the entry installs no signal handler and observes no
error. On `SIGTERM` the process dies with the default disposition: the resident TypeScript and Vitest
hosts are never destroyed, the Oxlint child is left to die on stdin close, and any temporary revision
or arming files under `tmp/probe/` stay on disk.

`SIGTERM` is catchable, so this is repairable rather than inherent.

## Where the lifecycle goes

`.claude/rules/architecture.md` fixes this: a runtime entry declares no module-scope constant and no
module-scope function. It imports what it needs and runs. So the handler cannot be written in
`main.ts` as a function, and `main.ts` must stay close to the three lines it is.

The lifecycle therefore belongs on the server surface. `createProbeServer` already returns a
`ProbeServerInterface` with `start()` and `stop()`, and `createProbe` returns a `ProbeInterface` with
`destroy()`. Shutdown composes those two.

**This is the unit's real design decision and it is yours to make.** Two shapes are plausible and you
choose between them on the repository's own laws, not on preference:

- The server owns it. `start()` installs the handlers and `stop()` removes them, so the entry stays
  three lines and any embedder gets the same behavior.
- A named lifecycle capability the entry composes, exported from the server barrel.

Rule the question on: single-word entity APIs, the minimal-public-API gate, and whether an embedder who
already has their own signal handling would be harmed by the surface installing one. State your ruling
and its reason in your report. If you conclude the surface must NOT install handlers unconditionally,
that is a legitimate outcome — say so and design the opt-in.

## The test that is already there, and what to do with it

`tests/src/bin/main.test.ts` contains `records the arming dependency leak when the entry is killed
during boot`. It sends `SIGTERM` to the built entry mid-arming and asserts the arming files survive:

```ts
expect([...leaked].sort()).toStrictEqual(arming.sort())
```

**That test is yours, and it is the failing proof for this unit.** It records today's behavior
honestly, and wiring shutdown will redden it. Do not read that red as a regression you caused — it is
the evidence your repair works.

Rewrite the assertion in the same change to prove what the repair makes true: after the entry handles
`SIGTERM` and exits, the arming files are gone. Keep the pre-signal `expect(arming).toHaveLength(2)`
step, which is what proves the files existed to be cleaned up; without it a test asserting an empty
directory passes when arming never started.

Rename the test to say what it now proves. A test named for a leak that asserts cleanup is worse than
either.

## Scope

- **Owned**: `src/bin/main.ts`, `tests/src/bin/main.test.ts`, `tests/src/server/index.test.ts` (its
  export set moves when your ruling adds an export), and whichever of `src/server/factories.ts` or
  `src/server/types.ts` your ruling requires, plus the matching test file for it. Name in your report
  which you took and why.
- Note before you rule: `start` and `stop` are implemented by an object literal that a dependency
  returns, not by a class this package owns. So "`start()` installs the handlers and `stop()` removes
  them" is not implementable in `factories.ts` alone. Either restate that option as the factory
  installing handlers at construction, or stop and report that the ruling needs a file you were not
  granted.
- **Off-limits**: `src/core/**`, `src/server/Probe.ts`, `src/server/stages/**`, `src/server/helpers.ts`,
  `guides/**`, `PROBE.md`, `package.json`, `vite.config.ts`, `configs/**`, and every dotfile.
- **Instruments**: write every throwaway instrument under `tmp/scratch/`, and delete it before you
  return. `tmp` is gitignored; a bare `scratch/` or a loose file at the repository root is NOT, so an
  instrument there enters the next commit if your run is interrupted before cleanup.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: do not commit, push, tag, publish, install a dependency, or run a destructive
  command. Do not add an npm package. Do not read, print, or copy a secret.

## Criteria

Every criterion owes a committed test, red before the fix and green after where a red state exists.
Record the exact command and both counts.

1. The built entry, sent `SIGTERM` during arming, exits and leaves no `arm-*` file behind.
2. The built entry, sent `SIGTERM` while idle after arming, exits cleanly and leaves none of the files
   its own run created — the `arm-*` and revision files it can name — in its scratch workspace's
   `tmp/probe/`. Assert that membership, never that the directory is empty; the standing condition
   later in this brief forbids a whole-directory assertion and this criterion must not contradict it.
3. The entry exits with a status that distinguishes a signalled shutdown from a fault. State what you
   chose and why; do not invent a convention the repository does not already have.
4. A fault the probe contains is observed rather than discarded. What "observed" means is part of your
   ruling — at minimum it must not vanish silently.
5. `src/bin/main.ts` still declares no module-scope constant and no module-scope function.
6. Shutdown is idempotent: two signals in quick succession do not produce a double teardown or an
   unhandled rejection.

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
- The built entry is at `dist/bin/main.js` and `npm run build` produces it. The entry tests drive the
  BUILT artifact, so rebuild after every source change or you are testing the previous version. This is
  the single easiest way to waste a cycle in this unit.
- The protocol and stderr tests drive a real pseudoterminal because they read framed stdout. The
  killed-entry test does NOT: it spawns the built entry on plain pipes, and it must keep doing so, or
  `child.kill('SIGTERM')` reaches a `script` wrapper instead of the entry. Do not move it behind a
  pseudoterminal.
- The `probe` Vitest project reads `tmp/probe/`, and sibling projects write there concurrently. The
  existing killed-entry test uses an owned scratch workspace linked to the real installed toolchain for
  exactly this reason. Keep that approach.

## Where a throwaway instrument goes

Put it in `tmp/scratch/`, and nowhere else.

`tmp` is gitignored, so nothing there can enter a commit, and `.claude/rules/tests.md` forbids
committing a probe. `tmp/probe/` is gitignored too but the `probe` Vitest project collects
`tmp/probe/**/*.test.ts`, and sibling projects write there concurrently, so an instrument left there
is collected by a gate or trips another project's directory-listing assertion. A bare `scratch/` at the
repository root is NOT ignored — `git check-ignore` refuses it — so an instrument there walks into the
next commit.

Delete the instrument before you return, whatever it proved. If it settled a claim, promote it to a
real test in the mirrored location instead.

## Unknowns

- Whether `SIGINT` deserves the same handling as `SIGTERM`. An MCP server under a client is usually
  terminated rather than interrupted, but a developer running it in a terminal sends `SIGINT`. Decide,
  and say why.
- How long teardown may take. Destroying resident TypeScript and Vitest hosts is not instant, and a
  client that sends `SIGTERM` then `SIGKILL` on a short timer will not wait. If you find teardown
  exceeds a reasonable budget, report the measured number rather than choosing a timeout silently.

## Deviation contract

Stop and report when a fix needs an off-limits file, when your ruling requires BOTH `factories.ts` and
`types.ts` rather than one, or when a gate reddens for a reason your change does not explain. Report
expected, found, the exact command and its output, whether the work is done, and at most one short
hypothesis.

Where the conflict is ancillary — a test's placement, the order of two assertions — decide it, record the
decision, and carry on.

## Output

Return exactly: **Files written**, **Validation**, **Acceptance evidence**, **Deviation**, **Decisions**.

Under **Decisions**, lead with your ruling on where the lifecycle lives and the law you ruled it on. No
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
