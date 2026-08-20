# PBFIX13 audit: falsify the rename round and the driven-client proof

## Role and engine

Sol `analyst`, GPT-5.6 Sol, inside `codex exec --sandbox read-only` at `/home/user/probe-audit-wt`.
You are the objective lane. The writer was Opus, so your engine did not write this.

## Objective

Attempt to refute each numbered claim about commit `7b20615` (PBFIX13). Return per-claim verdicts
with evidence and one terminal VERDICT line.

## Context

- The tree at `/home/user/probe-audit-wt` sits at commit `7b20615`, the audit subject.
- The diff under audit is `tmp/pbfix13-diff.patch` (8749d69..7b20615, 29 files). The working
  tree status is `tmp/pbfix13-status.txt` (clean apart from `tmp/` staging).
- Read before ruling: `AGENTS.md`, `.claude/rules/names.md`, `.claude/rules/typescript.md`,
  `.claude/rules/architecture.md`, `.claude/rules/writing.md`, `.claude/rules/tests.md`,
  `.claude/rules/documentation.md`, and the `guides/probe.md` guide.
- The unit's own report is `.orkestrel/probe/pbfix13-report.md`; its brief is
  `.orkestrel/probe/pbfix13-brief.md`. The report is a subject, not authority.
- Gate evidence the Orchestrator took on this exact tree, 2026-08-20, before commit:
  `format:check` 0, `lint:check` 0, `check` 0, `test:guides` 0 (13 passed), `test:src:core` 0
  (32 passed), `test:src:bin` 0 (10 passed). Do not re-run whole-tree gates; the sandbox denies
  writes and the caches are not yours.
- Standing conditions: no network; the sandbox is read-only, so run no mutating command; scoped
  read-only commands (`rg`, `node --eval` over pure functions, `git show`) are available.

## Claims

1. The rename round is complete in code identifiers: no declaration or reference of the removed
   `Source` record type, `isSource`, `SOURCE_SHAPE`, `Verdict.checks` member, `messageFromUnknown`,
   or unqualified `PARTIES` constant remains anywhere in `src/`, `tests/`, `guides/probe.md`, or
   `configs/`. The English word "source" in an unrelated sense is exempt.
2. The `Stage` type derives from the frozen `PROBE_STAGES` list such that a member added to the
   list changes the type, and every stage the list names has an implementation the server
   registers.
3. The driven-client test drives the built bin through the `@orkestrel/mcp` stdio client
   transport with no project-owned behavior replaced, and its assertions fail if the server
   fails initialize, omits the `prove` tool, or mints no receipt. Rule from the test source and
   the transport's installed declaration; name any assertion that would pass vacuously.
4. The guide's reply-shape statement matches what `ProbeServer` returns: one text block rendered
   by `formatVerdict`, with the receipt as its closing line, and the structured-content decision
   recorded as deferred.
5. The diff introduces no `any`, no type assertion, no non-null assertion, no suppression
   directive, and no banned-vocabulary hit on its prose surfaces (guide text, TSDoc, comments)
   per the substitution table.
6. Every declaration the diff adds or moves sits in its centralized kind file, and every public
   export it adds reaches the correct environment barrel.
7. `PROBE_PARTIES` has one home and no drifted duplicate of the party list survives anywhere.
8. TSDoc on the public exports the diff touches keeps the required form: third-person `-s` first
   sentence that does not repeat the symbol name, `@param`/`@returns` present where applicable.

## Execution

You perform this audit directly and spawn nothing. Attempt refutation, not confirmation. A claim
you cannot break is CONFIRMED with the evidence that convinced you and the attack that failed. A
broken claim is BROKEN with the exact evidence (file:line, the failing input or the contradicting
text) and the smallest correct fix. A claim you cannot decide either way is UNRESOLVED with what
would decide it.

## Output

End your final message with the complete verdict: one block per claim numbered 1-8, each carrying
its verdict and evidence, then exactly one terminal line of the form
`VERDICT: PASS` (every claim CONFIRMED) or `VERDICT: FAIL` (any claim BROKEN or UNRESOLVED).
No process diary.
