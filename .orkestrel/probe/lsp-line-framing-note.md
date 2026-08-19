# Why a line reader cannot carry LSP, in fifteen lines

The minimal mechanism behind the overlap analysis's decisive finding, reproduced by the Orchestrator
independently of the lens that found it.

## The measurement

A `PassThrough` that stays open, like a live child's stdout, with `readline` over it:

```text
SCENARIO  LSP frame (no trailing newline)
  server ALIVE : "Content-Length: 17" | ""
  after CLOSE  : "Content-Length: 17" | "" | "{\"jsonrpc\":\"2.0\"}"

CONTROL   NDJSON line (trailing newline)
  server ALIVE : "{\"jsonrpc\":\"2.0\"}"
  after CLOSE  : "{\"jsonrpc\":\"2.0\"}"
```

## What it says

An LSP frame is `Content-Length: N\r\n\r\n<body>`, and **the body carries no trailing newline**. A line
reader emits a line only when it sees a delimiter, so while the server is alive it yields the header and
the blank line and then holds the body in its partial-line buffer indefinitely. The body appears only
when the stream closes — which, for a language server, means the server died.

The control is newline-delimited JSON, the framing MCP's stdio transport speaks. Its body arrives
immediately, because the delimiter is there.

So this is not a corruption risk or an edge case. **A line reader over LSP never delivers a message while
the server is running.**

## The first instrument was wrong, and was not used

The first attempt built both streams with `Readable.from([chunk])`, which ends the stream after that
chunk. Both rows therefore flushed immediately and the control did not discriminate, so the instrument
proved nothing. Replaced with a `PassThrough` left open, which is what a live child's stdout is.

## Why it matters here

It corrects a claim the Orchestrator had already made: that a line reader pointed at Oxlint would see
three lines per message and could skip two and parse the third. It sees **two**, and holds the third.

It also matches the overlap lens's end-to-end measurement against the real `oxlint --lsp` server, taken
separately: probe's raw-stdout reader recovers the `initialize` response in 71-102 ms, while through
`Process.lines` the two header lines arrive at ~76 ms and the payload never arrives at all, 3 of 3 runs
against a 3-second budget. `LintStage.#warm` awaits that response, so the adoption hangs on the
handshake rather than degrading.
