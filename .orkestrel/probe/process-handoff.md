# Handoff to `@orkestrel/process` — everything this campaign found, for reconciling against 0.0.3

Nothing here has been written into `/workspace/process`. The checkout sits clean at `c594133` (0.0.2).
The only change made there was `npm run build`, which is gitignored.

## 1. A live defect — highest priority, independent of everything else

**`stop()` or `destroy()` called in the same tick as construction, on a binary that does not exist,
sends `SIGTERM` to the caller's own process group.** Measured with a control:

```text
missing binary, stop at t=0   -> exit=9 | parent received SIGTERM
missing binary, stop at t=1   -> exit=0 | stop() returned normally, survived
missing binary, stop at t=50  -> exit=0 | stop() returned normally, survived
CONTROL real binary, t=0      -> exit=0 | stop() returned normally, survived
```

`src/server/helpers.ts:31` takes its Windows branch on `child.pid === undefined`. A spawn that is going
to fail has not failed yet in the construction tick, so the pid is already undefined while the handle is
live with libuv pid `0`, and `child.kill(signal)` becomes `kill(0, SIGTERM)` — POSIX for signal every
process in the caller's group. The surrounding `catch` never fires, because `child.kill` returns a
boolean rather than throwing.

Direction: a POSIX child with no pid has nothing to signal. Distinguish "no pid because Windows" from
"no pid because the spawn has not resolved", and never let a falsy pid reach `kill`.

## 2. The byte surface — design round complete, implementation NOT started

Two lanes argued it blind; `process-bytes-reconciliation.md` carries the full ruling. The shape:

```ts
readonly lines: AsyncIterable<string>
readonly bytes: AsyncIterable<Uint8Array>
send(text: string): boolean
write(bytes: Uint8Array): boolean
```

One retained chunk queue, two cursors. `lines` decodes and splits the same chunks `bytes` yields, so
there is one stored copy rather than two. No tee, and no single-reader rule — retention makes two
cursors free, which also removes the silent interleave two `for await` loops over `lines` have today.

Both lanes independently rejected a `string | Uint8Array` union on `write` and an option on `send`.

## 3. Measurements worth keeping, whatever 0.0.3 did

- **Line framing cannot carry a length-prefixed protocol.** An LSP body has no trailing newline, so a
  line reader holds it and then emits it welded to the next frame's header:
  ```text
  after frame 1:  "Content-Length: 25" | ""
  after frame 2:  "{\"id\":1,\"result\":\"FIRST\"}Content-Length: 26" | ""
  ```
- **Teeing behind the eager drain retains everything unread**: 4,096 chunks on the idle branch, against a
  direct-child control that replayed nothing.
- **A pull-based `ReadableStream` backpressures correctly on Node 22**, measured against an eager
  control. If a rationale anywhere says otherwise, it is wrong.
- **Node 22.22.2 supports native `for await` over `ReadableStream`**, verified with a non-iterable
  control that threw. `ReadableStream.from(child.bytes)` is therefore a real escape hatch.
- **`send` appends a newline unconditionally** (`Process.ts:124`). Against real Oxlint, an exact frame
  works and the server lives; the same frame through `send` returns `{"code":-32700,"message":"Parse
  error"}` and the server exits code 0 at +244 ms.
- **0.0.2's `error` event and `exit` both behave correctly on a spawn failure**:
  ```text
  SCENARIO spawn failure   SETTLED code=-2 signal=null   events=[error:ENOENT, exit:-2/null]
  CONTROL  healthy child   SETTLED code=0  signal=null   events=[exit:0/null]
  ```
  `exit` settles rather than hanging, because settlement is bound to `close`, which fires where `exit`
  does not.

## 4. Documentation notes for whatever ships

- `ProcessExit.code` is `-2` for a child that never spawned, and that is undocumented. Its TSDoc says
  only "The exit code, or `null` when a signal ended the process", so a consumer reading `code` alone
  cannot separate "never spawned" from "exited -2". The `error` event is what names it.
- `exit.code` is `null` on a signal death, so a consumer reading the code alone rewrites the liveness bug
  probe already fixed twice. Worth a line in the guide.

## 5. Deferred, and not carried into any 0.0.3 recommendation

- **Bare `\r` no longer terminating a line.** One lane proposed aligning `lines` with the fleet's
  `\n`-only rule. Real, but unrelated to the byte surface, and scope is fixed when work begins.
- **Probe's `LintStage` adoption.** Explicitly after 0.0.4.

## 6. What probe still hand-rolls, and would keep

Framing. Both lanes put it outside `process`, citing the fleet's own split of `ndjson` and `sse` into
stateful parsers with no emitter and no transport. `parseContentLength` stays in probe. The named trigger
for revisiting: a second fleet consumer speaking `Content-Length`-framed JSON-RPC over child stdio.
