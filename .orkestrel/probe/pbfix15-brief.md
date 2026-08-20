# PBFIX15: the PBFIX13 audit's carriers

## Role and engine

`builder`, Claude Sonnet, native in `/home/user/probe`. The unit is fully specified and taste-free.

## Objective

Close the PBFIX13 audit's broken claims: the pinned legacy driven-client proof, and the TSDoc
first-sentence form in `src/core/constants.ts` and `src/core/shapers.ts`.

## Context

- Read before editing: the `AGENTS.md` file, `.claude/rules/typescript.md` (§ Comments and API
  documentation), `.claude/rules/tests.md`, and `.claude/rules/writing.md`.
- The tree is committed and clean at dispatch. The audit's verdict rides in
  `.orkestrel/probe/pbfix13-audit-verdict.md`; its rulings are binding.
- The installed `@orkestrel/mcp` client accepts `version?: MCPVersion` where `MCPVersion` is
  `'2026-07-28' | '2025-11-25' | '2025-06-18'`; its declaration states that an unpinned client
  probes `server/discover` and a pinned legacy client runs `initialize` and sends
  `notifications/initialized`. Command and output behind this claim:
  `grep -n "type MCPVersion" node_modules/@orkestrel/mcp/dist/src/core/index.d.ts` →
  `export declare type MCPVersion = '2026-07-28' | '2025-11-25' | '2025-06-18';`.
- The existing driven-client test is `tests/src/bin/main.test.ts`, the case named
  `answers a driven third-party client with one text block`. It stays unchanged: it proves the
  unpinned modern class.

## The items

1. **Pinned legacy driven client.** Add one test beside the existing driven-client case, named
   `answers a pinned legacy client through the initialize path`, with the same 120_000 timeout.
   Mirror the existing case exactly, with these differences only:
   - the claim fixture's file paths use `src/core/legacy.ts` and
     `tmp/probe/bin/legacy-runtime.test.ts` (both variants), so the sibling case's files never
     collide with this one;
   - the `createMCPClient` options add `version: '2025-06-18'`;
   - after `await client.connect()`, replace the `toBeDefined` version assertion with
     `expect(client.version).toBe('2025-06-18')`;
   - keep the tools listing, the `prove` call, the `resultType` narrowing, the `probe ` prefix
     assertion, and the closing `receipt probe:` line assertion.
2. **TSDoc first sentences.** Replace each first sentence below, verbatim, leaving every
   `@remarks`, `@example`, and remaining prose untouched.
   In `src/core/constants.ts`:
   - `The stages a claim passes through, in the order a verdict reports them.` →
     `Lists the stages a claim passes through, in the order a verdict reports them.`
   - `The parties that can own action on an issue or probe failure.` →
     `Lists the parties that can own action on an issue or probe failure.`
   - `The conditions that can end a probe operation.` →
     `Lists the conditions that can end a probe operation.`
   - `The leading token every receipt carries.` →
     `Names the leading token every receipt carries.`
   - `The character joining a receipt's tokens.` →
     `Names the character joining a receipt's tokens.`
   In `src/core/shapers.ts`:
   - `Blueprint for one proposed file a claim carries.` →
     `Describes one proposed file a claim carries.`
   - `Blueprint for the drafts a claim asserts about and the test that exercises them.` →
     `Describes the drafts a claim asserts about and the test that exercises them.`
   - `Blueprint for the negative control, which is a case plus where and why it must break.` →
     `Describes the negative control, which is a case plus where and why it must break.`
   - `Blueprint for one claim, and the sole source of both the published tool schema and the guard
     applied to an arriving claim.` →
     `Describes one claim and is the sole source of both the published tool schema and the guard
     applied to an arriving claim.`
3. **Instrument control.** After the new test runs green, flip its version equality assertion to
   `'2025-11-25'`, run the same scoped command, and record the red reading (the assertion must be
   the failure). Restore the assertion and record the green rerun. If the flipped assertion
   passes, stop and report per the deviation contract: that reading means the pin is not honored,
   which is a finding rather than a fix.

## Unknowns

- Whether the guide mirrors any replaced first sentence verbatim. If `npm run test:guides`
  reddens on a changed sentence, update the mirroring line in `guides/probe.md` to match, record
  which line, and rerun.

## Scope

- Owned: `tests/src/bin/main.test.ts`, `src/core/constants.ts`, `src/core/shapers.ts`.
- Conditionally owned: `guides/probe.md`, only for a line that mirrors a replaced sentence.
- Off-limits: everything else; `tmp/` except your own report file and the probe workbench paths
  the test itself writes.
- Permission limits: no commit, no push, no install, no `git checkout`/`restore`/`stash`/
  `reset`/`clean`, no secrets.

## Execution

You perform this assignment directly and spawn no agent.

## Output

Write your report to the `tmp/pbfix15-report.md` file: per item what changed with file:line, the
control's red and green readings verbatim, the guide-mirror ruling, then `git diff --stat` and
`git status --short`. No process diary.

## Deviation contract

A conflict with an item stops the unit with the standard report. Sentence-internal grammar in the
`CLAIM_SHAPE` rewrite is yours to settle and record.

## Acceptance criteria (in order)

1. `npm run lint:check` exits 0.
2. `npm run check` exits 0.
3. `npm run format:check` exits 0 (run `npm run format` first if needed).
4. Every first sentence in the named files begins with a third-person `-s` verb; paste the output
   of `awk '/^\/\*\*/{getline; print NR": "$0}' src/core/constants.ts src/core/shapers.ts`.
5. `npm run test:guides` exits 0.
6. `npm run test:src:bin -- -t 'answers a pinned legacy client'` exits 0 with the case passing;
   paste the count lines.
7. The item-3 control readings are recorded (red at the version assertion, green on restore).

## Review evidence

The actual `git diff --stat` and `git status --short` output in the report. The full diff stays in
the tree for the closing check.
