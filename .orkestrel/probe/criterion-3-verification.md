# Criterion 3, verified against the source rather than asserted

The re-baseline of 2026-08-19 recorded criterion 3 as **Closed**. That entry was an assertion. This
file is the check, and the check refutes it: two of the ten high findings carry a recorded repair
direction that no unit ever applied.

Criterion 3 binds: *every high-severity sweep finding that an independent verifier reproduced is
closed, and each closure carries a test that was red before the fix and green after.*

The population is the ten `[HIGH]` headers in `seam-sweep-findings.md` at lines 10, 18, 32, 40, 48,
56, 64, 72, 80, and 88. Each row below names the finding, its verification verdict, and the state of
the code today.

| # | Finding | Verdict | Repair | Red-then-green proof |
| - | ------- | ------- | ------ | -------------------- |
| 1 | (protocol) Vitest worker stdout corrupts the JSON-RPC channel | REPRODUCED, executed | **Landed.** `src/server/stages/RuntimeStage.ts:213` passes `{ stdout: output, stderr: process.stderr }` as the fourth `createVitest` argument, `output` a drained `PassThrough` | `tests/src/bin/main.test.ts:28`, covering both the trailing-newline and no-newline variants the repair direction named |
| 2 | (failure-paths) a skipped test yields a clean runtime check | REPRODUCED, executed | **Landed.** `Finding.origin` discriminates `'code'` from `'instrument'`; `computeReceipt` reads only `'code'` | `tests/src/server/stages/RuntimeStage.test.ts:55,70`; before/after against a real `Probe.prove` in `receipt-defect-closed.md` |
| 3 | (resource-lifecycle) the type stage applies overlays outside its `try` | REPRODUCED, executed | **Landed.** S4, commit `8d0f055` | S4's failing proof, recorded in `s4-report.md` |
| 4 | (failure-paths) the lint stage reads liveness from `exitCode` alone | REPRODUCED, executed with a discriminating control | **Landed.** S3 `dcd50a3`, S3fix `078946d`, S3fix2 | S3's executed deadlock reproduction |
| 5 | (resource-lifecycle) the lint stage orphans a document promise | REPRODUCED; reachability corrected to a candidate whose text ends the server with code 0, not a signal death | **Landed** with the same S3 family | S3's proof |
| 6 | (concurrency) the runtime deadline is armed before the inspection is queued | REPRODUCED | **Landed.** S2, commit `abad0f6` | `s2-report.md`: focused red baseline of 3 failed, 5 filtered, green after |
| 7 | (contract-coverage) the type stage cannot resolve a candidate that is not on disk | REPRODUCED, measured in full as O9 | **In flight.** O9-U1 landed `703bfe6` for the type stage; O9-U2 owns the runtime stage | Owed by O9-U2 |
| 8 | (resource-lifecycle) the runtime stage's per-run eviction removes nothing | REPRODUCED, and **severity corrected to MEDIUM on measurement** | Out of criterion 3 by the correction; see the ruling below | Not owed |
| 9 | (doc-truth) the canonical `Claim` @example declares a control byte-identical to the case | CONFIRMED by inspection, sharper than reported | **NOT APPLIED** | Not owed yet |
| 10 | (doc-truth) `CLAIM_SHAPE` claims the tool admits with `compileGuard(CLAIM_SHAPE)` | Binding half closed by unit 4a; **doc half open** | **NOT APPLIED** | Not owed yet |

## The two open rows, measured today

Row 9. `src/core/types.ts:95-101` still binds one `greeting` source into both `case.files` and
`control.files`, and its text `export const GREETING = "hi"` compiles. The control declares
`stage: 'type'`, so it cannot fail where it says it must, so the flagship example on the package's
central type can never earn a receipt. The `Control` @example twenty lines earlier already carries the
correct failing text `export const GREETING: number = "hi"`.

Row 10. `src/core/shapers.ts:68` still states the tool "admits a call with `compileGuard(CLAIM_SHAPE)`".
`src/server/factories.ts:65` admits with `isClaim(input)`. Every `compileGuard` occurrence under `src/`
is inside a doc comment:

```text
$ grep -rn 'compileGuard' src/ | cut -c1-120
src/core/shapers.ts:13: * compileGuard(SOURCE_SHAPE)({ path: 'src/core/greeting.ts', text: '' }) // true
src/core/shapers.ts:30: * compileGuard(CASE_SHAPE)({ files: [], test }) // true
src/core/shapers.ts:51: * compileGuard(CONTROL_SHAPE)({ files: [], test, stage: 'type', reason: 'must not compile' }) //
src/core/shapers.ts:69: * `compileGuard(CLAIM_SHAPE)`. Deriving both from this one value is what stops the advertised
src/core/shapers.ts:75: * const admits = compileGuard(CLAIM_SHAPE)
src/core/validators.ts:99: * Admits and refuses exactly what `compileGuard(CLAIM_SHAPE)` does, so the in-process guard a
```

The sentence describes a call path the server does not take.

## Ruling on row 8's severity correction

The sweep labelled the eviction finding HIGH. The verification measured it: 30 inspections, `idMap`
+2, `filesMap` +1, module graph +1, and heap +0.038 MB per inspection, linear across all 30 points,
26.99 MB to 28.09 MB. The mechanism is real and the magnitude is medium.

A sweep's severity label is a hypothesis. The verifier's measurement is the ruling, and it moves this
finding to the plan's exclusion list for medium findings — real, enumerated in
`seam-sweep-findings.md`, and not what closes this campaign. Recording the correction here is what
keeps it a ruling rather than a silent absorption.

## What this changes

Criterion 3 is **open**, not closed. Rows 9 and 10 need one unit, and row 7 needs O9-U2 to return.

Rows 9 and 10 both live in `src/core`, both are documentation-voice repairs, and neither is
mechanical, so the unit routes to the Opus `implementer`. It queues behind O9-U2, which holds the
tree.

Row 9 carries an executable proof and therefore owes one: drive `Probe.prove` with the example's exact
claim and assert a receipt comes back. That test is red today for the reason the finding names, and it
holds the flagship example to the behavior it advertises.

Row 10 is a sentence about which guard the server calls. No unit test can hold a sentence true, so its
guard is the agreement test unit 4a already landed at `tests/src/core/validators.test.ts:74`, and the
repair is to make the sentence describe that guarantee instead of a call path that does not exist.
