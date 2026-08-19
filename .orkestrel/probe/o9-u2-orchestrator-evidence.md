# Orchestrator evidence for the O9-U2 audit round

Both lanes are read-only and cannot execute, so the brief told them to name the command that would
settle an execution-bound claim. This file is that evidence, taken on an idle container. It is
recorded before reconciliation so it cannot be shaped by either verdict.

## Claims 1, 2, 3, 4, 10 — the targeted suite

```text
$ npx vitest run --project src:server tests/src/server/stages/RuntimeStage.test.ts
 Test Files  1 passed (1)
      Tests  15 passed (15)
   Duration  15.67s
```

**Coverage of this evidence.** The three new tests declare their fixture project as an inline object.
That exercises one arm of `TestProjectConfiguration`. It says nothing about the function arm or the
string arm, so it settles those claims for the object arm only.

## Claim 11's mechanical half

The independent verifier reported `npm run lint:check` exit 0 and `npm run check` exit 0 at this
commit.

## Claim 12

```text
$ git -C /workspace/probe show --name-status --format='' 81a7485
M	src/server/stages/RuntimeStage.ts
M	tests/src/server/stages/RuntimeStage.test.ts
```

Exactly the two owned files. No instrument committed.

## Reachability ruling on the string-declared project

`.claude/rules/quality.md` bounds a fix by reachability: a defect reachable through the package's own
shipped code or a documented extension seam is repaired now, and one reachable only through a
hypothetical foreign implementation is documented instead. This one is reachable, and the ruling is
**repair**.

The string arm is declared, not hypothetical:

```text
$ grep -n 'type TestProjectConfiguration' node_modules/vitest/dist/chunks/reporters.d.DtoKVV2s.d.ts
3616:type TestProjectConfiguration = string | TestProjectInlineConfiguration | Promise<UserWorkspaceConfig> | UserProjectConfigFn;
```

`RuntimeStage` runs against the **probed** workspace's configuration, not this repository's:
`createVitest` receives `config: resolveWorkspaceFile(this.#workspace, 'vite.config.ts')`. Any consumer
workspace declaring `test.projects` as glob strings therefore reaches the arm.

And nothing downstream catches it. `#project` resolves by **name** against `vitest.projects`, so a
string-declared project still resolves to a live `TestProject`:

```text
	const project = vitest.projects.find((candidate) => candidate.name === name)
```

The specification then runs and the check comes back clean, with the candidate never served and the
disk copy read instead. That is the exact defect O9-U2 exists to close, surviving on the arm the unit
did not augment.

For the record, this repository's own workspace uses the function arm — `vite.config.ts:195` passes
`[srcCore, srcServer, srcBin, policy, config, probe]`, each declared as an arrow at `:32`, `:53`,
`:103`, `:143`, `:158`, `:177`. So probe's own gates would never have caught this, and the new tests
use a third arm again.

## What this evidence does not settle

- Whether Vite invokes `load` for a specification after `runTestSpecifications` resolved for it.
- Whether `createVitest` re-evaluates the workspace config module on each warm.
- Which query suffixes a real target workspace's module graph produces for a covered path.

Those are named for the fix round rather than assumed either way.
