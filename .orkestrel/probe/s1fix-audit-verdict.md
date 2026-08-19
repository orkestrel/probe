# Unit S1 fix round audit — VERDICT: FAIL

All eight claims CONFIRMED. Every break from the previous round is genuinely closed, and both
instruments that failed then — the assertion-free retention loop and the map count that never saw the
map — are repaired. The FAIL rests entirely on one finding beyond the claims.

## Claims

| Claim | Verdict |
| ----- | ------- |
| 1 — a receipt can no longer issue for a case whose test did not run | CONFIRMED |
| 2 — static skips still find, genuine passes still earn | CONFIRMED |
| 3 — resident state cannot grow without bound | CONFIRMED |
| 4 — cleanup can no longer mask an inspection failure | CONFIRMED |
| 5 — no generated specification reaches a gated project | CONFIRMED |
| 6 — worker diagnostics reach the developer | CONFIRMED |
| 7 — the adversarial stdout cases prove a receipt | CONFIRMED |
| 8 — a misconfigured workspace and a bad caller path are distinguishable | CONFIRMED |

## The finding that fails the round — measured, not argued

**Claim 1's repair, applied to the control side of the same verdict, mints a receipt for a control that
never ran.**

`computeReceipt` at `src/core/helpers.ts:98-101` asks whether the control's check at the declared stage
carries **a** finding. It never asks whether that finding is about the control's **code**. This round
enlarged the set of findings that are not about anyone's code by five: runtime skip, empty module,
missing configured project, eviction failure, and deletion failure.

So the repair inverted. Before it, a `ctx.skip()` control returned `[]` and minted nothing. Now it
returns `Vitest did not run the test (…)`, which satisfies "the control broke as promised".

The auditor established this by composing two verified facts and named the instrument that would
settle or withdraw it. The Orchestrator ran that instrument against a real `Probe.prove`:

```text
SKIPPED-CONTROL receipt : "probe:204337f2-43f7-451f-8354-13d53b9a0575:runtime:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11"
FINDING1-CONFIRMED      : true
CONTROL-A real failure  : "probe:a3a84d5a-40ea-...:runtime:..."
CONTROL-B passing ctrl  : undefined
```

**What the two controls establish.** A control that genuinely fails at runtime still earns a receipt,
and a control that passes still earns none. So the receipt is not simply always issued, and the middle
result is a defect rather than a broken probe.

**Why this is the campaign's most serious finding.** The receipt is the package's product.
`src/core/types.ts:223` states its meaning as present only when the case is clean and the control
failed where it said. A control that never ran did not fail where it said. A caller who never sees the
mechanism is handed a receipt that certifies nothing.

**The prescribed repair.** Give `Finding` a named discriminant for the axis that actually varies —
whether the message is about the candidate's code or about the stage's own instrument — and have
`computeReceipt` count only the first when deciding whether the control broke. The `clean` term keeps
counting both, so a case carrying an instrument fault still fails closed.

## Findings beyond the claims, ranked

1. **The receipt above.** Required change.
2. **`#project`'s tuple forces an impossible branch that returns a clean check.** Two independent
   optionals for one outcome that is always exactly one of two, so the caller writes a branch returning
   a clean check for a case whose test never ran. Unreachable today only because the three returns
   happen to be total. Claim 1's most consequential invariant rests on that accident.
3. **The claim-1 receipt assertion cannot fail.** The test supplies one check, so `computeReceipt`'s
   first term is already false and it returns `undefined` regardless of findings. Delete the entire
   skip-detection block and the assertion still passes. The report's headline evidence rests on it.
4. **Three new findings breach the `Finding` contract**, which defines it as the tool's own message
   against the path the tool reported. A deletion failure, an eviction failure, and a missing project
   are the stage's own faults wearing a `Vitest` prefix.
5. **The class TSDoc no longer describes the class.** It omits the recycling entirely, and there is no
   `guides/probe.md`, so it is the only human documentation of the stage.
6. **The recycle is paid inside the caller's deadline.** 1.15 s as reported, since corrected to 260-285 ms by measurement lands on the 65th call, 3.8% of the
   default budget, and at a tuned deadline it triggers the expiry-and-recycle recovery path — the
   recycling mechanism triggering the recovery mechanism.
7. **The counter and its own comment disagree.** `#inspections` increments on the early return that
   writes no specification.
8. **The map test is named for something it does not do.** Sound measurement, name claims coverage of
   `#replace` the body does not have.
9. Low: a `finally` that reads `tmp/probe` throws `ENOENT` on a fresh clone, masking the real failure —
   the same class this round just repaired in source.

## Ruling on the 64-inspection lifetime

**Ship the mechanism. Do not ship `64` as written.**

The mechanism is right for a stronger reason than the one recorded: recycling does not merely reset the
map that broke last round, it makes the whole class of question moot, because everything the instance
owns is released with it. That beats deleting from N maps and hoping N is complete — and the previous
round proved N was not.

The number is not measured, and the brief required it to be. The only figure is a cost, presented as
"roughly 18 ms amortized". Amortizing is the wrong frame for a synchronous stall: it does not land as
18 ms on 65 inspections, it lands as 1.15 s as reported, since corrected to 260-285 ms by measurement on one. Nothing measured the other side of the trade at
all — no per-entry resident cost exists anywhere in the round's evidence.

With the cost measured and the benefit unmeasured, the available numbers argue for a LARGER N: 64 pays
a 1.15-second stall every 64 inspections, about 1.8% of throughput permanently, to reclaim 64
string-keyed entries whose size nobody measured.

**Closing condition.** Either measure the resident cost of one retained generation and pick N from the
crossover, or state in the TSDoc that any bound suffices, name the value chosen, and give its measured
stall.

## What the auditor could not attack

Process resident memory — no heap or RSS figure exists in this round's evidence, so claim 3's universal
rests on structure plus a negative search rather than measurement. `#findings` never checks module
identity, which is an unattacked seam rather than a finding. The cursor-escape bytes on the wire remain
NOT-EVIDENCED from the previous round. And every executed fact came from a supplied file, because the
lane has no shell.

## CORRECTED after the fix round measured it — the stall is 260-285 ms, not 1.15 s

The ruling above carried 1.15 seconds from the unit's own report and reasoned about the trade using it.
The next round measured the stall through the real stage from `dist`, 66 inspections, twice:

```text
run 1: median 206 ms, inspection 65 = 466 ms, inspection 66 = 216 ms
run 2: median 215 ms, inspection 65 = 498 ms, inspection 66 = 214 ms
```

The spike lands on inspection 65 alone in both runs, so each run is its own control. The replacement
costs 260-285 ms, a little over four times less than the figure the ruling used.

**What that does to the ruling.** The direction survives and the force weakens. At 260-285 ms the
recycle is about 0.4% of throughput at N=64 rather than 1.8%, and under 1% of the default 30 s deadline
rather than 3.8%. The argument for a larger N rested on the cost being large; it is smaller than
believed, so "64 is defensible" becomes a reasonable reading where before it was not.

The closing condition is unchanged and was met by its second arm: the value is named in the class
`@remarks` with its measured stall, and `ProbeOptions` tells a caller budgeting `deadline` that one
inspection in 64 pays it.

Recorded because a number that travels through a ruling and into a brief is exactly the kind that never
gets re-measured. This one was, by the unit the ruling was aimed at.
