# Defect in `@orkestrel/process` 0.0.2 — `stop()` can signal the caller's own process group

**Severity: high, window: narrow.** Found by a verifier refuting a different finding, then reproduced
here with a control. This is `@orkestrel/process`'s own defect, not probe's.

## What happens

Construct a `Process` on a binary that does not exist, and call `stop()` (or `destroy()`) in the **same
tick** as construction. The caller's process group receives `SIGTERM`.

```text
missing binary, stop at t=0   -> exit=9 | RESULT: parent received SIGTERM
missing binary, stop at t=1   -> exit=0 | stop() returned normally, survived
missing binary, stop at t=50  -> exit=0 | stop() returned normally, survived
CONTROL real binary, t=0      -> exit=0 | stop() returned normally, survived
```

The control is the same call at the same tick against a real binary, and it survives. So the trigger is
the failed spawn, not the timing alone.

## The mechanism

`src/server/helpers.ts:26-39`:

```ts
export function killProcess(child, signal): void {
	try {
		if (process.platform === 'win32' || child.pid === undefined) {
			child.kill(signal)
			return
		}
		process.kill(-child.pid, signal)
	} catch { /* … */ }
}
```

A child whose spawn is going to fail has **not yet failed** in the construction tick: `child.pid` is
already `undefined`, but the internal handle is live with a libuv pid of `0`. So the guard takes the
`child.pid === undefined` branch and calls `child.kill(signal)`, which reaches `kill(0, SIGTERM)`.

POSIX defines `kill(0, sig)` as **signal every process in the caller's process group**. The host takes
its own `SIGTERM`.

At `t=1` the `error`/`close` sequence has fired, the handle is gone, `child.kill` is inert, and the bug
is unreachable. That is why it is easy to miss.

## Why the `catch` does not save it

The `catch` swallows a throw. `child.kill()` returns a boolean and does not throw here, so nothing is
caught — the signal is simply delivered.

## Suggested direction, for the package to rule on

The `child.pid === undefined` branch exists for Windows, where process groups work differently. On POSIX
a child with no pid has nothing to signal, so the honest action is to do nothing rather than to call
`kill` with a falsy pid. Distinguish "no pid because Windows" from "no pid because the spawn has not
resolved", and never let a falsy pid reach `kill`.

## How this was established, including two instruments that failed first

Worth recording, because two readings were wrong before the third was right.

1. **A raw probe calling `child.kill('SIGTERM')` directly after `spawn` returned `false` with no
   self-signal** — a false negative. Calling `kill` outside the package's own path does not reproduce
   the window.
2. **A probe through `createProcess` killed its whole pipeline** and printed nothing. The `Terminated`
   came from bash, because the signal reached the process group rather than the node process where the
   handler sat, so the trap could not report.
3. **`setsid --wait` plus an in-process `SIGTERM` handler and a real-binary control** is what settled it.
   An earlier attempt used bare `setsid`, which forks and returns immediately, so the output file was
   read before it was written — exit codes of `0` with no `RESULT` lines, which looked like a clean pass
   and was an empty measurement.

## Provenance

A lens claimed adoption would structurally prevent probe's spawn-failure hang. Its verifier refuted that
claim 10/10 and found this while doing so. The finding is the refutation's by-product, and it outlives
the adoption question entirely.
