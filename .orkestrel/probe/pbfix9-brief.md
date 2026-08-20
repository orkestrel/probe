# PBFIX9: one test hangs on the host it must pass on

## Role and engine

Role `sol` implementer. Engine GPT-5.6 Sol, high effort, sandbox `workspace-write`, rooted at
`/workspace/probe`. Sole writer for this unit. You wrote the test under repair; this is your own
unit's carry, not a new subject.

## The failure

`tests/src/server/Probe.test.ts` — `attributes a deadline in runtime cleanup to the instrument` —
**times out at 60000 ms on the host**, both inside the full suite and alone on an idle container:

```text
rm -rf tmp/probe && npx vitest run --config vite.config.ts --no-cache --project src:server \
  tests/src/server/Probe.test.ts -t 'attributes a deadline in runtime cleanup'
exit 1
Test Files  1 failed (1)
Tests       1 failed | 21 skipped (22)
Error: Test timed out in 60000ms.
```

Your report recorded it green. Your sandbox and this host disagree, and the host is authoritative:
it is where the release gate runs.

The mechanism is a `mkfifo` at the Vitest results-cache path plus a spawned reader, intended to stall
`writeToCache()` so a deadline fires during eviction. On this host it does not stall as intended — it
hangs, and the promise never settles.

## Objective

Make the instrument-attribution proof pass on the host, or replace it with one that does.

**Do not delete the coverage silently.** The behaviour is real and it is half of the deadline
attribution this campaign fixed: claimant execution attributes `claimant`, probe's own cleanup
attributes `instrument`. Its sibling — a caller's non-terminating test attributing `claimant` —
passes on the host and stays.

## Rule between these, and say which you took and why

- **Repair the stall.** Diagnose why the FIFO does not block `writeToCache()` here and make it
  deterministic. A proof that depends on host process scheduling is fragile even when it passes.
- **Drive the boundary directly.** The attribution reads a progress counter against a
  pre-inspection snapshot. A test that drives the stage's own progress boundary, rather than
  manufacturing a filesystem stall, proves the same rule without a FIFO. Prefer this if it reaches
  the same assertion.
- **Remove it and record the gap.** Only if neither reaches a deterministic proof. Then say plainly
  in your report that instrument-side deadline attribution ships unproven, and name what would
  prove it.

## Scope

- **Owned:** `tests/src/server/Probe.test.ts`, and any test helper under `tests/` it needs. You may
  change `src/server/stages/RuntimeStage.ts` or `src/server/Probe.ts` **only** if the test reveals
  the attribution itself is wrong — and if it does, stop and report before changing either.
- **Off-limits:** every other file. The vendored host and the scaffold-planned files as before. Do
  not change the version.

## Host conditions

- The tree is dirty with your previous unit's work, uncommitted and gate-green apart from this test.
  Read it; it is not the committed state.
- **Your sandbox is not the host.** This failure is the proof of that. Any reading you take inside it
  is an observation, not a criterion. Report the exact command for every reading you want taken on
  the host, and expect the Orchestrator to take it.
- Use `rmdir` for an empty directory. Delete `tmp/probe` before any guides-project run.
- The network is unavailable.

## Execution

Perform this assignment directly. Spawn nothing.

## Prohibitions

- Never run `git checkout`, `git restore`, `git stash`, `git reset`, or `git clean`.
- Never commit, push, install, or read a credential.
- No `any`, no `as`, no `!`, no `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable`.
- No mocks, behavioral fakes, module replacement, framework spies, or fake clocks.
- Never lengthen the timeout to make a hang look like a pass. A test that needs longer than its
  siblings to prove the same class of rule is the wrong test.
- State no count in any prose you write, and never name a list item by its position.

## Acceptance criteria

1. Your ruling, with the reason, before any edit.
2. The proof you land runs in a time comparable to its siblings in the same file. Report its duration.
3. `npm run lint:check` exits 0.
4. `npm run check` exits 0.
5. The exact host command for the repaired or replacing test, for the Orchestrator to run.

## Deviation contract

Stop and report if the attribution itself is wrong rather than the test: expected, found, exact
evidence, and at most one short hypothesis. That is a source change and this unit is not scoped for
it.

## Output

Write your report to `tmp/codex/pbfix9-report.md` and make it your final message too: your ruling and
its reason; what you changed; the duration of the proof you landed; the exact host command; and if
you removed the coverage, the plain statement that it ships unproven and what would prove it. No
process diary.
