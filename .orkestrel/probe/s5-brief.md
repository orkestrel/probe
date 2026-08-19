# Unit S5 — the contract stops describing a package that does not exist

## Role and engine

`implementer` — Claude Opus 5, high reasoning effort. Eight defects, all of them documentation voice
and contract shape, which is this engine's assignment.

## Objective

Make every sentence in the package's public contract true of the code that ships, and rule on the one
field the contract requires and nothing reads.

## Context

Read before acting, in this order: `AGENTS.md`; `.claude/rules/names.md`, `typescript.md`,
`architecture.md`, `patterns.md`, `documentation.md`, `tests.md`, `quality.md`, `writing.md`; then this
brief. No skill is named for this unit.

Governing guide: `PROBE.md`, at `/home/user/scaffold/PROBE.md` — the orchestrator's repository, not
yours. Read it there if your sandbox permits the path; if it refuses, proceed without it, because this
brief carries every fact you need.

The probe's own guide, `guides/probe.md`, DOES NOT EXIST yet. `guides/README.md` records it as
"Not created". So there is no second copy of any documented claim to keep in step, and no parity gate
covering this surface. A later unit creates it.

Documentation defects reach every consumer who installs the package, and two of these are worse than
wrong prose: they are examples a consumer copies and a contract a consumer codes against.

`.claude/rules/documentation.md` is load-bearing here: "Falsify a prose claim the way you falsify a
code claim." A `// false` beside a call that returns `true` is a defect of the same kind as a wrong
return value.

## Defects

### A — the canonical `Claim` @example can never yield a receipt

`src/core/types.ts` lines 94-102. The example binds one `greeting` source and one `test`, then uses
both in `case` AND in `control`:

```text
 * const greeting: Source = { path: 'src/core/greeting.ts', text: 'export const GREETING = "hi"\n' }
 * const claim: Claim = {
 * 	case: { files: [greeting], test },
 * 	control: { files: [greeting], test, stage: 'type', reason: 'the control must not compile' },
 * }
```

The control declares `stage: 'type'` and `reason: 'the control must not compile'`, and the text it
names is `export const GREETING = "hi"`, which compiles. `computeReceipt` issues only when every case
check is clean AND the control failed at its declared stage, so this claim can never earn a receipt.

This is the flagship example on the package's central type, so it is the shape a first consumer copies.
They get a refusal with no indication that the example, rather than their code, is wrong.

The same file gets it right 20 lines earlier: the `Control` @example at lines 70-75 uses
`'export const GREETING: number = "hi"\n'`, which genuinely fails the type stage it names. Use that
text. This is a transcription defect, not a conceptual one.

### B — `CLAIM_SHAPE` documents a derivation that does not exist

`src/core/shapers.ts:68` says the tool "admits a call with `compileGuard(CLAIM_SHAPE)`".
`src/server/factories.ts:65` admits with `isClaim(input)`. `compileGuard` has no call site in `src/` at
all — every occurrence there is inside a doc comment.

**A verification lane found a better repair than rewriting the remark, and it is the one to take.**
The remark describes the right design; the code diverged from it. So make the code do what the remark
says: in `src/core/validators.ts`, replace the hand-written `recordOf` with
`export const isClaim: Guard<Claim> = compileGuard(CLAIM_SHAPE)`.

That collapses two hand-maintained definitions into one derived from the shape, which is the anti-drift
property the remark promises, and it removes the need for a test to hold two things in agreement that
were never bound. Keep the agreement test regardless — it becomes a proof that the derivation behaves,
rather than a rope between two independent definitions.

If the substitution turns out not to be behaviour-preserving, that is a finding worth reporting rather
than a reason to fall back silently: report exactly which input the two disagree on.

Note also that the sweep's wording "`compileGuard` is never called" is false as stated — it is called
at `tests/src/core/validators.test.ts:74`. The true statement is that it is never called in `src/`.

### C — `Control.reason` is required, validated at three layers, and read by nothing

`grep -rn 'reason' src/` returns writes and declarations only, no reads. It is declared in
`types.ts:82`, shaped in `shapers.ts:58`, guarded in `validators.ts:89`, and written by the package's
own arming controls at `Probe.ts:142` and `:152`. Nothing ever reads it.

**This is a ruling, not an edit, and it is the unit's real decision.** It is the same defect
`Claim.project` had before it was routed, and it takes the same two-way choice: route it or remove it.

Rule it on the repository's own laws. The minimal-public-API gate says do not carry a capability with
no consumer. Against that: a control's reason is the claimant stating what they believe falsifies their
claim, and a probe that records why a control was expected to fail has an audit value a probe that
discards it does not. If you rule to route it, route it somewhere a consumer can actually read — the
verdict is the obvious candidate — and that makes it a `Verdict` change, so say so. If you rule to
remove it, remove it from all three layers and from every example.

State the ruling and the law you ruled it on. Do not leave it as it is.

### D through H — five sentences that describe behavior the code does not have

Each is a prose repair. Verify each against the code before rewriting it; do not take this brief's
summary as the finding.

- **`ProbeInterface` and `ProbeOptions` describe an mtime-keyed revalidation** of every workspace file.
  The sweep hashes contents and covers only module extensions.
- **`inferTestProject`'s `@returns`** says `undefined` selects the root project, and no code implements
  that. Correction from verification: "no root project exists" is OVERSTATED — Vitest does always have
  a root project. The real defect is that the documented return contract is not the implemented one.
  Also note the only consumer changed in unit S1's repair: it no longer throws on `undefined`. Read the
  current code, not this sentence.
- **`StageInterface.destroy`** states a teardown guarantee the coordinator's own code refuses to trust.
- **`Verdict.id`** is documented as the revision identity the verdict was produced for. It is an
  independent UUID no stage ever sees.
- **The `expire` event doc** says the runtime worker was recycled. The event fires before recycling
  starts, and recycling is conditional.

There is also a sixth, lower: **the `Verdict` @example reports an `elapsed` the code cannot produce
from its own per-stage numbers.** The figure must exceed the floor `max(case) + max(control) = 513`.
Fix all three sites in one change — `types.ts:207` and the same wrong figure echoed at `helpers.ts:60`
and `validators.ts:181` — or two copies survive to contradict the third.

## Also yours — the admission check unit S4 deliberately deferred

A workspace-escaping `Source.path` is admitted by both `isSource` and `SOURCE_SHAPE`, which constrain
`path` only to a non-empty string. That lets a malformed claim reach a stage and fail part-way through
it.

Unit S4 repairs the stage so it cleans up whatever it is handed. You add the other half: refuse the
path at admission, so the bad input never arrives. Both must hold on their own — do not weaken S4's
work by assuming admission covers it, and do not skip this by assuming S4 covers it.

A path is a wire-level contract concern, so the check belongs with the guard and the shape, not in a
stage.


## Also yours — four defects the completeness critic found after this brief was written

Full evidence in `.orkestrel/probe/critic-findings-routing.md`. Each was executed, not derived.

**C1. Five `@example` blocks carry a test the runtime stage refuses.** `src/core/types.ts:49`, `:72`,
`:96` and `src/core/validators.ts:66`, `:80` all use `text: 'test("greets", () => {})\n'`. No Vitest
project in this workspace sets `globals: true` — `tsconfig.json:8` supplies `vitest/globals` to the
type checker only. Executed: `ReferenceError: test is not defined`.

This is a SECOND independent reason the `Claim` example can never earn a receipt, and it reaches four
examples that defect A does not. **Prescribe the whole replacement, not just the import.** A bare `import` plus `test('greets', () => {})`
is lint-clean today only because the example never runs; adding the import while leaving an empty body
draws oxlint errors that the lint stage then reports, so the repair would redden the criterion it exists
to close. Use a self-contained assertion:

```text
import { expect, test } from 'vitest'
test('greets', () => {
	expect(1).toBe(1)
})
```

The assertion must be self-contained. The runtime stage writes only `subject.test.text` to disk and
never writes the candidate `files`, so an example test that imports the candidate module fails at module
resolution rather than proving anything.

Criterion 1 is not closed until the example survives the lint stage AND the runtime stage AND the
receipt logic. Run it; do not reason about it.

**C2. `Finding.line` is documented absent for the case where it is present.** `types.ts:118-119` says
`line` is absent for a runtime failure; `RuntimeStage.ts:319-320` at HEAD (the finding's original citation, 242-243, was against the pre-repair commit 938eb04) sets it whenever the stack carries
one, and a failing assertion does — executed, `line: 3`. Restate to name the real condition: absent
when the error carries no stack frame.

**C3. `computeReceipt` issues for a control that also broke where it did not declare.** This is a
RULING, not an edit, and it is yours. `helpers.ts:80-82` and `types.ts:65-66` both say a control
failing at a stage other than the one it names has falsified the instrument. `helpers.ts:100-101`
inspects only the declared stage, and executed evidence shows a control breaking at all three stages
still earns a receipt. The package enforces the strict reading for its OWN boot control at
`Probe.ts:177-179` and ships the loose one to callers. Rule it: tighten `computeReceipt`, or restate
both sentences to the narrow reading. Say which and why. If you tighten it, `src/core/helpers.ts` is
yours for that change.

**C5. `Finding.path` is not what the tool reported, at any stage.** `types.ts:131` says "path the tool
reported against". All three stages substitute a different path, and the substitutions are correct
behaviour. Restate the sentence to describe the mapping rather than denying it.

## Scope

- **Owned**: `src/core/types.ts`, `src/core/shapers.ts`, `src/core/validators.ts`, `src/core/helpers.ts`,
  `src/server/types.ts`, `src/server/helpers.ts`, and `tests/src/core/**` for the tests these changes
  owe.
- **Also owned, under EITHER ruling on defect C**: `src/core/helpers.ts` and `src/server/Probe.ts` in
  full, plus `tests/src/server/Probe.test.ts`. The earlier draft granted only two literals in
  `Probe.ts`, which closes neither ruling: routing `reason` needs the verdict path, and removing it
  needs every write site. Take what the ruling needs and say what you took.
- `tests/src/bin/main.test.ts` also carries two `reason` literals and belongs to another unit. If your
  ruling moves them, stop and report the two-line patch rather than editing that file.
- **Off-limits**: `src/server/stages/**`, `src/server/factories.ts`, `src/bin/main.ts`, `guides/**`,
  `PROBE.md`, `package.json`, `vite.config.ts`, `configs/**`, and every dotfile.
- **Instruments**: write every throwaway instrument under `tmp/scratch/`, and delete it before you
  return. `tmp` is gitignored; a bare `scratch/` or a loose file at the repository root is NOT, so an
  instrument there enters the next commit if your run is interrupted before cleanup.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: do not commit, push, tag, publish, install a dependency, or run a destructive
  command. Do not add an npm package. Do not read, print, or copy a secret.

## Criteria

1. The `Claim` @example, executed, yields a receipt. Prove it by running it, not by reading it.
2. Every remaining @example in the owned files, executed, returns what its comment claims. Where a
   fence asserts a value, the assertion holds.
3. A workspace-escaping `Source.path` is refused by `isSource` and by `SOURCE_SHAPE`, and a contained
   relative path is still admitted. Both directions, or the check is untested in the direction that
   matters.
4. `isClaim` still agrees with `compileGuard(CLAIM_SHAPE)` over the hostile population
   `tests/src/core/validators.test.ts` already covers. Your admission change moves both; keep them
   agreeing.
5. Each of the six prose repairs describes what the code does. For each, name the code you read.
6. Defect C is ruled and implemented in one direction, with the law named.

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
- Validate with the scoped commands `npm run test:src:core` and `npm run check:src:core` first. Run the
  whole-workspace `npm test` only once, at the end, and read its result against the standing condition
  above rather than treating any red as yours.
- **This workspace has no `tests/guides.test.ts` and no guide-fence gate of any kind.** So NO documented
  behaviour in this package has an executing gate — not the guide fences, and not the TSDoc `@example`
  blocks. That is why defect A and C1 both survived to ship. Report every documented behaviour you find
  with no gate; the list is the useful output, and it is longer than it looks.
- The `probe` Vitest project reads `tmp/probe/`. Put any throwaway instrument in `tmp/scratch/`, and nowhere else.
- Units before you edited `tests/src/core/**`. Read those files as they are now.

## Unknowns

Nothing. The earlier draft asked whether `guides/` repeats defect A's claim; that is now measured and
the answer is no — no file under `guides/` mentions the probe's API, and `guides/probe.md` does not
exist. Defect A has exactly one home, `guides/**` stays off-limits, and no criterion touches it.

## Deviation contract

Stop and report when a fix needs an off-limits file, when defect C's ruling needs more of `Probe.ts`
than the two literals, or when a gate reddens for a reason your change does not explain. Report
expected, found, the exact command and its output, whether the work is done, and at most one short
hypothesis.

Where the conflict is ancillary — a sentence's placement, which of two true phrasings to use — decide it,
record the decision, and carry on.

## Output

Return exactly: **Files written**, **Validation**, **Acceptance evidence**, **Deviation**, **Decisions**.

Under **Decisions**, lead with your ruling on `Control.reason` and the law you ruled it on. No process
diary.

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
