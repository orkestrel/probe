# Unit S3fix2 — audit brief

## Subject

Commits `449f96d` and `282c902` in `/workspace/probe`, branch `claude/probe-package`. Baseline `7721a20`.
`282c902` is a one-line formatter fix on a file S3fix2 did not own; the unit's own work is `449f96d`.

**Written by Claude Opus 5.** You are the independent lane.

Read `git -C /workspace/probe show 449f96d`, then
`/home/user/scaffold/.orkestrel/probe/s3fix2-report.md` for what the unit claims, and
`s3fix-audit-reconciliation.md` for what it was told to close. **The report is the claim under test,
never evidence for it.**

## Execution

Perform this assignment directly. **Spawn no subagent and delegate no part of it.** The Orchestrator runs
the other lane; splitting your own work duplicates a lane already running.

## A concurrent writer holds part of this tree

Unit S4 is editing `src/server/stages/TypeStage.ts` and `tests/src/server/stages/TypeStage.test.ts`.
Those are not your subject.

- Read your subject at the commit: `git show 449f96d:<path>`.
- **Do not run `npm test` or any whole-suite gate** — it would read S4's in-flight state. Scoped runs
  against `tests/src/server/stages/LintStage.test.ts` are fine.

## Host fact

The stage spawns a Node child. **A sandboxed bench gives a Node-spawned-Node child no working stdio: it
exits cleanly and never receives stdin or publishes stdout.** That yields FALSE GREENS, not errors. Probe
your sandbox first. If it has that property, rule from source and mark what you could not execute as
`NOT RULED`, never `CONFIRMED`.

## Posture

Refute. A claim survives only when you cannot break it. `PLAUSIBLE` where uncertain, never `CONFIRMED`.

## The claims

1. The declared URI, reused across sequential inspections with ascending versions, returns each
   inspection's own findings. The unit measured five; find a sixth that breaks it.
2. An exact-path override the workspace anchors is now selected, and a non-exempt control still reports.
3. Suffix, directory-anchored, and filename-sensitive globs all still select correctly. No shape was
   traded for another.
4. Path synthesis is entirely gone: no `randomUUID`, no synthesized basename or directory, no
   `inferTestProject` in `LintStage.ts`.
5. **Refusing a concurrent second inspection of one open path loses nothing the uuid covered.** The uuid
   made two concurrent same-path inspections safe. Name a legitimate caller the refusal now breaks, or
   establish there is none. This is the change most likely to have a victim.
6. The refusal is reachable only for a *concurrent* second inspection, never for a sequential one. A
   sequential reuse that trips it would be a regression.
7. **The two public helpers cover what the census covered.** `expectReleased` and `isProcessLive` replace
   a read of five private maps. Name any state the census could see that they cannot, and say whether it
   mattered.
8. No `node:inspector` import remains in the owned test file, and no test asserts private state by
   another route.
9. `reports nothing for a path the target workspace excludes from linting` pins a real residue honestly,
   and would turn red if synthesis returned. Check that it would.
10. The `tmp/probe` measurement table is accurate: `.gitignore` alone causes it, `.oxlintignore` is not
    honoured in LSP mode, and a negation does not reverse it. Re-run at least two rows.
11. The claim that no LSP setting controls ignore handling is complete. The unit lists eight settings;
    check the binary rather than trusting the list.
12. Each of the six red-then-green proofs reddens for the reason the unit names, not another.
13. The renamed reachability test's record is now honest — it proves a reachability fact and no repair.
14. The change violates no `AGENTS.md` non-negotiable and no applicable rule in
    `/home/user/scaffold/.claude/rules/`.
15. Exactly the owned files changed in `449f96d`, and no instrument was committed.

## Context

`/home/user/scaffold/AGENTS.md`; `/home/user/scaffold/.claude/rules/` `names.md`, `typescript.md`,
`architecture.md`, `patterns.md`, `tests.md`, `quality.md`, `writing.md`. Governing guide
`/home/user/scaffold/PROBE.md`.

## Output

Per claim:

```text
CLAIM <n>: CONFIRMED | REFUTED | PLAUSIBLE | NOT RULED (reason)
Evidence: <command and output, or exact file:line and quoted code>
```

Then **Out-of-scope findings** and **What you could not execute**. End with exactly one terminal line:
`VERDICT: PASS` or `VERDICT: FAIL`.
