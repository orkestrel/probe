# O9 unit 1 — the `Overlay` entity and the type stage's adoption

## Role and engine

`implementer` on Claude Opus 5. This is the foundation unit of the reconciled candidate-source
design. You are the sole serial writer in `/workspace/probe`.

## Objective

Introduce one `Overlay` entity that owns a candidate set for the duration of one inspection, and make
the type stage read candidates through it instead of through its own private maps. Do not touch the
runtime stage; a later unit adopts the same entity there.

## Context

Read before acting:

1. `/workspace/probe/AGENTS.md` and every rule under `/workspace/probe/.claude/rules/`.
2. `/workspace/probe/src/core/types.ts` and `/workspace/probe/src/server/types.ts`.
3. `/home/user/scaffold/.orkestrel/probe/o9-reconciliation.md` — the ruling this unit implements.
   Read it in full; it names what two independent design lanes agreed on and where the Orchestrator
   ruled between them.

The defect this design closes is measured, not hypothesised. `Case.files` is source an agent supplies
as text. The type stage overlays it into a map its language-service host reads, but `fileExists` and
`directoryExists` go to disk, so an overlay-only candidate cannot be imported. The runtime stage
overlays nothing at all, which is where the false green comes from. This unit fixes the type stage's
half.

## What is already settled, so you do not re-derive it

**The two host callbacks are necessary and sufficient for the type stage.** Measured by reconstructing
the host exactly as shipped, then changing one callback at a time:

```text
candidate in an existing directory, host as shipped:
   Cannot find module '../../src/core/o9virtual.js' or its corresponding type declarations.
candidate in an existing directory, fileExists consults the overlay:
   no diagnostics — the import resolved

candidate in a NON-EXISTENT directory, host as shipped:
   Cannot find module '../../src/nosuchdir/o9virtual.js' or its corresponding type declarations.
candidate in a NON-EXISTENT directory, fileExists AND directoryExists overlay-aware:
   no diagnostics — the import resolved
```

**Directory listings stay on disk.** Both design lanes ruled this independently. `readDirectory` feeds
`parseJsonConfigFileContent`'s glob expansion, whose result is cached per project in the stage's file
map at service creation, so a virtual file entering a listing would outlive the inspection that
declared it. `getScriptFileNames` already unions the overlay's keys, which is how a candidate becomes
a root of the program, so nothing is lost.

**`directoryExists` derives rather than stores.** Answer true when disk says so, or when some current
overlay path sits under the directory. The belief is then exactly coextensive with the overlay's
lifetime and the existing clear ends it. Do not keep a second set of virtual directories.

**The overlay is scoped to one inspection.** Today each stage's queue keeps `#inspect` bodies
disjoint, so stage-level mutable state happens to be safe. The design must not inherit that: scope the
overlay so the property is owned. See the reconciliation's concurrency ruling for why.

## Scope

- **Owned**: `src/server/types.ts`, `src/server/Overlay.ts` (new), `src/server/stages/TypeStage.ts`,
  `src/server/index.ts`, `tests/src/server/index.test.ts` **only** to keep the barrel population
  assertion true.
- **Off-limits**: everything else. Specifically `src/core/**`, `src/server/stages/RuntimeStage.ts`,
  `src/server/stages/LintStage.ts`, `src/server/Probe.ts`, `src/server/factories.ts`,
  `src/server/helpers.ts`, `src/bin/main.ts`, every other file under `tests/`, `guides/**`,
  `package.json`, `vite.config.ts`, `configs/**`, and every dotfile.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: do not commit, push, tag, publish, install a dependency, or run a destructive
  command. Do not add an npm package. Do not read, print, or copy any secret.

## Criteria

1. `OverlayInterface` is declared in `src/server/types.ts` and `Overlay` implements it in its own
   file. Every member is one descriptive word. The entity carries no Vite or TypeScript type, because
   two later stages adapt it to their own tools and it must not depend on either.
2. The type stage reads candidates through the entity and no longer carries its own overlay map or
   version counter.
3. An overlay-only candidate in an existing directory is importable by the test: no resolution
   diagnostic.
4. An overlay-only candidate in a directory that does not exist is importable: no resolution
   diagnostic.
5. A candidate shadowing a file that exists on disk is typechecked as the agent's text, not the disk
   text.
6. Directory listings are unaffected. A project's cached file list is byte-identical before and after
   an inspection that overlays a file in a directory that does not exist. Paste both.
7. Overlay state is cleared after a successful inspection, after a failing one, and after `destroy`.
8. The bound the previous round placed on the service cache still holds. Do not regress it.
9. `Overlay` reaches the server barrel and the population assertion names it.
10. `npm run format:check`, `npm run lint:check`, `npm run check`, `npm run build`, and `npm test` each
    exit 0, run in that order. Report `npm test` separately if a sandbox blocks the vendored config
    proof.
11. `git diff --stat` touches only the owned files.

For criteria 3, 4, and 5, record the failing proof first: the exact command and its output against the
current tree, then the same command green. Where the defect is already closed by your change, produce
the red by reverting your own edit in the working copy, recording it, and restoring.

## Execution

Perform this assignment directly. Spawn no subagent.

## Deviation contract

Stop and report when reality conflicts with the primary objective: a criterion you cannot close with
the owned files alone, or a gate that reddens for a reason your change does not explain. Report
expected, found, the exact command and its output, whether the work is done, and at most one short
hypothesis.

Decide an ancillary question yourself and record it: the entity's exact member names, how the
inspection scope is expressed, and comment wording are yours.

## Output

Return exactly these five sections, and no process diary: **Files written**, **Validation**,
**Acceptance evidence**, **Deviation**, **Decisions**.
