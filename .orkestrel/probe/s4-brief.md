# Unit S4 — the type stage's overlay cannot outlive its inspection

## Role and engine

`sol` — GPT-5.6 Sol, high reasoning effort. Objective correctness work over cleanup ordering and map
lifetime.

## Objective

Make every overlay the type stage applies get removed, whatever happens during the inspection that
applied it, so no claim can leave an in-memory copy of a real workspace file behind.

## Context

Read before acting, in this order: `AGENTS.md`; `.claude/rules/names.md`, `typescript.md`,
`architecture.md`, `patterns.md`, `tests.md`, `quality.md`, `writing.md`; then this brief. No skill is
named for this unit.

Governing guide: `PROBE.md`, at `/home/user/scaffold/PROBE.md` — the orchestrator's repository, not
yours. Read it there if your sandbox permits the path; if it refuses, proceed without it, because this
brief carries every fact you need.

The probe's own guide, `guides/probe.md`, DOES NOT EXIST yet. `guides/README.md` records it as
"Not created", so there is no second copy of any documented claim to keep in step. A later unit
creates it.

`PROBE.md`'s five laws exist to stop the probe certifying against source that is
not what it claims to be checking. Defect A below is that exact failure, reached through the cleanup
path rather than through caching.

This unit is a prerequisite for the candidate-source overlay work (O9), which rebuilds the same
lifetime. Repairing it here means O9 builds on a correct lifetime instead of repairing it a second
time in a new shape.

## Defects

### A — overlays are applied outside the `try` whose `finally` removes them

`src/server/stages/TypeStage.ts:148-169`. Verbatim:

```ts
		this.#revision += 1
		this.#overlay(subject.test)
		for (const source of subject.files) this.#overlay(source)
		try {
			// inspection
		} finally {
			this.#overlays.delete(resolveWorkspaceFile(this.#workspace, subject.test.path))
			for (const source of subject.files) {
				this.#overlays.delete(resolveWorkspaceFile(this.#workspace, source.path))
			}
		}
```

`#overlay` calls `resolveWorkspaceFile`, which throws on a path that escapes the workspace. So a case
whose `files` contain a good path followed by an escaping path applies the first overlay, throws on the
second, and never enters the `try`. The `finally` never runs and the first overlay is pinned.

The overlay text comes from the caller, so the stage then serves an attacker-chosen body for a real
workspace file to every later claim in that process. A later claim can be made to pass or fail against
text that is not on disk, which defeats the receipt's premise.

This is reproduced. The Orchestrator ran it and the disk file was confirmed untouched while the stage
kept reading the poison text for that path across two later inspections that never named it. Full
evidence is in `.orkestrel/probe/high-finding-verification.md`.

Reachability: `isSource` and `SOURCE_SHAPE` constrain `path` only to a non-empty string, so nothing
rejects an escaping path before the stage. `Probe.prove` rethrows and does not destroy the probe, so the
poisoned resident stage survives the failed claim.

Trigger precision, which the test must respect: the bad path must follow at least one good overlay. A
case whose only bad path is `test` pins nothing, because `test` is overlaid first.

### B — the `finally` itself can throw, so moving the applications is not sufficient

The `finally` re-derives each key by calling `resolveWorkspaceFile` again. A bad path in the middle of
`files` therefore throws inside the `finally`, and every later source stays pinned.

Do not fix A by moving the two lines inside the `try` and stopping. Collect the resolved paths as they
are applied and clear exactly those, so clearing cannot itself throw. Something in the shape of an
`applied` list that `#overlay` pushes to, and a `finally` that iterates it, satisfies both defects with
one mechanism.

### C — `#versions` is never pruned

`#overlay` sets both `#overlays` and `#versions` (lines 172-176). The `finally` deletes only from
`#overlays`. `#versions.clear()` runs at line 109, which is `destroy`. So the stage retains one
`#versions` entry per distinct claim path for the life of the process.

This is presently harmless to correctness, because `#version` consults `#overlays.has(file)` first. It
is still unbounded growth keyed on caller-supplied strings. Delete the `#versions` entry alongside the
overlay.

### D — STRUCK. This finding was REFUTED by independent verification; do not repair it

The sweep reported that `TypeStage`'s class `@remarks` describes a project selection the coordinator no
longer uses. A blind verification lane refuted it: the claim misquotes the document it indicts.

The `@remarks` already conditions the scoped-project branch on "when a call names none", which is
exactly what `inspect` does — `project ?? inferTypeProject(source.path)`. The documentation and the code
agree, and the sweep read a contradiction into a sentence that states the fallback correctly.

**Leave `src/server/stages/TypeStage.ts` lines 20-22 exactly as written.** Criterion 6 is struck with
this defect. A dropped finding is kept here with its refutation rather than deleted, so the next reader
does not re-raise it.

## Scope

- **Owned**: `src/server/stages/TypeStage.ts`, and `tests/src/server/stages/TypeStage.test.ts`.
- **Off-limits**: everything else. Specifically `src/core/**` — including `validators.ts` and
  `shapers.ts`, so do NOT add the admission-time path check discussed under Deferred below —
  `src/server/Probe.ts`, `src/server/stages/RuntimeStage.ts`, `src/server/stages/LintStage.ts`,
  `src/server/factories.ts`, `src/server/helpers.ts`, `src/bin/main.ts`, `guides/**`, `PROBE.md`,
  `package.json`, `vite.config.ts`, `configs/**`, and every dotfile.
- **Instruments**: write every throwaway instrument under `tmp/scratch/`, and delete it before you
  return. `tmp` is gitignored; a bare `scratch/` or a loose file at the repository root is NOT, so an
  instrument there enters the next commit if your run is interrupted before cleanup.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: do not commit, push, tag, publish, install a dependency, or run a destructive
  command. Do not add an npm package. Do not read, print, or copy a secret.

## Deferred, deliberately — do not implement it here

The sweep also recommends rejecting a workspace-escaping path at admission, in `isSource` and
`SOURCE_SHAPE`, so a malformed claim is refused at the wire rather than part-way through a stage. That
is correct and it belongs to unit S5, which owns `src/core/**`.

Do not reach for it. Defence in depth is the point: S4 makes the stage clean up whatever it was handed,
S5 stops the bad input arriving. Each must hold on its own, so S4's tests must drive an escaping path
through the stage directly rather than assuming admission will stop it.

## Criteria

Every criterion that fixes a defect owes a committed test, red before the fix and green after; record
the exact command and both counts. Criterion 4 is a regression criterion, proved by the existing tests
staying green, and has no red state to capture.

1. A case with a good path followed by a workspace-escaping path leaves no overlay behind. Assert it by
   observing what a LATER inspection reads for the good path, not by inspecting a private map.
2. That later inspection reads the file's real on-disk text. Assert the disk content too, so a test that
   passes because the file was corrupted is impossible.
3. An escaping path anywhere in `files` — first, middle, last — leaves nothing behind. The middle case
   is what proves defect B is fixed rather than only defect A.
4. A normal inspection still applies its overlays, still reports diagnostics against the candidate text,
   and still cleans up. The fix must not stop overlays working. Existing tests in
   `tests/src/server/stages/TypeStage.test.ts` cover this; keep them green.
5. `#versions` does not grow across repeated inspections of distinct paths. Assert an observable
   consequence rather than the map's size if you can find one; if you cannot, say so in your report and
   assert the size, and name what would have been better.

## Naming, so this brief's vocabulary does not become permanent

The defect letters and criterion numbers in this brief are addressing for this brief only. Name every
test for the behaviour it proves, never for the defect or the criterion that specified it. A private
label that reaches a test name outlives the brief and means nothing to the next reader.

## Standing condition — dispatch baseline

You are dispatched from a clean, committed baseline and you are the sole writer in this checkout. The
Orchestrator confirms `git status --porcelain` is empty before launching you; if it is not empty when
you start, that is a deviation worth reporting immediately rather than working around.

State any completion criterion about your own diff against the BASELINE COMMIT, never against the
working tree: `git diff --stat <baseline>..` is stable, and `git status` is not.

## Execution

Perform this assignment directly. Spawn no subagent.

## Host facts your commands run under

- Working directory `/workspace/probe`. Nested process spawns are permitted.
- The whole-workspace `npm test` is safe and takes roughly three minutes.
- The `probe` Vitest project reads `tmp/probe/`, and several tests write there. Put any throwaway instrument in `tmp/scratch/`, and nowhere else.
- Units before you may have edited `tests/src/server/stages/TypeStage.test.ts`. Read it as it is now
  rather than trusting any line number quoted for it. The line numbers quoted above for
  `src/server/stages/TypeStage.ts` were read at dispatch and no unit before you owned that file, but
  re-read them anyway before editing.

## Unknowns

Whether criterion 5 has an observable consequence at all. `#version` consults `#overlays.has(file)`
first, so a stale `#versions` entry may be unreachable by design. If it is genuinely unobservable, that
is a real answer: report it, assert the size, and note that the entry is unbounded growth rather than a
correctness defect. Do not invent a behavioural difference that is not there.

## Deviation contract

Stop and report when a fix needs an off-limits file, when two criteria contradict, or when a gate
reddens for a reason your change does not explain. Report expected, found, the exact command and its
output, whether the work is done, and at most one short hypothesis.

Where the conflict is ancillary — which test file a helper sits in, the order of two assertions — decide
it, record the decision, and carry on.

## Output

Return exactly: **Files written**, **Validation**, **Acceptance evidence**, **Deviation**, **Decisions**.

Under **Validation**, name each gate you ran and its exit code. Under **Acceptance evidence**, give each
criterion its test name, and for each red-then-green proof the exact command with both counts. No
process diary.

## Standing condition — the shared `tmp/probe` directory

Four server test files write into one `tmp/probe/` directory, and `test:src` runs `src:core`,
`src:server`, and `src:bin` in a single Vitest invocation with no parallelism guard, so their files
run concurrently and see each other's writes.

This has already cost two units a repair round. It is a known condition, not a discovery.

Two rules follow, and they bind whatever you are writing:

- **Never assert that `tmp/probe/` is empty, or assert anything about its whole contents.** Assert that
  the specific files YOUR test created are gone. `.claude/rules/tests.md` requires exactly this: assert
  the membership a globbed set should have, never a total that a partly empty population satisfies.
- **Give every file your test writes a name unique to that test**, so a sibling running concurrently
  cannot collide with it or be mistaken for it.

Where a proof needs a whole workspace rather than a few files, take an owned scratch directory linked
to the real installed toolchain, as `tests/src/bin/main.test.ts` already does. Do not disable file
parallelism to make an over-broad assertion pass — that hides the defect and keeps the wrong assertion.
