# PD-C — Section survey of PROBE.md

## Role and engine

`grok` — Cursor Grok, through the Cursor CLI bridge your role file pins. Read-only.

## Objective

Classify every section of `/workspace/probe/PROBE.md` (71,917 bytes) into exactly one of three
dispositions, so the unit that writes `guides/probe.md` knows what it must carry and what it must drop.

- **PRODUCT** — a statement about what the published `@orkestrel/probe` package does, which a consumer
  needs. This must reach `guides/probe.md`.
- **NARRATIVE** — a statement about how this campaign proceeded: what was tried, what a round found,
  which unit changed what. This dies with the file and is recoverable from git history.
- **SUPERSEDED** — a statement the repository now contradicts. This must not be carried, and the reason
  must be recorded.

## Context

`PROBE.md` is being deleted. It is unpublished (`package.json` `files` ships `dist/src`, `dist/bin`,
and `README.md` only) and no test reads it. The ruling that dissolves it is
`/workspace/probe/.orkestrel/probe/probe-md-ruling.md`; read it first.

`/workspace/probe/.orkestrel/probe/probe-md-worklist.md` already enumerates the **deltas** — measurements
that moved and claims the campaign withdrew or added. Read it. Your job is the complement: a survey of
the **whole file**, so nothing outside those deltas is lost by omission.

The current package surface, which decides SUPERSEDED: read `/workspace/probe/src/core/types.ts`,
`/workspace/probe/src/server/types.ts`, `/workspace/probe/src/core/index.ts`, and
`/workspace/probe/src/server/index.ts`. A `PROBE.md` sentence naming a symbol, field, or behaviour those
files do not have is SUPERSEDED.

`/workspace/probe/guides/` holds no `probe.md` yet. `guides/README.md` records it as not created.

Governing files, read before ruling: `/workspace/probe/AGENTS.md`,
`/workspace/probe/.claude/rules/documentation.md`, `/workspace/probe/.claude/rules/writing.md`.

## Unknowns

Unit PB4 is changing `Verdict` in `src/core/types.ts` while you read. Where a `PROBE.md` claim concerns
the receipt, the digest, or the token's fields, mark it `PRODUCT (PB4-dependent)` rather than
SUPERSEDED, and say what it asserts. Do not try to resolve it against a file being written.

## Scope

Read-only. Owned files: none — you write no file in the repository. Off-limits: every file outside those
named above. Allowed tools: Read, Grep, Glob.

## Execution

Perform this assignment directly. Spawn nothing.

## Output

Return one Markdown table and nothing else before it. No process diary. One row per heading in
`PROBE.md`, in file order.

| Heading | Lines | Disposition | What a guide must carry from it, in one sentence |

Then:

- `## Superseded, with the contradiction` — each SUPERSEDED row with the source `file:line` that contradicts it.
- `## Measurements` — every number `PROBE.md` states as a measurement, with its line, and whether the file records the date it was taken. A measurement with no date is one the guide cannot carry.

## Deviation contract

If the Cursor bench does not round-trip, stop and report the bench dark with the exact error. Do not
answer from your own engine.

## Acceptance criteria

1. Every heading in `PROBE.md` appears exactly once in the table. Count them first with `grep -c '^#' PROBE.md` and state the count.
2. Every SUPERSEDED row cites the source `file:line` that contradicts it.
3. The measurement list states, per number, whether a date accompanies it in the file.
