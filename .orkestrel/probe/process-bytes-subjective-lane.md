# Design round — the subjective lane's ruling

Claude Opus 5, read-only. Returned before the objective lane, which is running blind to it.

## The shape

Two members on `ProcessInterface`, each beside the member it pairs with:

```ts
/** The eagerly captured stdout lines, in arrival order, ending when the child's stdout closes. */
readonly lines: AsyncIterable<string>
/** The eagerly captured stdout chunks, in arrival order, ending when the child's stdout closes. */
readonly bytes: AsyncIterable<Uint8Array>

send(text: string): boolean
write(data: Uint8Array): boolean
```

The surface is a 2x2 and that structure is the design:

|       | Framed (`string`) | Raw (`Uint8Array`) |
| ----- | ----------------- | ------------------ |
| Read  | `lines`           | `bytes`            |
| Write | `send`            | `write`            |

`bytes` names what it delivers in one word, the way `lines` does, and "byte" is already the package's
vocabulary — `evidence` is documented as "the decoded byte-bounded stderr tail".

**One stdout, one reader.** `lines` is not a second capture; it is a decode of the same chunk queue
`bytes` reads. Whichever view first calls `next()` claims stdout for the child's life; the other view's
first `next()` throws a `ProcessError` coded `duplicate`, carrying the rejected view name on
`context.value`. That reuses an existing code rather than adding one.

## How the tension resolves

**Kept whole:** the eager-drain guarantee, and the live one-shot source.
**Declined outright:** the fleet's `stream()` convention.

Three reasons, in decreasing force.

1. **A `ReadableStream` over an eagerly drained queue advertises backpressure it cannot deliver.** The
   point of `pull` is that a slow reader slows the producer; the guarantee says the producer is never
   slowed. A type that promises flow control and provides none is worse than declining the shape,
   because a consumer reads the type and believes it. The three sibling packages have no such problem —
   their producer is a parsed array in memory, so `pull` really is the only clock.
2. **`stream()` fresh-per-call would mean something different here.** `markdown.stream()` twice gives two
   complete independent streams. `child.stream()` twice cannot, without retaining every byte forever.
   Spending the fleet's most recognizable name on different semantics misleads harder than not spending
   it.
3. **The nearest sibling outranks the distant convention.** `bytes` and `lines` are one data at two
   granularities; two container shapes would make a consumer switching granularity rewrite the loop, the
   cancellation, and the error path. `AsyncIterable` also keeps `src/core/types.ts` host-independent.

The cost, stated plainly: a consumer moving from `@orkestrel/csv` does not find `stream()`. The
compensation is one standard call — `ReadableStream.from(child.bytes)` — available on the Node the
package already requires (`engines.node` is `>=22.12.0`; `ReadableStream.from` landed in Node 20.6).

**The retained-buffer cost is not paid**, because there is no replay buffer. Memory is strictly lower
than today for a byte consumer and about equal for a line consumer — one queue of chunks instead of one
queue of decoded strings.

## Where framing lives

**`process` knows one framing, the newline, and nothing else. `Content-Length` stays in probe.**

The line, stated as a rule: a newline is the operating system's own convention for a text stream, so a
supervisor that hands back lines is describing its host rather than adopting a protocol. `Content-Length`,
JSON-RPC, NDJSON, and SSE are message protocols, and a supervisor that knew one would be a transport with
a parser welded inside — the shape the fleet already refused when it split `ndjson` and `sse` out.

`parseContentLength` stays in probe. It has one consumer, and the creation gate wants a first real
consumer rather than a first plausible one. **The named trigger for revisiting:** a second fleet consumer
speaking `Content-Length`-framed JSON-RPC over a child's stdio. `@orkestrel/mcp` does not move that
needle — its stdio transport is newline-framed and carries its own `extractLines`.

## Two deliberate behaviour changes to `lines`

1. **Bare `\r` stops terminating a line.** `readline` splits on `\n`, `\r`, and `\r\n`; the replacement
   splits on `\n` and trims one trailing `\r`, matching `@orkestrel/mcp`'s `extractLines` and
   `@orkestrel/ndjson`. A child's progress bar stops arriving as thousands of lines.
2. **A second concurrent reader throws instead of silently splitting.** Today two `for await` loops over
   `child.lines` share one buffer and interleave, losing data with no signal — the same class of defect
   this change exists to fix.

## What it rejected

| Candidate | What killed it |
| --------- | -------------- |
| `stream()` fresh per call from a retained buffer | Retaining every byte for the child's life with no release point, against a package whose `evidence` is bounded for exactly that reason |
| `stream()` single reader, no replay | Keeps the fleet's name while breaking the fleet's promise |
| A `ReadableStream` getter under another name | Still types backpressure the eager drain cannot honour |
| `raw`, `chunks`, `output`, `stdout`, `data` | `raw` names a treatment not a thing; `chunks` names delivery where `lines` names content; `output`/`stdout` collide with `RunResult.stdout`, a `string` |
| Internal tee beside `readline` | Both queues fill unconditionally, so a `bytes`-only consumer pays double memory and grows an unread line queue without bound |
| `write(data: string \| Uint8Array)` | The union reintroduces the encode-and-append ambiguity that caused the measured corruption |
| `send(text, options)` or a `framed` flag | A member that is empty by configuration is not a member |
| Removing `lines`, shipping only `bytes` | A real capability with a real ergonomic case; the rules remove a symbol only when the capability should not exist |

## The eight tensions it named for the objective lane

Recorded verbatim in intent, because a lane that names what it is least sure of is doing the pass's job.

1. `AsyncIterable` over `ReadableStream` — a `ReadableStream` whose `pull` awaits a queue does exert real
   pressure on the consumer's pace even when it cannot pause the producer, and `pipeThrough` composition
   may outweigh the type's honesty.
2. Rewriting `lines` rather than teeing — the larger, riskier diff chosen on a memory argument it did not
   measure.
3. Bare `\r` — a real behaviour regression for a consumer tailing a tool that draws progress bars.
4. Throwing on a second reader — whether to throw at all, and whether `duplicate` or `protocol` is honest.
5. `write` refusing `string` — costs every caller a `TextEncoder`.
6. No cap on the stdout queue — a runaway child can exhaust memory, now reachable through two members.
7. No new package — if a second real consumer exists that it missed, the ruling flips.
8. The framer as class state rather than an exported pure leaf — "export and test reusable logic" reads
   the other way.

## Its five risks

- The `readline` replacement may lose an edge case it did not enumerate; a differential run of both
  engines over one fixture corpus is the evidence that settles it.
- Its memory argument is unmeasured, and a measurement could collapse the plan back to the cheaper tee.
- The single-claim rule may be reachable accidentally through the guide's own idioms.
- `ReadableStream.from` availability is asserted from `engines.node`, not executed.
- Node `Buffer` chunks handed out as `Uint8Array` may be pooled views, so a retained chunk could alias.
