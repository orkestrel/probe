# S3fix2 audit — successor brief

Supersedes `s3fix2-audit-brief.md`, which stays. Three things changed and the claim list did not.

1. **Transport.** The original went to the `analyst` bridge driver, whose Execution section told it to
   perform the assignment directly. It read that as "answer yourself", returned a PASS with no
   journal, and therefore ran on Claude — the same engine that wrote S3fix2. This one is a direct
   `codex exec`, so the reader of this file is Sol inside its own CLI and "directly" means what it
   says.
2. **Sandbox.** The original ran `--sandbox read-only`, under which a Node-spawned Node child returns
   exit 0 with empty stdout. Six of fifteen claims came back NOT RULED for that reason. This one runs
   `--sandbox workspace-write` in an isolated git worktree, so the attacks can execute.
3. **Concurrency.** The original's warning about unit S4 holding `TypeStage.ts` is stale. S4 landed.
   The worktree makes the question moot.

## Subject

Commits `449f96d` and `282c902` in `/workspace/probe`, branch `claude/probe-package`, baseline
`7721a20`. `282c902` is a one-line formatter fix on a file S3fix2 did not own; the unit's own work is
`449f96d`.

Written by Claude Opus 5. You are the independent lane.

## Your working tree

You run in `/workspace/probe` directly, on the current `HEAD`. No worktree is involved.

The subject has not moved since its commit. Every file the claims concern is byte-identical between
`449f96d` and `HEAD`:

```text
$ git -C /workspace/probe diff --stat 449f96d HEAD -- src/server/stages/LintStage.ts tests/src/server/stages/LintStage.test.ts src/server/helpers.ts
(no output)
```

So the working tree **is** the subject, and reading or running it measures `449f96d`. An earlier
version of this brief put you in a detached worktree; that was unnecessary, and its symlinked
`node_modules` made Vite resolve outside the worktree and the workspace's own
`orkestrel-environment-boundary` plugin refuse every module. Do not recreate it.

You may write, spawn, build, and run scoped tests. You are the only unit in the tree. Do not commit,
and leave the tree as you found it: revert any instrument you write before you finish, and report any
file you could not restore.

`npm test` there runs the whole suite including the four server test files that contend over
`tmp/probe`. Run scoped instead — `tests/src/server/stages/LintStage.test.ts` is your subject — and if
a scoped run reports a timing failure, re-run it alone before believing it.

## Execution

Perform this assignment directly and spawn nothing.

## The claims

Unchanged from `s3fix2-audit-brief.md`. Read that file's claim list, claims 1 through 15, and rule on
each. Read `s3fix2-report.md` for what the unit asserts and `s3fix-audit-reconciliation.md` for what
it was told to close. **The report is the claim under test, never evidence for it.**

Six claims — 1, 2, 3, 4, 7, and 11 — came back NOT RULED last time solely because the sandbox could
not execute. They are now executable. Rule on them with running code, and treat a NOT RULED on any of
them as a result that needs its own evidence about why.

## What the previous round already established

The previous lane's fifteen verdicts are in `tmp/codex/s3fix-audit-last.md` — but that is the audit of
**S3fix**, the predecessor, not of S3fix2. Do not carry its verdicts forward. It is listed here so you
recognise it if you find it, not as input.

## Instruments

Every probe carries a negative control drawn from outside the population the probe covers, run under
the same conditions. State each instrument's coverage beside its result. A claim you cannot break is
CONFIRMED with the evidence that convinced you; a claim you break is REFUTED with the exact failing
input, state, or interleaving, plus the smallest correct fix.

Report a claim unanswered rather than answering it with a weaker instrument.

## Output

One line per claim, in order, and nothing else before them:

```text
CLAIM <n>: CONFIRMED | REFUTED | PLAUSIBLE | NOT RULED (reason)
Evidence: <the command and its output, or the exact file:line>
```

Then `Out-of-scope findings`, then `What you could not execute`, then a single terminal line:
`VERDICT: PASS` or `VERDICT: FAIL`.

No process diary.
