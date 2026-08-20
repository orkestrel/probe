# PD-A — Carry check over the probe campaign register

## Role and engine

`grok` — Cursor Grok, through the Cursor CLI bridge your role file pins. Read-only.

## Objective

Produce one list: every item in the probe campaign that is **still open**, each with the carrier
that will close it, or with `NO CARRIER` where none exists.

An item is a defect, a finding, a measurement to re-take, a deferred decision, a withdrawn claim, or
an acceptance condition. An item is **open** unless the file itself records it closed with evidence.

This exists because `/workspace/probe/.orkestrel/probe/` is about to be deleted. Anything open in it
that has no carrier dies with the folder.

## Context

Repository: `/workspace/probe`. Campaign folder: `/workspace/probe/.orkestrel/probe/`.

Read these as the register, in this order:

1. `plan.md` (29,203 bytes) — the campaign plan and its three re-baselines. The authoritative unit list.
2. `readiness-grade.md` (69,115 bytes) — the graded readiness assessment. Its ungraded and failed rows are open items.
3. `carry-ledger.md` (3,980 bytes) — the finding-to-brief carry record.
4. `seam-sweep-triage.md` (19,126 bytes) — triaged seam findings.

Then read only these, which a marker scan showed carry deferral or open-finding language:

`b1-finding.md`, `criterion-3-verification.md`, `o9-u2-audit-reconciliation.md`, `p4-receipt-ruling.md`,
`probe-md-ruling.md`, `probe-md-worklist.md`, `process-bytes-reconciliation.md`, `receipt-defect-closed.md`,
`s1-audit-verdict.md`, `s1fix-brief.md`, `s1fix3-brief.md`, `s3-audit-dispatch-note.md`,
`s3-audit-reconciliation.md`, `s3fix-audit-reconciliation.md`, `s5-brief.md`, `seam-sweep-findings.md`,
`testhelper-synthesis.md`, `adoption-findings.md`, `critic-findings-routing.md`, `u3-orchestrator-findings.md`,
`s3-audit-lens-verdicts.md`, `README.md`.

Do not read the remaining files in the folder. They are briefs, reports, diffs, and verdicts for work
already landed in commits.

Carriers you can name, and how to check each:

- **LANDED** — a commit already closed it. Check with `git log --oneline -40` and `git log -S'<token>' --oneline` in `/workspace/probe`.
- **LIVE BRIEF** — an existing brief owns it. The briefed-but-not-landed units are `pb4-brief.md`, `pb5-brief.md`, `pb6-brief.md`, `d1-brief.md`. Name the file and the item within it.
- **NO CARRIER** — nothing owns it. This is the answer that matters most. Do not soften it.

Governing files, read before ruling: `/workspace/probe/AGENTS.md`, `/workspace/probe/.agents/orchestration.md`
(§ Dispatch anatomy, "Carry every finding"; § Where campaign artifacts live), `/workspace/probe/.claude/rules/writing.md`.

## Unknowns

Whether `readiness-grade.md` grades items that `plan.md` already struck. Where the two disagree,
report both readings rather than picking one.

## Scope

Read-only. Owned files: none — you write no file in the repository. Off-limits: every file outside
`/workspace/probe/.orkestrel/probe/` except the governing files named above and `git log` output.
Allowed tools: Read, Grep, Glob, Bash for `git log` and `git show` only.

## Execution

Perform this assignment directly. Spawn nothing.

## Output

Return one Markdown table and nothing else before it. No process diary.

| # | Item, stated as the falsifiable claim it makes | Source file:line | Carrier | Evidence |

Then two short sections:

- `## NO CARRIER` — repeat only the rows whose carrier is `NO CARRIER`, each with one sentence on what closing it requires.
- `## Superseded` — items a later file explicitly overturned, with both file:line references. These die correctly.

Cap the table at the items that are genuinely open. An item recorded closed with evidence does not
belong in it.

## Deviation contract

If the Cursor bench does not round-trip, stop and report the bench dark with the exact error. Do not
answer from your own engine. If a named file does not exist, report it and continue with the rest.

## Acceptance criteria

1. Every item in the table cites a real `file:line` that a reader can open.
2. Every `LANDED` carrier cites a real commit hash from `/workspace/probe`.
3. Every `LIVE BRIEF` carrier names the brief file and quotes the phrase in it that owns the item.
4. The `NO CARRIER` section is present, even if empty.
