# Instruments that work

Two units have now spent significant budget building a client for the probe's stdio server and
failing. The working one is here so a third does not.

## `wire.mjs` — drive the built entry over stdio

Spawns `dist/bin/main.js` and speaks the transport correctly. Point a unit at this rather than letting
it write its own.

Two facts decide whether such an instrument works, and both have cost this campaign a unit:

- **The Model Context Protocol stdio transport is newline-delimited JSON.** An instrument that frames
  requests with `Content-Length` headers — the way a Language Server Protocol client does — hangs with
  no error and no output. That framing is correct for the probe's *lint* stage, which speaks LSP to
  Oxlint, and wrong for its *server*. The two live in one package, which is how the mistake gets made.
- **Boot is about 4.4 seconds** because arming runs two real controls before the probe will serve. An
  instrument whose timeout is tighter than that reports a hang that is really a wait. Handshake
  requests answer immediately; only `tools/call` waits on arming.

A current-revision `tools/list` needs all three reserved metadata keys, not just the version:

```js
send('tools/list', { _meta: {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'orchestrator', version: '1.0.0' },
} })
```

Sending only the version is refused as malformed metadata, which reads like a server defect and is not.

## The bench sandbox buffers a pipe until EOF

This is the third fact, and it is the one that cost the most, because it makes a correct instrument
look broken and only inside a bench.

A unit running under a bench sandbox that creates a child with `stdio: 'pipe'` and writes requests
interactively gets nothing back until EOF. The child answers correctly; its output sits in the buffer.
So an interactive driver hangs, a driver that redirects a file and closes stdin works, and the same
interactive driver run outside the sandbox works too. Three observations that look contradictory until
the buffering is the explanation.

What to do about it depends on where the instrument runs:

- **Outside a bench sandbox** — the Orchestrator's own shell — plain pipes are fine, and `wire.mjs`
  works as written.
- **Inside a bench sandbox**, either redirect a prepared newline-delimited file into the child and let
  EOF flush it, or give the child a pseudoterminal-backed stdio so nothing buffers. A unit that needs
  request-by-request sequencing needs the pseudoterminal; a unit that only needs all four responses
  can use the file.

Note the shape of the mistake this produces. Every unit that hit it concluded its subject was broken
and went looking in the server, because a hang with empty stdout and empty stderr is exactly what a
dead server looks like. Two of them spent most of their budget there. The instrument was right and the
environment was lying.

## Measured results this instrument produced

```text
handshake initialize -> {"name":"probe","version":"0.0.1"}
handshake tools/list -> prove
modern    tools/list -> prove
--- tools/call prove ---
probe c33e9c58-… (723 ms)
toolchain typescript 6.0.3, oxlint 1.79.0, vitest 4.1.11
case type: 0 findings (174 ms)      control type: 0 findings (109 ms)
case lint: 0 findings (191 ms)      control lint: 0 findings (124 ms)
case runtime: 0 findings (392 ms)   control runtime: 1 finding (330 ms)
  tmp/probe/w.test.ts:2 expected 4 to be 5 // Object.is equality
receipt probe:c33e9c58-…:runtime:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11
```

Both protocol eras answer, and the `tools/call` returns the verdict as raw text rather than a
JSON-quoted string.

## The bench sandbox gives a Node-spawned-Node child no working stdio

Measured by unit S2's fix round with a throwaway probe, 2026-08-19, after it cost that unit most of a
round.

Inside the Codex bench sandbox, a Node process spawned by another Node process **exits cleanly but
never receives stdin and never publishes stdout**. This is stronger than the buffering constraint
recorded earlier on this page: it is not that the pipe buffers until EOF, it is that the channel does
not work at all.

**What this makes unprovable inside a bench.** Anything whose subject is a child process speaking a
protocol over stdio. Concretely:

- `LintStage` in its entirety. It spawns `oxlint --lsp` and speaks LSP over that child's stdio, so a
  bench unit cannot arm it, cannot drive it, and cannot observe it fail.
- Any Language Server Protocol fixture, including the protocol-faithful one S2 built.
- The built entry's own MCP transport, wherever a test drives it as a spawned child.

**How this produces a FALSE GREEN rather than an obvious failure.** The stage cannot arm, so the
probe's boot inspection times out, and that timeout produces the same rejection message a genuine
stage timeout produces. A test asserting on the message accepts it. The unit sees green, the gate
outside the sandbox sees the honest red, and the two disagree for a reason neither run reports.

**The routing consequence.** Unit S3's whole subject is `LintStage`'s behaviour when its child dies,
hangs, or misbehaves. A bench unit cannot measure any of that. Either route S3 to the harness's native
`implementer`, which runs outside this sandbox, or keep it on the bench and have the Orchestrator
supply every executed measurement it needs. Do not dispatch it to a bench and expect it to prove its
own work.

**How to tell you have hit this.** A child process that exits with code 0 almost immediately, a request
to it that never resolves, and a stack that lands in the spawning code's `exit` handler.
