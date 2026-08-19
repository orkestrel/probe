# Unit S1 fix round audit — falsify the repairs

## Role and engine

`reviewer` — Claude Opus 5, high reasoning effort. GPT-5.6 Sol wrote this round, so the auditor is an
engine that did not write it. You also audited the round before this one and returned `VERDICT: FAIL`
on three claims; this round exists to close them.

This lane is READ-ONLY and carries no `Bash`. Every piece of executed evidence is a file you `Read`.

## What the previous round taught, and what it means for this one

Your own closing observation last time: claims phrased "the code now does X" are checkable by reading
and rarely wrong; claims phrased "therefore Y cannot happen" are where the defects live. All three
that broke asserted a property of a DEPENDENCY's behaviour rather than of the diff's text.

The claims below are written in that second form deliberately. Attack the "cannot happen" half.

## Evidence supplied to you

- `/home/user/scaffold/.orkestrel/probe/s1fix-diff.md` — the full diff, stat, and status, captured
  after the unit exited and before any commit.
- `/home/user/scaffold/.orkestrel/probe/s1fix-report.md` — the unit's returned report.
- `/home/user/scaffold/.orkestrel/probe/s1fix-gates.md` — five gates run by an independent verifier
  outside the bench sandbox, plus a suppression grep, a `tmp/probe` listing, and a stray-file check.
- `/home/user/scaffold/.orkestrel/probe/s1-audit-verdict.md` — your previous round's verdict, which
  this round answers.

You may `Read` and `Grep` anything under `/workspace/probe`, including `node_modules/vitest/dist/**`
and `node_modules/vite/dist/**` for installed declarations. The working tree is the post-fix state and
no unit is writing it.

Do not block on a command you cannot run. Name what you would have run and what result would change
your verdict, mark that claim `UNPROVEN`, and the Orchestrator will run it and return to you.

## The claims, numbered

1. **A receipt can no longer be issued for a case whose test did not run.** The unit reports that the
   runtime-skip check now blocks `computeReceipt`, and that `ctx.skip()` and an empty file both
   reddened before the repair.
2. **A statically skipped test still produces a finding, and a genuinely passing case still produces a
   clean check and still earns a receipt.** The repair did not make everything fail, and did not
   regress what already worked.
3. **Resident state cannot grow without bound across inspections.** The unit kept unique revision paths
   and instead recycles the runner every 64 inspections; it reports both
   `_unresolvedUrlToModuleMap` and `fileToModulesMap` returning to first-generation sizes after
   replacement.
4. **Cleanup can no longer mask an inspection failure.** Bookkeeping runs before eviction, and eviction
   and deletion failures return `Finding`s rather than throwing.
5. **No generated specification can be collected by any gated Vitest project.** Generated bin
   specifications now live under `tmp/probe/bin`, which maps to the ungated `probe` project.
6. **Worker diagnostics reach the developer.** Worker stdout stays drained through the `PassThrough`;
   worker stderr reaches `process.stderr`.
7. **The two adversarial stdout cases prove a receipt**, not merely that content is an array.
8. **A misconfigured workspace and a bad caller path are now distinguishable**, with distinct messages.

## Attack claim 3 first, and attack the number

The unit's brief required that if it capped the runner's lifetime, **N must be a measured choice rather
than a round number.** Its report gives a measured COST — about 1.15 s as reported, since corrected to 260-285 ms by measurementeconds across 65 inspections,
roughly 18 ms amortized — and does not say why 64 rather than 32 or 128. Sixty-four is conspicuously
round.

Rule on this, and rule on what the number actually buys:

- **Within a generation the map still grows.** Recycling resets it; it does not stop it. So the resident
  cost between replacements is bounded by N, and the question is whether N entries plus one full runner
  rebuild is a better trade than a smaller N with more rebuilds. Is there any evidence in the diff or
  the report that this trade was measured rather than assumed?
- **A rebuild is not free and its cost is not amortized evenly.** An 18 ms average across 65 inspections
  hides one expensive inspection. What does the 65th claim's latency look like compared to the 64th?
  A caller with a deadline meets the rebuild without warning. Does anything bound or disclose that?
- **The previous round's own decision was overturned by exactly this kind of reasoning.** It recorded
  "runner recycling was unnecessary" from an instrument that counted the wrong maps. Ask whether the
  current instrument could miss a map the same way. What does it NOT count?

## Attack claim 4 at the word "cannot"

`#evict` previously threw from a `finally`, and the repair is that failures now return `Finding`s.
Verify that the `finally` has no remaining throw path at all — including from anything it awaits, from
`unlinkSync`, and from the bookkeeping the unit says it moved earlier. A single reachable throw makes
the claim false, and the previous round showed this exact spot is easy to get wrong in both directions.

Also check the mirror defect: if eviction failures are now `Finding`s on the returned `Check`, can an
eviction failure make a clean case look dirty? A `Finding` that is not about the candidate's code is
a false red on the caller's claim.

## Attack claim 1 at the doors it did not come through

Last round the defect survived through a door the unit's tests did not open. Ask which doors this round
opened and which remain: `ctx.skip()`, an empty file, `test.skip`, `describe.skip`, `it.todo`, a
runtime `skipIf`, a name filter excluding every test, a test that throws in a `beforeAll` so nothing
runs, and a file that fails to import. Which of these produce a clean check now?

## Also check

- **The mutation proofs.** The unit reports three, each reddening exactly one named test and passing
  after restoration. Confirm from the diff that each mutation's subject is genuinely load-bearing, and
  that nothing was left mutated.
- **The `tmp/probe/bin` route.** Confirm `inferTestProject` maps that path to `probe`, and that no gate
  selects the `probe` project. Read `package.json` scripts and `vite.config.ts` rather than trusting
  the report.
- **The fenced test.** `tests/src/bin/main.test.ts` still contains `records the arming dependency leak
  when the entry is killed during boot`, which belongs to a later unit. Confirm its name and assertions
  are unchanged.
- **Test isolation.** Confirm no assertion the unit wrote or changed reads the whole `tmp/probe`
  directory or filters it by a shape generic to every probe instance.
- **Assertions that cannot fail.** For each new test, ask what value would redden it. The previous round
  found a 15-iteration loop carrying no assertion; check the 65-inspection proof for the same defect.

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
- **Ruling on the 64-inspection lifetime** — ship or do not ship, with the reason.
- **What you could not attack** — so the next round knows what has already been tried.

End with exactly one terminal line: `VERDICT: PASS` or `VERDICT: FAIL`.

Do not manufacture a finding. This round answers a FAIL, so an all-confirmed result is a plausible and
useful outcome. If you find nothing, say so and put the claims on trial: state whether any could have
been falsified by the evidence this round actually had.
