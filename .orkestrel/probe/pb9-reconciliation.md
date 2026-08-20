# PB9 design round — reconciliation

Two lanes on one brief, blind to each other. Both returned a complete design. They agree on the shape
and disagree about nothing; the objective lane found a mechanism the subjective lane could not have
known, and it changes what the shape must do rather than what it must look like.

## Routing deviation, recorded

The objective lane reports that it ran as a direct exec in this session rather than through the Sol
bridge, and that **no journal path and no session id exist for its answer**. `.agents/orchestration.md`
**Bench laws** rule 2 is explicit: a bench unit with no journal ran on its driver's engine, however
normal its answer reads. So this round ran **both lanes on Opus 5**, in separate clean contexts, blind
to each other — which is the substitution the engine table prescribes when Sol is unavailable, arrived
at by accident rather than by decision. Recorded, not absorbed.

The lane's answer is retained rather than discarded because it carries executed evidence with pasted
commands and outputs, and because the Orchestrator re-took its load-bearing measurement independently
before accepting it. Evidence quality and engine independence are different properties; this round has
the first and lacks the second.

## The measurement that decides the design

The objective lane claimed `createProbe()` installs process-wide termination listeners that force-exit
the process about 1 ms after a signal, so any teardown the entry starts loses the race. Re-taken by the
Orchestrator on 2026-08-20 against `dist/src/server/index.js`:

```
before createProbe SIGINT: 0 []
before createProbe SIGTERM: 0 []
after  createProbe SIGINT: 2 [(anonymous), onExit]
after  createProbe SIGTERM: 2 [(anonymous), onExit]
after  arm         SIGTERM: 2 [(anonymous), onExit]
destroy took 2853 ms
after  destroy     SIGTERM: 1 [(anonymous)]
```

Three facts, all stronger than the lane reported:

1. **Two listeners per signal, not one.** `onExit` is Vitest's; the anonymous one is a second
   registration the lane did not separate out.
2. **`destroy()` took 2853 ms on this host**, against a 1 ms force-exit timer. The lane measured 15 ms
   cold and 368 ms warm. The race is not close, and it is not close by three orders of magnitude at the
   high end.
3. **`destroy()` removes only one of the two.** The anonymous listener survives teardown, so a probe
   that has been destroyed still holds a termination listener.

`Probe.#recycle` builds a fresh `RuntimeStage`, and each one calls `createVitest` again. So a strip
performed once at boot stops working after the first recycle — which PB5 made routine, because every
stage now recycles.

## The ruling

**Shape: the subjective lane's, adopted whole.** No `signals` option. The harness spawns
`dist/bin/main.js`, so no consumer can pass one, and `AGENTS.md` § Design laws forbids adding a
capability with no real consumer. `signals: []` would also be a supported way to spell the defect.
`createProbeServer(options?: ProbeOptions)` creates the probe it serves, because an entity that
unconditionally seizes this process's stdio is the process; `ProbeServerInterface` becomes
`start(): void` and `destroy(): Promise<void>`, and `stop` leaves rather than sitting beside a verb
that releases what it does not.

**Mechanism: the objective lane's, and it is not optional.** A signal handler alone is cosmetic — it
reads as fixed, passes a manual smoke test, and fails in the field. `RuntimeStage` must remove the
listeners each `createVitest` call installs, at the point it installs them, every warm and every
recycle. Take the removal by diffing `process.listeners(signal)` immediately before and after the
call rather than by matching `fn.name === 'onExit'`: the name is an unexported Vitest implementation
detail, and a coincidental match from another dependency would strip the wrong listener.

**The arming files go with it.** The sweep PB5 built matches `.probe-<pid>-<uuid>` on the basename.
`Probe.#boot` writes `tmp/probe/arm-type-<uuid>.ts` and `arm-runtime-<uuid>.ts`, which carry no marker,
so nothing sweeps them — and those two names are exactly what the pinned leak test asserts survive.
Route both through the same revision helper. One vocabulary for every file the package writes into a
consumer's tree.

## What M1 changes about this

The objective lane rules that `process.exit()` is mandatory because `server.stop()` leaves stdin's
listeners attached and the loop referenced. The Orchestrator measured the same thing directly: with an
open stdin pipe, `active resources = ["PipeWrap"]` and the process never exits.

Unit M1 in `@orkestrel/mcp` is repairing precisely that. After it lands, a closed transport releases
its stdin listeners, and the loop may drain on its own.

**This does not remove the `process.exit()` requirement, and the implementing unit must not assume it
does.** Probe pins `@orkestrel/mcp ^0.0.19` and cannot receive M1 until mcp publishes 0.0.20 and probe
re-pins. Until then the installed transport retains its listeners. Write the teardown so it is correct
under both transports, and prove which one the tree actually has rather than assuming.

## Tensions the subjective lane raised, ruled

| Tension | Ruling |
| ------- | ------ |
| Folding the `probe` parameter away | **Adopted.** No caller hands one in, and none can: `createProbeServer` forwards no stream options, so the transport always seizes the real stdio. The embedding path proven by the distribution test drives `createProbe` directly and never touches the server. |
| `createProbeServer(options?: ProbeOptions)` takes another entity's options type | **Adopted as written.** Every key configures the probe the server creates. A one-key `ProbeServerOptions { probe?: ProbeOptions }` wrapper adds a name and no boundary, which `AGENTS.md` § Design laws refuses. |
| Dropping `stop()` rather than keeping it beside `destroy()` | **Adopted.** "Stop serving, stay warm" has no consumer, and publishing two teardown verbs where one leaks the other's resource re-creates P16 inside the API. |
| Exactly two signals, fixed | **Adopted.** No evidence any harness sends `SIGHUP` or `SIGBREAK`, and adding them is the speculation the option was refused for. |
| The library never calls `process.exit` | **Overruled by measurement.** It must, until the transport releases stdin, and it must prove which transport it has. |
| `ProbeServer` barrelled rather than interned | **Adopted.** Its constructor needs only values a consumer holds. |

## Risks carried into the units

- **The strip reaches into Vitest's internals.** A version bump that renames the function, wraps it, or drops the timer reopens the race silently. The unit owns a proof that fails when the strip stops working, not a comment saying it might.
- **Teardown is unbounded.** `Probe.destroy()` awaits arming first, and a boot in flight can hold a stage deadline. A `SIGTERM` grace window is usually far shorter, so a test can read green while the harness force-kills mid-teardown. The unit measures signal-to-exit with the signal delivered **during** boot, not after arm.
- **A destroyed probe still holds the anonymous listener.** Whatever installs it is not identified. The unit identifies it before deciding whether removing it is the server's business.
