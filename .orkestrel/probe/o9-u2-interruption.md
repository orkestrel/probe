# O9-U2 was stopped by a container restart, not by a fault

Recording this plainly rather than assessing its partial bytes as either good or worthless.

## What happened

The container restarted at about 19:53. The exec's own error log shows the network dying underneath
it, which is the restart rather than anything the unit did:

```text
$ tail -3 /workspace/probe/tmp/codex/o9-u2.err
2026-08-19T19:53:12.511656Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: IO error: Connection refused (os error 111), url: wss://chatgpt.com/backend-api/codex/responses
2026-08-19T19:53:14.069453Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: IO error: Connection refused (os error 111), url: wss://chatgpt.com/backend-api/codex/responses
2026-08-19T19:53:17.044409Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: IO error: Connection refused (os error 111), url: wss://chatgpt.com/backend-api/codex/responses
```

No `--output-last-message` file was written, so the unit has **no report**. Its recovery handle is the
thread id in the journal head: `01a01b7d-aaf6-7920-9a80-87e919a03d0a`, journal
`/workspace/probe/tmp/codex/o9-u2.jsonl`.

## The tree it left

Exactly its two owned files, and nothing else:

```text
$ git -C /workspace/probe status --short
 M src/server/stages/RuntimeStage.ts
 M tests/src/server/stages/RuntimeStage.test.ts
```

## How far it got, from its own milestone stream

- Both owned files written, last at 19:39.
- Five durable properties passing, with candidate entries carrying `overlay.revision` so a first
  inspection, a second, and a cleared overlay produce distinct snapshot values.
- Two host discoveries it hit and worked around: appending a `load` hook to each project environment
  produced 0 hook calls against the runner's cached hook list, and returning an augmented
  `test.projects` array from Vite's `config` hook makes Vite concatenate rather than replace, so every
  project name appeared twice.
- One owned-file narrowing defect the comprehensive type gate caught that the server-only config did
  not: `config.test` stayed optional after reading `config.test?.projects`.
- Four of five gates green. The build kept its baseline API Extractor and CJS `import.meta` warnings.
- The test gate failed with 12 failures across 3 files it does not own: the known `tmp/probe` bin
  flake, and 11 timeouts in `Probe` and `LintStage`.
- Isolated `Probe.test.ts` repeated 2 of those failures — so they are **not** the contention this
  campaign has seen before. Isolated `LintStage.test.ts` showed timeout markers too, and that file
  never constructs `RuntimeStage`.

It was correctly refusing to call the isolated readings causal, and was still gathering when the
restart cut it.

## What the Orchestrator owes here

The deciding reading is the one the unit could not take: whether those two files fail the same way at
baseline `703bfe6`, before O9-U2 touched anything. The unit held a working tree with its own edits in
it and could not answer that cheaply.

That measurement is `scratchpad/causality.sh` — both trees, same commands, with `helpers.test.ts` as a
harness control run first in each tree because it drives pure functions and has never timed out. A
control failure means the tree or its node_modules is broken and no reading is usable.

Resume or re-dispatch is decided after that reading, not before. Re-dispatching a unit to re-diagnose
a failure that predates it would spend a whole exec on the wrong question.
