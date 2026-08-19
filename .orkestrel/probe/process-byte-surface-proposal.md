# Proposal — give `@orkestrel/process` a byte surface beside its line surface

Answers the question: is shape A provably impossible, or is shape B better on the merits?

**Short answer: A is not impossible in the abstract, it is blocked by one omission and one design
property — and the obvious minimal fix for the omission is a trap. B is better on the merits, for a
reason that has nothing to do with probe.**

## Why A cannot be taken as the package stands

Two independent blocks.

1. **Nothing is exposed.** `ProcessInterface` publishes seven members — `emitter`, `lines`, `evidence`,
   `exit`, `send`, `stop`, `destroy`. No stream, no child, no chunk event.
2. **stdout is already being drained.** `src/server/Process.ts:79` runs in the constructor,
   unconditionally:

   ```ts
   this.#reader = createInterface({ input: this.#child.stdout, crlfDelay: Infinity })
   ```

The second is why "just expose `child.stdout`" is the wrong fix. readline is consuming that stream from
construction, so a second consumer would be racing it for chunks. That reads fine in a quick test and
loses bytes under load — a worse API than not exposing it at all.

## Why line framing cannot carry a length-prefixed protocol

Not a corruption *risk*. Systematic corruption. Measured with `createInterface` built exactly as
`Process.ts:79` builds it, over a stream left open the way a live child's stdout is:

```text
after frame 1:  "Content-Length: 25" | ""
after frame 2:  "{\"id\":1,\"result\":\"FIRST\"}Content-Length: 26" | ""
```

An LSP body carries no trailing newline, so the reader holds it. When the next frame arrives, the held
body is emitted **welded to the next frame's header** as one line. Every message is permanently glued to
the following message's header.

The package's own TSDoc states the guarantee that produces this, and it is a good guarantee: stdout is
drained eagerly "so `exit` resolves and a late consumer of `lines` still receives every framed line,
including a final line written without a trailing newline." That flush happens at close. A language
server's every message is an unterminated final line until the next header arrives, and it needs the
message while the stream stays open.

The write side is line-shaped too. `Process.ts:124` is `this.#child.stdin.write(\`${text}\n\`)` — a
newline appended unconditionally. Driving the real Oxlint server, an exact frame works and the server
lives; the same frame through `send` returns `{"code":-32700,"message":"Parse error"}` and the server
exits code 0 at +244 ms.

## The reason to do this that is not about probe

**`process` already treats its two output streams asymmetrically.**

```text
stderr   this.#child.stderr.on('data', this.#retain.bind(this))   raw chunks, live event + bounded tail
stdout   createInterface({ input: this.#child.stdout, ... })      lines only
```

A consumer can already get stderr as bytes. It cannot get stdout as bytes. The package knows how to hand
out chunks; it just does not do it for the stream where a caller is most likely to need them. Closing
that asymmetry is a coherence fix in its own right.

## The recommended shape

**Add a byte surface beside `lines`. Do not add a framing mode.**

Against a framing mode (`framing?: 'lines' | 'length'`):

- It is a two-literal union, which `AGENTS.md` § Design laws targets under "Boolean behavior" and "Real
  domain states only".
- It teaches a general child-process toolkit what LSP is. The next consumer wants netstrings, a 4-byte
  length prefix, or SSE, and each one is another literal.
- It puts protocol knowledge in the tier that should own only process lifetime.

For a byte surface:

- One member, one word, no union, no protocol knowledge anywhere in `process`.
- The eager-drain guarantee is kept: tee each chunk to the byte queue and to readline from one read.
  `exit` still resolves, and a late consumer of `lines` still receives everything.
- It closes the stdout/stderr asymmetry above.
- `AGENTS.md`'s creation gate is satisfied rather than speculated: probe's `LintStage` is the first real
  consumer, and `@orkestrel/mcp`'s transport is a second real consumer of `lines`.

Both directions need it, because both are line-shaped today:

- **Read:** a member beside `lines` yielding raw chunks — `bytes`, as `AsyncIterable<Uint8Array>`. The
  plural-noun-of-what-it-yields matches `lines`.
- **Write:** a way to write without the appended newline. Either a sibling member or a `send` that does
  not append. A caller framing its own messages must control every byte it emits.

Probe then takes shape A **through** B: `Process` owns spawn, `exit`, bounded `stop`, and stderr
`evidence`; probe keeps `parseContentLength` and the LSP conversation over `bytes`.

## What this does not change

The rest of the overlap ruling stands. Probe's other two stages spawn nothing — `RuntimeStage` was
measured running `pool: 'threads'` in the same process — and the four test-side spawn sites should adopt
`process` regardless of framing, because they drive children and terminate them by hand today.
