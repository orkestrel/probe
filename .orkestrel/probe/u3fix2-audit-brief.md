# Repair round 2 audit — contract and publication

## Subject

The uncommitted working tree of `/workspace/probe` against its last commit, written by GPT-5.6 Sol.
The Orchestrator supplies the diff and the gate output; both are named in the dispatch. The unit's
own report is beside this file.

The round before it, on Opus 5, closed ten lifecycle defects. This round must not have regressed any
of them, and claim 14 exists for that.

## Context

Read before ruling, in this order:

1. `/workspace/probe/AGENTS.md` and every rule under `/workspace/probe/.claude/rules/`.
   `.claude/rules/patterns.md` § Declared ecosystem capabilities decides claim 5.
2. `/workspace/probe/src/core/types.ts` and `/workspace/probe/src/server/types.ts`.
3. The brief the unit executed, `/home/user/scaffold/.orkestrel/probe/u3fix2-brief.md`.
4. The measured record, `/home/user/scaffold/.orkestrel/probe/u3-orchestrator-findings.md`.

You may read anything under `/workspace/probe` and `/home/user/scaffold`. Edit nothing.

## Claims

Rule on each independently: `CONFIRMED`, `REFUTED`, or `UNPROVEN`, each with exact evidence — a file
and line, a quoted excerpt, or a command and its output. `UNPROVEN` is a real verdict where the tree
cannot settle it; do not manufacture one to avoid it.

1. `Claim.project` reaches the type stage and decides what a candidate source is checked against. A
   claim naming a project other than the default is checked against that project.
2. Arming refuses to serve when the type host serves stale source, and the control that proves it
   mutates something the type stage can actually report.
3. Arming still refuses when the runtime stage serves stale source. The round added a control; it did
   not replace one.
4. `ProbeServerInterface` is declared in `src/server/types.ts`, `createProbeServer` returns it, and
   `dist/src/server/index.d.ts` contains no `import { createStdioServer }`.
5. `schemaToParameters` from `@orkestrel/contract` performs the narrowing, no `Object.fromEntries`
   remains in `factories.ts`, and its `undefined` case is handled rather than ignored.
6. `dist/src/server/index.js` contains no `devDependencies` and no `prepublishOnly`, and the server
   still reports its own version over the wire.
7. Exactly one exported helper carries the manifest read, both call sites use it, and the server
   barrel population test names it.
8. Both factories carry an `@example`, and every field of `ProbeOptions` is documented.
9. Every declaration the round adds sits in the file its kind belongs in. No type or interface is
   declared outside a `*/types.ts` file, and no implementation file gains a module-scope constant or
   free function.
10. No `any`, no `as`, no non-null assertion, no `@ts-` directive, and no lint suppression appears in
    the diff. No expression exists only to change a type.
11. Every public name the round adds is justified by a real consumer, and every entity member is a
    single descriptive word.
12. Every TSDoc sentence the round adds is true of the code. Execute any example that states an exact
    value rather than reading it.
13. Nothing is a stub, a deferred behaviour, a `TODO`, or concealed follow-up work.
14. **No guarantee from the previous round regressed.** Each of these held before this round and must
    still hold: `process.exitCode` is untouched by arming and by any `prove`; all three stages abandon
    an in-flight inspection on `destroy`; recovery from an expiry is bounded and always installs the
    replacement; every `elapsed` is an integer; `tmp/probe/` holds no `*.probe-*` file after an
    expiry; every `prove` rejection emits one `error` event.

## Scope

Read-only. You have no `Edit` and no `Write`. Name the defect and where it is; the Orchestrator routes
every fix.

## Execution

Perform this assignment directly. Spawn no subagent.

## Output

1. **Verdicts** — one row per claim: number, verdict, evidence.
2. **Terminal line** — the single line `VERDICT: PASS` when every claim is `CONFIRMED`, otherwise
   `VERDICT: FAIL`. Nothing follows it.
