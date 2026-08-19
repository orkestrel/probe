# Ruling — `@orkestrel/queue` brings three packages probe does not use

Unit Q1 flagged this at return. Measured in `/workspace/probe` at commit `e11c389`.

## The measurement

`@orkestrel/queue@0.0.9` declares five runtime dependencies:

```text
@orkestrel/abort ^0.0.7
@orkestrel/contract ^0.0.12
@orkestrel/database ^0.0.10
@orkestrel/emitter ^0.0.7
@orkestrel/timeout ^0.0.7
```

Probe already imports `@orkestrel/contract`, `@orkestrel/emitter`, and `@orkestrel/timeout` directly, so
those three cost nothing new. `@orkestrel/abort` is small and probe uses abort signals throughout.

`@orkestrel/database` is the one that pays for itself in weight, and it pulls two backends:

```text
node_modules/@orkestrel/database    780K
node_modules/@orkestrel/indexeddb   104K
node_modules/@orkestrel/sqlite       84K
```

968K of durable-store surface. Probe imports none of it — its ecosystem imports are `contract`,
`emitter`, `mcp`, `queue`, `test`, `timeout`, and `tool`.

## The ruling: keep the queue

Three reasons, in order of weight.

1. **`AGENTS.md` requires the reuse.** "Reuse a primitive when its semantics match, and do not wrap it
   merely to rename it." The semantics match exactly — probe needs one-at-a-time admission with no
   retries, which is `createQueue({ concurrency: 1, retries: 0 })`.
2. **The hand-rolled version was broken.** Q1's failing-first test proves `LintStage.#tail` held later
   inspections behind abandoned ones with no bound: 20 s timeout before, 77 ms after. Reverting to
   save 968K would restore a wedge.
3. **The weight is a devDependency-shaped cost.** Probe is a development tool. Nothing here ships to a
   browser bundle, and 968K of unpacked `node_modules` in a package that already installs
   `@orkestrel/server`, `@orkestrel/mcp`, and `@orkestrel/tool` is not the constraint that changes the
   decision.

## What this is actually evidence of, and it is not probe's

`@orkestrel/database` is a **runtime** dependency of `@orkestrel/queue`, so every consumer of the queue
pays for the durable store whether or not it asks for one. A queue that persists is a queue with a
store; a queue with `concurrency: 1` and no persistence does not need one.

That is a shape question for `@orkestrel/queue`, not a defect in probe, and it is outside this
campaign's fixed scope. Recorded here against the package that owns it, per the finding-outside-scope
rule in `.claude/rules/quality.md`. Surfaced to the user rather than acted on.

## Why the dependency exists — measured, not assumed 2026-08-19

The working hypothesis was that `@orkestrel/queue` needed `@orkestrel/database` for a host-agnostic
UUID. **That is not the reason.** Read from the installed package at
`node_modules/@orkestrel/queue/dist/src/core/index.js`.

The UUID comes from the global, with no import at all:

```text
310:		const id = supplied ?? crypto.randomUUID();
```

`crypto` appears in no import statement. The file's five imports are `@orkestrel/contract`,
`@orkestrel/abort`, `@orkestrel/emitter`, `@orkestrel/timeout`, and `@orkestrel/database`. Nothing in
the UUID path touches the database.

`@orkestrel/database` is imported once and used at exactly one site:

```text
  5:import { createDatabase } from "@orkestrel/database";
1066:	return new DatabaseQueueStore(createDatabase({
```

That site is `createDatabaseQueueStore`, which builds the durable queue store the package ships beside
`MemoryQueueStore`. It is a real feature, not a leftover.

## What makes it cost every consumer

The import at line 5 is static and top-level in the **core barrel**, and `@orkestrel/queue` publishes a
single export subpath:

```json
{ ".": { "import": { "types": "./dist/src/core/index.d.ts", "default": "./dist/src/core/index.js" } },
  "./package.json": "./package.json" }
```

So there is no way to reach `createQueue` without loading `createDatabaseQueueStore`, and no way to load
that without resolving `@orkestrel/database` and its two backends. A consumer that only ever calls
`createQueue` — which is every call probe makes, at `src/server/Probe.ts:83`, `:92`, and `:98` — pays
for the durable store it never constructs.

## The fix, in `@orkestrel/queue`

Move `DatabaseQueueStore` and `createDatabaseQueueStore` behind a second export subpath, and move
`@orkestrel/database` out of `dependencies`. Then `createQueue` and `createMemoryQueueStore` consumers
resolve nothing extra, and a consumer that wants durability opts in by importing the subpath and
declaring the database itself.

This is a change to `@orkestrel/queue`, outside this campaign's fixed scope. Recorded against the
package that owns it.
