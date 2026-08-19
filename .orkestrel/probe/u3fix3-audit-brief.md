# Repair round 3 audit

## Subject

Commit `9c91856`, written by Claude Opus 5. Read it at `/tmp/probe-audit3`, a read-only git worktree
pinned at that commit with `node_modules` symlinked. The full diff is `/tmp/probe-audit3/ROUND3.diff`.
Do not read `/workspace/probe`; a writing unit owns it.

Gate evidence, run by the Orchestrator on that commit: `format:check` 0, `lint:check` 0, `check` 0,
`build` 0, `test` 0 (14 source, 86 policy, 28 config). Do not re-litigate the gates.

## Context

Read `/tmp/probe-audit3/AGENTS.md`, the applicable `.claude/rules/*`, `src/core/types.ts`, and
`src/server/types.ts` before ruling. The findings this round closed are in
`/home/user/scaffold/.orkestrel/probe/u3fix2-audit-reconciliation.md`.

## Claims

Rule `CONFIRMED`, `REFUTED`, or `UNPROVEN`, each with exact evidence.

1. `StageInterface.inspect` takes one parameter and documents no `project`; `TypeStage.inspect` takes
   the optional second and documents it; all three stages still satisfy the interface.
2. Nothing reads the second parameter through `StageInterface`, and no call site was changed to
   accommodate the move.
3. The type stage's language service cache cannot grow without bound on caller-supplied project
   strings. Read the mechanism and rule on whether the bound actually holds, including on the paths
   the report did not exercise.
4. Every spelling of one declared project reaches one service, and a project outside the declared set
   is still reachable.
5. The recycled slot disposes what it evicts, and leaves no entry behind in any map it populated.
6. `WorkspaceManifest.contents` carries a record type, no `Reflect.get` remains in `src/`, and the
   crossing goes through `@orkestrel/contract`'s declared guard rather than an assertion.
7. Adopting that guard did not change any error message or refusal the previous code produced.
8. The two sentences describing `Claim.project` agree.
9. Every declaration sits in the file its kind belongs in; no new module-scope constant or free
   function appears in an implementation file; no new public name lacks a consumer.
10. No `any`, `as`, non-null assertion, `@ts-` directive, or lint suppression appears in the diff.
11. Every TSDoc sentence the round adds is true of the code. Execute anything stating an exact value.
12. **No guarantee from the two previous rounds regressed.** `process.exitCode` untouched by arming
    and by `prove`; all three stages abandon an in-flight inspection on `destroy`; recovery from an
    expiry bounded and always installing the replacement; every `elapsed` an integer; no `*.probe-*`
    file after an expiry; one `error` event per `prove` rejection; arming still refuses for both a
    stale type host and a stale runtime host.

## The design decision to rule on

The round chose a **fixed resident set plus one recycled slot** over a least-recently-used cap and
over refusing an undeclared project. Rule on that choice on its merits: whether the bound is the right
shape, whether its stated cost — a caller alternating between two undeclared projects rebuilds a
service each claim — is acceptable, and whether any simpler mechanism reaches the same property. This
is the one place where disagreeing with the round is a useful answer rather than a defect report.

## Scope

Read-only. Name the defect and where it is; the Orchestrator routes every fix.

## Output

1. **Verdicts** — one row per claim: number, verdict, evidence.
2. **The design decision** — your ruling on the bound's shape, with reasoning.
3. **Terminal line** — `VERDICT: PASS` or `VERDICT: FAIL`. Nothing follows it.
