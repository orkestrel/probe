# Unit S3fix — close the S3 audit's confirmed findings

## Role and engine

`implementer` — Claude Opus 5, native. Two lanes audited S3 and both refuted the same seven claims, so
this is a fix round. The auditor after you will be GPT-5.6 Sol, an engine that did not write this.

You run natively because the subject is a spawned Oxlint child, and a sandboxed bench gives a
Node-spawned-Node child no working stdio — it produces false greens rather than failures.

## Objective

Make `destroy()` settle on every path a language server can end on, make the synthesized candidate path
select the overrides the gate applies, and make every test in the file bind to the behaviour it names.

## Read this first

`/home/user/scaffold/.orkestrel/probe/s3-audit-reconciliation.md` is your finding list, F1 through F9,
with the measurements and controls behind each. `s3-audit-lens-verdicts.md` carries the full per-claim
evidence and `s3-audit-sol-verdict.md` the independent lane's report. Read the reconciliation; reach for
the other two when you need a measurement's detail.

Then read, in this order: `/home/user/scaffold/AGENTS.md`; `/home/user/scaffold/.claude/rules/`
`names.md`, `typescript.md`, `architecture.md`, `patterns.md`, `tests.md`, `quality.md`, `writing.md`.
The governing guide is `/home/user/scaffold/PROBE.md`. No skill is named for this unit.

## What you are repairing

**F1, HIGH — the suppression at `src/server/stages/LintStage.ts:349`.** One line causes three of the
seven refutations. `if (this.#destroyed && code === 0) return` skips `#fail`, and `#fail` is the only
thing that settles a `#failures` entry, so any request outstanding when a clean exit lands hangs forever.
Two measured paths: a server that exits 0 without answering `shutdown`, and a `destroy()` during warm
against a server that exits 0 before answering `initialize`. Oxlint's only code-exit shape is 0.

**F2, HIGH — a regression this repair introduced.** A spawn failure emits `error` and `close` and never
`exit`, and line 133's `exit` handler is the only writer of `#ending`. `destroy()` then hangs, because
line 98's guard does not fire and the `once('exit')`/`once('close')` listeners at 100-101 are attached
after `close` already fired. The baseline `e11c389` settled in the identical scenario.

**F3, HIGH — the C4 repair is half a repair.** `#file` keeps the declared basename and discards the
declared directory, so a path-anchored override such as `.oxlintrc.json`'s exact `configs/policy.ts`
cannot match `tests/probe-<uuid>.policy.ts`.

**F4, MEDIUM — the test for F3 cannot detect it.** It exercises only a suffix glob, which survives the
synthesis, and never compares a declared path against its own synthesized path.

**F5, MEDIUM — an inert assertion.** The spawned-host proof asserts on the string `unhandledRejection`,
which Node does not print.

**F6, MEDIUM and LOW — two tests do not bind to what they name.** Test 4 binds to no single repair; test
5's red comes from the C4 repair rather than the stdin listener it is named for.

**F8, MEDIUM — a comment claims a recycle that does not exist.** `Probe.ts` holds the lint stage
`readonly` and replaces only the runtime stage, so a faulted lint stage degrades permanently. Correct
the comment; do NOT build the recycle. That is a coordinator question and it is out of your scope.

**F9, MEDIUM — rule on `#ending`.** It persists state Node already carries on the child process. You are
rewriting its writers for F1 and F2 anyway. Decide whether it earns its place or whether the liveness
fact reads off the child, state your reason, and implement your ruling. `AGENTS.md` § Design laws —
"Derive state. Compute facts from existing fields. Do not store a second flag or label that can drift" —
is the rule that decides it, and note that F2 exists precisely because the stored copy drifted from the
child's real state.

## Also yours — F7, a claim in the record rather than in the code

S3's report concluded the orphan was reachable through the signal door. A lens refuted it: the signal
door reaches the deadlock, never the orphan. The orphan is reachable, by a code-0 vector the change never
measured — a lone surrogate in candidate text.

The repair was correct; its justification was not. **Do not edit `PROBE.md` or the campaign record** —
they are off-limits. Report the corrected reachability in your return so the Orchestrator carries it into
the guide, and add a test for the lone-surrogate vector if it reaches the orphan on this host. Measure
before asserting it does.

## Do NOT do these

Each was refuted by a verifier that tried to break it, and re-doing them wastes the round.

- Do not lift `SERVER`, `FIXTURE`, `PASSING`, `HOST`, or `killFixtureServer` into `tests/setupServer.ts`.
  Measured: no other probe test drives an Oxlint language server, so the rule's "could serve another
  test" trigger is not met, and that file is off-limits to you regardless.
- Do not change `signal ?? 'unknown'`. The branch is unreachable — Node emits `exit` with exactly one
  non-null argument, and even unnamed real-time signals give `code=0 signal=null`.
- Do not add `error` listeners to `child.stdout` or `child.stderr`. Refuted.
- Do not rewrite the `#retire` comment as a separate concern. Bounding destroy makes its clause true.
- Do not build a coordinator recycle path, and do not touch `src/server/Probe.ts`.

## Host facts

- Working directory `/workspace/probe`, clean and committed at `dcd50a3`. You are the sole writer. Report
  immediately if `git status --porcelain` is not empty when you start.
- Nested process spawns work here. `npm test` reports **180 passed, 0 skipped, 0 todo** at your baseline,
  and takes roughly three minutes.
- State every completion claim against the BASELINE COMMIT: `git diff --stat dcd50a3..` is stable,
  `git status` is not.
- Write every throwaway instrument under `tmp/scratch/` and delete it before you return. `tmp/` is
  gitignored; a bare `scratch/` or a loose file at the repository root is NOT.
- An unhandled rejection inside a Vitest worker is caught by Vitest, so a proof about ending the host
  needs a real spawned child. The existing host test shows the shape.

## Unknowns

- Whether the lone-surrogate vector reaches the orphan on this host. Measure it; do not assume it.
- Whether F9's ruling removes `#ending` entirely or narrows it. That is the ruling, not a given.

## Scope

- **Owned**: `src/server/stages/LintStage.ts` and `tests/src/server/stages/LintStage.test.ts`.
- **Off-limits**: everything else. Specifically `src/core/**`, `src/server/Probe.ts`, the other two
  stages, `src/server/helpers.ts`, `src/server/types.ts`, `src/bin/**`, `tests/setupServer.ts`, every
  other test file, `guides/**`, `PROBE.md`, `package.json`, `vite.config.ts`, `configs/**`, every
  dotfile, and everything under `/home/user/scaffold/`.
- If a repair genuinely needs an off-limits file, STOP and report rather than reaching.
- Do not commit, push, or install. Do not run tree-wide `format` or lint `--fix`.

## Execution

Perform this assignment directly. Spawn no subagent. Do not delegate any part of it.

## Deviation contract

Stop and report when a repair needs an off-limits file, when two findings' repairs conflict, or when a
gate reddens for a reason your change does not explain. Report expected, found, the exact command and its
output, whether the work is done, and at most one short hypothesis.

Ancillary choices — a private field's name, the order of two assertions, where a helper sits in the
class — are yours to decide, record, and carry on from.

## Naming

`F1` through `F9` and the claim numbers are addressing for this brief only. Name every test for the
behaviour it proves, never for the finding that specified it.

## Acceptance criteria

Each closes using the owned files alone.

1. `destroy()` settles when the server exits 0 without answering `shutdown`. Assert both directions: that
   case settles, AND a server that answers normally still settles.
2. `destroy()` settles when it is called during warm and the server exits 0 before answering
   `initialize`.
3. `destroy()` settles when the child fails to spawn. This is F2's regression, so its test must fail
   against `dcd50a3` — record the exact command and its failing output.
4. After any of criteria 1 to 3, the five maps `#responses`, `#failures`, `#documents`, `#publishes`, and
   `#refusals` are empty. Assert the membership, not a total that a partly empty population satisfies.
5. A candidate whose declared path a **path-anchored** override exempts receives no finding for that
   rule, and a non-exempt path still reports it. Assert both directions, driving the real Oxlint child.
   The suffix-glob case must keep passing.
6. Each of criteria 1, 2, 3, and 5 has a red-then-green proof: the exact command with its failing output
   before, and the same command green after.
7. No assertion in the file is inert. Specifically, the host proof no longer asserts on a string Node
   does not print, and every test's red comes from the repair it names. State for each of the six tests
   S3 added what its red now comes from.
8. Your F9 ruling is implemented and stated.
9. `npm run format:check`, `npm run lint:check`, `npm run check`, and `npm run build` pass. Report each
   exit code.
10. `npm test` reports 0 skipped and 0 todo, at a count at least 180 plus your new tests.

## Output

Return exactly: **Findings closed** (one line each, F-number, what changed), **The F9 ruling** (and why),
**The corrected reachability** (F7, with your measurement), **Red-then-green proofs** (each command with
both outputs), **What each of the six inherited tests now binds to**, **Validation** (each gate and its
exit code), **Counts**, **Deviation**, **Decisions**. No process diary. End with `git diff --stat` against
`dcd50a3`, then the full `git diff`.
