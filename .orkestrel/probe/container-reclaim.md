# Two container reclaims, what survived, and the policy change

The container running this campaign was reclaimed twice, roughly an hour apart. Both times
`/workspace/probe` and the entire local scaffold checkout were destroyed.

## What survived, and why

Everything pushed. 108 commits and 64 campaign artifacts came back from the remote, because the
campaign pushes after every step rather than at milestones.

**Unit S2's uncommitted work survived the first reclaim only because its diff had been captured into
the record before the loss.** `s2-diff.md` reapplied cleanly and restored all 248 insertions. That is
the retention law earning its keep: the artifact existed because the dispatch contract says to capture
a unit's diff as evidence for its audit, and it happened to also be a backup.

**Its fix round did not survive the second reclaim**, because that round's diff had not yet been
captured — only its report had. The report described the change precisely enough to rebuild both edits
by hand, so the cost was minutes rather than a unit, but that was luck rather than design.

## The policy change

**Commit probe work the moment a unit returns, before running gates, and amend if the gates fail.**

The old order — verify, then commit — means every reclaim loses a completed unit. The new order risks
a commit that gates later reject, which costs an amend. An amend is cheap; a lost unit is not.

## A false alarm worth recording, because it cost three wrong diagnoses

After the second restore, three entry tests failed. In order, the Orchestrator diagnosed:

1. `ENOENT` on `tmp/probe` — read as the latent audit finding about an unguarded `finally`.
2. An under-built scratch workspace missing `vite.config.ts`, inferred by comparing against another
   test's fixture.
3. Arming failing to create its directory, from a probe that had itself deleted the directory under a
   running process.

All three were wrong and all three were the same thing: **`dist/bin/main.js` did not exist.** The
reclaim wiped `dist/`, `npm install` does not rebuild it, and every one of those tests drives the built
entry. `npm run build` took 26 milliseconds and the suite went green at 171 tests.

The lesson is not "remember to build". It is that a symptom reached through three plausible mechanisms
still deserves the cheapest check first, and "does the artifact under test exist" is cheaper than any
of the three theories that were tried before it.

## Restoring after a reclaim

1. `git fetch origin <branch>` and `git merge --ff-only FETCH_HEAD` in the scaffold checkout.
2. `git clone` probe, then `git checkout -B claude/probe-package FETCH_HEAD` after fetching.
3. `npm install`.
4. **`npm run build`** — the entry tests need the artifact and nothing else creates it.
5. Reapply any uncommitted unit work from its captured diff in `.orkestrel/probe/`.
