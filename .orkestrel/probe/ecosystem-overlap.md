# Ecosystem overlap map — what probe hand-writes that the fleet already publishes

Built 2026-08-19, after the user asked why the campaign had never checked. It had not. `AGENTS.md`
requires inspecting declared `@orkestrel/*` capabilities before implementing overlapping logic, and
this campaign repaired roughly 2543 hand-written lines across seven rounds without once building this
map. The gap is the Orchestrator's.

Probe declares 8 of the fleet's 40 packages: `contract`, `emitter`, `mcp`, `timeout`, `tool` at
runtime; `guide`, `scaffold`, `test` in development.

## Verdicts

| Package | Verdict | Probe's code | Replacement |
| ------- | ------- | ------------ | ----------- |
| `queue` 0.0.9 | **ADOPT WITH A DIFFERENCE** | six hand-rolled tail chains | `createQueue({ concurrency: 1 })` |
| `mcp` 0.0.18 (already declared) | **ADOPT WITH A DIFFERENCE** | ad hoc JSON-RPC narrowing in `LintStage` | `isJSONRPCRequest` and siblings |
| `workspace` 0.0.5 | **REJECT** | disk-resolution helpers | none — see below |
| `reason`, `msg`, `console`, `pool`, `worker`, `program`, `supervisor`, `toolbox`, `workflow`, `abort`, `budget` | **REJECT** | — | — |

## The finding that matters most, and it is not a reuse opportunity

**Probe serializes the same work twice, in six places.**

```text
src/server/Probe.ts:48-50     #typeTail, #lintTail, #runtimeTail
src/server/stages/TypeStage.ts:44     #tail
src/server/stages/LintStage.ts:43     #tail
src/server/stages/RuntimeStage.ts:55  #tail
```

Each stage already chains its own inspections onto a private `#tail`, so only one runs at a time. Unit
S2 then added a second layer in the coordinator, one chain per stage, to start each deadline after
queue admission. The coordinator is now serializing work the stage was already serializing.

S2 did not do anything wrong: its brief named the defect and never told it to check whether the stages
already had the mechanism, because no overlap map existed. That is the concrete cost of skipping this
step — not a missed dependency, a duplicated invariant in code that had just been repaired.

`@orkestrel/queue`'s `createQueue({ concurrency: 1 })` publishes exactly this guarantee: FIFO, one in
flight, `enqueue` returning the settling promise, with no idle polling. Adopting it collapses six
implementations into one and makes the ownership question explicit — whose queue is it, the
coordinator's or the stage's — which is the question the duplication is hiding.

**What does not transfer.** `Queue` has a per-attempt timeout that retries; probe's deadline races and
then RECYCLES the stage. Adopt at `concurrency: 1, retries: 0` and keep probe's deadline-and-recycle
layered above, or the semantics change silently.

## Why `@orkestrel/workspace` is the wrong fit, on evidence rather than on the name

The user named this one specifically. `guides/workspace.md:11` is explicit: *"A workspace is not a
filesystem. There is no disk, no `node:fs`, no watcher."* Its `Workspace` is an in-memory
`Map<path, FileInterface>` with no I/O at all.

Probe's helpers are the opposite. `src/server/helpers.ts:15-95` resolves real paths on real disk,
`require.resolve`s real installed packages, and `readFileSync`s real manifests to discover the
toolchain versions the receipt reports. Adopting `workspace` would delete none of that and add an
unrelated abstraction beside it.

The near-miss worth recording: `TypeStage`'s overlay map (`TypeStage.ts:172-176, 204-214`) resembles
`Workspace`'s edit surface far more than the disk helpers do. It is still not a fit, for the same
reason inverted — the overlay is keyed by resolved absolute disk paths and versioned for TypeScript's
`getScriptVersion` cache-invalidation contract, so it needs a stable relationship to real files that
`Workspace` explicitly refuses to have.

## Rejections worth keeping, so nobody re-proposes them

- **`reason`** — pure name collision with `Control.reason`, which is a human-readable string. The
  package is a quantitative and symbolic rule-evaluation engine.
- **`msg`** — pure name collision on the English word. The package parses CFB/OLE2 and RFC 2822 email.
- **`console`** — a styled-output system with a sink seam and ANSI rendering, against probe's four
  deterministic string-join functions for an MCP text response. Adds more than it removes.
- **`pool` and `worker`** — both model N leased resources with acquire and release. Probe holds one
  resident singleton per stage, replaced wholesale on timeout or after 64 uses. No leasing, no
  concurrent holders, no acquire/release boundary.
- **`abort`** — already in use indirectly through `@orkestrel/timeout`, which probe declares.

## What needs a run rather than a read

- Whether Oxlint's LSP envelopes are structurally close enough to `@orkestrel/mcp`'s JSON-RPC types for
  its guards to narrow real traffic. Feed a captured Oxlint frame through them; the guide's own
  examples are not evidence about Oxlint.
- Whether swapping the tail chains for `Queue` preserves ordering and error propagation under probe's
  deadline-race-and-recycle wrapper. That needs a test exercising a timed-out stage under `Queue`.
- The catalog versions above come from the regenerated table, not a live registry query.
