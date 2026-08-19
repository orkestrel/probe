# `@orkestrel/process` 0.0.2 — the missing `error` event, and what it changes for probe

Recorded mid-analysis. The five-lens overlap workflow is running against **0.0.1** and cannot be told;
this note is applied at reconciliation instead.

## What is changing

The user is republishing `@orkestrel/process` as 0.0.2 because `ProcessEventMap` is missing an `error`
member. At 0.0.1 the map is exactly two events:

```ts
export type ProcessEventMap = {
	readonly stderr: readonly [chunk: string]
	readonly exit: readonly [exit: ProcessExit]
}
```

Note that the `error` named in `ProcessOptions` is `EmitterErrorHandler` — the emitter's isolated
listener-failure channel, documented as "never onto this map". That is a different thing from a child
that fails.

## Why it matters more to probe than it looks

Probe's defect (b) — the one that hung `destroy()` and that S3fix removed the stored field to close — is
**exactly a spawn failure**. Node reports that as `error` then `close`, and never `exit`. Measured:

```text
healthy child     exit:0/null | close:0/null
missing binary    error:ENOENT | close:-2/null      <- no exit
```

So at 0.0.1, a consumer watching `ProcessEventMap` sees **nothing at all** when a child fails to spawn:
no `stderr`, no `exit`. That is the same hole probe just spent a fix round closing, and probe would have
inherited it.

`ProcessExit` also cannot express a spawn failure. Its two members are `code` and `signal`, and a child
that never spawned has neither — Node leaves `exitCode` at `-2` on the object, but there is no exit event
carrying it.

## The consequence for the ruling

**Any lens finding that says the toolkit fails to observe a spawn failure is a 0.0.1 finding, not a
0.0.2 one.** Do not carry it into the ruling as a permanent objection; re-check it against 0.0.2 when it
lands.

Conversely, any lens finding that the toolkit's lifecycle coverage is REAL was measured without the
event probe most needs, so 0.0.2 can only strengthen it.

Two things to check when 0.0.2 lands, before adopting anything:

1. Whether `error` on the map carries enough to distinguish a spawn failure from a mid-life stream
   error. Probe needs both, and they are different faults.
2. Whether `exit` still resolves — or rejects, or stays pending — when the child never spawned. The
   promise is what a teardown awaits, and a pending one is the hang.

---

## Measured against the real 0.0.2, and one claim above is WRONG

`process` was pulled to `c594133` (0.0.2) and rebuilt. `ProcessEventMap` now carries the event:

```ts
/** The child emitted an error — a spawn fault or process-level failure — carrying its cause. */
readonly error: readonly [error: unknown]
```

emitted from `src/server/Process.ts:83`:

```ts
this.#child.once('error', (cause: unknown) => this.#emitter.emit('error', cause))
```

Driven as a real consumer, with a healthy child as the control:

```text
SCENARIO spawn failure   SETTLED code=-2 signal=null   events=[error:ENOENT, exit:-2/null]
CONTROL  healthy child   SETTLED code=0  signal=null   events=[exit:0/null]
```

### Both open questions are closed

1. **`error` separates a spawn fault from an ordinary life.** It fires with `ENOENT` on the scenario and
   does not fire on the control, so it discriminates.
2. **`exit` SETTLES for a child that never spawned.** It does not reject and it does not stay pending.
   The mechanism is `child.once('close', …)` at `Process.ts:84`: `close` fires on a spawn failure even
   though `exit` never does, and `#close` is bound to it.

**So `@orkestrel/process` 0.0.2 structurally prevents probe's defect (b)** — the hang that S3fix removed
a stored field to close. Probe would not inherit it. That is measured rather than argued.

### The correction

This note claimed earlier: "`ProcessExit` also cannot express a spawn failure. Its two members are
`code` and `signal`, and a child that never spawned has neither."

**That is wrong.** A spawn failure settles with `code = -2` — Node's `close` code for `ENOENT`. The shape
does carry a distinguishable value.

One qualification stands, narrower than the original claim: `-2` is not documented on `ProcessExit`,
whose TSDoc says only "The exit code, or `null` when a signal ended the process". A consumer reading
`code` alone cannot tell "never spawned" from "exited -2"; the `error` event is what names it. That is a
documentation observation about 0.0.3's guide, not a defect.
