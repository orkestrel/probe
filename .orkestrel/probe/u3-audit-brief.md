# Unit 3 audit — the probe coordinator, transport, and entry

## Subject

Commit `f7104c7` in `/workspace/probe`, written by GPT-5.6 Sol. The full diff is
`/home/user/scaffold/tmp/u3audit/diff.txt`. The Orchestrator's own gate run is
`/home/user/scaffold/tmp/u3audit/gates.txt`. Read both before ruling.

The files the commit touches: `src/server/Probe.ts` (new), `src/server/factories.ts` (new),
`src/server/index.ts`, `src/server/types.ts`, `src/server/stages/RuntimeStage.ts`,
`src/bin/main.ts`, `tests/src/server/index.test.ts`.

## Context

Read before ruling, in this order:

1. `/workspace/probe/AGENTS.md` and every rule under `/workspace/probe/.claude/rules/`.
2. `/workspace/probe/src/core/types.ts` and `/workspace/probe/src/server/types.ts`, authoritative for
   these contracts.
3. The design ruling, `/home/user/scaffold/PROBE.md`, for what this mechanism is meant to be.
4. The decomposition, `/home/user/scaffold/.orkestrel/probe/plan.md`, § Unit 3, which states what
   this unit owed.

You may read anything under `/workspace/probe` and `/home/user/scaffold`. Do not edit anything.

## Claims

Rule on each claim independently. Give each a verdict of `CONFIRMED`, `REFUTED`, or `UNPROVEN`, with
the exact evidence — a file and line, a quoted excerpt, or a command and its output. `UNPROVEN` is a
real verdict and is the correct one where the claim cannot be settled from the tree; do not
manufacture a verdict to avoid it.

1. `Probe` warms at construction and `prove` awaits that warmth, so no `start` method exists and a
   second concurrent `prove` waits rather than starting a second engine.
2. A failure during boot arming is reported to the caller of `prove` and does not terminate the host
   process before any caller exists.
3. The arming control imports the dependency it mutates, so a probe that serves stale source cannot
   arm successfully.
4. The runtime deadline is owned outside the worker and therefore expires against a synchronous
   infinite loop.
5. On deadline expiry the coordinator destroys the hung stage and installs a replacement, and a
   later ordinary claim is served correctly.
6. `RuntimeStage.destroy` abandons an in-flight inspection rather than waiting behind it, and its
   documented contract in `src/server/types.ts` matches what the implementation does.
7. Every declaration the commit adds sits in the file its kind belongs in, per
   `.claude/rules/architecture.md` § Centralized files. No implementation file carries a second class
   and no nested function declaration appears.
8. Every reusable or public type the commit introduces is declared in a `*/types.ts` file, per
   `AGENTS.md` § Non-negotiable rules, including the return type of every exported factory.
9. No expression in the commit exists only to change a type — no `any`, no `as`, no non-null
   assertion, and no runtime round-trip whose sole effect is to satisfy the type checker.
10. Every public member of `Probe` and every exported function the commit adds uses a single
    descriptive word, per `AGENTS.md` § Design laws.
11. `src/bin/main.ts` declares no module-scope constant and no module-scope function, and writes
    nothing to stdout or stderr that a Model Context Protocol harness would surface as spurious
    server output.
12. The server barrel `src/server/index.ts` exports every intentional top-level source export of that
    environment, and `tests/src/server/index.test.ts` asserts that exact population.
13. `createProbeServer` answers both protocol eras, and the decorator it applies is additive rather
    than a downgrade to an obsolete revision.
14. Nothing in the commit is a stub, a deferred behaviour, a `TODO`, or concealed follow-up work.
15. The `@example` and `@remarks` prose the commit adds is true of what the code does. Execute any
    example that states an exact value rather than reading it.

## Scope

Read-only. You have no `Edit` and no `Write`. Do not propose a patch; state the defect and where it
is. The Orchestrator routes every fix.

## Execution

Perform this assignment directly. Spawn no subagent.

## Output

Return exactly two sections.

1. **Verdicts** — one row per claim: the claim number, the verdict, and the evidence.
2. **Terminal line** — the single line `VERDICT: PASS` when every claim is `CONFIRMED`, or
   `VERDICT: FAIL` when any claim is `REFUTED`, or `VERDICT: FAIL` when an `UNPROVEN` claim is one
   the tree should have been able to settle. Nothing follows this line.
