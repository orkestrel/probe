# PB5 amendment — this unit routes native, not to the bench

`pb5-brief.md` § Role and engine names `sol` through `codex exec`. That routing is withdrawn. Every
other section of the brief stands unchanged.

## Why

`.agents/orchestration.md` **Bench laws** rule 4 now records that a child created inside a bench
sandbox has stdio that cannot be trusted, and that a subject whose behaviour lives in a child's pipes
is unmeasurable there. It fails as a false green: the stage never arms, the boot inspection times out,
and that timeout produces the same rejection a genuine stage timeout produces, so a test asserting on
the message passes inside the bench while the host's gate reports the honest red.

Two of this unit's four rows are exactly that subject:

- **P7** is `LintStage.destroy()` against a language server that answers `shutdown` and ignores `exit`.
  The stage spawns `oxlint --lsp` and speaks LSP over that child's stdio.
- **P16** is the shipped entry's `SIGINT` and `SIGTERM` handling, proven by driving the built entry as
  a spawned child.

A bench cannot arm the lint stage, drive it, or observe it fail, so it cannot prove either row.

## The new routing

**Role:** `implementer` (Claude Opus 5, native). Perform the assignment directly and spawn nothing.

This puts the writer on the Orchestrator's own engine, so the audit lane for this unit is **Sol**, per
`.agents/orchestration.md` § Orchestration by harness: in a fix round the auditor is an engine that
did not write it, and when the writer's engine is the Orchestrator's, the auditor is the other lane.

## What changes in the brief's execution

Nothing about the repairs, the scope, or the acceptance criteria. One thing about evidence: this host
permits nested child creation, so every proof the brief names is reachable. The brief's standing
conditions about recording a blocked proof as an observation do not apply — take the measurement.
