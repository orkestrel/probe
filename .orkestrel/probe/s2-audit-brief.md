# Unit S2 audit — falsify the coordinator repair

## Role and engine

`reviewer` — Claude Opus 5, high reasoning effort. GPT-5.6 Sol wrote this unit, so the auditor is an
engine that did not write it. READ-ONLY, no `Bash`.

## What the previous audits on this package taught

Both prior rounds produced the same lesson, and it decides where to spend this one: a claim phrased
"the code now does X" is checkable by reading and rarely wrong; a claim phrased "therefore Y cannot
happen" is where the defects live. Every break so far asserted a property of a DEPENDENCY's behaviour
or of an INTERACTION, not of the diff's text.

The second prior round found something sharper still: a repair that correctly closed a false green on
one side opened one on the other side of the same verdict. **Ask what this repair's mirror is.**

## Evidence supplied to you

- `/home/user/scaffold/.orkestrel/probe/s2-diff.md` — full diff, stat, and status.
- `/home/user/scaffold/.orkestrel/probe/s2-report.md` — the unit's returned report.
- `/home/user/scaffold/.orkestrel/probe/s2-gates.md` — five gates by an independent verifier.
- `/home/user/scaffold/.orkestrel/probe/s2-brief.md` — what it was asked to do.

You may `Read` and `Grep` anything under `/workspace/probe`, including `node_modules`. The working tree
is the post-change state and no unit is writing it.

Name what you would have run instead of blocking on it, and mark that claim `UNPROVEN`.

## The claims, numbered

1. **A claim's deadline can no longer be consumed by work it did not do.** Per-stage admission queues
   start each deadline after queue admission rather than before.
2. **One claim's expiry can no longer destroy another claim's live run.** Runtime expiry recycles only
   the active worker before releasing queued work, and an ordinary claim queued behind an infinite-loop
   claim completes with a receipt.
3. **A stalled stage can no longer hang `tools/call` forever.** A protocol-faithful lint server that
   withholds diagnostics makes `prove` reject at the 6000 ms stage budget.
4. **A rejected `prove` emits exactly one `error`.** Across four paths: arming, ordinary stage failure,
   expiry, and post-destroy rejection.
5. **A boot refusal now says why.** Boot refusal errors include rendered stage findings.
6. **The `expire` event's documentation is true when it fires.** It fires only after the replacement
   runtime worker is installed.
7. **The whole-directory cleanup assertion no longer collides with siblings.** It checks only the
   uniquely named revision its own test created.

## Attack claim 1 at what replaced it

The brief warned that arming the timer after admission converts a bounded wrong deadline into a
possibly unbounded queue wait, and asked what bounds the total time a caller waits. The unit's answer
is: "`deadline` bounds active execution, not queue wait. Work ahead carries its own inspection and
recovery bounds."

Rule on whether that is true and sufficient:

- Is EVERY path a queued item can take bounded? Name any that is not. Recovery, destruction, and
  warming are the suspicious ones, because they are not inspections.
- Is the bound composable? If each item is bounded by B and the queue can hold N, a caller waits N×B.
  Does anything bound N? An MCP client can issue calls faster than the probe serves them.
- Does `ProbeOptions.deadline`'s documentation now say what it actually bounds, in words a caller
  budgeting a timeout can act on? The unit edited that doc comment; read it against the code.

## Attack claim 2 at the mirror

Isolating expiry to the active claim is correct. Ask what the isolation now lets through:

- A claim whose stage was destroyed by ANOTHER claim's recovery — what does it see? The unit says the
  observation channel stays available after stage destruction so a later rejected proof can emit once.
  What else stays available that should not?
- Two claims expiring at once. Whose recycle wins, and does the loser's replacement leak or get
  orphaned?
- A claim that arrives DURING a recycle. Does it queue behind the replacement, or race it?

## Attack claim 4 by counting

"Exactly one" is a count, and a count is falsifiable by finding a fifth path. Enumerate every way
`prove` can reject — including a destroy racing an in-flight call, a rejection from the queue itself,
and a stage that throws during admission rather than during inspection — and check each emits once and
only once.

## Also check

- **The fixture server.** `.claude/rules/tests.md` permits a protocol-faithful fixture server and
  forbids a mock of project-owned behaviour. Confirm what the unit built is the former: it must
  implement the real LSP framing minimally to drive the system under test, not reimplement the lint
  stage's own logic.
- **Assertions that cannot fail.** Both prior rounds found one. For every new test, ask what value
  would redden it. Pay attention to timing assertions: a test asserting rejection "within 6000 ms" on a
  loaded four-core container may be asserting the container rather than the code.
- **The `toThrow` messages.** The unit hit a lint rule requiring a message on `toThrow`. Confirm each
  message it added names the error the test is actually about, rather than any error.
- **Scope honesty.** The diff must contain only `src/server/Probe.ts`, `src/core/types.ts`, and
  `tests/src/server/Probe.test.ts`. `tests/src/server/index.test.ts` was granted and is untouched,
  which is fine; anything else is not.

## Scope

Read-only. You own no files and edit nothing.

## Execution

Perform this assignment directly. Spawn nothing.

## Output

For each numbered claim, exactly one block:

```text
CLAIM <n>: CONFIRMED | BROKEN | UNPROVEN
Evidence: <file:line spans and quoted code that decided it>
Break: <the exact input, state, or interleaving — only for BROKEN>
Fix: <the smallest correct repair — only for BROKEN>
```

Then:

- **Beyond the claims** — findings outside the numbered list, strongest first, each with file:line.
- **Ruling on what `deadline` now bounds** — is the contract a caller can act on, or not.
- **What you could not attack.**

End with exactly one terminal line: `VERDICT: PASS` or `VERDICT: FAIL`.

Do not manufacture a finding. An all-confirmed round is a legitimate result. If you find nothing, put
the claims on trial instead: state whether any could have been falsified by the evidence this round had.
