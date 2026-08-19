# Unit 3 fix round 1 — lifecycle and safety

## Role and engine

`implementer` on Claude Opus 5. GPT-5.6 Sol wrote the code you are repairing, so this round runs on a
different engine by design. You are the sole serial writer in `/workspace/probe`.

## Objective

Close ten lifecycle and safety defects. Each names its evidence. A second round follows this one and
owns the contract and publication defects; do not touch those.

## Context

Read before acting:

1. `/workspace/probe/AGENTS.md` and every rule under `/workspace/probe/.claude/rules/` that governs
   the files you touch.
2. `/workspace/probe/src/core/types.ts` and `/workspace/probe/src/server/types.ts`.
3. `/home/user/scaffold/.orkestrel/probe/u3-orchestrator-findings.md`, the full measured record.

The subject is commit `f7104c7`. All five gates are green there, so a gate that reddens under your
change is your change.

Two facts about measuring this package, so you do not rediscover them:

- The Model Context Protocol stdio transport speaks newline-delimited JSON, not `Content-Length`
  framing. An instrument that frames with headers hangs.
- Constructing a probe costs about 4.3 s, and a warm `prove` about 0.5 s. Size any timeout you write
  from that.

## Defects

### D1 — unobserved warm rejections end the host process

`Probe.ts:70` stores `this.#warmth = this.#warm()` and `#warm` re-throws after emitting (`:118`).
Nothing observes it until `prove` or `#destroy`. `src/bin/main.ts` calls neither, so an arming
failure is an unhandled rejection with no caller, and Node ends the process:

```text
$ node warmth.mjs
entry-started
entry-listening
Error: arming failed
EXIT=1
```

The failure paths are ordinary, not exotic: `Probe.ts:148` and `:154`, `RuntimeStage.ts:130` and
`:132`, and the toolchain refusals at `TypeStage.ts:87` and `RuntimeStage.ts:80`. So a probe that does
not share the gate's compiler today kills its host instead of refusing to serve.

`Probe.ts:202` has the same shape: the replacement `RuntimeStage` its constructor builds warms into
an unobserved promise too.

Observe every stored warm promise at the point it is created, and keep the failure so `prove` still
rejects with it. Both halves must hold; a construction that swallows the failure is a new defect.

### D2 — every probe host inherits a failing exit code from boot

The resident Vitest sets `process.exitCode = 1` when a run reports a failure. Arming deliberately
fails a control, so this fires before any claim is served:

```text
$ node arm-exit.mjs
exitCode right after arming, before any user claim: 1
EXIT=1
```

Every consumer inherits it, and the server process always exits 1. `RuntimeStage` owns the side
effect, so `RuntimeStage` contains it. Restoring the previous value around the run works and keeps
the findings:

```text
bare inspect:      findings=1 exitCode=1
contained inspect: findings=1 exitCode=undefined
```

Restore the prior value rather than assigning a literal, so a host that deliberately set a non-zero
code keeps it.

### D3 — a failed recycle wedges the probe permanently

`Probe.ts:200` is `await stage.destroy()` with no guard. `RuntimeStage.destroy` chains off
`this.#vitest`, so a rejected warm or a rejected `close` throws before line 202 and the replacement is
never installed. `this.#runtime` then stays a destroyed stage and every later `prove` throws
`The runtime stage has been destroyed` for the life of the process.

Recovery must always reach the replacement.

### D4 — the recovery path has no deadline

`Probe.ts:192` awaits `#recycle` inside the handler for the deadline that just fired. If closing the
hung worker does not return, `prove` never settles. The one failure the deadline exists for can still
wedge the coordinator.

Bound the recovery too.

### D5 — `destroy` means two different things across three stages

`RuntimeStage.ts:68` abandons an in-flight inspection. `LintStage.ts:74` and `TypeStage.ts:71` chain
off `#tail` and wait behind one. `src/server/types.ts:32-36` says a stage *may* abandon, which admits
both — but `Probe.#recycle` depends on abandoning to recover from a hung worker.

State the guarantee the coordinator needs, and make all three stages honour it.

### D6 — an expiry leaves the abandoned test in the consumer's checkout

Measured with a 6 s deadline against a synchronous infinite loop:

```text
after a normal prove, tmp/probe holds: []
deadline rejected as designed: The runtime stage exceeded 6000 ms
after the expiry, tmp/probe holds: [ 'leak.test.probe-de705c2b-...ts' ]
a later ordinary claim served: type=0 lint=0 runtime=0
after destroy, tmp/probe holds: []
```

The `finally` in `RuntimeStage.#inspect` does run eventually, so this is a window rather than a
permanent loss. Inside that window the file holds whatever the claim held — here an infinite loop —
and it matches the `probe` project's include glob, so a developer running `npm run test:probe` hangs
on it.

Remove the revision file when the inspection is abandoned, not only when it settles.

### D7 — the verdict an agent reads carries raw float milliseconds

`Probe.ts:94` and each stage set `elapsed` from `performance.now()` differences, and
`src/core/helpers.ts:42` interpolates the value directly. The documented examples read
`'lint: 0 findings (17 ms)'` and `'probe 01J8Z0 (337 ms)'`. What ships, measured over the wire:

```text
probe 4e3d2dbf-ace3-431b-8a10-fb66e27d6def (692.649617 ms)
case type: 0 findings (141.13012200000048 ms)
```

Round where the measurement is taken. `src/core/helpers.ts` belongs to the next round, so do not
change the formatter; fix the values it is given.

### D8 — `#warm` and `#warmth` in `Probe` name arming, not warming

`Probe.ts:113-121` calls `#arm` and emits `arm`. It warms nothing; the three stages warm themselves in
their own constructors. The same two identifiers in `LintStage.ts:54`, `TypeStage.ts:51`, and
`RuntimeStage.ts:48` name genuine warming, so one term carries two concepts inside one module against
`AGENTS.md` § Design laws. The vocabulary for the second concept already exists as the `arm` event.

Rename the coordinator's field and method to the arming they perform.

### D9 — one `prove` failure reports off the `error` event

`Probe.ts:83` throws `The probe has been destroyed` outside the `try` that emits `error` (`:100-102`),
so that rejection reaches the caller with no observation event while every other `prove` failure emits
one.

### D10 — the bin test starts a real server inside the test worker

`tests/src/bin/main.test.ts` imports `src/bin/main.js`, which is in the manifest's `sideEffects` and
runs `createProbeServer(createProbe()).start()`. The test boots a real probe, spawns a real Oxlint
child, boots a nested Vitest, and attaches a reader to the worker's stdio, then passes while leaking
the arming dependency:

```text
$ rm -f tmp/probe/arm-*.ts && npm run test:src:bin
Test Files  1 passed (1)   Duration 3.72s   EXIT=0
$ ls -A tmp/probe
arm-7cce5711-26e5-4965-a2a5-c7ae3a745ef0.ts
```

Stop the bleeding only. Assert something true about the entry without importing it. A later unit owns
the real proof, which drives the entry as a spawned child; do not write that proof here.

## Scope

- **Owned**: `src/server/Probe.ts`, `src/server/stages/RuntimeStage.ts`,
  `src/server/stages/TypeStage.ts`, `src/server/stages/LintStage.ts`, `src/server/types.ts`,
  `tests/src/bin/main.test.ts`.
- **Off-limits**: everything else. Specifically `src/core/**`, `src/server/helpers.ts`,
  `src/server/factories.ts`, `src/server/index.ts`, `src/bin/main.ts`, `tests/src/core/**`,
  `tests/src/server/**`, `guides/**`, `package.json`, `vite.config.ts`, `configs/**`, and every
  dotfile.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: do not commit, push, tag, publish, install a dependency, or run a destructive
  command. Do not add an npm package. Do not read, print, or copy any secret.

## Criteria

1. D1: a probe whose arming fails does not end the host process, and `prove` on that probe rejects
   with the arming failure. Prove both halves and paste the output.
2. D2: `process.exitCode` is unchanged by arming and by any `prove`, and a host that set a non-zero
   code keeps it. A failing control still reports the same finding count as before.
3. D3: a recycle whose `destroy` rejects still installs the replacement, and a later `prove` is
   served.
4. D4: a recycle that does not return still lets `prove` settle rather than hanging.
5. D5: all three stages abandon an in-flight inspection on `destroy`, and `src/server/types.ts` states
   that as a guarantee rather than a permission.
6. D6: after a deadline expiry and before any `destroy`, `tmp/probe/` holds no `*.probe-*` file.
   Paste the measurement.
7. D7: every `elapsed` on a verdict is an integer.
8. D8: `Probe` carries no member named for warming that performs arming.
9. D9: every `prove` rejection emits one `error` event.
10. D10: `npm run test:src:bin` exits 0 and `tmp/probe/` holds no file afterwards.
11. `npm run format:check`, `npm run lint:check`, `npm run check`, `npm run build`, and `npm test`
    each exit 0, run in that order.
12. `git diff --stat` touches only the six owned files.

## Execution

Perform this assignment directly. Spawn no subagent.

## Deviation contract

Stop and report when reality conflicts with the primary objective: a defect whose fix needs an
off-limits file, two criteria that contradict each other, or a gate that reddens for a reason your
change does not explain. Report expected, found, the exact command and its output, whether the work is
done, and at most one short hypothesis.

Decide an ancillary question yourself and record it: the new identifier names, comment wording, and
how your proof scripts are structured are yours. Delete every throwaway script before you finish.

## Output

Return exactly these five sections, and no process diary.

1. **Files written** — each path with a one-line statement of what changed.
2. **Validation** — each of the five gates with its exit code.
3. **Acceptance evidence** — criteria 1 through 12, each with the command and output that closes it.
4. **Deviation** — the contract above, or `None`.
5. **Decisions** — ancillary decisions you made, or `None`.
