# Design round — reconciliation

Two lanes argued one brief blind, on different engines. Opus 5 held the subjective lane, GPT-5.6 Sol the
objective lane. The Orchestrator rules.

## What both lanes reached independently — settled

1. **`write(bytes: Uint8Array): boolean` as a separate member.** Identical proposals. Both rejected a
   `string | Uint8Array` union and both rejected an option on `send`, for the same reason: exact bytes
   and newline-framed text are different behaviours, and a member that is empty by configuration is not
   a member. `send` is untouched.
2. **Framing stays out of `process`.** Both cited the `ndjson`/`sse` division — a stateful parser retains
   partial framing state, a transport only delivers chunks. `parseContentLength` stays in probe. No
   parser package: one local implementation does not meet the creation gate.
3. **The fleet's `stream()` convention is declined**, and for an agreeing core reason: a fresh stream per
   call needs replay storage, and a one-shot live source makes that unbounded.
4. **`lines` keeps its contract**, because MCP's transport is newline-framed and is its consumer.

## Where they disagree

| | Subjective (Opus) | Objective (Sol) |
| - | ----------------- | --------------- |
| Read surface | `bytes: AsyncIterable<Uint8Array>` on `ProcessInterface` | `stdout: readonly [chunk: Uint8Array]` on `ProcessEventMap` |
| Mechanism | one chunk queue, `lines` derived from it | push event, no second reader |
| Multi-reader | a `duplicate` throw on the second claim | not applicable, events broadcast |

## The measurement that settles half of it

Sol measured what Opus admitted it had not:

```text
tee total=4096 fast=4096 late=4096 made-before-late=4096 made-after-late=4096
control-direct-child first="XYZ" late="" code=0 signal=null
```

**A tee behind the eager drain retains every unread chunk.** That kills the tee outright — and the tee
was Opus's own Alternative B, which it had already rejected on an unmeasured memory argument. The
measurement confirms the conclusion Opus reached without it.

Sol also refuted one of Opus's stated *reasons*. Opus declined `ReadableStream` partly because it would
"advertise backpressure it cannot deliver". Sol measured that a pull-based `ReadableStream` backpressures
correctly on Node 22:

```text
pull-based before-read pulls=1
pull-based after-one-read value=1 pulls=2
control-eager before-read-enqueues=4 first=1
```

So the type is not dishonest in the way Opus claimed. The conclusion survives on Opus's other two
reasons — replay semantics and sibling consistency — but the premise does not, and a right answer
resting on a wrong premise is worth separating, because the premise is what a later reader reuses.

## The ruling: neither lane's read surface, and the synthesis is the Orchestrator's

**Take Opus's retained chunk queue. Drop Opus's single-reader `duplicate` throw. Do not take Sol's
event as the primary surface.**

### Why not Sol's event

Its symmetry argument is real — `stderr` is already an event carrying chunks, so `stdout` beside it looks
inevitable. **The symmetry hides an asymmetry:** stderr is diagnostic and stdout is the protocol channel.
A missed stderr chunk costs a diagnostic; a missed stdout chunk corrupts a protocol.

Sol states the cost plainly and it is disqualifying for this consumer: "A consumer that needs every byte
must register `ProcessOptions.on.stdout` during construction." Forgetting a constructor option would
silently lose protocol bytes, which is a worse failure mode than the memory it saves.

The package's own precedent argues the same way. `evidence` exists **because** the `stderr` event alone
was judged insufficient — a push surface already needed a retained companion once. Sol's shape gives
stdout a push surface with no companion.

And it forfeits `for await`, which is the ergonomic the fleet's guides showcase and the reason this
convention was raised at all.

### Why the `duplicate` throw is unnecessary

Opus proposed it because two consumers of one queue interleave and lose data. True of a *consumed* queue.
**It is not true of a retained one.**

The queue must be retained anyway, to keep the late-consumer guarantee `lines` already documents. Once
the chunks are retained, two independent cursors over them are free — `bytes` iterates the chunks and
`lines` iterates the same chunks decoded and split. No claim, no throw, no interleaving, and both views
work for a late consumer.

Retention is not a new cost. `lines` retains today; the change stores chunks instead of decoded strings,
which is roughly the same bytes and **one** stored copy instead of two. That satisfies "derive state"
rather than straining against it, and it is why Sol's objection — "lossless late consumption still
requires an unbounded queue" — is correct and not an objection: the queue is already there, drained by
its consumer, exactly as `evidence` is bounded because nothing drains it.

### The resulting shape

```ts
export interface ProcessInterface {
	readonly emitter: EmitterInterface<ProcessEventMap>
	readonly lines: AsyncIterable<string>
	readonly bytes: AsyncIterable<Uint8Array>
	readonly evidence: string
	readonly exit: Promise<ProcessExit>
	send(text: string): boolean
	write(bytes: Uint8Array): boolean
	stop(): Promise<void>
	destroy(): Promise<void>
}
```

A 2x2: `lines`/`bytes` to read, `send`/`write` to write, framed and raw. `ReadableStream.from(child.bytes)`
remains the one-line path to a web stream for a consumer who wants `pipeThrough`.

## Carried from Sol against Opus

- **The tee is dead by measurement**, not by argument. Record the numbers in the guide's rationale.
- **`ReadableStream` backpressures correctly on Node 22.** Do not repeat Opus's premise anywhere in the
  guide or the TSDoc.
- **Node 22.22.2 supports native `for await` over `ReadableStream`**, verified with a non-iterable
  control that threw. That makes `ReadableStream.from` a real escape hatch rather than an asserted one.

## Carried from Opus against Sol

- **The retained queue keeps the late-consumer guarantee**, which the event shape cannot.
- **`bytes` names what it delivers**, matching `lines`. Sol's `stdout` names a channel and would sit
  oddly beside `lines`, which does not.

## Dropped on the record

- **Opus's single-reader `duplicate` throw.** Unnecessary under retention, as above. Its underlying
  observation — that two `for await` loops over today's `lines` silently interleave — is real and is
  fixed by the same retention, so it needs no error code.
- **Opus's bare-`\r` change.** Out of scope for this round: it changes `lines` behaviour for a reason
  unrelated to the byte surface, and `AGENTS.md` fixes scope when work begins. Record it as a successor.

## This synthesis is the Orchestrator's own and gets audited like any other unit

Neither lane proposed it. `.agents/orchestration.md` § Acceptance laws: "When the Orchestrator writes any
part of a unit, that part is briefed, owned, and audited like any other part, and its auditor is an
engine the Orchestrator does not share." The implementation is briefed to a writer and audited by Sol.

**The one thing an auditor must attack first:** whether two independent cursors over one retained chunk
queue actually deliver `lines`' documented behaviour — every line to a late consumer, and the final
unterminated line flushed at close — with no shared mutable carry between the two views.
