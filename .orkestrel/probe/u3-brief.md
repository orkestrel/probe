# @orkestrel/probe — Unit 3: coordinator, transport, entry

You are the sole serial writer in `/workspace/probe`, at a clean committed baseline. Units 1 and 2
landed the contracts and the three stages; unit 4 writes the tests and the guide after you.

## Read first

- `/workspace/probe/AGENTS.md` and `/workspace/probe/.claude/rules/`, especially
  `architecture.md`, `names.md`, `patterns.md`, `typescript.md`.
- `/workspace/probe/src/core/types.ts` — `Claim`, `Verdict`, `Check`, `Toolchain`, `ProbeInterface`,
  `ProbeOptions`, `ProbeEventMap` are already defined. Implement `ProbeInterface` exactly.
- `/workspace/probe/src/core/helpers.ts` — `computeReceipt(verdict, stage)` and `formatVerdict`
  already exist. Use them; do not reimplement.
- `/workspace/probe/src/server/types.ts` — `StageInterface` is `{ stage, inspect(case), destroy() }`.
- `/workspace/probe/src/server/stages/*.ts` — each takes `(workspace = process.cwd())`. Each already
  performs its own revalidation; do not duplicate it in the coordinator.
- `/workspace/probe/src/server/helpers.ts` — `resolveWorkspaceModule`, `resolveWorkspaceBinary`,
  `messageFromUnknown` and others exist. Reuse rather than rewrite.
- `/home/user/scaffold/PROBE.md` — the accepted design, read-only.

## Owned files

`src/server/Probe.ts`, `src/server/factories.ts`, `src/server/index.ts`, `src/bin/main.ts`, and
`tests/src/server/index.test.ts` (one stale generated assertion, see below). Nothing else — not
`src/core`, not the stages, not the manifest, not any other test.

## What to build

**`Probe` (`src/server/Probe.ts`)** implementing `ProbeInterface`.

- `#` fields, constructor, public getters then methods, then `#` private methods.
- Warming begins at construction and every public method awaits it. There is NO `start` method:
  the harness owns the process and a restart is a new process. A second concurrent call awaits the
  same warm promise rather than starting a second engine.
- `prove(claim)` runs all three stages over `claim.case`, runs them again over `claim.control`,
  assembles a `Verdict`, and attaches a receipt through `computeReceipt(verdict, claim.control.stage)`.
- A verdict exists only when all three stages ran. A stage that cannot start throws; do not return
  an empty `Check` and do not invent a sentinel.
- Resolve `typescript`, `vitest`, and `oxlint` from the workspace root at construction, expose them
  as `toolchain`, and carry that on every verdict. Refuse to serve when a peer cannot be resolved.
- Own the deadline OUTSIDE the work, using `@orkestrel/timeout`, which is already a runtime
  dependency. An in-worker timeout cannot fire against a synchronous infinite loop; this was
  measured, and a probe running `while (true) {}` under a Vitest `testTimeout` never returned.
  On expiry, emit `expire`, recycle the runtime stage, and reject.
- Arm at boot: run one control that MUST fail, and refuse to serve until it does. Choose a control
  that imports a dependency the arming mutates, not a bare `expect(2).toBe(3)`. A control importing
  nothing proves the runner can report red and proves nothing about the module graph, and staleness
  is the failure this service actually risks — three rounds of this build were spent on it.
- `destroy()` carries its fixed lifecycle meaning and destroys every stage.

**`src/server/factories.ts`** — `createProbe(options?)` returning `ProbeInterface`, and
`createProbeServer(probe)` returning the composed Model Context Protocol server.

- Compose it as `createStdioServer(createMCPLegacy(mcp))`. Without `createMCPLegacy`, a harness's
  `initialize` and `tools/list` fail with `Invalid params: malformed modern request metadata`,
  because `@orkestrel/mcp` dispatches by wire era and a harness speaks the dated revision. This was
  measured against a spawned server; the undecorated form looks finished and refuses every request.
- The server identity is `probe` and the single tool is `prove`, so a harness surfaces
  `mcp__probe__prove`. Publish the tool's input schema from `CLAIM_SHAPE` and apply `isClaim` to
  what arrives; the two agreeing is unit 4's standing proof.
- The tool result carries `formatVerdict(verdict)` as its text.

**`src/bin/main.ts`** — the stdio entry the harness launches.

- It declares NO module-scope constant and NO module-scope function: it imports what it needs and
  runs. That rule is in `.claude/rules/architecture.md` and the policy sweep enforces it.
- Load `typescript` and `vitest` through a dynamic `import` inside the warmer rather than at module
  scope. Measured: static imports delayed a server's `initialize` reply from 57.6 ms to 869 ms.
  The stages already do their own loading; make sure the entry does not defeat it.

**`src/server/index.ts`** — the barrel, star exports only, adding the new modules and the stages.

**`tests/src/server/index.test.ts`** — a generated starter asserts the server entry exports nothing.
Unit 1 hit the same stale assertion on the core side; replace this one the same way, asserting the
real surface as a whole population rather than as membership checks.

## Laws

- One class per implementation file, `#` fields, no module-scope declaration inside it.
- No function declared inside another function. No `any`, no `as`, no non-null assertion, no
  suppression directive. Narrow `unknown` off the wire with real guards.
- Every collection returned is readonly. Entity members are one word.
- No polling loop: await events, promises, and process exits.
- Do not re-export a dependency's symbols from this package's barrel.

## Execution

Perform this directly and spawn nothing. Do not install dependencies, commit, or push. Validate
with `npm run check`, `npm run lint:check`, and `npm test` from `/workspace/probe`.

You may write throwaway probes under `/workspace/probe/tmp/probe/` and run `npm run test:probe`.
Delete every one before finishing; unit 4 owns the tests.

## Deviation contract

Stop and report if the objective conflicts with what you find: expected, found, exact evidence,
done or not done, one short hypothesis. An ancillary choice is yours to make and record.

## Acceptance criteria

1. `npm run check`, `npm run lint:check`, and `npm test` all exit 0.
2. A `Probe` proves a claim end to end and returns a verdict carrying three case checks, three
   control checks, and a toolchain.
3. A receipt appears only when the case is clean and the control failed at its declared stage.
4. Driving the composed server over stdio, `initialize`, `tools/list`, and `tools/call` all answer
   correctly. Prove this by spawning the built entry and speaking the protocol to it, not by
   calling the factory in-process.
5. A claim whose control does not fail yields a verdict with no receipt rather than an error.

## Output

Files written with a one-line reason each, the exact validation commands and exit codes, the
evidence for criteria 2 to 5 as commands and what they printed, any deviation, and anything you
decided that this brief left open. No process diary.

---

# AMENDMENT — the deviation you reported is resolved; resume

You stopped correctly. `StageInterface` had no way to reclaim a hung runtime stage, and
`RuntimeStage.destroy()` chains off `#tail`, so it would wait for the very inspection that hangs.
Three facts were measured after your report, and they close it without changing `StageInterface`.

- `vitest.close()` alone HANGS against a worker spinning in a synchronous loop: 20 s, no return.
- `vitest.cancelCurrentRun('keyboard-input')` also never resolves against that worker.
- Firing cancel WITHOUT awaiting it and then awaiting `close()` returns in **10 ms**, and a
  replacement instance built afterwards runs a specification correctly in **490 ms**.

So the recycle is: `void vitest.cancelCurrentRun('keyboard-input').catch(() => {})`, then
`await vitest.close()`, then construct a fresh stage. Do not await the cancel; awaiting it is what
hangs.

`RuntimeStage` and `src/server/types.ts` are now ALSO yours this round, for that purpose only.
Give the stage a way to be torn down that does not queue behind an in-flight inspection — a
`destroy()` that abandons rather than waits is the honest meaning of the word, and the fixed
lifecycle vocabulary in `.claude/rules/names.md` says `destroy` tears down and releases resources.
An in-flight `inspect` may reject when that happens; that is correct, not a defect.

The coordinator then owns the deadline as the brief already requires: on expiry, emit `expire`,
recycle the runtime stage through that path, and reject the call.

Add one proof: a claim whose runtime work spins forever is rejected within the deadline, the
service survives, and the very next claim proves normally. That proof is the whole reason the
deadline exists.

## One correction to the transport section above

Do not read `createMCPLegacy` as targeting an obsolete protocol. The current revision is
`2026-07-28`, which removed the handshake and carries the revision per request in `_meta`;
`@orkestrel/mcp` implements that in its core. The decorator is ADDITIVE and was measured so: the
decorated server answers handshake `initialize` and `tools/list` AND modern `tools/list` and
`server/discover`, while the undecorated one answers only the modern pair. Compose the decorated
form so the server speaks both.

When you drive it for acceptance criterion 4, a modern request needs all three reserved keys —
`io.modelcontextprotocol/protocolVersion`, `io.modelcontextprotocol/clientCapabilities`, and
`io.modelcontextprotocol/clientInfo`. A request carrying only the version key is refused as
malformed metadata, which reads exactly like an unsupported era and is not one.
