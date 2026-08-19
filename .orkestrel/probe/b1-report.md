Implemented the race-free arming observation in [main.test.ts](/workspace/probe/tests/src/bin/main.test.ts:13).

**Your reading before the fix**

`npx vitest run --project src:bin tests/src/bin/main.test.ts`

- Exit: 1
- Tests: 1 failed, 4 passed
- Failure: bare `ENOENT` reading `<scratch>/tmp/probe` after 750 ms.

**The mechanism changed**

The test now:

- Checks immediately for both arming files.
- Rechecks every 10 ms until a five-second monotonic deadline.
- Treats `ENOENT` as “not armed yet.”
- Reports `Timed out waiting for two arming files in …` on expiry.
- Kills the child immediately after observing both files.

**Files written**

- [tests/src/bin/main.test.ts](/workspace/probe/tests/src/bin/main.test.ts:13)

No product files were changed.

**Red-then-green proof**

Same command:

`npx vitest run --project src:bin tests/src/bin/main.test.ts`

- Before: exit 1 — 1 failed, 4 passed.
- After: exit 0 — 5 passed, 0 failed.

**Three consecutive runs**

All used the focused command above:

1. Exit 0 — 5 passed.
2. Exit 0 — 5 passed.
3. Exit 0 — 5 passed.

**Validation**

- `git diff --check`: exit 0.
- `npm run test:src`: exit 1 on two consecutive isolated runs.
- Result each time: 2 files failed, 8 passed; 11 tests failed, 79 passed.
- All failures were existing timeouts in:
  - `tests/src/server/Probe.test.ts`: 2 failures.
  - `tests/src/server/stages/LintStage.test.ts`: 9 failures.

The required five gates and `npm test` were not run because the brief’s deviation contract required stopping once completion needed off-limits files. Consequently, `test:policy` and `test:config` did not run.

**Deviation**

Expected: `npm run test:src` exits 0.

Found: it repeatedly exits 1 because 11 off-scope server tests time out, including 20-second, 30-second, 60-second, and 180-second cases.

Done: the owned bin-test repair is complete and stable. Full acceptance is blocked by failures outside the owned file.

**Decisions**

- Did not increase the fixed delay.
- Did not make boot succeed artificially.
- Did not edit server tests or product source.
- Stopped before broader gates as required by the deviation contract.