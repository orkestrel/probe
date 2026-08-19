# Unit S3fix — audit brief

## Subject

Commit `078946d` in `/workspace/probe`, branch `claude/probe-package`. Baseline `dcd50a3`.

It is a **fix round**. Two lanes audited `dcd50a3` and refuted seven claims; `s3-audit-reconciliation.md`
lists what it was told to close as F1 through F9. **Written by Claude Opus 5**, so an auditing lane on
that engine is the second lane, never the independent one.

Read `git -C /workspace/probe show 078946d` for the change and
`/home/user/scaffold/.orkestrel/probe/s3fix-report.md` for what the unit claims it did.
**Treat that report as the claim under test, never as evidence for it.**

## Execution

Perform this assignment directly. **Spawn no subagent and delegate no part of it.** You are one lane of a
two-lane pass and the Orchestrator runs the other; splitting your own work duplicates a lane that is
already running and does not make the pass more independent.

## A concurrent writer holds part of this tree

Unit H1 is editing `src/server/helpers.ts` and `tests/src/server/helpers.test.ts` right now. Those two
files are **not your subject** and their state will move under you.

Two consequences, both binding:

- Read your subject at the commit — `git show 078946d:<path>` — not from the working tree.
- **Do not run `npm test` or any whole-suite gate.** It would read H1's in-flight state and report a
  failure that is not your subject's. Gate evidence belongs to an independent `verifier` and is not
  your job. Scoped runs against `tests/src/server/stages/LintStage.test.ts` are fine.

## Posture

Refute. A claim survives only when you cannot break it. Where you are uncertain the verdict is
`PLAUSIBLE`, never `CONFIRMED`. Prefer running the question to reasoning about it.

## Two facts about this host

- The stage spawns a Node child. **A sandboxed bench gives a Node-spawned-Node child no working stdio:
  it exits cleanly and never receives stdin or publishes stdout.** That yields FALSE GREENS, not errors.
  If your sandbox has that property, rule from source and say which claims you could not execute. A claim
  you could not execute is `NOT RULED`, never `CONFIRMED`.
- `pgrep -f` self-matches. Read liveness from a recorded pid with `kill -0`, never from a pattern over a
  full command line.

## The claims

1. `destroy()` settles when the server exits 0 without answering `shutdown`.
2. `destroy()` settles when called during warm against a server that exits 0 before answering
   `initialize`.
3. `destroy()` settles when the child fails to spawn.
4. After each of claims 1 to 3, all five maps — `#responses`, `#failures`, `#documents`, `#publishes`,
   `#refusals` — are empty.
5. **The derived `#ending` getter is complete.** It reads `signalCode` then `exitCode` and returns
   `undefined` only while both are null. Name any ending it misses, any moment it reports `undefined` for
   an ended child, or any moment it reports an ending for a live one. The previous round's stored field
   failed exactly here.
6. Removing the stored field introduced no new read-ordering hazard: every consumer of `#ending` sees a
   value at least as fresh as the stored field gave it.
7. `#exit` settling unconditionally cannot now reject something that should have succeeded. The previous
   round's suppression existed for a reason — establish whether that reason was real.
8. `#file` keeping the declared directory selects the same overrides the workspace gate applies, for
   directory-anchored globs. The `tmp/probe` carve-out is justified rather than test-fitting.
9. The carve-out uses `inferTestProject`, and that function's contract actually covers this use.
10. Each of the five new tests fails when its subject is reverted. Name any that would pass against
    `dcd50a3`.
11. The mutation table in the report is accurate. Spot-check at least two rows by applying the mutation
    yourself.
12. The inspector-session census reads real state and replaces nothing. The unit flagged it as sitting
    against `.claude/rules/tests.md` "Test observable behavior, not implementation details" — **rule on
    whether that is acceptable or must be replaced**, and if it must, say with what.
13. The change violates no `AGENTS.md` non-negotiable and no applicable rule in
    `/home/user/scaffold/.claude/rules/`.
14. Exactly two files changed and no instrument was committed.
15. **The partial closure is honestly stated.** The unit reports that an exact-path override cannot be
    matched by any synthesized identity that stays distinct from the declared path, and gives a table of
    five alternatives. Check that table. Is there a sixth option it missed?

## Context

Read `/home/user/scaffold/AGENTS.md`; `/home/user/scaffold/.claude/rules/` `names.md`, `typescript.md`,
`architecture.md`, `patterns.md`, `tests.md`, `quality.md`, `writing.md`; then
`/home/user/scaffold/.orkestrel/probe/s3-audit-reconciliation.md` for what this round was told to close.
The governing guide is `/home/user/scaffold/PROBE.md`.

## Output

For each claim:

```text
CLAIM <n>: CONFIRMED | REFUTED | PLAUSIBLE | NOT RULED (reason)
Evidence: <the command and its output, or the exact file:line and quoted code>
```

Then **Out-of-scope findings** (file, line, one sentence each) and **What you could not execute**.

End with exactly one terminal line: `VERDICT: PASS` or `VERDICT: FAIL`. FAIL when any claim is REFUTED.
