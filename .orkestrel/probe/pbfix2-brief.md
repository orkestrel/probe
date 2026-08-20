# PBFIX2 — close the campaign audit's nine remaining rows

## Role and engine

`implementer`, Opus 5.

Routing note, so the choice is on the record: the objective lane would normally take this unit. It
cannot. Row R4's proof needs a fixture language server, which is a child of the test process and
therefore a grandchild of a bench exec, and a bench sandbox denies a grandchild `EPERM`. The unit
runs on the native engine for that reason. Its auditor is GPT-5.6 Sol, which did not write it.

## Objective

Close rows R1, R2, R4, R5, R6, D1, D4, and D5 from the probe campaign audit, so probe carries no
open finding from that round.

## Context

The campaign audit reconciliation is `.orkestrel/probe/pb-audit-reconciliation.md`. Read it. It
names eleven rows. Two are already closed and one is ruled without a change, so eight remain and
this brief carries all eight.

A first fix unit, PBFIX, was dispatched against these rows and stopped mid-flight: it rewrote
`src/server/index.ts` from `export *` rows into named and type-only rows, which
`.claude/rules/architecture.md` § Barrel exports forbids outright. Its whole partial tree was
reverted. **Nothing it wrote survives, and its brief was the cause** — the brief passed an auditor's
finding about a published type through without checking what remedy the rule permits. Read the
barrel rule before touching a barrel, and read the constraint under "What the barrel rule permits"
in this brief.

Read before acting, in this order:

1. `/workspace/probe/AGENTS.md`
2. `/workspace/probe/.claude/rules/architecture.md`, `.claude/rules/typescript.md`,
   `.claude/rules/tests.md`, `.claude/rules/documentation.md`, `.claude/rules/writing.md`,
   `.claude/rules/quality.md`
3. `/workspace/probe/.orkestrel/probe/pb-audit-reconciliation.md`
4. `/workspace/probe/guides/probe.md` — the governing guide, which you also edit

No skill is named for this unit.

Host: Linux container, bash, network available. `/workspace/probe` is a clean checkout at `271da88`.
`node_modules` is installed. The `src:server` project spawns real language servers and is slow.

### What the orchestrator measured, so you do not re-derive it

Each of these was run by the orchestrator against this tree, not taken from a report.

- `Verdict.reason` enters the receipt token. Two claims differing only in the reason's prose digest
  to `f3f64d71ca3df5e2dbabb1e9955f5b88` and `712c763a9e383fa44564f437ff12c7b1`. The digest is token
  field 2.
- `src/server/helpers.ts` rewrites every absolute string relative to the selected workspace before
  hashing, so identical claim bytes digest differently across workspaces.
- `src/core/validators.ts:61-72` refuses an empty, absolute, or workspace-escaping `path`.
  `src/core/shapers.ts:18` constrains `SOURCE_SHAPE.path` to `stringShape({ min: 1 })` and nothing
  else.
- `src/server/stages/LintStage.ts:99` awaits `#warmth` during teardown, while
  `src/server/types.ts:122-123` states that a stage abandons every inspection rather than waiting.
- `src/server/ProbeServer.ts:86` calls `process.stdin.pause()` unconditionally, while
  `src/server/types.ts:222` states the process is left as it was before `start`.
- `src/server/stages/RuntimeStage.ts:494-505` sweeps by walking the whole workspace from its root
  (`#walk()` starts at `resolve(this.#workspace)`), deleting any file whose basename matches
  `.probe-<pid>-<uuid>` when that pid is dead. Its own comment claims "a developer's own file
  carrying the marker is left where it is", which is false.
- `src/core/helpers.ts:138-142` requires every stage to appear in `verdict.checks` and requires
  nothing of `verdict.control`, so a control array missing a stage entirely leaves `strayed` false.
- `guides/probe.md:122` documents `Inspection`, and `src/server/index.ts` barrels it.

## Unknowns

Three, named so you report on them rather than inventing an answer:

- **R4's bound.** What value bounds the warming wait is not decided here. Pick one, state it, and
  say what it is derived from — an existing constant, the stage's own deadline, or a new constant in
  `constants.ts`. Report the choice.
- **D1's mechanism.** Whether the sweep is narrowed by location, by a content marker this package
  writes, or by both is yours. Measure where this package actually writes generated specifications
  before choosing; a location bound that under-sweeps is worse than the defect. Report the mechanism
  and why the alternative loses.
- **R2's refusal message.** Whether the guard can name the failing member depends on what
  `@orkestrel/contract` returns from `compileGuard` and the `recordOf` combinators. Read the
  installed types. Where it cannot, say so and close the row on the prose alone.

## What the barrel rule permits

`.claude/rules/architecture.md` § Barrel exports, verbatim in the tree you are in:

- A barrel contains only `export * from './module.js'` declarations. No named, default, namespace,
  or type-only barrel export.
- A star-export collision is a design failure: rename the conflicting concept at its owner. Never
  hide a collision with a selective barrel row.
- Every declaration in a centralized file is exported, and every intentional top-level source export
  reaches its environment barrel.

There is therefore no such thing as "keep this type out of the barrel". A type in `types.ts` is
public. If a type must not be public, the capability itself is removed, and that is a design
decision this unit does not hold. Nothing in this brief asks you to change a barrel row, and no row
below closes by changing one. If you conclude one must change, that is a deviation — stop and
report.

## The eight rows

### R1 and R5 — one defect, two sentences

The digest is a function of the workspace and the claim. Two sentences describe it as a function of
the claim alone.

- `guides/probe.md:235` — `Verdict.reason` "does not change receipt eligibility or enter the token".
  It enters the token, through the digest, because `Control` carries it.
- `guides/probe.md:418` — "`verdict.digest` is a function of the case and control bytes alone, so it
  is the same in any…".

State the real rule once, in the guide, and make the `Verdict.reason` TSDoc in `src/core/types.ts`
agree with it. Say plainly what the digest covers: the case bytes, the control bytes including the
reason, and the workspace the absolute strings were rewritten against.

Do not remove `reason` from the digest. A claim's declared falsifier is part of what the verdict
answered, and excluding it would make the digest a claim about less than the claim.

Add the executed assertion that would break if either sentence went false again. A substring check
that the sentence appears is a presence guard, not a proof —
`.claude/rules/documentation.md` § Parity is explicit about this. The digest evidence above is the
control: two claims differing only in the reason's prose must digest differently.

### R2 — a guard and its published schema disagree, and the TSDoc says they do not

`src/core/validators.ts:118` states that `isClaim` "admits and refuses exactly what
`compileGuard(CLAIM_SHAPE)` does, so the in-process guard and the guard the tool applies at the wire
cannot disagree about one claim." They do disagree: a `path` of `../../etc/hosts` satisfies
`SOURCE_SHAPE` and is refused by `isSource`.

`ProbeServer` advertises the schema and enforces the guard, so a caller that read the advertised
schema and satisfied it is refused with no member named. Close both halves:

1. Correct the TSDoc to state the real relationship. The schema is the wire contract's shape and the
   guard is this package's admission rule, and the guard is strictly narrower. Say where it is
   narrower.
2. Make a refusal of a schema-valid claim name the member and the reason it failed, so the caller
   can act on it. Where `@orkestrel/contract` cannot supply the failing member, say so in your
   report and close this half on the prose.

Correct `SOURCE_SHAPE`'s own remark at `src/core/shapers.ts:9` too, which says "`isSource` enforces
the same minimum" — true of the minimum and misleading about the rest.

### R4 — teardown waits for a server that may never answer

`src/server/types.ts:122-123` states that a stage abandons every inspection it holds rather than
waiting behind one, so teardown never waits for an inspection to return.
`src/server/stages/LintStage.ts:99` awaits `#warmth`, and warming waits for the language server's
`initialize` response. A server that accepts the connection and never answers deadlocks `destroy()`.

Bound the wait. The contract sentence is the one worth keeping: a probe that cannot be destroyed is
worse than one that gives up on a warm. `#child` is already available at that site, so a bounded
race can release the process without the warming result.

Prove it: a fixture that speaks the transport, accepts the connection, and never answers
`initialize`. `.claude/rules/tests.md` permits a protocol-faithful fixture server, and forbids a
mock. `destroy()` must settle within the bound you chose, and the test asserts the elapsed interval
with `performance.now()`, as `.claude/rules/tests.md` requires.

Record the failing count before the fix and the passing count after, per
`.claude/rules/tests.md` and AGENTS.md § TTTDD.

### R6 — `destroy()` changes a process it did not change at `start`

`src/server/types.ts:222` states the process is left as it was before `start`.
`src/server/ProbeServer.ts:86` pauses stdin unconditionally, so a host whose stdin was already
flowing stops reading when the server it embedded is destroyed.

Pause only what this server resumed. `start` already captures the listeners it will release
(`ProbeServer.ts:55`); capture the flowing state on the same line of reasoning and restore it. This
is the same ownership test `@orkestrel/mcp` applies.

Prove both directions: a stdin that was flowing before `start` is still flowing after `destroy`, and
a stdin that was paused before `start` is paused after it.

### D1 — the sweep deletes files this package did not write

`RuntimeStage.ts#sweep` walks the entire target workspace and deletes any file whose basename
matches the revision pattern with a dead pid. A consumer's own file named
`notes.probe-4821-<uuid>.ts` is deleted from their repository. The comment above the method asserts
the opposite.

This is the most serious row in the set: it is data loss in a consumer's tree, from a package that
has not published yet.

Narrow the sweep to what this package writes. The mechanism is yours, per **Unknowns**. Correct the
comment to state what actually makes the sweep safe.

Prove both directions:

- a developer file named `notes.probe-<dead-pid>-<uuid>.ts`, at a path this package does not write
  to, survives a sweep;
- a genuine orphan this package wrote, with a dead pid, is still swept.

The second assertion is what stops a location bound from closing the row by sweeping nothing.

### D4 — the receipt reads an unrecorded control stage as a clean one

`src/core/helpers.ts` `computeReceipt` requires every stage to appear in `verdict.checks` and
requires nothing of `verdict.control`. `strayed` inspects only the control entries that exist, so a
`verdict.control` array missing a stage entirely passes. The receipt then claims every other control
stage stayed clean when one of them never ran.

Unreachable through `prove`, which always records every control stage. Reachable through
`computeReceipt`, which the guide publishes as a public helper a consumer calls on a verdict they
hold.

Require the control to name every stage, the same way the case already must. `Probe.prove` already
satisfies this — `Probe.ts:150` runs the control through `#inspect`, which returns one check per
stage — so no shipped path changes behaviour.

Existing tests do build shorter control arrays and will redden. `tests/src/core/helpers.test.ts:254`
passes `control: [{ stage: 'type', … }]`, and `tests/src/server/stages/RuntimeStage.test.ts:263-265`
passes single-element control arrays. Both files are yours. Update each to the shape `prove` really
produces, and keep whatever each assertion was proving. Add the missing-control-stage case beside
them.

### D5 — a documented refusal that nothing proves

The absolute-path refusal is documented in two places and asserted nowhere, and the guard's Windows
drive-letter branch — the `[A-Za-z]:` alternative in `src/core/validators.ts:61` — is unreached by
any test.

Two assertions in `tests/src/core/validators.test.ts`: a POSIX absolute path is refused, and a
Windows drive-letter path is refused. Both run on every host, because the guard is a string rule
rather than a filesystem one.

## Not yours

- **D3, `Inspection` as excess surface, is ruled and needs no change.** It is a type in
  `src/server/types.ts`, so `.claude/rules/architecture.md` requires it exported and barrelled, and
  `guides/probe.md:122` documents it. The orchestrator retains it. Do not remove it, do not intern
  it, do not touch its barrel row.
- **The `Verdict.control` sub-entity question** — whether `Verdict` should carry
  `{ stage, reason, checks }` as a sub-entity, whether `reason` should be required, and whether it
  should accept `''` — is a design round the orchestrator holds. Do not restructure `Verdict`.
- **Sol 24's threat-model ruling stands as documented.** The receipt token has evidentiary value
  only when the reader recomputes it from the claim and a trusted workspace, and the guide says so.
  Do not weaken it and do not restate it as stronger.
- `INTERNAL` in `tests/guides.test.ts` stays empty.

## Scope

Owned files, the only files you may write:

- `guides/probe.md`
- `src/core/types.ts`, `src/core/helpers.ts`, `src/core/validators.ts`, `src/core/shapers.ts`,
  `src/core/constants.ts`
- `src/server/ProbeServer.ts`, `src/server/helpers.ts`
- `src/server/stages/LintStage.ts`, `src/server/stages/RuntimeStage.ts`
- `tests/src/core/helpers.test.ts`, `tests/src/core/validators.test.ts`
- `tests/src/server/ProbeServer.test.ts`, `tests/src/server/stages/LintStage.test.ts`,
  `tests/src/server/stages/RuntimeStage.test.ts`
- `tests/guides.test.ts` — for the executed assertions R1 and R5 require, and for nothing else
- any new fixture file under `tests/src/server/fixtures/`

Off-limits, do not write: `src/core/index.ts`, `src/server/index.ts`, `src/core/errors.ts`,
`src/server/types.ts` except for the two contract sentences R4 and R6 name, `src/server/Probe.ts`,
`src/server/Overlay.ts`, `src/server/factories.ts`, `src/server/stages/TypeStage.ts`,
`vite.config.ts`, `package.json`, and everything under `.orkestrel/`.

`src/server/types.ts` is **granted for the two sentences R4 and R6 name and nothing else**. Every
other line in it is off-limits, including every barrel-visible declaration.

Tools: Read, Grep, Glob, Edit, Write, Bash. No commits, no pushes, no dependency installs, no
destructive command. Never run `git checkout`, `git restore`, `git stash`, `git reset`, or
`git clean`.

## Naming

Name every test for the behaviour it proves, never for this brief's row label. `R4`, `D1`, and the
rest are this brief's control identifiers so its own tables can be read; they are not vocabulary
this package has, and a test carrying one leaves a private label in the suite permanently.

## Execution

Perform this assignment yourself. Spawn nothing.

## Deviation contract

Stop and report — expected, found, exact evidence, done or not done, at most one hypothesis — when:

- a quoted line is not where this brief says it is, or does not read as quoted;
- a row cannot close without writing an off-limits file;
- a row cannot close without changing a barrel row;
- a fix would change a published signature this brief does not name.

Decide and carry on, recording the choice in your report: the bound R4 takes, the mechanism D1
takes, the exact guide and TSDoc wording, the fixture's shape, and where each new test sits within
its file.

## Acceptance criteria

Run these in order and report each bare exit code. The order is deliberate: the cheap non-timing
gates come first so a slow one cannot hide them.

1. `grep -n "does not change receipt eligibility" guides/probe.md` reports nothing, and
   `grep -n "case and control bytes alone" guides/probe.md` reports nothing.
2. `npm run format` then `npm run format:check` exits 0.
3. `npm run lint:check` exits 0.
4. `npm run check` exits 0.
5. `npm run test:guides` exits 0.
6. `npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:core` exits 0.
7. `npm run test:policy` exits 0.
8. `npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:server` exits 0.
   This project spawns real language servers and is timing-sensitive under load. Where it fails on a
   deadline rather than an assertion, re-run that one file alone once, report both readings
   labelled, and treat it as an observation rather than a stop — the orchestrator takes the deciding
   reading after you exit. Where it fails on an assertion, stop and report.
9. Each of R4, R6, D1, D4, and D5 has at least one test that fails against the unfixed code. Record
   the exact command and its failing count before each fix, and the same command's passing count
   after, per `.claude/rules/tests.md`. A test that never ran red does not bind to the defect it
   claims.

Do not run `npm test`, `npm run build`, or `npm run test:distribution`. An independent verifier
takes those readings.

## Output

A report with:

- one row per audit row — R1, R2, R4, R5, R6, D1, D4, D5 — stating what changed and what proves it;
- the red-then-green command and counts for each of R4, R6, D1, D4, D5;
- one row per acceptance criterion with its bare exit code;
- the three **Unknowns** answered, with the reasoning that decided each;
- the decisions you made under the deviation contract's second list;
- anything you could not close, named.

No process diary.
