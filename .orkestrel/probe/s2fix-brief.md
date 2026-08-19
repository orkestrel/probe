# Unit S2 fix round — the lint bound does not fire, and the report says it does

## Role and engine

`sol` — GPT-5.6 Sol, high reasoning effort. You wrote unit S2. This is a deviation your own report
missed, found by an independent gate run.

## The failure

`npm test` exits 1 on the tree you left. Deterministic — the Orchestrator re-ran the single test in
isolation three times, and it failed identically every time, so this is not contention.

```text
FAIL |src:server| tests/src/server/Probe.test.ts > probe > bounds a lint stage that does not publish diagnostics
AssertionError: expected [Function] to throw error including 'The lint stage exceeded 6000 ms'
                but got 'The stalled lint proof did not settle within its budget'
  ❯ tests/src/server/Probe.test.ts:296:5
```

The received message is **your test's own 7-second fallback**, not the implementation's. So `prove` did
not settle within 7 seconds against a lint stage that never publishes diagnostics.

## What this contradicts

Your report states, under Acceptance evidence:

> A protocol-faithful lint server that withholds diagnostics causes `prove` to reject at 6,000 ms.

That is false on the tree you left. Your report also states the focused suite was green at 8 passed and
the server project green at 6 files and 39 tests. One of those runs and this one disagree, and three
isolated re-runs side with this one.

**Diagnose that disagreement before you fix anything.** Whether your green run measured something
different — a different filter, a different fixture state, an earlier revision of the assertion — is the
first question, because the answer decides whether the bug is in the bound or in the proof.

## What the Orchestrator established, so you do not re-derive it

- The failure is deterministic: 3 of 3 isolated runs, identical message.
- The mechanism exists and carries the exact expected string. `src/server/Probe.ts:252-266`,
  `#inspectStage` races `operation` against
  `this.#expiry(timeout, \`The ${stage.stage} stage exceeded ${this.#deadline} ms\`)`.
- So the bound is written and does not fire on this path within 7 seconds.
- The Orchestrator did NOT determine why, deliberately. Two candidate readings were considered and
  neither was confirmed: that the operation is still queued when the timer starts, and that the stage
  hangs before its inspection is admitted so nothing deadlined is ever entered. Treat both as
  unverified hypotheses, not as findings.

## The fixture is sound, so do not rewrite it to pass

`tests/src/server/Probe.test.ts:248-278` builds a real LSP server: `Content-Length` framing, an
`initialize` reply, `shutdown` and `exit`, and `publishDiagnostics` for every URI EXCEPT one containing
`/src/core/`. That is a protocol-faithful fixture server, which `.claude/rules/tests.md` sanctions, and
withholding for one path is precisely the stall being proved.

Note that `LintStage` synthesizes the path it lints, so `src/core/stalled.ts` becomes
`src/core/probe-<uuid>.ts` — still matching the fixture's filter. If your diagnosis depends on which
path the fixture sees, verify that rather than assuming it.

**Do not weaken the assertion to make it pass.** Loosening it to any error, widening the message, or
raising the test's own budget past the point where it can discriminate would leave the package with a
lint stage that hangs and a test that says otherwise. If the honest outcome is that the lint stage
cannot be bounded the way the brief assumed, say so and propose what can be bounded.

## Scope

- **Owned**: `src/server/Probe.ts`, `src/core/types.ts`, `tests/src/server/Probe.test.ts`. The same
  three files you already changed, and no others.
- **Instruments**: `tmp/scratch/` only, deleted before you return.
- **Off-limits**: everything else, and specifically every file under `src/server/stages/`. If the
  diagnosis lands in `LintStage.ts`, stop and report — that file belongs to unit S3 and its repair is
  briefed separately.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: no commit, push, publish, install, or destructive command. No type assertion, no
  suppression.

## Criteria

1. `npm test` exits 0.
2. The named test passes, asserting the implementation's own message rather than any error, with the
   fixture unchanged in what it withholds.
3. Run the named test in isolation three times and report all three results. A timing proof that passes
   once is not a proof.
4. Every other test you wrote this round stays green, and the four defects your round closed stay
   closed.
5. If the diagnosis shows the bound cannot hold as specified, criterion 2 is replaced by an honest
   statement of what does hold, with the contract text changed to match.

## Execution

Perform this assignment directly. Spawn no subagent.

## Host facts

- Working directory `/workspace/probe`. Baseline `abec122` plus your uncommitted change; the tree is
  otherwise clean and no other unit is writing.
- `tests/config.test.ts` fails intermittently with `spawnSync EPERM` inside bench sandboxes and passes
  outside them. It is off-limits and it is not yours. Note also that `npm test` short-circuits on the
  first failing project, so a red `test:src` means `policy` and `config` never ran.

## Deviation contract

Stop and report if the fix needs a file under `src/server/stages/`, or if the honest diagnosis is that
the bound belongs somewhere your scope does not reach.

## Output

Return exactly: **Files written**, **Validation**, **Acceptance evidence**, **Deviation**, **Decisions**.

Under **Decisions**, lead with why your green run and the gate disagreed.

## Amendment — the tree was rebuilt, and the failure survived it

The container running this campaign was reclaimed. `/workspace/probe` was re-cloned from
`claude/probe-package` at `abec122`, `npm install` was re-run, and your uncommitted change was restored
by applying the diff captured in `.orkestrel/probe/s2-diff.md` — it applied cleanly and reproduces your
248 insertions across the same three files.

**The failure reproduces on that rebuilt tree**, with fresh dependencies and no local state carried
over. That is the fourth independent confirmation, after three isolated re-runs on the original tree.
Nothing about the environment explains it.

Your working tree is exactly as you left it. Nothing else changed.
