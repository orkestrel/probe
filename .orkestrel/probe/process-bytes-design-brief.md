# Design round — the shape of `@orkestrel/process`'s byte surface

## The decision

`@orkestrel/process` 0.0.3 gains a way to read a child's stdout as raw bytes. **Rule on its exact
shape.** The user has accepted the need; only the shape is open.

Two lanes argue this blind and the Orchestrator reconciles. Propose; do not implement.

## Why it is needed — settled, do not re-litigate

`Process` drains stdout through `readline` in its constructor
(`/workspace/process/src/server/Process.ts:79`) and publishes only `lines`. A length-prefixed protocol
cannot survive that. Measured with the interface built exactly as the package builds it, over a stream
left open:

```text
after frame 1:  "Content-Length: 25" | ""
after frame 2:  "{\"id\":1,\"result\":\"FIRST\"}Content-Length: 26" | ""
```

Frame one's body arrives welded to frame two's header. Systematic corruption, not delay.

The write side is line-shaped too: `Process.ts:124` is `stdin.write(\`${text}\n\`)`, appending a newline
unconditionally. Against real Oxlint, an exact frame works; the same frame through `send` returns
`{"code":-32700,"message":"Parse error"}` and the server exits code 0 at +244 ms.

Exposing `child.stdout` directly is refused: readline is attached in the constructor, so a second
consumer would race it. That is settled.

## The tension you are ruling on

Three things are each individually desirable and **cannot all hold**.

1. **The fleet convention.** `@orkestrel/markdown`, `@orkestrel/html`, and `@orkestrel/csv` all publish
   `stream(): ReadableStream<T>` — a **fresh** stream per call, pull-based, one item per `pull`,
   backpressure-respecting, cancellable, pipeable through any `TransformStream`, and natively `for await`
   iterable. Read `/home/user/scaffold/guides/markdown.md` § "Shallow streaming with `stream()`",
   `guides/html.md`, and `guides/csv.md` for the exact idiom and its documented wording.
2. **`process`'s existing guarantee.** Its TSDoc states stdout is drained eagerly "so `exit` resolves and
   a late consumer of `lines` still receives every framed line, including a final line written without a
   trailing newline."
3. **The source is live and one-shot.** A child's stdout cannot be replayed. Those three packages stream
   a stored document; `process` streams a process.

A `ReadableStream` also locks to one reader. `lines` and a byte surface both consuming one child stdout
requires an internal tee.

**Rule on how to resolve this.** Some candidate shapes, not an exhaustive list — propose a better one if
you have it:

- a getter returning one `ReadableStream<Uint8Array>`, single reader, no replay;
- a `stream()` method returning a fresh stream per call, fed from a retained buffer (price the memory:
  `evidence` is byte-bounded for exactly this reason, and a long-lived child is unbounded);
- a getter returning an `AsyncIterable<Uint8Array>`, matching `lines` rather than the fleet;
- something else.

## The second question — where does framing live?

`@orkestrel/ndjson` and `@orkestrel/sse` are **stateful chunk parsers**: `parse(chunk) → complete items`,
retaining a trailing partial until its terminator arrives, no emitter and no transport. Read
`guides/ndjson.md` and `guides/sse.md`.

That is the same job a `Content-Length` reader does. **Rule on whether `process` should know anything
about framing at all**, or whether the fleet's answer is "`process` hands out bytes; a parser in the
`ndjson`/`sse` shape turns them into messages."

Probe already has `parseContentLength` in `src/server/helpers.ts`. Consider whether that should stay in
probe, or whether the shape suggests a separate parser package. **Do not propose creating a package
unless the evidence demands it** — `AGENTS.md`'s creation gate requires a first real consumer.

## The write side

Rule on how a caller writes bytes without an appended newline. A sibling member, an option on `send`, or
a different shape. `send` returns `false` for a closed channel rather than throwing, and that behaviour
should survive whatever you propose.

## Constraints

- `AGENTS.md` § Design laws bind: single-word entity APIs, no superfluous wrappers, boolean behavior over
  two-literal unions, real domain states only, derive state, minimal public API with a first real
  consumer.
- `@orkestrel/process` is at 0.0.2, `/workspace/process`, commit `c594133`. Read
  `src/core/types.ts`, `src/server/Process.ts`, and `guides/process.md`.
- Its runtime dependencies are `@orkestrel/contract` and `@orkestrel/emitter`. Adding a dependency needs
  the user's explicit request; do not propose one casually.
- The first real consumer is probe's `LintStage`, which speaks LSP to Oxlint. `@orkestrel/mcp`'s
  transport is a second real consumer, of `lines`, and is newline-framed — so whatever you propose must
  not degrade `lines`.
- **Read-only.** Propose; implement nothing. Write any instrument under `/workspace/process/tmp/scratch/`
  and delete it.

## Execution

Perform this assignment directly. Spawn no subagent and delegate no part of it.

## Output

1. **The shape** — the exact member signature, its name, and one sentence on why that name.
2. **How the tension resolves** — which of the three you keep whole, which you compromise, and the cost.
3. **The write side** — the exact signature.
4. **Where framing lives** — and why.
5. **What you rejected** — each candidate you considered and the rule or measurement that killed it.
6. **The migration** — what changes for `lines`, for MCP's transport, and for anything already shipping.
