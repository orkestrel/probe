# PBFIX4 — never remove a listener you did not add

## Role and engine

`implementer`, Opus 5. A published-contract change in a package that has never published, so it is
free now and expensive after. Its auditor is GPT-5.6 Sol, which did not write it.

## Objective

Make `ProbeServer` release exactly the listeners it attached, so a caller's own listener survives
`destroy`.

## The defect

`src/server/helpers.ts:454-461`:

```ts
export function releaseListeners(emitter: EventEmitter, capture: ListenerCapture): void {
	for (const [event, captured] of capture) {
		for (const listener of emitter.listeners(event)) {
			if (captured.includes(listener)) continue
			emitter.removeListener(event, listener)
		}
	}
}
```

It removes every listener absent from the capture. A listener a caller attached **after** the capture
is absent from it, so the helper takes it. The contract it documents — restore the emitter to its
captured state — cannot distinguish "this server added it" from "someone else added it later", and
those are different facts.

Found by the unit that fixed the stdin ownership rule. Its consequence there: the release-time
`listenerCount('data') === 0` check in `ProbeServer` is **behaviourally inert**, because this helper
has already stripped any caller reader before the count is read. The check is correct and mandated,
and it becomes load-bearing the moment this helper stops taking listeners it did not add.

## The ruling you implement

**Hold your handlers as fields and remove them by reference. Never remove a listener you did not
add.**

That is already the shape this fleet uses everywhere else it was examined:
`@orkestrel/mcp`'s `StdioServerTransport`, `WebSocketServerTransport`, and both
`WebSocketClientTransport` classes each hold `readonly` bound handler fields and remove exactly those,
and `@orkestrel/probe`'s own `LintStage` does the same. `ProbeServer` is the outlier.

Whether `releaseListeners` and `ListenerCapture` survive is yours. Either is defensible:

- **Keep them** if `captureListeners` still earns its place as a test instrument — asserting that a
  teardown restored the world is a real thing to assert — and give `releaseListeners` a contract it
  can honour, or delete it alone.
- **Delete both** if nothing but `ProbeServer` used them, and say what the tests assert instead.

Removing an export moves the guide's Surface table and the parity gate with it. Both are yours.

## Context

Read before acting: `AGENTS.md`, `.claude/rules/typescript.md`, `.claude/rules/architecture.md`,
`.claude/rules/tests.md`, and `guides/probe.md`'s account of `ProbeServer.start` and `destroy`.

Host: Linux container, bash. `/workspace/probe` is a clean checkout at `409926a` with dependencies
installed. The `src:server` and `src:bin` projects each take roughly 500 seconds.

## Unknowns

One. **Whether `captureListeners` has a consumer besides `ProbeServer`.** Count the importers before
you decide the export's fate; a brief scoped to a declaration and not its consumers is how a unit ends
up in a typecheck break it cannot edit.

## Scope

Owned: `src/server/helpers.ts`, `src/server/ProbeServer.ts`, `src/server/types.ts`,
`tests/src/server/helpers.test.ts`, `tests/src/server/ProbeServer.test.ts`, `tests/guides.test.ts`,
and `guides/probe.md`.

Off-limits: every other file, and in particular `src/server/index.ts`, `src/core/index.ts`,
`src/server/Probe.ts`, `src/server/stages/`, `tests/src/bin/`, `vite.config.ts`, and `package.json`.

Tools: Read, Grep, Glob, Edit, Write, Bash. No commits, no pushes, no installs, no destructive
command. Never run `git checkout`, `git restore`, `git stash`, `git reset`, or `git clean`.

## Execution

Perform this assignment yourself. Spawn nothing.

## What the tests must prove

- A listener a caller attaches to `process` **after** `ProbeServer.start()` is still attached after
  `destroy()`, and still fires.
- The listeners the server itself attached are gone after `destroy()`.
- The stdin flow rule still holds in all four of its cases, and the release-time
  `listenerCount('data') === 0` half is now reachable: a caller reader attached after `start` keeps
  the stream flowing through `destroy`. That case could not be written truthfully before this fix,
  and writing it is how you prove the fix.

Record the failing count before each fix and the passing count after, per `.claude/rules/tests.md`.

## Deviation contract

Stop and report — expected, found, exact evidence, done or not done, at most one hypothesis — when a
quoted line is not where this brief says it is, when the change needs an off-limits file, or when
removing an export breaks a consumer you do not own.

Decide and carry on, recording the choice: the fate of `releaseListeners` and `ListenerCapture`, the
field names, the exact guide sentences, and where each test sits.

## Acceptance criteria

Run these in order and report each bare exit code.

1. `grep -n "removeListener\|listeners(" src/server/ProbeServer.ts src/server/helpers.ts` — report
   every line verbatim. No surviving path may remove a listener chosen by absence from a capture.
2. `npm run format` then `npm run format:check` exits 0.
3. `npm run lint:check` exits 0.
4. `npm run check` exits 0.
5. `npm run test:guides` exits 0.
6. `npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:server` exits 0.
7. `npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:bin` exits 0. This
   drives `dist/bin/main.js`, so run `npm run build` first — the brief grants it for this criterion
   alone, because the suite cannot see a source change without it.
8. Each new test fails against the unfixed code. Record the command and both counts.

Do not run `npm test` or `npm run test:distribution`. An independent verifier takes those readings.

## Output

A report with what changed and what proves it, the red-then-green counts, one row per acceptance
criterion with its bare exit code, the unknown answered, the decisions you took, and anything you
could not close. No process diary.
