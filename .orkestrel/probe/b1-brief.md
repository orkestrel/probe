# B1 — the bin entry test races its subject's cleanup

## Role and engine

`sol` (GPT-5.6 Sol), reached as a direct `codex exec`. You are the engine reading this brief inside
your own CLI, so perform the assignment directly and spawn nothing.

## Objective

Make `tests/src/bin/main.test.ts:326` prove what it was written to prove without depending on how fast
the host tears down a failed boot.

## Context

Working directory `/workspace/probe`, branch `claude/probe-package`, commit `a4df465` of the
orchestrator repo. Read `AGENTS.md`, `.claude/rules/tests.md`, and `.claude/rules/typescript.md`
before editing. No skill is named for this unit.

### The diagnosis, already measured — do not re-derive it

The test spawns the built entry in a scratch workspace holding only `package.json` and a linked
`node_modules`, waits a fixed **750 ms**, then reads `<scratch>/tmp/probe` expecting two arming files.

Arming creates them. Then boot fails, and the failure path removes the directory. The fixed sleep lands
after that removal.

Three runs reproducing the test's exact setup, sampled every 15 ms:

```text
run 1: armed at 154ms, gone by 690ms, window 536ms  (the test reads at 750ms)
run 2: armed at 153ms, gone by 658ms, window 505ms  (the test reads at 750ms)
run 3: armed at 152ms, gone by 674ms, window 522ms  (the test reads at 750ms)
```

The cause of the failed boot is in the child's stderr, which the test discards:

```text
failed to load config from /tmp/orkestrel-test-kF5F6b/vite.config.ts
```

The instrument that produced both readings is
`/home/user/scaffold/.orkestrel/probe/instruments/arming-window.mjs`. Read it if you want the setup;
you do not need to run it.

**Take your own reading first anyway.** Those numbers are this container's, and yours may differ. Run
the failing test once before editing and record what you get, so your red baseline is yours.

### Two repairs that look right and are wrong

- **Do not raise the 750 ms constant.** That moves the race rather than closing it, and it fails again
  on any host whose teardown is faster.
- **Do not give the scratch workspace a valid `vite.config.ts` so the boot succeeds.** Arming files are
  cleaned up on a successful boot too, so that changes what the test proves without closing the race.

The property the test wants is: **after arming has written its files, killing the entry leaves them
behind.** Reach that state by observing it rather than by waiting a fixed interval for it.

## Unknowns

Whether `test:policy` and `test:config` pass. `npm test` chains
`test:src && test:policy && test:config`, so this failure has stopped the chain and those two projects
have not run at all in recent memory. When your fix lets the chain through and either of them fails,
that failure is **not yours** — report it under the deviation contract with its exact output and stop
rather than repairing it.

## Scope

Owned: `tests/src/bin/main.test.ts`.

Off-limits: everything else. Specifically `src/bin/main.ts`, `src/server/Probe.ts`, and every file
under `src/` — the defect is in the test, not in the product, and this unit does not change product
behaviour to make a test pass.

Tools: Read, Grep, Glob, Edit, Write, Bash. You are the sole writer in the tree.

## Execution

Perform this assignment directly. Spawn nothing.

## Acceptance criteria

Each closes using the owned file alone.

1. `tests/src/bin/main.test.ts` no longer waits a fixed interval before reading the arming directory.
   It observes the arming files with a bounded deadline, and kills the child once it has observed them.
2. When the deadline expires without the files appearing, the test fails with a message naming what it
   waited for — never with a bare `ENOENT` from `readdirSync`.
3. `npx vitest run --project src:bin tests/src/bin/main.test.ts` exits 0. Note the project is
   **`src:bin`**, not `src:server`.
4. That same command, run three times consecutively, exits 0 all three times. Report all three.
5. `npm run test:src` exits 0.

## Report these, but they are observations rather than criteria

- The result of `npm test` in full, including whether `test:policy` and `test:config` ran and what they
  reported. A failure in either is a deviation report, not a criterion you must close.
- The five gates in order, each with its exact command and exit code.

## Deviation contract

Stop and report — expected, found, exact evidence, done or not done, at most one short hypothesis — if
closing this needs a file you do not own, if `test:policy` or `test:config` fails once the chain
reaches them, or if the arming files never appear at all in your environment. How you name the poll
helper and where it sits in the file are yours to decide, record, and carry on from.

## Review evidence

A code change: the actual diff and the actual gate output, both required in your report.

## Output

**Your reading before the fix**, **The mechanism you changed**, **Files written**, **Red-then-green
proof** with the exact command and both counts, **The three consecutive runs**, **Validation** (each
gate and exit code), **Deviation**, **Decisions**. No process diary.
