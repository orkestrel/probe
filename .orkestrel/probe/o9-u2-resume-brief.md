# O9-U2 — resume for the report only

Your previous exec was killed by a **container restart**, not by any fault of yours. Your own error
log shows the network dying underneath you at 19:53 with repeated websocket connection refusals to
`chatgpt.com`. Nothing you did is in question and nothing you wrote was lost.

## The state you are resuming into

Your two owned files are intact and unchanged since you wrote them:

```text
$ git -C /workspace/probe status --short
 M src/server/stages/RuntimeStage.ts
 M tests/src/server/stages/RuntimeStage.test.ts
```

## The question you could not close is closed, and the answer is not yours

You reported 2 `Probe.test.ts` failures surviving an isolated re-run, and timeout markers in
`LintStage.test.ts`. You were right to refuse to call those readings causal.

The Orchestrator took the reading you structurally could not: your tree, unchanged, on an idle
container, with `helpers.test.ts` first as a harness control.

```text
################ TREE A-o9u2 : /workspace/probe ################
---- CONTROL helpers.test.ts (must pass) ----
      Tests  14 passed (14)
CONTROL_EXIT=0
---- tests/src/server/Probe.test.ts ----
      Tests  10 passed (10)
EXIT=0 ELAPSED=35s
---- tests/src/server/stages/LintStage.test.ts ----
      Tests  20 passed (20)
EXIT=0 ELAPSED=6s
```

All three pass. Your re-run was isolated from sibling test files, but not from your own `codex exec`,
`codex-code-mode-host`, and sandbox, which stayed resident the whole time. On this container that
residue alone misses a 60-second budget on tests driving real resident hosts.

**Do not investigate those failures further. They are not defects and they are not yours.**

## Your remaining assignment

Write your report. That is all of it.

- **Do not edit any file.** Your implementation is complete and accepted into the tree pending audit.
- **Do not re-run any gate or any test.** Every gate reading you take carries your own load, which is
  exactly the effect above. The authoritative gates belong to an independent `verifier` on an idle
  container, and the Orchestrator dispatches that.
- Report your gate results as you already observed them, and say plainly that they were taken under
  your own exec's load.

## Execution

Perform this assignment directly. Spawn nothing.

## Output

The exact shape your original brief named, and nothing else:

**What you measured about the resident runner first**, **The mechanism** (and why it is the
project-augmentation route rather than a config override), **Files written**, **Red-then-green
proofs**, **Validation** (each gate and exit code), **Counts**, **Anything re-run alone with both
readings**, **Deviation**, **Decisions**.

Under **Anything re-run alone with both readings**, record the contention finding above as the
Orchestrator's reading rather than yours, and note that your own isolated readings disagreed with it
for the reason given.

Include in **What you measured about the resident runner first** the two host discoveries from your
milestone stream, because they are the durable part of this unit and nothing else records them:

- appending a `load` hook to each project environment produced 0 hook calls against the runner's
  cached hook list;
- returning an augmented `test.projects` array from Vite's `config` hook makes Vite concatenate rather
  than replace, so every project name appeared twice.

No process diary.
