PB9 is complete. All twelve acceptance criteria close; six gates green.

## The measurement re-taken first

`Probe.destroy()` on this tree, `dist/src/server/index.js`, 2026-08-20, host Linux 6.18.5 x64 / Node 22.22.2:

```
before createProbe SIGINT: 0 []      after createProbe SIGINT: 2 [(anonymous), onExit]
before createProbe SIGTERM: 0 []     after createProbe SIGTERM: 2 [(anonymous), onExit]
destroy during boot took 2745 ms     destroy after arm took 17 ms
```

The reconciliation's 2853 ms is the **boot-in-flight** case and still holds (2745 ms). The armed case is 17 ms. Vitest's force-exit timer is `setTimeout(() => process.exit(), 1)` at `node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js:2058`. The ruling is unchanged.

## What changed, per section

**1. The server owns the process.** `ProbeServerInterface` is `start(): void` and `destroy(): Promise<void>` (`/workspace/probe/src/server/types.ts:198`); `stop` is gone. `createProbeServer(options?: ProbeOptions)` returns it (`/workspace/probe/src/server/factories.ts:52`) and creates the probe it serves. `ProbeServer` is one class (`/workspace/probe/src/server/ProbeServer.ts:33`) with `#probe`, `#transport`, `#signals`, `#input`, `#closing`, barrelled at `/workspace/probe/src/server/index.ts:5`, with a runnable `@example`. `/workspace/probe/src/bin/main.ts` is one import plus `createProbeServer().start()`.

**2. The listener race.** `/workspace/probe/src/server/stages/RuntimeStage.ts:221-253`: `captureListeners(process, ['SIGINT','SIGTERM'])`, then `return create(...)` **unawaited**, then `releaseListeners` in `finally`. The unawaited call is load-bearing, not stylistic — see the deviation below. Removal is by identity diff, never by name. `exit` is left attached: it runs while the process is already leaving.

**3. Arming files.** `/workspace/probe/src/server/Probe.ts:219-224` routes both boot dependencies through `createRevisionFile` with `${process.pid}-${randomUUID()}`; they are now `tmp/probe/arm-type.probe-<pid>-<uuid>.ts` and `arm-runtime.probe-…`, and the boot tests import the matching stem.

**4. Transport.** Installed: `@orkestrel/mcp` **0.0.19**. `StdioServerTransport.close()` fires `close` on its own emitter and leaves the `data`, `close`, and `error` listeners on `process.stdin` attached. Decision below.

New shared leaves: `captureListeners` (`/workspace/probe/src/server/helpers.ts:405`) and `releaseListeners` (`:435`), plus the `ListenerCapture` type (`/workspace/probe/src/server/types.ts:235`), with guide rows and executed examples.

## Red-then-green, per behavioural change

| Change | Command | Red | Green |
| --- | --- | --- | --- |
| Vitest listener strip | `npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:server -t 'strips the termination listeners'` | 1 failed, 0 passed (SIGTERM 3 vs 1) | 1 passed |
| Strip survives a recycle | `… -t 'recycles the resident runner'` | 1 failed, 0 passed (SIGTERM 2 vs 1) | 1 passed |
| Strip is synchronous with the call | same as row 1, with `return await create(` restored | 1 failed (SIGTERM 2 vs 1) | 1 passed |
| Arming revision identity | `… -t 'writes its boot dependencies'` | 1 failed (`arm-type-<uuid>.ts`) | 1 passed |
| `destroy` returns the process | `npx vitest run … tests/src/server/ProbeServer.test.ts --project src:server`, with both `releaseListeners` calls neutered | 1 failed, 1 passed | 2 passed |
| Entry shape and no-leak | `npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:bin` | 2 failed, 3 passed | 8 passed |
| Guide parity | `npx vitest run … --project guides` | 3 failed, 6 passed | 9 passed |

Two changes needed no red proof and I say so: routing the RuntimeStage sweep test over arming-shaped names (the marker is identical, so the sweep already covered it — coverage, not repair), and the guard-parity test's new source path (a move).

## The anonymous termination listener

It is **`signal-exit@4.1.0`**, vendored into `node_modules/rolldown/dist/shared/watch-BNCfUBmW.mjs`, registered at module load by `rolldown/dist/index.mjs:11` (`src/setup.ts`, main thread only) to close its trace subscriber. It reaches this process transitively through Vite 8 when `RuntimeStage` loads `vitest/node`.

**Not this package's to remove**, and the report is: it registers once per process, not once per warm, which is why it survives teardown and does not multiply on recycle. Its handler acts only when `process.listeners(sig).length === count`, that is when it is the last listener on the signal — then it unloads and re-raises the signal so the default disposition applies. With `ProbeServer`'s handler attached it is inert. Removing it would take over another package's process contract and break rolldown's cleanup. It is also what gives the second-signal escalation described below for free.

## The transport, and what it decided about the exit

The installed transport retains its stdin listeners, so `ProbeServer.#destroy` releases them itself and pauses the stream (`/workspace/probe/src/server/ProbeServer.ts:84-86`). **The loop then drains, and `destroy()` ends with no explicit exit.** Proven, not assumed: all four spawned-entry deliveries exit `{code: 0, signal: null}` with the parent still holding the stdin pipe open. A later transport that detaches its own listeners leaves the release with nothing to do rather than making it wrong.

## Signal to child exit

Built entry spawned against a scratch target, 3 runs each, 2026-08-20:

| Delivery | SIGTERM | SIGINT |
| --- | --- | --- |
| During boot | 2327, 2223 ms | 2286, 2295 ms |
| Armed | 56, 59 ms | 54, 50 ms |

Every run: exit code 0, no signal, `tmp/probe` empty (absent — the boot removes the directory it created).

## Gates

| Command | Exit |
| --- | --- |
| `npm run format:check` | 0 |
| `npm run lint:check` | 0 |
| `npm run check` | 0 |
| `npm run build` | 0 |
| `npm test` | 0 |
| `npm run test:distribution` | 0 |

`npm test`: 146 + 86 + 28 + 9 tests passed across 15 files. `npm run test:policy` (criterion 2) exits 0 with 86 passed.

## Deviations, recorded

**1. `destroy()` does not call `process.exit`, against the brief's §4 conditional.** The conditional's premise is that nobody detaches the transport's stdin listeners. Criterion 6 requires `destroy()` to return `process.stdin.listenerCount('data')` to its pre-`start()` value, which makes `ProbeServer` the party that detaches them — a case §4 does not cover. An explicit exit would also make criteria 6 unmeasurable in process: no test could observe idempotency or a listener count after a call that kills the worker. I released the listeners, paused stdin, measured the drain, and left the exit out. TSDoc says so at `/workspace/probe/src/server/ProbeServer.ts:79-83` and the guide records it under § Lifecycle → Teardown. This is reversible in one line if the audit rules the other way.

**2. Two defects the first implementation shipped, both caught by measurement rather than by review, both fixed.** Reporting them because they are exactly the shape the brief warned about, and the second is subtle enough to reintroduce.

- Releasing the capture in a `finally` **after awaiting** `createVitest` removes every termination listener registered during the warm — including `ProbeServer`'s own, because `start()` runs while the constructor's first warm is still in flight. The armed-signal case then died by default disposition in 29 ms with the teardown never running, and it read exactly like a working graceful shutdown from the outside. The strip must be synchronous with the call: Vitest registers before its first await, and `finally` on an unawaited `return` runs before the promise settles (both verified). `/workspace/probe/tests/src/server/stages/RuntimeStage.test.ts` asserts the count synchronously after construction, which is the assertion that binds this.
- Signalling during boot before the fix exited 143 after 1186 ms with both arming files left behind: Vitest's `onExit` was registered and not yet stripped.

**3. `ProbeServer` releases its own signal handlers first in teardown**, so a second signal during a teardown that takes seconds reaches the default disposition and ends the process at once. That is a decision, not an accident, and it is documented at `/workspace/probe/src/server/ProbeServer.ts:73-75` and in the guide.

Nothing outside the owned list was touched: `.orkestrel/`, `.claude/`, `.agents/`, `configs/`, and `vite.config.ts` are unmodified. No commit was made. Rollback point `47e6b4d` stands.