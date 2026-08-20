# PBFIX16: the PBFIX14 audit's carriers

## Role and engine

`builder`, Claude Sonnet, native in `/home/user/probe`. The unit is fully specified; one item
carries a scoped conditional.

## Objective

Close the PBFIX14 audit's broken claim and findings: the origin-prose ownership qualifiers, the
guide's malformed-row enumeration, the create verb, the summary and wrap repairs, the
`#workbench` comment, the flattening proof, the durable-record corrections, and the placement
remark.

## Context

- Read before editing: the `AGENTS.md` file, `.claude/rules/writing.md`,
  `.claude/rules/documentation.md`, `.claude/rules/tests.md`, and the
  `.orkestrel/probe/pbfix14-audit-verdict.md` file (the rulings — binding).
- The tree is committed and clean at dispatch (PBFIX15 landed as 327fa8a). Cited line numbers
  come from the audit at ef33bd2 and can drift; re-locate by pattern.
- Verified facts, 2026-08-20: the guide's instrument clause sits near `guides/probe.md:286-288`;
  the class remark near `src/server/stages/RuntimeStage.ts:71-74`; the workspace/malformed guide
  row near `guides/probe.md:332`; the boot message near `src/server/Probe.ts:242` with its test
  expectation near `tests/src/server/Probe.test.ts:382`; the summary sentence near
  `guides/probe.md:22`; the overlong line near `guides/probe.md:416`; `#workbench` near
  `src/server/Probe.ts:232`; the bin flattening at `src/bin/main.ts:8`; the construction-refusal
  proof near `tests/src/bin/main.test.ts:93-114`.

## The items

1. **Origin prose, guide.** Replace the instrument clause so it reads: `a specification it could
   not write, after its directory exists, for a reason the target tree does not own, or a module
   that ran no test.`
2. **Origin prose, class remark.** Replace the write-run-evict-delete clause in the
   `RuntimeStage` remark so it reads: `a specification it could not write after its directory
   exists, or one it could not run, evict, or delete, in each case for a reason the target tree
   does not own`.
3. **The malformed-row enumeration.** At the guide's workspace/malformed row, restore the head to
   `The target tree publishes something probe cannot read:` and add the boot-workbench condition
   as a list member (`or a directory it blocks probe from creating for the boot workbench`), so
   the colon's enumeration contains every alternative the head names.
4. **The create verb.** Change the boot message to `The probe could not create the boot
   workbench (…)` in `src/server/Probe.ts`, and follow it in the `stringContaining` expectation
   in `tests/src/server/Probe.test.ts`. Where the guide row's verb disagrees after item 3, align
   it to `creating`.
5. **The summary sentence.** Replace the receipt summary so it reads: `A `Verdict` is the
   answer: one `Check` per stage in each phase, the case and the control.` Rewrap the paragraph
   to the file's column.
6. **The wrap.** Rewrap the overlong registered-failure sentence near `guides/probe.md:416` so
   its lines hold the neighbours' column.
7. **The `#workbench` comment.** Add one `//` line above or inside `#workbench` naming what the
   returned `true` means: the directory was absent before this call, so the boot teardown owns
   removing it.
8. **The flattening proof, conditional.** The guide claims the binary writes its failure as one
   stderr line, and `src/bin/main.ts:8` flattens embedded newlines, but no current proof drives a
   newline-bearing message. Attempt a refusal whose message carries a newline through the bin's
   real arguments (a workspace argument containing a newline is the first candidate). If one is
   reachable, extend the existing construction-refusal proof: assert stderr contains the joined
   single-line form and does not contain the raw newline-bearing fragment. If no reachable
   refusal embeds caller text with a newline, change nothing there and record the exact vectors
   you tried and what each produced.
9. **The durable record.** In `.orkestrel/probe/pbfix14-report.md`: correct the receipt
   recommendation's citation (the sentence landed as the `Verdict` summary near
   `guides/probe.md:22`, not at `guides/probe.md:255-265`), and replace every temporal `now` and
   dating `new` with present-tense statements. Change nothing else in that file.
10. **The placement remark.** Add one `@remarks` sentence to the `findRefusedPaths` TSDoc in
    `src/server/helpers.ts` stating why the function lives here: core's leaf pair may not consume
    the shapes module, and `ProbeServer` is the sole consumer.

## Unknowns

- Whether item 8's vector is reachable. The item states both outcomes; record which one held.

## Scope

- Owned: `guides/probe.md`, `src/server/Probe.ts`, `src/server/stages/RuntimeStage.ts`,
  `src/server/helpers.ts`, `src/bin/main.ts` (item 8 only, and only if the vector requires an
  entry change — expected not), `tests/src/server/Probe.test.ts`, `tests/src/bin/main.test.ts`,
  `.orkestrel/probe/pbfix14-report.md` (item 9 only).
- Off-limits: everything else; `tmp/` except your own report file.
- Permission limits: no commit, no push, no install, no `git checkout`/`restore`/`stash`/
  `reset`/`clean`, no secrets.

## Execution

You perform this assignment directly and spawn no agent.

## Deviation contract

A conflict with a ruling stops the unit with the standard report. Sentence wrap points and the
comment's exact wording are yours to decide and record.

## Output

Write your report to the `tmp/pbfix16-report.md` file: per item what changed with file:line, the
item-8 outcome with the vectors tried, then `git diff --stat` and `git status --short`. No
process diary.

## Acceptance criteria (in order)

1. `npm run lint:check` exits 0.
2. `npm run check` exits 0.
3. `npm run format:check` exits 0 (run `npm run format` first if needed).
4. `npm run test:guides` exits 0.
5. The scoped Probe run over the boot-workbench test passes with the new message; paste the count
   lines.
6. If item 8 extended the bin proof, the scoped run over that test passes; paste the count lines.
   Otherwise the recorded vectors stand in.

## Review evidence

The actual `git diff --stat` and `git status --short` output in the report.
