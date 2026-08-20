# PBFIX5 — the runtime stage creates the directory it writes into

## Role and engine

`implementer`, Opus 5. Its auditor is GPT-5.6 Sol, which did not write it.

## Objective

Make the guide's flagship example return a receipt on a fresh checkout.

## The defect, measured

The Orchestrator drove the guide's own flagship claim, verbatim, against the shipped
`dist/src/server/index.js` with `tmp/probe/` absent:

```
tmp/probe before prove: false
tmp/probe after prove:  false
receipt: undefined
CASE  runtime [instrument] The runtime stage could not write the generated specification
      (The runtime test directory does not exist: /workspace/probe/tmp/probe)
CTRL  type    [code]       Type 'string' is not assignable to type 'number'.
CTRL  runtime [instrument] The runtime stage could not write the generated specification
      (The runtime test directory does not exist: /workspace/probe/tmp/probe)
```

`tmp` is git-ignored, so **every fresh clone of a consumer's repository has no `tmp/probe/`**, and
the first claim they prove returns no receipt. This package has never published, so this is the
behaviour of its first release.

## Why it happens

The package creates the workbench, deletes it, then refuses to use it.

- `src/server/Probe.ts:231` — `const created = !existsSync(directory)`
- `:263` — `mkdirSync(directory, { recursive: true })`
- `:309-311` — `if (created) rmdirSync(directory)`
- `src/server/stages/RuntimeStage.ts:341,351` — writes the generated specification, creating no parent

The refusal itself is good behaviour: it detects the absence and reports a clear message rather than
crashing. The problem is the directory it refuses over is the one the coordinator created and tidied
away moments earlier, on the exact path the guide's flagship example declares.

## The ruling you implement

**The runtime stage creates the parent directory of the specification it writes, recursively.**

The caller declared the path, so creating its parent is implied by the declaration, and the
coordinator already does exactly that for its own boot dependencies. Documenting the prerequisite
instead would be documenting a limit rather than closing it, which
`.claude/rules/documentation.md` warns against — and the limit exists only because of an internal
asymmetry, not because of anything a consumer did.

**Keep the refusal** for the case that survives: a parent that cannot be created. Its message is
already clear; adjust it only if the new failure mode needs different words.

Do not change `Probe.#boot`'s cleanup. Once the stage creates what it needs, boot tidying away a
directory it created leaves no consumer worse off, and leaving litter in a consumer's tree is worse
than not.

## Context

Read before acting: `AGENTS.md`, `.claude/rules/typescript.md`, `.claude/rules/tests.md`,
`.claude/rules/documentation.md`, and `guides/probe.md`'s prerequisites and flagship example.

Host: Linux container, bash. `/workspace/probe` is a clean checkout at `3719eda` with dependencies
installed. `tmp/probe/` currently exists and is empty — **delete it before you measure anything**, or
you will not see the defect.

## Unknowns

One. **Whether any other write path in this package has the same gap.** The runtime stage is the one
the measurement caught. Check every `writeFileSync` and `cpSync` under `src/` for a parent it does not
ensure, and report what you find even where you do not change it.

## Scope

Owned: `src/server/stages/RuntimeStage.ts`, `tests/src/server/stages/RuntimeStage.test.ts`,
`tests/guides.test.ts`, and `guides/probe.md`.

Off-limits: every other file, and in particular `src/server/Probe.ts`, both barrels,
`src/server/helpers.ts`, `vite.config.ts`, and `package.json`.

Tools: Read, Grep, Glob, Edit, Write, Bash. No commits, no pushes, no installs, no destructive
command. Never run `git checkout`, `git restore`, `git stash`, `git reset`, or `git clean`.

## Execution

Perform this assignment yourself. Spawn nothing.

## What the test must prove

A claim whose declared test path sits under a directory that does not exist earns its receipt. Drive
it through the real coordinator, delete the directory first, and assert the receipt is defined —
not merely that no error was thrown.

`tests/guides.test.ts` already runs the flagship example. Deleting `tmp/probe/` before that suite is
the cheapest reproduction and the unit that found this used exactly that; decide whether the
permanent proof belongs there or in the runtime stage's own file, and say why.

Record the failing count before the fix and the passing count after.

## Deviation contract

Stop and report — expected, found, exact evidence, done or not done, at most one hypothesis — when a
quoted line is not where this brief says it is, when the fix needs an off-limits file, or when
creating the parent breaks the sweep that decides which files this package may delete.

That last one is the real risk and is worth naming: `#sweep` deletes files this package wrote, and
`#owned` attributes them by a content marker. Creating a directory does not mark it, so a directory
this package created is not a file it may delete. Do not extend the sweep to directories.

## Acceptance criteria

Run these in order and report each bare exit code.

1. With `tmp/probe/` deleted, the flagship claim earns a receipt. Report the command and the receipt.
2. `npm run format` then `npm run format:check` exits 0.
3. `npm run lint:check` exits 0.
4. `npm run check` exits 0.
5. `npm run test:guides` exits 0, run with `tmp/probe/` deleted beforehand.
6. `npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:server` exits 0.
7. The new test fails against the unfixed code. Record the command and both counts.

Do not run `npm test`, `npm run build`, or `npm run test:distribution`. An independent verifier takes
those readings.

## Output

A report with what changed and what proves it, the red-then-green counts, criterion 1's receipt, one
row per acceptance criterion with its bare exit code, the unknown answered, and anything you could not
close. No process diary.
