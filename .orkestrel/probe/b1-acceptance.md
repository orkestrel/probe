# B1 accepted, and what my brief's defect cost

## The authoritative reading

Taken with no exec resident, each project run **independently** rather than through `npm test`'s `&&`
chain, so one failure could not hide the others:

```text
############ npm run test:src ############
 Test Files  10 passed (10)
      Tests  90 passed (90)
EXIT=0 ELAPSED=40s
############ npm run test:policy ############
      Tests  86 passed (86)
EXIT=0 ELAPSED=2s
############ npm run test:config ############
      Tests  28 passed (28)
EXIT=0 ELAPSED=2s
```

**204 tests, all passing.** Three things close at once.

- The 11 server timeouts B1 reproduced twice were entirely its own exec's load. Its tree, idle, is
  green. This is the third independent confirmation of the effect that writing-concurrency rule 10
  now covers.
- `test:policy` and `test:config` run and pass. They had not run in this campaign's memory, because
  the `&&` chain stopped at the bin test.
- B1's own module-scope declarations in a test file pass the policy sweep. The gate that judges B1's
  repair was the gate B1's repair unblocked, and it rules in favour.

## The standing 201 figure reconciles

`plan.md` carried **201 passed** at `703bfe6`. The measured total is now 204, and O9-U2 added exactly
three tests. 201 was accurate; nothing was wrong with it. The discrepancy I flagged earlier dissolves.

## The gates were not green, and my brief is why

`npm run check` failed after B1:

```text
tests/src/bin/main.test.ts(368,53): error TS2339: Property 'sort' does not exist on type 'readonly string[]'.
```

`waitForArming` returns `readonly string[]`, and `sort` mutates. The line already spread `leaked` into
a copy; `arming` needed the same.

B1 never saw it. Its brief made `npm run test:src` exits 0 criterion 5, which a unit inside its own
exec cannot validly read. B1 hit that, correctly declared a deviation, and stopped — **before reaching
`npm run check`**.

So the unreachable criterion did not merely waste time. It sat ahead of the criteria that would have
caught a real defect, and the deviation contract firing skipped every one of them. That is the part
the brief-check rule at `8bbc654` did not yet say, and it is added there now.

## The repair

One line, Orchestrator-written, per the work-directly rule for a one-line fix:

```diff
-				expect([...leaked].sort()).toStrictEqual(arming.sort())
+				expect([...leaked].sort()).toStrictEqual([...arming].sort())
```

Because the Orchestrator wrote it, it is briefed, owned, and audited like any other written part, and
its auditor must be an engine the Orchestrator does not share. It goes into the next audit round's
subject list.

## Gates after the repair

```text
format:check   exit 0 PASS
lint:check     exit 0 PASS
check          exit 0 PASS
```

And the bin test alone: `Tests 5 passed (5)`, exit 0.

## What B1 refused, correctly

All three wrong repairs the brief named: it did not raise the fixed delay, did not make the boot
succeed artificially, and did not edit a server test or product source to make a failure go away.
