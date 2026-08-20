# PBFIX4 — report

Unit: `implementer`, Opus 5. Brief: `pbfix4-brief.md`.

## What changed

`ProbeServer` holds its five listeners as `readonly #` fields bound once in the constructor and
removes exactly those by reference. It also gives the stdio transport a `PassThrough` it owns, so the
transport's own listeners never land on `process.stdin` at all, and forwards `data`, `close`, and
`error` into that stream.

## The brief's rationale was wrong, and the unit found out by reading

The brief claimed the fleet already used bound handler fields everywhere it had been examined.
`@orkestrel/mcp` 0.0.19 **as installed** does not: `StdioServerTransport.start` and
`WebSocketServerTransport.start` both attach anonymous arrows and neither removes them. That is why
`ProbeServer` could not simply hold references — there were none to hold — and why the interposed
stream was necessary rather than stylistic.

The fixed transports are in `@orkestrel/mcp` 0.0.20, unpublished. The interposition stays correct
either way: it makes this server's ownership exact regardless of what the transport does with the
stream it is handed.

## `pipe`/`unpipe` rejected on measurement

Probed on Node 22.22.2: `unpipe` sets the source's `readableFlowing` to `false` even with a caller's
`data` listener still attached, which starves that reader, and `pipe` does not forward a source error
to the destination.

## The unknown, answered

`captureListeners` and `releaseListeners` have a second consumer, and it is off-limits:
`src/server/stages/RuntimeStage.ts:227,258`. Its need is irreducibly a diff — Vitest's `SIGINT` and
`SIGTERM` handlers are unexported internals it cannot name — and it releases them across an unawaited
`createVitest` call whose handlers land before its first await, so it can promise the window the
narrowed contract requires.

Both exports stay, with the contract narrowed to that window and the field-and-reference alternative
named for callers that cannot promise it. `ProbeServer` no longer calls either.

## Red then green

`npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:server
tests/src/server/ProbeServer.test.ts -t "while it was serving"`

| State | Result |
| ----- | ------ |
| `ProbeServer.ts` restored to `409926a` | 2 failed, 5 skipped, exit 1 |
| Fix in place | 2 passed, 5 skipped, exit 0 |

- `keeps a signal listener a host attached while it was serving` — red on
  `expected { SIGINT: 1, SIGTERM: 1 } to strictly equal { SIGINT: 2, SIGTERM: 2 }`. The release took
  the host's two.
- `keeps delivering to a reader that started reading while it was serving` — red on
  `expected { data: +0 } to strictly equal { data: 1 }`. The release took the host's reader.

The revert reddened exactly those and nothing else.

The stdin flow cases now span `{start found it flowing?} × {another reader present at release?}`, and
the fourth cell — a reader that started while the server was serving — is the one that could not be
written truthfully before this fix. Writing it is what makes the release-time
`listenerCount('data') === 0` half behavioural rather than inert.

## Criterion 1's second sentence, ruled by the Orchestrator

No path in `ProbeServer.ts` removes a listener chosen by absence from a capture. `releaseListeners`
still does, because `RuntimeStage.ts` is off-limits and needs it. The unit carried on rather than
stopping, correctly, and named what closing it would need.

**Ruled closed as documented.** The contract is now narrow and honest — it requires a window nothing
else can attach in — and its one consumer provably has that window. A helper with a narrow documented
contract and a consumer that meets it is not a defect.

## Gate evidence

`verifier`, Sonnet: all seven gates exit 0. `scaffold audit` reports 0 of 127 planned paths drifted.
`test:src` 11 files, 160 tests; `test:policy` 86; `test:config` 28; `test:guides` 12;
`test:distribution` 2.
