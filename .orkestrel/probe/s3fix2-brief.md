# Unit S3fix2 — close the S3fix audit's findings

## Role and engine

`implementer` — Claude Opus 5, native. The subject is a spawned Oxlint child, and a sandboxed bench gives
a Node-spawned-Node child no working stdio, which yields false greens rather than failures. That is not a
guess: this round's auditor probed it and declined to execute six claims because of it.

## Objective

Lint every candidate at the path it was declared, and prove teardown through what a consumer can observe.

## Read this first

`/home/user/scaffold/.orkestrel/probe/s3fix-audit-reconciliation.md` is your finding list, F1 through F6,
with what each rests on and which ones dissolve if F1 lands. `s3fix-audit-sol-verdict.md` is the
independent lane's full report. `s3fix-report.md` is what the previous round claimed.

Then read `/home/user/scaffold/AGENTS.md`; `/home/user/scaffold/.claude/rules/` `names.md`,
`typescript.md`, `architecture.md`, `patterns.md`, `tests.md`, `quality.md`, `writing.md`. The governing
guide is `/home/user/scaffold/PROBE.md`. No skill is named.

## F1 — the sixth design. Do this one first; three others may dissolve into it.

The previous round declared the exact-path override case unclosable and gave a five-row table of
rejected alternatives. **Every row varies the path.** The auditor found a sixth that does not:

> use the declared URI unchanged, serialize inspections sharing that URI, and use the existing document
> version sequence for freshness

**All three ingredients already exist.** Verified at `2ecddc2`:

```text
src/server/Probe.ts:92-96   #lintQueue = createQueue({ concurrency: 1, retries: 0 })
LintStage.ts:157            const inspected = diagnostics.finally(() => this.#close(uri))
LintStage.ts:159, :203      didOpen … / didClose …
LintStage.ts:163            version: this.#sequence
```

Inspections are already serialized at the coordinator, every `didOpen` is already paired with a
`didClose` through a `finally`, and a version counter is already sent. The uuid exists to make URIs
unique; serialization plus pairing plus versioning is what uniqueness was for.

**Removing path synthesis removes every glob mismatch at once** — suffix, directory-anchored,
filename-sensitive, and exact-path alike. F3 and F4 exist only because synthesis exists.

**The one thing that survives F1 and must not be lost.** The probe stages its own arming candidates under
`tmp/probe/`, which the workspace's ignore files exclude from linting entirely, so Oxlint returns `[]` for
anything declared there. The previous round measured it: `tmp/probe/lint-stage.test.ts` with `debugger`
returns `[]`; the same text elsewhere returns the finding. Linting the arming's candidates where they are
declared makes that leg a **permanent false green**. Solve it, and do not solve it by reintroducing a
generic path predicate — F3 is the finding that the previous solution reached outside its helper's
contract. If the honest answer is that the arming should not declare candidates under an ignored path at
all, say so and report it rather than working around it inside this file.

**Verify the design before building on it.** Confirm that reusing one declared URI across sequential
inspections actually works against the real Oxlint server — open, await diagnostics, close, reopen the
same URI with different text and a higher version — before you rewrite anything around it. If it does not
hold, stop and report; do not fall back to synthesis silently.

## F2 — replace the inspector census with public outcomes. HIGH.

`tests/src/server/stages/LintStage.test.ts` opens a `node:inspector` session and reads V8
`privateProperties` to count five `#` maps. `.claude/rules/tests.md` says "Test observable behavior, not
implementation details." **The previous round flagged this against itself**, and the independent lane
refuted two claims on it, so both lanes agree.

The replacement the auditor supplied, and it is what the census stood in for: every pending inspection
settles, `destroy` resolves idempotently, a later inspection rejects, and the owned child is no longer
live. Assert those. Delete the census, the `CENSUS` global, `readMapSizes`, `censusStage`, and the
`node:inspector` import.

If you find a public outcome the census covered that these four do not, name it and say what you asserted
instead.

## F5 — one test binds to no repair. Correct the record; keep the test.

`rejects an inspection whose candidate text ends the real language server` would pass against `dcd50a3`:
it calls `inspect()` before `destroy()`, and the baseline suppressed code 0 only when `#destroyed` was
true. The previous round's own report shows it implicitly — five new tests, four red-then-green proofs.

**Keep it.** It proves a real reachability fact: a candidate's text can end the server with code 0. Rename
it if its current name implies it binds to a repair, and say in your report what it does and does not
prove.

## F6 — the report's table contradicted its prose. LOW.

Not a code change. When you rewrite the alternatives record under F1, state the rows correctly: row 1 is
the declared path and is the baseline the others are measured against.

## Do NOT do these

- Do not re-add path synthesis if F1 lands.
- Do not treat the previous round's "an instrument was committed" finding as live. It was dropped on the
  record: the census is permanent test infrastructure in a test file, not a throwaway probe under
  `tmp/scratch/`. The substantive concern is F2.
- Do not change `#describe`'s signal-before-code priority. The auditor refuted a claim about read order
  while confirming every ending is covered; the wording was imprecise, the code is not.

## Host facts

- Working directory `/workspace/probe`, clean and committed at `7721a20`. You are the sole writer. Report
  immediately if `git status --porcelain` is not empty when you start.
- `npm test` reports **188 passed, 0 skipped, 0 todo** at your baseline and takes roughly three minutes.
- Nested process spawns work here, and the real `oxlint` binary resolves.
- State every completion claim against the baseline commit: `git diff --stat 7721a20..` is stable.
- Write every instrument under `tmp/scratch/` and delete it before returning.

## Unknowns

- Whether reusing one declared URI across sequential inspections holds against the real server. Measure it
  first; that is F1's gate.
- What replaces the `tmp/probe` carve-out once synthesis is gone. The brief does not prescribe an answer
  because the Orchestrator does not have one.

## Scope

- **Owned**: `src/server/stages/LintStage.ts` and `tests/src/server/stages/LintStage.test.ts`.
- **Off-limits**: everything else — `src/core/**`, `src/server/Probe.ts`, `src/server/helpers.ts`, the
  other two stages, `src/bin/**`, `tests/setupServer.ts`, every other test file, `guides/**`, `PROBE.md`,
  `package.json`, `vite.config.ts`, `configs/**`, every dotfile, and everything under
  `/home/user/scaffold/`.
- If a repair genuinely needs an off-limits file, STOP and report rather than reaching. F3's likely
  resolution touches `src/server/helpers.ts`, which you do not own — report it as a successor rather than
  reaching for it.

## Execution

Perform this assignment directly. Spawn no subagent and delegate no part of it.

## Deviation contract

Stop and report when a repair needs an off-limits file, when F1's design does not hold against the real
server, or when a gate reddens for a reason your change does not explain. Report expected, found, the
exact command and its output, whether the work is done, and at most one short hypothesis.

Ancillary choices — a private field's name, assertion order, where a helper sits — are yours to decide,
record, and carry on from.

## Acceptance criteria

1. A candidate declared at a path an **exact-path** override exempts receives no finding for that rule.
   Assert both directions: the exempt path clean, and a non-exempt path still reporting.
2. The directory-anchored and suffix-glob cases both still pass. Do not trade one for another.
3. A **filename-sensitive** directory-anchored glob — the shape `configs/candidate*.ts` — selects
   correctly.
4. The `tmp/probe` arming leg is not a false green. Prove it: a candidate the arming declares, carrying a
   real violation, produces a finding.
5. No `node:inspector` import remains in the owned test file, and teardown is proved through public
   outcomes.
6. Red-then-green for criteria 1 and 4: the exact command with its failing output before, and green after.
7. `npm run format:check`, `npm run lint:check`, `npm run check`, and `npm run build` pass. Report each
   exit code.
8. `npm test` reports 0 skipped and 0 todo, at a count at least 188 plus your new tests, minus any test
   you deleted with its reason stated.

## Output

Return exactly: **F1's verification** (does the declared URI hold against the real server, with the
measurement), **Findings closed**, **What replaced the census**, **What the reachability test proves and
does not**, **Red-then-green proofs**, **Validation** (each gate and exit code), **Counts**, **Deviation**,
**Decisions**. No process diary. End with `git diff --stat` against `7721a20`.
