# O9 unit 2 — the runtime stage serves the candidate it certifies

## Role and engine

`sol` — GPT-5.6 Sol, high reasoning effort. Module resolution, transitive import graphs, and cache
invalidation across a resident runner. Objective and constraint-heavy.

## Objective

Make `subject.files` visible to the Vitest run, through the whole transitive import graph, so a claim's
test exercises the candidate the agent supplied rather than what happens to be on disk.

## This is the defect the campaign exists to close

Measured against the built package, from `o9-design-brief.md`:

```text
PROVE A  case: type=0 lint=0 runtime=0
PROVE A  RECEIPT: ISSUED  <-- for a candidate the runtime never ran

PROVE B  case: type=0 lint=0 runtime=1
PROVE B  runtime says: expected 'probe' to be 'CHANGED'
PROVE B  RECEIPT: none
```

Same candidate, both outcomes. A test that observes the change gets a false red; a test that does not
gets a **false green carrying a receipt** — and the second is the common case, because most edits are
refactors whose tests are meant to keep passing.

The mechanism is visible in `inspect` at `src/server/stages/RuntimeStage.ts:76-127`. The **test** is
written to disk as a real revision file and run. **`subject.files` are never written and never
overlaid.** So every import the test makes resolves to the disk copy.

## What is settled, so you do not re-derive it

From two independent design lanes and the Orchestrator's reconciliation
(`o9-reconciliation.md`, read it in full):

- **One adapter per stage, sharing state rather than mechanism.** TypeScript wants host callbacks, Oxlint
  wants LSP documents, **Vite wants resolution and load hooks**. A single virtual filesystem underneath
  all three is the second source-language analyzer `AGENTS.md` forbids.
- **Candidates are keyed by their declared workspace-relative path.** Both lanes refused a
  revision-suffixed identity: it changes `import.meta.url`, module identity, and stack paths, it leaks a
  synthesized name into messages an agent reads, and it does not avoid invalidation anyway.
- **Reach the whole transitive graph.** Direct-import-only leaves the measured false green exactly as it
  is, because the ordinary claim's test imports a barrel and the barrel imports the real file.
- **Take the project-augmentation route, not the configuration override.** This is explicit in the
  reconciliation's unit plan and binds this unit.
- **The overlay is inspection-scoped.**

## Unit 1 built what you consume

`src/server/Overlay.ts` and `OverlayInterface` in `src/server/types.ts` exist and shipped at `703bfe6`.
Members: `revision`, `paths`, `set`, `text`, `covers`, `clear`. `revision` is a per-instance `randomUUID`
identity, which exists precisely so a resident runner can tell two inspections' texts apart for one path.

The type stage's adoption is the model: `#inspect` constructs its own `Overlay`, installs it where the
resident host reads it, and clears it through its own reference in `finally`. **Follow that shape.** Read
`src/server/stages/TypeStage.ts` before designing yours.

## The hard part, named so you attack it directly

Vitest holds a **resident** runner across inspections, warmed once at `#warm`
(`RuntimeStage.ts:156-184`) and recycled every 64 specifications. Vite caches transformed modules. So:

1. A hook that serves overlay text must be consulted **on the inspection that sets the overlay**, not
   from a module cache populated by an earlier inspection or by disk.
2. When the overlay clears, the next inspection must **not** keep serving the candidate.
3. `#revalidate` at `:276` and `#snapshot` at `:292` already exist for cache invalidation against disk
   changes. Read them; your mechanism either extends that path or explains why it cannot.

**Measure the invalidation, do not reason about it.** Two inspections of one declared path with different
candidate text, where the second's text must be what runs. If the resident runner serves the first's
text, you have found the real problem and it is yours.

## Scope

- **Owned**: `src/server/stages/RuntimeStage.ts`, `tests/src/server/stages/RuntimeStage.test.ts`, and
  `src/server/types.ts` **only** if the adapter needs a declared type.
- **Off-limits**: `src/core/**`, `src/server/Overlay.ts`, `src/server/stages/TypeStage.ts`,
  `src/server/stages/LintStage.ts`, `src/server/Probe.ts`, `src/server/factories.ts`,
  `src/server/helpers.ts`, `src/bin/main.ts`, every other test file, `guides/**`, `PROBE.md`,
  `package.json`, `vite.config.ts`, `configs/**`, every dotfile, and everything under
  `/home/user/scaffold/`.
- **Do NOT change `Overlay`.** If it needs a member it does not have, STOP and report — that is a
  successor to unit 1, not an edit here.

## Explicitly NOT this unit

The reconciliation's decision 5 — record which candidates were actually served, and never issue a receipt
for a claim whose candidate the runtime did not load — is a **later unit**. It touches `helpers.ts` and
the receipt computation, which are off-limits here.

Your unit makes the candidate reachable. The next one makes the receipt honest about whether it was
reached. Do not attempt both; a unit that reaches into `computeReceipt` will stop on scope.

## Host facts

- Working directory `/workspace/probe`, clean at `703bfe6`. Sole writer. Report immediately if
  `git status --porcelain` is not empty when you start.
- `npm test` is **201 passed, 0 skipped, 0 todo**.
- Probe is on scaffold 0.0.43. Nested spawns work; the runtime stage runs Vitest in-process on worker
  threads (`pool: 'threads'`), so it shares the host process.
- **This tree's server tests share one `tmp/probe` directory. Re-run any failure alone before believing
  it**, and report both readings. `tests/src/bin/main.test.ts` has a known pre-existing flake under load,
  in a file you do not own — if you see `ENOENT ... scandir ... tmp/probe` there, that is it.
- State every completion claim against the baseline commit.

## Unknowns

- Whether Vite's resolution hooks can be installed on an already-warmed Vitest instance, or whether the
  overlay must be reachable from the config the runner was created with. **Measure this first**; it
  decides the shape.
- Whether serving a candidate through a hook is enough, or whether the resident runner's module cache
  defeats it across inspections.

## Execution

Perform this assignment directly. Spawn no subagent and delegate no part of it.

## Deviation contract

Stop and report when the repair needs an off-limits file, when `Overlay` lacks a member you need, or when
a gate reddens for a reason your change does not explain. Report expected, found, the exact command and
its output, whether the work is done, and at most one short hypothesis.

## Acceptance criteria

1. A claim whose test imports a candidate **directly** exercises the candidate's text, not the disk copy.
   Prove it red before the change.
2. A claim whose test imports a candidate **through a barrel** exercises the candidate's text. This is
   the transitive case and it is the one that produced the measured false green.
3. Two sequential inspections of one declared path with different candidate text each run their own text.
   The second must not serve the first's.
4. After an inspection, the next one with no candidates runs the disk copy. The overlay does not leak.
5. The disk copy is never modified. Assert its bytes before and after.
6. Red-then-green for criteria 1, 2, and 3: the exact command with its failing output before, and green
   after.
7. All five gates pass, each with its exit code.
8. `npm test` reports 0 skipped and 0 todo at a count at least 201 plus your new tests.

## Output

Return exactly: **What you measured about the resident runner first**, **The mechanism** (and why it is
the project-augmentation route rather than a config override), **Files written**, **Red-then-green
proofs**, **Validation** (each gate and exit code), **Counts**, **Anything re-run alone with both
readings**, **Deviation**, **Decisions**.
