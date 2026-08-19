# The failures O9-U2 could not attribute were its own exec

## The reading

Both trees, same commands, `helpers.test.ts` first in each as a harness control drawn from outside the
population under test — pure functions, no child process, no resident host, no `tmp/probe`, and it has
never timed out this campaign.

```text
################ TREE A-o9u2 : /workspace/probe ################
---- CONTROL helpers.test.ts (must pass) ----
 Test Files  1 passed (1)
      Tests  14 passed (14)
CONTROL_EXIT=0
---- tests/src/server/Probe.test.ts ----
 Test Files  1 passed (1)
      Tests  10 passed (10)
EXIT=0 ELAPSED=35s
---- tests/src/server/stages/LintStage.test.ts ----
 Test Files  1 passed (1)
      Tests  20 passed (20)
EXIT=0 ELAPSED=6s
```

O9-U2's own tree, unchanged, on an idle container: every one of the three files passes. The 2
`Probe.test.ts` failures that survived its isolated re-run do not exist here, and neither do the
`LintStage.test.ts` timeout markers.

## Why the unit could not get this reading

O9-U2 re-ran those files **alone** and still saw them fail. Its re-run was isolated from other test
files. It was not isolated from the `codex exec`, the `codex-code-mode-host`, and the sandbox process
that were resident the whole time — the unit's own engine.

A unit cannot take an uncontended reading of its own tree, because the unit is the contention. Running
one test file at a time removes the sibling suites and leaves the executor itself in place, and on a
four-core container that residue is enough to miss a 60-second budget on tests that drive real
resident hosts.

This is why the reading waited for the exec to exit rather than running beside it.

## The baseline arm was voided by its own control, correctly

The second tree — a detached worktree at `703bfe6` with `node_modules` symlinked from the main
checkout — failed its control before running anything:

```text
 FAIL  |src:server| tests/src/server/helpers.test.ts
Error: Environment modules cannot import files outside the workspace
  Plugin: orkestrel-environment-boundary
  File: /tmp/probe-baseline-703bfe6/src/server/stages/RuntimeStage.ts
CONTROL_EXIT=1
TREE B-baseline: INSTRUMENT BROKEN — harness control failed. Readings below are unusable.
```

The symlink makes Vite resolve module paths outside the worktree, and the workspace's own environment
boundary plugin refuses them. The shortcut broke the instrument, the control reported it, and the
script refused to publish the readings underneath it.

The arm is not needed. Tree A leaves no failure to attribute, so there is nothing for a baseline to
rule on. Recorded because an instrument's coverage belongs beside its result: this measurement covers
O9-U2's tree on an idle container and says nothing about `703bfe6`.

## What it changes

Nothing in O9-U2's implementation. Its two owned files stand, and the three files it could not clear
are green.

What it changes is the acceptance path. O9-U2's gate evidence is void — not wrong, void, because every
gate it ran carried its own engine's load. The gates must be re-run by an independent `verifier` on an
idle container before this unit is accepted, which is what the acceptance laws require anyway.
