# Unit S1 fix round 3 — land the discriminant across every file that consumes `Finding`

## Role and engine

`implementer` — Claude Opus 5, high reasoning effort. This completes a change the previous round
started and correctly stopped on.

## Why this round exists

The previous round was told to add a named discriminant to `Finding` using a scope drawn from the file
that DECLARES it. It could not, and it proved why with two independent measurements rather than
guessing:

- A required property fails the typecheck: `src/core/validators.ts(128,14): error TS2322 … Property
  'origin' is missing`.
- An optional property fails at runtime, because `recordOf` is exact:
  `isFinding({ path, message, origin: 'code' })` returns `false`. `isFinding` feeds `isCheck` feeds
  `isVerdict`, and `src/server/factories.ts:76` applies `isVerdict` to every verdict the `prove` tool
  returns — so the server would throw `The prove tool returned an invalid verdict` on every call.

That is the Orchestrator's error, not the unit's: the scope was drawn from the declaration rather than
from the consumers. This brief is scoped from the consumers.

It stopped and reported rather than reaching, and everything not depending on the discriminant is
already landed and green. **Do not redo that work.** Read the diff first.

## The defect still open

A control whose test never ran earns a receipt. Measured against a real `Probe.prove`:

```text
SKIPPED-CONTROL receipt : "probe:204337f2-…:runtime:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11"
CONTROL-A real failure  : "probe:a3a84d5a-…:runtime:…"
CONTROL-B passing ctrl  : undefined
```

`computeReceipt` asks whether the control's check carries **a** finding, never whether that finding is
about the control's **code**. A genuine failure still earns a receipt and a passing control still earns
none, so the middle result is the defect.

## The design decision is already made, and it is good

The previous round ruled `origin: 'code' | 'instrument'` and gave its reasons. Adopt it as ruled.

- A union rather than a boolean, per `.claude/rules/names.md` § General vocabulary: a binary SWITCH is
  a boolean, while a discriminant on a produced datum is data. Nothing sets `origin` to select
  behaviour; the stage produces it.
- `origin` names the axis that varies — where the fault the message reports lives.
- `'instrument'` rather than the auditor's `'stage'`, because `stage` is already this package's word
  for which inspection ran (`Stage`, `Check.stage`, `Control.stage`), and one term with two meanings
  breaks `AGENTS.md` § Design laws "One concept, one term". `instrument` is already the package's own
  word for the inspecting thing at `types.ts:66` and `helpers.ts:82`.

If you disagree, say so before implementing and stop. Do not re-litigate it silently.

## Scope — drawn from consumers this time

Every file naming `Finding`, enumerated with `grep -rln '\bFinding\b' src/ tests/`:

- **Owned**: `src/core/types.ts`, `src/core/constants.ts`, `src/core/validators.ts`,
  `src/core/helpers.ts`, `src/server/stages/RuntimeStage.ts`, `src/server/stages/TypeStage.ts`,
  `src/server/stages/LintStage.ts`, `tests/src/core/helpers.test.ts`,
  `tests/src/core/validators.test.ts`, `tests/src/core/index.test.ts`, and
  `tests/src/server/stages/RuntimeStage.test.ts`.
- Also owned if your change reddens them: `tests/src/server/stages/TypeStage.test.ts`,
  `tests/src/server/stages/LintStage.test.ts`, `tests/src/server/Probe.test.ts`.
- **Instruments**: write every throwaway instrument under `tmp/scratch/`, and delete it before you
  return. `tmp` is gitignored; a bare `scratch/` at the repository root is NOT.
- **Off-limits**: `src/core/shapers.ts`, `src/server/factories.ts`, `src/bin/main.ts`, `guides/**`,
  `PROBE.md`, `package.json`, `vite.config.ts`, `configs/**`, every dotfile, and
  `tests/src/bin/main.test.ts`.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: no commit, push, tag, publish, dependency install, or destructive command. Add no
  npm package, no type assertion, and no suppression of any kind.

**Two facts the Orchestrator verified so you do not have to.** `src/core/shapers.ts` contains no
`Finding` shape at all, so the published tool schema needs no change and that file stays off-limits.
And `tests/src/core/index.test.ts:8` asserts `Object.keys(entry).sort()` with `toStrictEqual`, so every
new export you add reddens it — that redness is expected and yours to update, not a deviation.

## The patch the previous round left you

Its exact prescription for `src/core/validators.ts`, replacing the current `isFinding`:

```ts
export const isOrigin: Guard<FindingOrigin> = literalOf(FINDING_ORIGINS)

export const isFinding: Guard<Finding> = recordOf(
	{ origin: isOrigin, path: isString, message: isString, line: isNumber },
	['line'],
)
```

Put `FINDING_ORIGINS` in `src/core/constants.ts` beside `PROBE_STAGES`, which is the established
pattern that `isStage` already follows. `src/core/index.ts` needs no edit — it is `export *`.

## Count the construction sites yourself

The previous round counted 16 in `RuntimeStage.ts`, 3 in `TypeStage.ts`, 4 in `LintStage.ts`, and none
in `Probe.ts`. A cruder pattern-based count by the Orchestrator disagreed, which is a fact about the
patterns rather than about the code. Count them by reading, set `origin` at every one, and report your
count.

`origin` is `'instrument'` when the message is about the stage's own machinery — a deletion failure, an
eviction failure, a missing configured project, a module that ran nothing. It is `'code'` when the
message is a diagnostic the tool reported about the candidate's source.

## Criteria

Each owes a committed test, red before the fix and green after, with the exact command and both counts.

1. A control whose test calls `ctx.skip()` earns NO receipt.
2. A control that genuinely fails at its declared stage still earns a receipt.
3. A control that passes still earns none.
4. A case carrying an instrument fault still refuses the receipt. This is the over-correction guard and
   it must stay a separate test. The previous round already wrote it — keep it green.
5. Every `Finding` the three stages construct carries `origin`, set correctly. Prove it for at least one
   `'instrument'` finding and one `'code'` finding per stage.
6. `isFinding` admits a finding carrying `origin` and refuses one without it, and the MCP server still
   returns a valid verdict — the failure mode the previous round measured must not reappear.
7. The three messages that breach the `Finding` contract drop their false `Vitest` attribution and name
   the real path, now that `origin` distinguishes them. `types.ts:113-137` defines `Finding` as the
   tool's own message against the path the tool reported.
8. `computeReceipt` and `Verdict.receipt` state the full invariant in prose, which the previous round
   deliberately left half-written because the code did not yet support it.

## What ends this seam

This is the fourth round against the runtime stage's verdict path and past the three-round budget in
`.claude/rules/quality.md`, which is why the ruling is already made and this round implements it rather
than re-opening it. State the invariant plainly in the code and its documentation:

**A receipt is issued only when every stage ran clean on the case AND the control produced at least one
`origin: 'code'` finding at the stage it declared.**

The constraint bounding it against over-correction: the case's `clean` term keeps counting EVERY
finding, `'instrument'` included, so a case whose stage faulted still refuses the receipt. The interface
where a consumer meets the obligation: `Finding.origin`, documented on the type and on
`computeReceipt`.

## Execution

Perform this assignment directly. Spawn no subagent.

## Naming, so this brief's vocabulary does not become permanent

Criterion numbers are addressing for this brief only. Name every test for the behaviour it proves.

## Standing condition — dispatch baseline

You are dispatched from a clean, committed baseline and you are the sole writer. The Orchestrator
confirms `git status --porcelain` is empty before launching. State any completion criterion about your
diff against the baseline commit, never against the working tree.

## Host facts

- Working directory `/workspace/probe`. Nested spawns permitted.
- The previous round observed `tests/config.test.ts` PASSING 28/28 in the bench sandbox, where two
  earlier units saw `spawnSync EPERM`. Treat that failure as possible but not expected; if you see it,
  the file is off-limits and it is the sandbox, so report and move on.
- `npm test` takes roughly three minutes; one test runs 66 real inspections.

## Deviation contract

Stop and report when a fix needs an off-limits file, when a criterion contradicts another, or when a
gate reddens for a reason your change does not explain. Report expected, found, the exact command and
output, whether the work is done, and at most one short hypothesis.

The previous round's deviation was exemplary: it measured the blocker two independent ways, named the
files a successor would need, and left the tree consistent rather than half-changed. Hold that standard.

## Output

Return exactly: **Files written**, **Validation**, **Acceptance evidence**, **Deviation**, **Decisions**.
