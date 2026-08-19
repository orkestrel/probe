# Fix round — unit 2 stages, two defects reproduced by the Orchestrator

Your unit-2 work is uncommitted in `/workspace/probe`. Keep it and correct it in place. You remain
the sole serial writer, and your owned files are unchanged: `src/server/types.ts`,
`src/server/helpers.ts`, and the three files under `src/server/stages/`.

Both defects are reproduced, with the exact sequences below. Your unit's own probe reported
criteria 3 to 5 as met; an independent run says otherwise for two of them. Diagnose from the
reproductions rather than from the earlier probe.

## D1 — the lint stage returns a silent false clean for a document under `tmp/`

Identical source, one `debugger` statement, inspected twice through one `LintStage`:

- `test.path` = `<workspace>/tmp/probe/x.test.ts` returns **0 findings**.
- `test.path` = `<workspace>/tests/scratch/x.test.ts` returns **1 finding**.

Oxlint applies its ignore rules to the document Uniform Resource Identifier, and `tmp` is
gitignored, so the language server answers a clean result for a file it declined to read. That is
the refusal-reads-as-a-pass failure the unit brief named, arriving through the language-server door
instead of the command-line one.

This matters because `tmp/probe/` is exactly where this repository's convention puts a probe, so
the default path is the broken one.

Fix the property, not the symptom: the stage chooses the Uniform Resource Identifier it presents,
because the document need not exist anywhere. Present every document at an identifier Oxlint will
read, whatever path the caller declared, and map every finding back to the caller's declared path.
You already perform exactly that remapping in the runtime stage.

Acceptance: the two inspections above return the same finding count, and a clean source at either
path returns none.

## D2 — the runtime stage still serves a stale dependency

One `RuntimeStage`, a dependency and a specification both under `<workspace>/tmp/probe/`, the
specification importing `./rtdep.ts`:

```
1. write dep = 'ORIGINAL'; inspect a spec asserting 'ORIGINAL'  ->  0 findings   correct
2. write dep = 'CHANGED';  inspect a spec asserting 'CHANGED'   ->  1 finding    WRONG, expected 0
3.                          inspect a spec asserting 'ORIGINAL' ->  0 findings   WRONG, expected >0
```

Step 3 is the defect that matters: the file on disk says `CHANGED`, the probe asserts `ORIGINAL`,
and the stage reports clean. A probe that certifies a claim false against current source is worse
than no probe, because the agent believes it.

`matchesWorkspaceModule` is `/\.(?:[cm]?[jt]sx?|vue|json)$/`, so the dependency IS inside the
snapshot population; the walk is not the problem. Look instead at WHEN the snapshot is taken
relative to the invalidation, and at whether the invalidation reaches the module the specification
imports rather than only the specification itself. A snapshot captured after the previous run
completes will show nothing moved on the next call.

A fresh specification identity protects the specification and nothing it imports. That was measured
before this package existed, and it is why the sweep exists.

Acceptance: the three-step sequence above returns 0, then 0, then a non-zero count.

## Proof discipline

Write the two reproductions as throwaway probes under `/workspace/probe/tmp/probe/`, run
`npm run test:probe`, and record the failing counts BEFORE you change anything. Then fix, then
record the same commands green. Delete every probe before you finish; unit 4 owns the tests.

Note the trap in D1 applies to your own probe: a probe file under `tmp/` is fine for the runtime
and type stages, and is the very thing that breaks the lint stage.

## Execution

Perform this directly and spawn nothing. Do not commit or push. Validate with `npm run check`,
`npm run lint:check`, and `npm run test:probe`.

## Output

The files changed with a one-line reason each, the before and after counts with their exact
commands, the diagnosis of D2 in one or two sentences, any deviation. No process diary.
