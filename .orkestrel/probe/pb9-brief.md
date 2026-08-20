# PB9 — the probe leaves nothing behind when the process is asked to die

## Role and engine

`implementer` (Claude Opus 5, native). Perform the assignment directly and spawn nothing.

Native rather than a bench: this unit's proof spawns the built entry and signals it, which is a
grandchild of a bench exec's own child, and `.agents/orchestration.md` **Bench laws** rule 4 denies
that. The writer is on the Orchestrator's engine, so this unit's audit lane is **Sol**.

## Read first

`.orkestrel/probe/pb9-reconciliation.md`. It carries the ruling, the measurement that decides it, both
lanes' reasoning, and the tensions already settled. This brief does not restate it — it assigns it.

Then `AGENTS.md` and the `.claude/rules/` files for what you touch: `names.md` (the fixed lifecycle
vocabulary decides `stop` versus `destroy`), `architecture.md` (the runtime-entry rule and where a
class belongs), `patterns.md`, `typescript.md`, `tests.md`.

## The subject

Row P16 of `.orkestrel/probe/readiness-grade.md`. A killed host leaves `tmp/probe/` files in the
**consumer's own repository**, where they break that consumer's gates.

PB5 closed half of it: the runtime stage sweeps at warm, and the revision identity is
`${process.pid}-${randomUUID()}` so a sweep deletes only files whose writing process is gone. PB5
refused the other half, correctly — the shipped entry cannot hold a probe reference, because a runtime
entry declares no module-scope constant and no module-scope function and the policy gate enforces it.

## What you build

### 1. The server owns the process it already claims

```ts
import { createProbeServer } from '@src/server'

createProbeServer().start()
```

One import, one expression statement. `createProbeServer(options?: ProbeOptions)` creates the probe it
serves. `ProbeServerInterface` becomes `start(): void` and `destroy(): Promise<void>`; `stop` leaves.
`ProbeServer` is one class in `src/server/ProbeServer.ts`, barrelled, with `#` fields holding the
probe, the transport handle, and a closing latch, and a runnable `@example`.

`start()` registers the two listeners as anonymous callbacks passed directly as arguments, which the
design laws permit. `destroy()` removes them, tears down the transport, awaits the probe's own
`destroy()`, and is idempotent through the latch.

No `signals` option. No `ProbeServerOptions`. No `PROBE_SIGNALS` constant. The reconciliation rules on
why, and that ruling is not yours to reopen.

### 2. The listener race, which is the half that actually decides whether this works

`createProbe()` installs process-wide termination listeners the entry never registered. Measured on
this host on 2026-08-20:

```
before createProbe SIGTERM: 0 []
after  createProbe SIGTERM: 2 [(anonymous), onExit]
destroy took 2853 ms
after  destroy     SIGTERM: 1 [(anonymous)]
```

`onExit` is Vitest's, installed by `createVitest` inside `RuntimeStage`, and it force-exits the process
about 1 ms after a signal. `destroy()` takes three orders of magnitude longer. So **a signal handler
alone is cosmetic** — it reads as fixed, passes a smoke test, and fails in the field.

`RuntimeStage` must remove the listeners each `createVitest` call installs, at the point it installs
them. Every warm and every recycle — PB5 made every stage recycle, so a strip performed once at boot
stops working after the first.

**Take the removal by diffing `process.listeners(signal)` immediately before and after the
`createVitest` call, and removing exactly what appeared.** Do not match `fn.name === 'onExit'`: the
name is an unexported Vitest implementation detail, and a coincidental match from another dependency
strips the wrong listener.

Note the third measured fact: `destroy()` leaves one listener attached. Identify what installs the
anonymous one before deciding whether removing it is this package's business. Report what you find
either way.

### 3. The arming files the sweep never matched

`Probe.#boot` writes `tmp/probe/arm-type-<uuid>.ts` and `tmp/probe/arm-runtime-<uuid>.ts`. PB5's sweep
matches `.probe-<pid>-<uuid>` on the basename, so neither is ever swept — and those two names are
exactly what `tests/src/bin/main.test.ts` currently pins as surviving.

Route both through the same revision helper the runtime stage uses. One vocabulary for every file this
package writes into a consumer's tree.

### 4. What the transport does about stdin

`@orkestrel/mcp`'s `stop()` leaves its stdin listeners attached, so the loop stays referenced and
`process.exit()` is the only thing that ends the process. Measured: with an open stdin pipe,
`active resources = ["PipeWrap"]` and the process is still alive after 1500 ms.

Unit M1 in `@orkestrel/mcp` repairs exactly that, and probe cannot receive it until mcp publishes and
this package re-pins.

**Write the teardown correct under both transports, and prove which one this tree has rather than
assuming.** Read `node_modules/@orkestrel/mcp/package.json` for the installed version and check whether
its `close()` removes its listeners. Say what you found. If the installed transport still retains them,
`destroy()` ends with an explicit exit and you say so in its TSDoc; if it releases them, prove the loop
drains without one.

## Standing conditions

- The tree is clean at the commit the dispatch names, except `tmp/`, which is gitignored and expected to be dirty. Do not treat `tmp/` as a deviation.
- This host permits nested child creation. Every proof here is reachable; take the measurement.
- Do not edit any file under `.agents/`, `.claude/`, or `configs/`, or `vite.config.ts`. Those are scaffold-generated or vendored and `repair` reverts an edit there.
- `.orkestrel/` is off-limits.
- `guides/probe.md` and `tests/guides.test.ts` may exist by the time you run, created by unit PB6. If they document `createProbeServer` or `ProbeServerInterface`, they are yours to correct — the parity gate must stay green.

## Scope

**Owned:** `src/server/types.ts`, `src/server/factories.ts`, `src/server/ProbeServer.ts` (new),
`src/server/index.ts`, `src/server/Probe.ts`, `src/server/stages/RuntimeStage.ts`, `src/bin/main.ts`,
`src/core/types.ts` only where a TSDoc sentence about the server's lifecycle becomes false, and the
mirrored test files under `tests/src/`, plus `guides/probe.md` and `tests/guides.test.ts` where they
name the changed surface.

**Off-limits:** everything else.

**Tools:** read, write, and run commands inside `/workspace/probe`. Do not commit, push, install a
dependency, or run a destructive command.

## Execution

Perform this assignment directly. Spawn nothing.

Insert a failing proof before each behavioural change: record the exact command and its failing count,
implement, then record the same command green. A pure rename needs no red proof and you say so.

The load-bearing proof is a real one: spawn the built entry, signal it, and assert the consumer's
`tmp/probe/` is empty afterwards. `tests/src/bin/main.test.ts:347` currently asserts the opposite —
that the orphans survive — and flipping it is the point of this unit.

**Deliver the signal during boot, not after arm.** `Probe.destroy()` awaits arming first, and a boot in
flight can hold a stage deadline far longer than a real `SIGTERM` grace window. A test that signals a
fully armed probe measures the easy case and reads green while the harness force-kills mid-teardown.
Measure and report the wall-clock from signal to child exit for both.

## Acceptance criteria

Ordered so an unreachable criterion cannot hide the ones behind it.

1. `ProbeServerInterface` declares exactly `start(): void` and `destroy(): Promise<void>`; `createProbeServer(options?: ProbeOptions)` returns it; `ProbeServer` is one class in its own file with a runnable `@example`; `src/bin/main.ts` is one import plus one expression statement.
2. `npm run test:policy` exits 0. The entry rule is what made this unit necessary; it stays satisfied.
3. Each `createVitest` call's own termination listeners are removed at the point it installs them, taken by a before-and-after diff rather than by name, and re-verified after a stage recycle.
4. Both arming files carry the sweep's revision shape, and a test proves a warming stage removes one written under a dead pid while a live-pid sibling survives.
5. A spawned entry signalled with `SIGTERM`, and again with `SIGINT`, leaves `tmp/probe/` empty; the child exits within a stated bound rather than being force-killed by the harness. Both the boot-time and the armed-time deliveries are measured and reported.
6. `destroy()` is idempotent and leaves `process.stdin.listenerCount('data')` at its pre-`start()` value.
7. `npm run format:check` exits 0.
8. `npm run lint:check` exits 0.
9. `npm run check` exits 0.
10. `npm run build` exits 0.
11. `npm test` exits 0.
12. `npm run test:distribution` exits 0.

## Deviation contract

A conflict with the objective stops the unit: report expected, found, exact evidence, done or not done,
and at most one short hypothesis. Prose, structure, and example choice are yours to decide and record.

If criterion 5's bound cannot be met because teardown outruns any reasonable grace window, that is a
finding rather than a failure: report the measured wall-clock, say what holds it, and stop rather than
weakening the criterion.

## Output

- Per numbered section: what changed and the `file:line`.
- The red-then-green command and both counts, per behavioural change.
- What you found installing the anonymous termination listener.
- Which mcp transport this tree has, and what that decided about the exit.
- Signal-to-exit wall-clock, boot-time and armed-time.
- The gate table: command, bare exit code.
- Files changed.

No process diary.

## What landed since this brief was written

PB6, PB7, and PB8 all ran. Read the tree, not the brief's picture of it.

- **`guides/probe.md` and `tests/guides.test.ts` exist.** The guides gate sweeps both barrels for a missing `@example`, requires every `Object.keys(server)` name to have a backticked row under `## Surface`, and executes the documented fences. Your change adds `ProbeServer` and removes `stop` from `ProbeServerInterface`, so all three move together — **`guides/probe.md` and `tests/guides.test.ts` are granted to you** for exactly that parity.
- **`Verdict` gained an optional `reason`**, carried from `Control.reason`.
- **`isSource` refuses an absolute or workspace-escaping path.**
- **`formatFinding` renders `[code]` or `[instrument]`** ahead of every finding's location.
- **`normalizePath` is exported** from `src/server/helpers.ts`; use it rather than writing another rewrite.
- **`Overlay` is interned**, listed with `OverlayInterface` in the parity `INTERNAL` list. If `ProbeServer` should be interned rather than barrelled, that list is where it goes — but the reconciliation ruled it barrelled, and that ruling stands unless you find a reason it cannot be.

## The one measurement to re-take before you design against it

The reconciliation records `destroy()` at 2853 ms and Vitest's force-exit timer at about 1 ms. Both
were taken before PB5 landed stage recycling and before PB7's changes. **Re-take the `destroy()`
figure on this tree as your first step** and state it. The ruling does not change if the number
moved — 1 ms is not reachable — but the number goes in the guide with its date, and a stale one is
the defect this campaign exists to stop.
