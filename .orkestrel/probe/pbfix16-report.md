# PBFIX16 report

## Per item

1. **Origin prose, guide.** `guides/probe.md:287-288` — the instrument clause now reads "a
   specification it could not write, after its directory exists, for a reason the target tree does
   not own, or a module that ran no test."
2. **Origin prose, class remark.** `src/server/stages/RuntimeStage.ts:71-73` — the `RuntimeStage`
   remark now reads "a specification it could not write after its directory exists, or one it could
   not run, evict, or delete, in each case for a reason the target tree does not own".
3. **The malformed-row enumeration.** `guides/probe.md:332` — the head reads "The target tree
   publishes something probe cannot read:" and the enumeration gained the member "or a directory it
   blocks probe from creating for the boot workbench" as its final alternative.
4. **The create verb.** `src/server/Probe.ts:242` — the boot message reads "The probe could not
   create the boot workbench (…)". `tests/src/server/Probe.test.ts:382` follows with
   `stringContaining('The probe could not create the boot workbench')`. The guide row from item 3
   already reads "creating", so no further alignment was needed.
5. **The summary sentence.** `guides/probe.md:20-24` — the sentence now reads "A `Verdict` is the
   answer: one `Check` per stage in each phase, the case and the control." The paragraph is
   rewrapped to the file's column.
6. **The wrap.** `guides/probe.md:416-417` — the registered-failure sentence is rewrapped to two
   lines at the file's column.
7. **The `#workbench` comment.** `src/server/Probe.ts:235-236` — added: "A returned `true` means
   this directory was absent before this call, so the boot teardown that follows owns removing it
   again."
8. **The flattening proof, conditional.** No code change. See Item-8 outcome following.
9. **The durable record.** `.orkestrel/probe/pbfix14-report.md` — the receipt recommendation's
   citation now reads `guides/probe.md:22` (was `guides/probe.md:255-265`). Every temporal `now` and
   the one dating `new` ("the new workspace classification") in that file are replaced with
   present-tense statements: lines 5, 8, 11, 14, 16, 23, 25, 35, and 71 (pre-edit numbering). No
   other content in that file changed.
10. **The placement remark.** `src/server/helpers.ts:490-492` — added an `@remarks` sentence to
    `findRefusedPaths`'s TSDoc: "This function lives in the server helpers rather than in core:
    core's leaf pair, `helpers.ts` and `validators.ts`, may not consume the shapes module this
    function reads `CLAIM_SHAPE` from, and `ProbeServer` is the sole consumer of the result it
    returns." Verified before writing: `src/core/validators.ts` mentions `CLAIM_SHAPE` only in
    TSDoc prose (`rg -n "CLAIM_SHAPE" src/core/validators.ts` returns two comment lines, no import),
    so core's leaf pair genuinely does not import the shapes module today.

## Item-8 outcome

Vectors tried:

- **A workspace argument through the bin's real arguments.** `src/bin/main.ts` reads no `argv` at
  all — `rg -n "process.argv" src/` returns no match, and the entry is `new ProbeServer().start()`
  with no options. There is no CLI argument through which a caller can supply a workspace, so this
  vector does not exist.
- **A construction-refusal message carrying the workspace path itself.** `rg -n
  "\\$\\{.*workspace" src/` matches only `src/server/ProbeServer.ts:178`, the `prove` tool's
  post-handshake refusal message (not a construction refusal, and it interpolates refused draft
  member names, not the workspace path). Every construction-refusal message this package raises —
  `readWorkspaceManifest`'s "`<name>` does not publish a readable manifest", `resolveWorkspaceModule`
  and `loadWorkspaceModule`'s failures, `resolveWorkspaceBinary`'s failures — interpolates only the
  fixed tool name (`typescript`, `oxlint`, `vitest`) or a workspace-relative member path, never the
  workspace root itself. A directory name carrying a newline therefore never reaches a
  construction-refusal message's text.

No reachable refusal embeds caller text carrying a newline at construction. Nothing changed in
`src/bin/main.ts` or `tests/src/bin/main.test.ts`; the flattening at `src/bin/main.ts:8` stays
defensively unreachable through the construction-refusal door, as PBFIX14's audit found.

## Review evidence

`git diff --stat`:

```text
 .orkestrel/probe/pbfix14-report.md | 20 ++++++++++----------
 guides/probe.md                    | 36 ++++++++++++++++++------------------
 src/server/Probe.ts                |  4 +++-
 src/server/helpers.ts              |  4 ++++
 src/server/stages/RuntimeStage.ts  |  4 ++--
 tests/src/server/Probe.test.ts     |  2 +-
 6 files changed, 38 insertions(+), 32 deletions(-)
```

`git status --short`:

```text
 M .orkestrel/probe/pbfix14-report.md
 M guides/probe.md
 M src/server/Probe.ts
 M src/server/helpers.ts
 M src/server/stages/RuntimeStage.ts
 M tests/src/server/Probe.test.ts
```

## Gates

1. `npm run lint:check`: exit 0.
2. `npm run check`: exit 0.
3. `npm run format` then `npm run format:check`: `format` rewrote `guides/probe.md` (table column
   width and paragraph rewrap converged to the formatter's own spacing); `format:check` then exited
   0.
4. `npm run test:guides`: exit 0, 13 tests passed.
5. `npx vitest run --config vite.config.ts --no-cache --project src:server
   tests/src/server/Probe.test.ts -t 'blocked boot workbench'`: exit 0, 1 passed, 21 skipped, 22
   collected.
6. Item 8 made no code change, so no bin proof was extended. The recorded vectors above stand in,
   per the brief's fallback.
