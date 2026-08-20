# PBFIX13: the shape-and-prose readiness rows

## Role and engine

Claude Opus 5 `implementer`, native, writing in the main checkout at `/home/user/probe`.

## Objective

Close the rows the `tmp/readiness-matrix.md` file carries as PBFIX13: BR9 through BR19.

## Context

- Read before editing: the `AGENTS.md` file, `.claude/rules/names.md`,
  `.claude/rules/typescript.md`, `.claude/rules/writing.md`, `.claude/rules/tests.md`,
  `.claude/rules/documentation.md`, the `guides/probe.md` guide, and the `tmp/readiness-matrix.md`
  file — the rows carry the reproduced evidence; this brief restates only what each needs.
- The tree is committed and clean at dispatch, with PBFIX12 landed (the objective seams closed:
  schema-owned refusals, exact stage cardinality, the destroyed-start throw, the containment
  boundary prose, workspace-owned creation faults, progress at claimant admission, the two-inode
  gauge proof, the one-line bin refusal). Line numbers in the matrix predate it — re-locate by
  pattern.
- You are on the host: spawn-driving tests run normally, but the container carries concurrent
  load, so a timing-sensitive whole-suite reading is an observation and scoped runs are your
  criteria.
- The rows:
  - **BR9** — probe's `Source` (the file-text record at src/core/types.ts:30) collides with the
    `Source` class `@orkestrel/guide` exports (verified at
    node_modules/@orkestrel/guide/dist/src/core/index.d.ts:962); the `Finding` precedent counts a
    declared development dependency. Rename the record. Choose the name yourself — the concept is
    a declared file: a path and its text — and prove the choice with a collision sweep over every
    installed `@orkestrel/*` declaration bundle and a residue sweep after landing. Rename
    `isSource` and every consumer with it, one concept one term throughout.
  - **BR10** — `Verdict.checks` holds the claim's case outcomes: `formatVerdict` prints `case`
    for it and `Claim` names its phases `case`/`control`. Rename the member to `case`, sweeping
    the declaration, `isVerdict`, `computeReceipt`, `formatVerdict`, `Probe`, the guide, and the
    proofs. The wire shape follows the type.
  - **BR11** — `messageFromUnknown` follows no sanctioned helper form; rename to
    `describeUnknown` with its consumers.
  - **BR12** — banned senses, ruled at edit time: `now` (src/core/types.ts near the boot-control
    remark and the warm-service remark; the `@returns` line in src/server/helpers.ts), temporal
    `once` (the `arm` event sentence in the guide), `below` (the guide's § Cost opener; comments
    in Probe.ts, RuntimeStage.ts, TypeStage.ts — the comparative "110 ms to 330 ms above" stays),
    and the `StageInterface.destroy` TSDoc sentence "depends on both guarantees" (src/server/types.ts)
    — replace `guarantees` with the checkable properties and keep `both` only if the sentence
    names the members.
  - **BR13** — § Registering the server states no reply shape. Add the fact in the section's own
    voice: a `tools/call` answers with one text block rendered by `formatVerdict`, the receipt is
    that text's closing line (`receipt TOKEN`, or `no receipt`), and a caller that needs the
    record holds a `Probe` in process. Where the repository keeps its declared-gaps prose, record
    the structured-content decision as deferred with one sentence.
  - **BR14** — the same section names no driven client and states no honest limit. The installed
    `@orkestrel/mcp` client is in probe's dependencies: if its client can drive a child stdio
    server, add one integration proof driving the built bin through it and name the client in the
    guide; if it cannot, state plainly that the transport facts are proved against a hand-written
    line client and no third-party client has been driven, and record the integration proof as a
    declared gap. Decide by reading mcp's exports, and record which path you took and why.
  - **BR15** — the comment in configs/src/vite.bin.config.ts opens "The `scaffold` executable
    build"; this file is probe's own. The comment names `probe`.
  - **BR16** — `ProbeOptions.deadline` states no `Default:` line; the implementation applies
    30,000 ms and the guide publishes it. Add the line.
  - **BR17** — `PROBE_STAGES` derives from a hand-written union while its siblings freeze
    `as const` lists and derive. Write the frozen-list derivation for `Stage`, and settle the
    qualifier across `PARTIES`, `PROBE_STAGES`, and `PROBE_ERROR_CODES` in one direction,
    updating consumers.
  - **BR18** — the example data drifts: the `Toolchain`/`isToolchain` examples carry versions the
    `Verdict` example contradicts, and the `Verdict` example carries the flagship claim's reason
    and path with a digest the guide's measured receipt contradicts. Align on the measured values
    with their date, or make the example visibly not the flagship claim; apply one choice
    consistently.
  - **BR19** — hoist the named `onExit` and `onExitAgain` declarations out of the `it` callback in
    tests/src/server/helpers.test.ts to module scope, keeping the name-vs-identity proof intact.
- Rename proofs: for BR9, BR10, and BR11 the typecheck is the red — record `npm run check` red
  after the types move and green after the consumers follow, or state why the sweep order made a
  red impossible and prove completeness by residue sweep instead.

## Unknowns

- The BR9 replacement name is yours; report the candidates you weighed and the sweep that proves
  the winner collision-free.
- Whether `@orkestrel/mcp` offers a stdio client transport decides BR14's path; report the reading.

## Scope

- Owned: `src/`, `tests/src/`, `guides/probe.md`, `README.md`, `configs/src/vite.bin.config.ts`.
- Off-limits: `package.json`, `vite.config.ts`, `tsconfig.json`, the vendored files
  (`tests/setupPolicy.ts`, `tests/policy.test.ts`, `tests/config.test.ts`), `tests/guides.test.ts`
  and `tests/distribution.test.ts` unless a rename breaks their assertions (then the assertion
  moves with the rename and you record it), `tmp/` except your own report file.
- Permission limits: no commit, no push, no install, no `git checkout`/`restore`/`stash`/`reset`/
  `clean`, no secrets.

## Execution

You perform this assignment directly and spawn no agent.

## Output

Write your report to the `tmp/pbfix13-report.md` file: per row, what changed with file:line; the
BR9 name decision with both sweeps; the BR14 path decision with its reading; the BR12 per-hit
rulings; the rename red-or-residue evidence; and any claim of your own you flag. End with the
diffstat. No process diary.

## Deviation contract

A conflict with a row's prescription stops the unit with the standard report. An ancillary choice
(sentence form, example values within the chosen direction) is yours to decide and record.

## Acceptance criteria (in order)

1. `npm run lint:check` exits 0.
2. `npm run check` exits 0.
3. `npm run format:check` exits 0 (run `npm run format` first if needed).
4. Residue sweeps return no hit: the old BR9 name and `isSource`... (the sweep names the exact
   patterns for the name you chose), `\bchecks\b` as a `Verdict` member, `messageFromUnknown`.
5. The fleet collision sweep for the BR9 name returns no colliding declaration.
6. `rg -n "scaffold" configs/src/vite.bin.config.ts` returns no hit.
7. `npm run test:guides` exits 0.
8. Scoped vitest runs over the files you touched pass; whole-suite readings are observations.

## Review evidence

Return the actual `git diff --stat` and `git status --short` output in the report. The full diff
stays in the tree for the auditor.
