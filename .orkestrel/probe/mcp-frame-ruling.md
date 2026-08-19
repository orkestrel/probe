# Ruling — probe keeps its own LSP message handling

The user asked for this to be verified before adoption. It was verified, and it does not hold.

The unit ran on Cursor Grok (`cursor-grok-4.6-high`), live at dispatch, journal at
`tmp/cursor/mcp-frame.log`. Its verdict was ADOPT IN PART. The Orchestrator measured the two arms it
cleared and rules **REJECT** on all of it.

## What the bench found

`@orkestrel/mcp` publishes framing-agnostic JSON-RPC envelope guards in host-independent core, and
publishes no `Content-Length` reader at all — only newline delimiting and SSE. So probe's
`parseContentLength`, `#read`, and `#frame` have no published counterpart and were never in question.

It found one trap in the response arm. LSP replies to `shutdown` with `result: null`, which every probe
fixture sends:

```text
tests/src/server/stages/LintStage.test.ts:35  send({ jsonrpc: '2.0', id: message.id, result: null })
tests/src/server/Probe.test.ts:49             send({ jsonrpc: '2.0', id: message.id, result: null })
```

`isJSONRPCResultResponse` requires `result` to satisfy `isMCPResult` or `isMCPLegacyResult`, neither of
which admits `null`. **Adopting the response parser would hang `destroy()`** — the reply would be
dropped, the `shutdown` promise would never settle, and the teardown would wait forever.

## What the Orchestrator measured, and why the cleared arms are refused too

Grok cleared `isJSONRPCNotification` and `isJSONRPCError`. Both were run against real LSP shapes with
controls drawn from outside the population:

```text
--- isJSONRPCNotification ---
accept   LSP publishDiagnostics
accept   LSP notification no params
accept   LSP logMessage
REFUSE   LSP array params
REFUSE   no jsonrpc field
REFUSE   CONTROL a request (has id)
REFUSE   CONTROL a response
--- isJSONRPCError ---
accept   LSP error obj
accept   with data
REFUSE   string code
REFUSE   CONTROL missing message
```

Both guards are correct for the shapes Oxlint actually sends, and both controls are refused, so the
instrument works. Two divergences from probe's current behaviour, both unreachable today:

- **Array `params`.** JSON-RPC 2.0 permits positional parameters; the MCP guard requires an object.
  Probe consumes exactly one notification, whose params are an object, and its existing structural
  narrowing already discards an array at the `'uri' in params` check.
- **A missing `jsonrpc` field.** The guard refuses it; probe never checks it. Every fixture sends
  `jsonrpc: '2.0'`, so nothing reaches this.

## The ruling

Adoption is safe **today**, by coincidence of what Oxlint sends rather than by contract. That is the
reason to refuse it.

1. **LSP is not MCP, and the divergence is invisible until it hangs.** The `result: null` trap is proof
   that these two JSON-RPC dialects disagree in ways that produce a deadlock rather than an error.
   Adopting the neighbouring arms binds probe's LSP handling to a contract written for a different
   dialect, which is free to tighten in a release. The next divergence arrives as a hung `destroy()` in
   a package nobody changed.
2. **There is no re-implementation to delete.** `.claude/rules/tests.md` forbids reimplementing a
   framework helper, and probe does not. `#receive` does method dispatch for one message type plus
   narrow structural narrowing; its whole envelope check is
   `typeof message !== 'object' || message === null`. Replacing one line with a cross-package import is
   the wrapper `AGENTS.md` § Design laws refuses — it adds no boundary, invariant, composition,
   translation, lifecycle, or materially narrower contract that probe's own code does not already hold.

Probe keeps `#read`, `#frame`, `#receive`, and `parseContentLength` as they are. `@orkestrel/mcp` stays
what it already is here: the transport for the entry's own MCP surface, imported by
`src/server/factories.ts` as `createStdioServer`.

## Retained for a future reader

If probe ever speaks MCP over `Content-Length` framing rather than LSP, revisit this. The envelope
guards are the right primitives for that wire, and the reason they are refused here is the dialect, not
the package.
