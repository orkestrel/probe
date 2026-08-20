# PB9 design — how a resident probe server takes a shutdown signal

## The question

`@orkestrel/probe` ships `src/bin/main.ts`, registered as an MCP stdio server. When the host that
spawned it is killed, the entry installs no `SIGINT` or `SIGTERM` handler, so `probe.destroy()` never
runs and the runtime stage's `tmp/probe/*.probe-*` specification files survive in the **consumer's own
repository**, where they break that consumer's gates. Row P16 of `.orkestrel/probe/readiness-grade.md`
grades it `degrades-consumers`.

Unit PB5 closed the orphan-sweep half: `RuntimeStage` now sweeps at warm, and the revision identity is
`${process.pid}-${randomUUID()}` so a sweep deletes only files whose writing process is gone. The
shutdown half it refused, correctly, and this brief exists because of that refusal.

## The constraint that shapes every answer

The entry cannot hold a reference. `.claude/rules/architecture.md`: a runtime entry "declares no
module-scope constant and no module-scope function: it imports what it needs and runs." The policy
gate enforces it, and PB5 measured both binding forms failing:

```
$ cat src/bin/main.ts
import { createProbe, createProbeServer } from '@src/server'

const probe = createProbe()
createProbeServer(probe).start()

$ npm run test:policy
+ [ { "line": 3, "message": "module data sits in a data-kind file",
+     "path": "src/bin/main.ts", "rule": "data" } ]
 Test Files  1 failed (1)
      Tests  1 failed | 85 passed (86)
EXIT 1
```

`tests/setupPolicy.ts` is vendored and `tests/policy.test.ts` is a root cross-cutting proof. Neither
changes. The rule is sound and stays.

So the whole entry must remain one expression statement. Whatever holds the probe and takes the signal
lives in the library, reachable by import.

## What each lane argues

**Subjective lane (`planner`, Opus 5):** the shape a consumer should meet. What the option is called,
whether it is a boolean or a list, whether a class is the right home, what the entry line reads like,
and whether this capability should exist on `createProbeServer` at all rather than somewhere else.

**Objective lane (`analyst`, GPT-5.6 Sol):** what the runtime actually permits. Signal-handler
semantics, what happens to an in-flight `prove` when the signal arrives, double-signal and
signal-during-shutdown, the process exit code, whether a handler keeps the event loop alive, whether
`destroy()` can be awaited inside a signal handler at all, and what a stdio transport's own listeners
do to any of it.

Both lanes run blind to each other. Neither implements.

## Context to read first

- `/workspace/probe/AGENTS.md`, especially § Design laws — single-word entity APIs, boolean behavior, minimal public API, no superfluous wrappers, functional core and imperative shell.
- `/workspace/probe/.claude/rules/architecture.md` — the entry rule quoted above, and where a class belongs.
- `/workspace/probe/.claude/rules/patterns.md` — options objects, managers, lifecycle.
- `/workspace/probe/.claude/rules/names.md` — the fixed lifecycle vocabulary.
- `/workspace/probe/src/server/factories.ts` — `createProbe` and `createProbeServer` as they stand.
- `/workspace/probe/src/server/types.ts` and `/workspace/probe/src/core/types.ts` — the published contracts.
- `/workspace/probe/src/bin/main.ts` — four lines.
- `/workspace/probe/src/server/Probe.ts` — what `destroy()` does and how long it takes.
- `/workspace/probe/tests/src/bin/main.test.ts` — the test that currently pins the leak.

## The starting hypothesis, which you may reject

PB5 proposed:

```ts
createProbeServer(createProbe(), { signals: ['SIGINT', 'SIGTERM'] }).start()
```

with `ProbeServerOptions` in `src/server/types.ts` and a `ProbeServer` class in a new
`src/server/ProbeServer.ts`, because `factories.ts` cannot host the handler without a nested function.

Attack it. Name at least two alternatives and say why each loses. Consider at minimum: a boolean
switch rather than a signal list; the server always taking the signals with no option; the capability
living on `Probe` rather than on the server; and doing nothing in the library and instead making the
orphan sweep alone sufficient.

## What a consumer's obligation actually is

Answer this explicitly, because it decides whether the option exists: **a consumer registering probe
as an MCP server does not write the entry — the harness spawns `dist/bin/main.js` directly.** So who
is the option for? If nobody can pass it, the option is speculation and `AGENTS.md` § Design laws
forbids it. If the entry is its only caller, say so and rule on whether a fixed behaviour beats an
option nobody varies.

## Output

- **The recommendation**, stated as one code sample of the entry line plus the exact type declarations it needs.
- **The rejected alternatives**, each with the reason it lost, not a balanced comparison.
- **The invariant, the bound, and the interface** — per `.claude/rules/quality.md`, the three things a ruling states.
- **What the consumer sees change**, including whether anything in the published surface grows.
- **The risks your lane owns**, and what would falsify your recommendation.

No implementation. No process diary.
