# Unit H1 — the workspace guard refuses contained files whose names begin with a dot-dot

## Role and engine

`builder` — the harness's cheap native tier. This unit is fully specified and taste-free: the defect is
measured, the corrected expression is given, and the criteria are mechanical. No design judgment is
delegated.

## Objective

Make `resolveWorkspaceFile` refuse exactly the paths that escape the workspace, and accept every path
that does not.

## The defect, reproduced

`src/server/helpers.ts:15-23`:

```ts
export function resolveWorkspaceFile(workspace: string, target: string): string {
	const root = resolve(workspace)
	const file = resolve(root, target)
	const path = relative(root, file)
	if (path.startsWith('..') || isAbsolute(path)) {
		throw new Error(`Path escapes the workspace: ${target}`)
	}
	return file
}
```

`path.startsWith('..')` is a bare prefix test. A contained file whose NAME begins with two dots produces
a relative path that begins with two dots, and the guard refuses it.

The Orchestrator ran both the shipped expression and the corrected one over the same nine targets
against `root = /workspace/probe`. Verbatim:

```text
DIFFER  "..hidden.ts"            probe=THROW pkgform=ok
DIFFER  "..config/value.ts"      probe=THROW pkgform=ok
DIFFER  "...weird.ts"            probe=THROW pkgform=ok
agree   "src/a.ts"               probe=ok    pkgform=ok
agree   "../outside.ts"          probe=THROW pkgform=THROW
agree   ".."                     probe=THROW pkgform=THROW
agree   "/etc/passwd"            probe=THROW pkgform=THROW
agree   "./a/../../escape.ts"    probe=THROW pkgform=THROW
DIFFER  ""                       probe=ok    pkgform=THROW
```

The five agreeing rows are the control, and four of them are genuine escapes drawn from outside the
population the defect covers. They agree, so the containment itself is sound and the correction does not
weaken it. Probe is strictly over-strict on three dot-prefixed names.

**The consequence is a false red.** A candidate declaring `..hidden.ts` is refused as escaping the
workspace, when it is an ordinary contained file. `PROBE.md`'s laws exist to stop the probe certifying
against source that is not what it claims to be checking; refusing source that is exactly what it claims
to be is the same failure from the other side.

## The correction

The form the Orchestrator measured as `pkgform`, adapted to keep the throw:

```ts
if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
```

`sep` comes from `node:path`, which this file already imports from. Do not import `resolveContained`
from `@orkestrel/test` — that package is a devDependency and this file is published runtime source
re-exported by `src/server/index.ts`, so importing it would promote a test-only package to a runtime
dependency. `AGENTS.md` forbids adding a dependency without an explicit user request.

## The empty target — rule on it, do not change it blind

The final row shows the shipped guard accepting `''` and returning the workspace root directory itself,
where the corrected form refuses it.

`src/core/validators.ts:57` is `isSource: Guard<Source> = recordOf({ path: isNonEmptyString, text: isString })`,
so `Source.path` cannot be empty through the wire guard and no shipped consumer reaches this row.

Decide whether the empty target is refused, and say which you chose and why. Both answers are
defensible: the workspace root is not a file, so refusing it is honest; and no consumer can reach it, so
changing it is unobservable. Whichever you choose, assert it, so the next reader finds the decision in a
test rather than in this brief.

## Context

Read before acting, in this order: `/home/user/scaffold/AGENTS.md`; `/home/user/scaffold/.claude/rules/`
`names.md`, `typescript.md`, `architecture.md`, `patterns.md`, `tests.md`, `quality.md`, `writing.md`;
then this brief. No skill is named for this unit. The governing guide is `/home/user/scaffold/PROBE.md`.

`guides/probe.md` DOES NOT EXIST. `guides/README.md` records it as "Not created", so there is no second
copy of any documented claim to keep in step. A later unit creates it. Do not create it here.

## Host facts your commands run under

- Working directory `/workspace/probe`. Nested process spawns are permitted.
- You are dispatched from a clean committed baseline as the sole writer. If `git status --porcelain` is
  not empty when you start, report that immediately rather than working around it.
- State every completion claim about your diff against the BASELINE COMMIT — `git diff --stat <baseline>..`
  is stable, `git status` is not.
- The whole-workspace `npm test` takes roughly three minutes. Use `npx vitest run tests/src/server/helpers.test.ts`
  during development.

## Scope

- **Owned**: `src/server/helpers.ts` and `tests/src/server/helpers.test.ts`.
- **Off-limits**: everything else. Specifically `src/core/**`, `src/server/Probe.ts`, all three stages,
  `src/server/index.ts`, `src/bin/**`, `guides/**`, `PROBE.md`, `package.json`, `vite.config.ts`,
  `configs/**`, and every dotfile.
- The owned list is sufficient and was counted, not recalled. `grep -rn "Path escapes the workspace" src/ tests/`
  returns exactly two lines: the throw at `src/server/helpers.ts:20` and one assertion at
  `tests/src/server/helpers.test.ts:64`, which uses `../outside.ts` — a genuine escape both forms refuse.
  The correction only ever accepts MORE paths, so no consumer of `resolveWorkspaceFile` can redden.
- Write any throwaway instrument under `tmp/scratch/` and delete it before returning. A bare `scratch/`
  or a loose file at the repository root is NOT gitignored.
- Do not commit, push, or install. Do not run tree-wide `format` or lint `--fix`.

## Execution

Perform this assignment directly. Spawn nothing.

## Deviation contract

Stop and report when the fix needs an off-limits file, when a gate reddens for a reason your change does
not explain, or when two criteria contradict. Report expected, found, the exact command and its output,
whether the work is done, and at most one short hypothesis.

Where the conflict is ancillary — which order the assertions sit in, what a local constant is called —
decide it, record it, and carry on.

## Naming

The unit label `H1` and the row labels in the measurement table are addressing for this brief only. Name
every test for the behaviour it proves, never for the brief that specified it.

## Acceptance criteria

Each closes using the owned files alone.

1. `resolveWorkspaceFile` accepts `..hidden.ts`, `..config/value.ts`, and `...weird.ts`, returning the
   absolute contained path for each.
2. It still refuses `../outside.ts`, `..`, `/etc/passwd`, and `./a/../../escape.ts` with the existing
   message. Assert BOTH directions in the test, or the test only proves the guard was removed.
3. A red-then-green proof: record the exact command and its failing output before the repair, and the
   same command green after.
4. You rule on the empty target and assert the behaviour you chose.
5. `npm run lint:check` and `npm run check` pass. `npx vitest run tests/src/server/helpers.test.ts` passes
   with a count you report.
6. The full `npm test` count is at least its baseline plus your new tests, with 0 skipped and 0 todo.
   Read the baseline from your own first run rather than from this brief.

## Output

Return exactly: **Files written**, **The empty-target ruling**, **Red-then-green proof** (the exact
command with both counts), **Validation** (each gate and its exit code), **Deviation**, **Decisions**.
No process diary. End with `git diff --stat` against the baseline, then the full `git diff`.
