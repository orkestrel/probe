# @orkestrel/probe — build plan

The design is `PROBE.md` in the scaffold repository. This file carries only the decomposition and
the ownership, so units do not collide. One writer at a time, each from a clean committed baseline.

## Unit 1 — contracts (`src/core`)

Owns `src/core/types.ts`, `src/core/constants.ts`, `src/core/shapers.ts`,
`src/core/validators.ts`, `src/core/helpers.ts`, `src/core/index.ts`.

- `Stage`, `Source`, `Case`, `Control`, `Claim`, `Finding`, `Check`, `Verdict`, `Toolchain`.
- `CLAIM_SHAPE`, one `ContractShape`, yielding both the JSON Schema `tools/list` publishes and the
  guard the tool applies on arrival, so the wire contract and the runtime guard cannot drift.
- `isClaim`, `isVerdict`.
- `formatVerdict`, the text an agent reads, shared by the tool result and the cold path.
- `computeReceipt`, pure, returning `string | undefined`, issuing nothing unless every check on the
  case is clean and the control failed at its declared stage.

Host-independent: no `node:` specifier reaches this environment.

## Unit 2 — stages (`src/server/stages`)

Owns `src/server/types.ts` (the `StageInterface` contract), `src/server/stages/TypeStage.ts`,
`src/server/stages/LintStage.ts`, `src/server/stages/RuntimeStage.ts`, `src/server/helpers.ts`.

Each stage is a class implementing one contract, so a consumer can run one stage alone.

- Type: a resident `ts.LanguageService` over a virtual path that is never written. Version every
  dependency snapshot by modification time; a host that versions only the probe serves stale
  source. Select the scoped project for a candidate source file and the root project for the test
  file.
- Lint: a resident `oxlint --lsp` process, virtual `textDocument/didOpen`, no file on disk.
  Resolve the binary through `createRequire` against the target's `package.json`, read the `bin`
  field, and spawn `process.execPath` against that entry, because `node_modules/.bin/oxlint` is a
  `.cmd` on Windows that `spawn` cannot execute.
- Runtime: a resident Vitest, `pool: 'threads'`, one fresh specification identity per revision
  through `createSpecification` and `runTestSpecifications`. Never `rerunFiles`. Evict each
  result after returning it.

## Unit 3 — coordinator, transport, entry

Owns `src/server/Probe.ts`, `src/server/factories.ts`, `src/server/index.ts`, `src/bin/main.ts`.

- `Probe` warms at construction and `prove` awaits that promise, so there is no `start` method and
  a second concurrent call waits rather than starting a second engine.
- Revalidate before every call: stat the workspace, `invalidateFile` what moved, re-version the
  type host's snapshots.
- Own the deadline outside the worker through `@orkestrel/timeout`, and recycle the runtime worker
  when it fires. An in-worker timeout cannot fire against a synchronous infinite loop.
- Arm at boot with a control that imports a dependency the arming mutates, and refuse to serve
  until the verdict changes with it. A control asserting `expect(2).toBe(3)` imports nothing and
  passes while the service serves stale source.
- Resolve the three peers from the workspace root at boot, expose them as `toolchain`, carry that
  on every verdict, and refuse to serve when the resolution disagrees with the gate commands.
- `createProbeServer` composes `createStdioServer(createMCPLegacy(mcp))`. The undecorated server
  answers a harness `tools/list` with `Invalid params: malformed modern request metadata`.
- `src/bin/main.ts` declares no module-scope constant and no module-scope function.

## Unit 4 — proofs and parity, split three ways

Re-baselined after unit 3 landed. The original single unit owned `tests/**` and `guides/**` together.
Three facts forced the split: the core proofs are pure and fast while the server proofs drive real
tools and take minutes, the guide is subjective work that belongs on Opus while both proof sets are
objective work that belongs on Sol, and the guide forces a scaffold configuration change the proof
units must not touch. The three own disjoint files and run in order.

### Unit 4a — core proofs (Sol)

Owns `tests/src/core/**`. Every pure leaf and every guard, including the two standing obligations
below. Brief: `u4a-brief.md`.

### Unit 4b — server and entry proofs (Sol)

Owns `tests/src/server/**` and `tests/src/bin/**`. The helpers, the three stages against the real
toolchain, the coordinator, and the built entry over spawned stdio. Carries the regression guards for
both reproduced defects. Brief: `u4b-brief.md`.

The `src:server` project runs at Vitest's five-second default and `vite.config.ts` is a scaffold
content-owned file, so a slow test there sets its own budget through `it(name, { timeout }, fn)`
rather than through the config.

### Unit 4c — guide and parity (Opus)

Owns `guides/probe.md`, `guides/README.md`, `tests/guides.test.ts`, `package.json`, and
`vite.config.ts` only through `npx scaffold overwrite`. Brief: `u4c-brief.md`.

Creating `tests/guides.test.ts` selects the `guides` Vitest project, so the template regenerates
`vite.config.ts` while the `test:guides` script must be added by hand. The vendored config proof
checks that the projects and the scripts agree, so both halves land together or neither does.

## Unit 5 — bring the workspace onto scaffold 0.0.42 (Orchestrator)

Re-pin, install, re-vendor, prove the gates. Brief: `u5-brief.md`.

Discovered while de-risking unit 4c: `scaffold overwrite` re-pins two development dependencies,
refreshes the catalog table, and vendors five dependency guides this workspace has never carried,
all in the same verb. None of that belongs to the unit that writes the package guide. It also brings
in the repaired vendored `tests/config.test.ts`, which resolves Oxlint through `createRequire`
instead of spawning the `node_modules/.bin/oxlint` shim that Windows cannot execute and a restricted
sandbox refuses.

Network-dependent work belongs to the Orchestrator's own tracked commands, because a bench sandbox
denies the network.

## Order, revised again

Unit 3's two repair rounds, then 5, then 4a, then 4b, then 4c. Unit 5 ran early, out of that order,
because the republish wave landed mid-campaign and every later unit had to run against the final
vendored host rather than one a later step would replace.

Each writing unit commits before the next is dispatched. Each nontrivial unit is audited by an engine
that did not write it.

### Audits run beside the next writer, not before it

A read-only audit lane and a writing unit can run at the same time, and the campaign is long enough
that they must. The isolation rule is what makes it safe: give the lanes a git worktree pinned at the
commit under audit, with `node_modules` symlinked from the main checkout, and give the writer the
live tree. Neither sees the other.

So each phase from here is: commit the writer, cut a worktree at that commit, then launch the audit
lanes on the worktree and the next writing unit on the live tree together.

Two things this does not license. Two writers still never share the main checkout. And an audit whose
verdict decides whether the next unit should run at all still blocks it — parallelism is for a lane
whose findings become a successor brief, not for one that could invalidate the work running beside
it.

### The design fork the campaign acquired

`O9` is not a repair and does not belong to any unit above. The three stages disagree about
`Case.files`, and the disagreement includes a false green. Its brief is `o9-design-brief.md` and it
runs as a two-lane design round, then its own implementation unit. Both halves of the remedy are
already measured, so the round rules on shape rather than feasibility.

It sits after the proof units. Nothing in 4a, 4b, or 4c depends on it, and it will add proofs of its
own that would otherwise be written twice.

## Standing obligations unit 4 inherits

- The hand guard `isClaim` and `compileGuard(CLAIM_SHAPE)` must agree across a hostile population.
  `shapers.ts` sits above the leaf pair, so `validators.ts` may not import it and the two are
  written separately; only a test holds them together. A 15-value population including an empty
  project, an empty control reason, a bad stage, an extra key, a null-prototype object, and a
  throwing `Proxy` currently shows zero disagreements.
- `computeReceipt` issues only when every case check is clean and the control failed at its
  declared stage. Its refusals are the proof that matters: the wrong stage, no failure at all, and
  a dirty case each return `undefined`.

## Exit criterion, restated

The campaign began with an implicit end: build the package. Three repair rounds, a design fork, and a
six-lens sweep have since changed what "built" means, so the end is restated here explicitly. A plan
that names work but not its end can only be abandoned, never finished.

The campaign is complete when all of the following hold, and not before:

1. Units 1, 2, 3, and 5 are landed, audited by an engine that did not write them, and committed.
   **Done.**
2. The proof units 4a, 4b, and 4c are landed and committed, and `npm test` reports no skipped and no
   todo test.
3. Every high-severity sweep finding that an independent verifier **reproduced** is closed, and each
   closure carries a test that was red before the fix and green after.
4. The candidate-source defect is closed, or is explicitly excluded on evidence with the contract
   text changed to match what the package actually promises. A receipt that certifies runtime evidence
   over source the runtime never ran is not something this package can ship with silently, so the one
   outcome not available is leaving the contract as it stands.
5. The five gates pass in order, run by an executor independent of every writer, and guide parity
   passes.
6. `PROBE.md` describes what shipped, including every measurement that moved and every claim this
   campaign withdrew.

## What is deliberately outside it

Recorded against the capability that owns them, for the next change rather than this one:

- Any sweep finding a verifier **refuted** or could not reproduce. A finding nobody can substantiate
  is dropped on the record, not carried.
- Medium and low findings that survive verification but are not on the path to criterion 3 or 4. They
  are real and they are enumerated in `seam-sweep-findings.md`; they are not what closes this campaign.
- Publishing. That is the user's decision and the user's credential, and nothing here presumes it.
- The scaffold release that would correct the published self-pin. The source is repaired and `main` is
  green; shipping that correction is a separate decision.

## The rule this restatement obeys

Re-baselining changes which units run. It never changes the goal. Criterion 3 is bounded by what
verification reproduces rather than by what an audit claimed, which is a narrowing the evidence
justifies. Criterion 4 is an addition the original exit criterion already required, because the design
this package implements states that an agent proves source it has only thought of. Neither is a
rescope, and a rescope would need the user.

## Re-baseline after unit 4b, 2026-08-19

The six-lens sweep and its triage landed after this plan was written. Ruling on every remaining unit.

| Unit | Ruling | What changed |
| ---- | ------ | ------------ |
| U4a — core proofs | **satisfied** | Landed. 10 tests, gates green. |
| U4b — server and entry proofs | **satisfied** | Landed. 33 tests across 7 files. Its entry leak test is carried into S6 rather than corrected here. |
| U4c — guide, parity, README, manifest | **transformed** | Intent stands, position moves. It now runs after the repair units, not before them. |
| S1-S6 — sweep repairs | **added** | The sweep revealed them after this plan was written. |
| O9 — candidate-source overlay | **unchanged**, with a new prerequisite | S4 must land first. |

**Why U4c moves.** It documents behavior three repair units are about to change. S1 makes a skipped
test stop yielding a clean check, S2 changes what `ProbeOptions.deadline` actually bounds, and S6
gives the entry a shutdown it does not have. A guide written now describes the package as it is today
and needs rewriting three times before the campaign ends. Writing it last costs one pass instead of
four, and the parity contract it establishes then holds against the shipped surface rather than
against a surface in flight.

**Why O9 acquired a prerequisite.** S4 repairs the overlay lifetime — overlays applied outside the try
that guards them, and a `#versions` map nothing prunes. O9 rebuilds that same lifetime to make
candidate sources visible to the type stage. Building the new mechanism on the broken lifetime means
repairing it twice, once in each shape.

**New order.** S1 → S2 → S3 → S4 → S5 → S6 → O9 → U4c → independent verifier → PROBE.md
reconciliation.

The S-units own disjoint files (`RuntimeStage.ts`, `Probe.ts`, `LintStage.ts`, `TypeStage.ts`,
`src/core/*`, `src/bin/main.ts`), and each owns its own mirrored test file. They still run one at a
time in the main checkout from a committed baseline, per the writing-concurrency law; disjointness is
what makes the ownership clean, not a licence to run them together.

**The exit criterion is unchanged.** This re-baseline reorders units and adds the sweep's repairs,
which the criterion already required — every capability the package owns ends implemented, repaired,
retained, or intentionally excluded on evidence. It does not move the goal.

## Criterion 3 has a hole, and closing it is on the critical path

Criterion 3 binds "every high-severity sweep finding that an independent verifier **reproduced**". Read
literally, a high finding nobody has tried to reproduce is covered by neither criterion 3 nor the
exclusion list, which names only findings a verifier refuted or could not reproduce.

That leaves an unreproduced high in the worst available state: not closed, and not dropped on the
record either. It would ship as an unexamined claim wearing the word HIGH.

Two high findings are in exactly that state today:

- the deadline armed before the inspection is queued (unit S2),
- the lint stage's orphaned document promise ending the host (unit S3).

**Ruling: both get an executed reproduction before their repair unit is dispatched.** Whatever comes
back settles them into a state criterion 3 or the exclusion list actually covers — reproduced and
therefore owed a closure, or refuted and therefore dropped with the refutation kept. Neither outcome
needs the criterion changed.

This is not a rescope. Criterion 3 already intends every high finding to end somewhere; the hole is in
its wording, not in its scope, and the fix is to run the verification the criterion assumes has
happened.

Both reproductions are behavioural, so they need to execute, and both drive resident hosts. They wait
until no writing unit holds the tree — a reading taken while S1 runs resident TypeScript and Vitest
hosts on a four-core container measures contention rather than the defect.

Eight of the ten high findings are already settled: five with executed evidence, two by inspection
because their subject is static text, and the candidate-source gap by full measurement as O9.

## Criterion 6's work list, surveyed 2026-08-19

`PROBE.md` must describe what shipped, including every measurement that moved and every claim this
campaign withdrew. Surveyed against the file rather than from memory, so the reconciliation unit has a
list instead of a reading assignment.

**Measurements the campaign moved or added.**

- The latency table at `PROBE.md:76-79` — boot 4392 ms, one `prove` 530-621 ms, one inspection 264 ms,
  the runtime stage alone 187 ms — is still accurate per inspection, and is now incomplete. The runtime
  stage recycles its resident runner every 64 written specifications, and that replacement costs
  **260-285 ms** on the inspection that triggers it, measured through the real stage across two runs
  whose spike lands on inspection 65 alone. A reader budgeting latency from that table will be wrong
  once in 64 calls, which is exactly the reader the table exists for.
- The per-stage figures at `:241-243` and `:279-281` were taken before four rounds of repair. Re-measure
  or mark them as of a stated date; do not silently carry them.

**Claims the campaign withdrew, which the file must not keep asserting.**

- That the entry orphans its resident hosts on termination. Measured false — the processes exit. What
  stands is that arming files survive and contained faults are discarded.
- Any wording implying a receipt certifies runtime evidence over source the runtime never ran. The
  candidate-source gap is O9's subject and criterion 4 forbids leaving the contract as it stands.

**Claims the campaign added that the file does not carry.**

- A receipt is issued only when every stage ran clean on the case AND the control produced at least one
  `origin: 'code'` finding at the stage it declared. `Finding` carries that discriminant now.
- A clean runtime check means every collected test passed, not that the module reported `passed`.
- The formatters render both finding origins identically, so an agent reading `formatVerdict` output
  cannot yet distinguish a control failure from an instrument fault. Carried out of scope on the record;
  the file must not imply otherwise.

**Not yet surveyable.** Whatever unit S2 changes about what `ProbeOptions.deadline` bounds. Survey that
after S2 lands rather than guessing at it now.

## Re-baseline after S3, 2026-08-19

S3 landed at `dcd50a3` with green gates — five gates exit 0, 180 passed, 0 skipped, 0 todo, run by an
executor independent of every writer. Three lanes are auditing it.

### Where each exit criterion stands

| # | Criterion | State |
| - | --------- | ----- |
| 1 | Units 1, 2, 3, 5 landed, audited, committed | **Closed** |
| 2 | Units 4a, 4b, 4c landed; no skipped, no todo | **Partly.** 4a and 4b landed. `npm test` reports 0 skipped and 0 todo. **4c is not written**, and it cannot be until `guides/probe.md` exists |
| 3 | Every reproduced high finding closed, each with a red-then-green test | **Closed pending the S3 audit.** The two highs the previous re-baseline left unreproduced were S2's deadline and S3's lint orphan. Both are now reproduced and repaired with recorded red-then-green output |
| 4 | The candidate-source defect closed, or excluded on evidence with the contract text changed | **Open.** O9 has a design brief and an objective ruling; no unit has been dispatched |
| 5 | Five gates by an independent executor, and guide parity | **Partly.** The gates passed today. Guide parity has no instrument: probe has no `tests/guides.test.ts` |
| 6 | `PROBE.md` describes what shipped | **Open.** Its work list is surveyed earlier in this file and has grown; see the additions below |

### Rulings on the remaining units

- **S4** — unchanged. Its defect moved 64 lines under Q1 and its amendment records the new positions.
- **S5, S6** — unchanged. Their briefs' line references were re-checked against the tree and hold.
- **U4c** — unchanged, and still blocked on a file that does not exist. Its references to scaffold's
  `src/core/constants.ts:234` and `src/bin/CLI.ts:556` were re-verified and are accurate.
- **O9** — unchanged, and it is the only thing standing between criterion 4 and closure. It is now the
  campaign's critical path.

### Four units the phase added, and why each is inside the criterion

`.claude/rules/quality.md` fixes the enumerated scope when work begins. Adding a unit is legitimate only
when implementation revealed work the exit criterion already required. Each is ruled on its own.

- **T1 and T2** — the test-package adoption. **User-directed**, in two instructions naming
  `createHostileValues` and the test package specifically. The user's current instruction outranks this
  plan, so no further justification is owed. T1 also closes a live defect: the differential guard test's
  hostile value is inert, exercising no trap either guard consults.
- **H1** — `resolveWorkspaceFile` refuses three contained files whose names begin with dots, reproduced
  against nine targets with four genuine escapes as controls. This is a **false red on ordinary source**.
  Criterion 4 exists because a receipt that certifies what the runtime never ran is not shippable; a
  refusal of source that is exactly what it claims to be is the same failure from the other side, and the
  criterion's own wording — the package must promise what it does — reaches it.
- **P1** — the published CommonJS server entry crashes on both resolving stages, driven as a real
  consumer with the ESM condition as a passing control. This is not a severity judgment about a finding;
  it is the package not working when installed. Criterion 5 requires the gates to pass, and probe has no
  instrument that loads what it publishes, which is why five green gates say nothing about it.

**Stated plainly rather than absorbed:** H1 and P1 were not in the enumerated scope when this campaign
began. They are additions on the reasoning above. If that reading is wrong, they are the two units to
strike, and striking them ships a package that refuses valid source and crashes for CommonJS consumers.

### Criterion 6 gains three entries

Beyond the list surveyed earlier in this file, `PROBE.md` must also carry:

- What the lint stage does when its language server dies — it reports the death rather than hanging, and
  teardown of a stage whose server already died is a clean shutdown rather than a process kill.
- That a candidate document can kill the real Oxlint server. Measured: `textDocument/didOpen` carrying
  400,000 nested `(` returns `code=null signal=SIGSEGV` against oxlint 1.79.0.
- Which module conditions probe publishes, after P1 rules on the CommonJS one.

### Dependency order, redrawn

`H1 → T1 → S4 → P1 → T2`, then S5 and S6 in either order, then O9, then U4c, then `PROBE.md`.

T2 runs after S4 and P1 because it sweeps files both of them rewrite. P1 runs after S4 because both touch
`src/server/stages/TypeStage.ts`. H1 and T1 are independent of everything and go first because they are
small and unblock nothing else.

## Re-baseline after S3fix2, 2026-08-19

Six units landed since the last re-baseline: S3 (`dcd50a3`), S3fix (`078946d`), H1 (`2ecddc2`),
T1 (`7721a20`), S3fix2 (`449f96d`), and one integration fix (`282c902`). `npm test` is **194 passed,
0 skipped, 0 todo** and all five gates are green.

### Criterion state

| # | Criterion | State |
| - | --------- | ----- |
| 1 | Units 1, 2, 3, 5 landed, audited, committed | **Closed** |
| 2 | Units 4a, 4b, 4c landed; no skipped, no todo | **Partly.** 4a and 4b landed; counts clean. **4c is not written**, and `guides/probe.md` still does not exist |
| 3 | Every reproduced high finding closed with a red-then-green test | **Closed.** Both highs the earlier re-baseline left unreproduced are now repaired with recorded proofs, and two audit rounds since have added more |
| 4 | The candidate-source defect closed, or excluded on evidence with the contract changed | **Open.** O9 is the last one, and S4 is its prerequisite |
| 5 | Five gates by an independent executor, and guide parity | **Partly.** Gates green. **Guide parity still has no instrument**: `tests/guides.test.ts` does not exist |
| 6 | `PROBE.md` describes what shipped | **Open**, and its work list has grown again |

### What the phase revealed that the plan did not contain

- **A published CommonJS entry that crashes** (P1). Found from a build warning the gates pass through.
  Ruled inside the criterion, on the record, because five green gates say nothing about an artifact
  nothing loads.
- **A false red on ordinary source** (H1, closed). `resolveWorkspaceFile` refused contained files whose
  names begin with dots.
- **An inert hostile value** (T1, closed). The differential guard test carried a proxy neither guard's
  traps consulted.
- **The `tmp/probe` arming false green** — open, and **not this campaign's to close**. `.gitignore`
  excludes `tmp`, oxlint honours version-control ignores in LSP mode, and `.oxlintignore` does not
  reverse it. Every remedy is in `Probe.ts`, `vite.config.ts`, or `.gitignore`, and `#arm()` asserts
  `findings.length > 0`, so any fix turns the boot control red for every workspace that gitignores `tmp`.
  **That is a product decision and it belongs to the user.** Recorded, routed, not absorbed.

### Criterion 6 gains four more entries

Beyond the two earlier surveys, `PROBE.md` must also carry:

- That a candidate is linted at the path it was declared, with no synthesized identity, and that this is
  what makes an exact-path override selectable at all.
- That the stage refuses a concurrent second inspection of one open path, and why the coordinator rather
  than the stage is where inspections serialize.
- That a path the workspace's version-control ignore excludes is a path the gate never lints, and the
  stage reports the same nothing for it.
- The corrected reachability sentence: the orphan is reached by a candidate whose text ends the server
  with code 0, not by a signal death.

### Dependency order, redrawn

`S4 → O9`, then `P1`, `T2`, `U4c` in any order, then `PROBE.md`.

O9 is the critical path because criterion 4 is the only criterion no other unit can close. U4c closes the
back half of criterion 2 and the guide-parity half of criterion 5 together, so it is the second most
valuable unit remaining.

## Re-baseline, 2026-08-19, after verifying criterion 3 rather than asserting it

The previous re-baseline recorded criterion 3 **Closed**. That was an assertion, and checking it
against the tree refuted it. `criterion-3-verification.md` carries the ten-row table and the evidence;
this section carries what it changes in the plan.

### The correction

Two high findings carry a recorded repair direction that no unit ever applied:

- the flagship `Claim` @example declares a control byte-identical to the case, so it can never earn a
  receipt (`src/core/types.ts:95-101`);
- the `CLAIM_SHAPE` remark says the tool admits with `compileGuard(CLAIM_SHAPE)` while the server
  admits with `isClaim`, and `compileGuard` has no call site under `src/` outside a doc comment
  (`src/core/shapers.ts:68`).

Both were settled by inspection and both got a repair direction. Neither got a unit. The error was
mine: "settled by inspection" ruled on the finding's truth and I read it as ruling on its closure.

**Unit D1 carries both.** Its brief is `d1-brief.md`, it routes to the Opus `implementer` because both
repairs are documentation voice, and it queues behind O9-U2.

### One severity correction, on the record

The sweep labelled the runtime stage's per-run eviction HIGH. The verification measured it across 30
inspections: `idMap` +2, `filesMap` +1, one module-graph node, and 0.038 MB of heap per inspection,
linear across every point, 26.99 MB to 28.09 MB.

A sweep's severity label is a hypothesis and the measurement is the ruling. The finding moves to the
plan's medium exclusion list — real, enumerated, and not what closes this campaign. Recorded here so
it is a ruling rather than a silent absorption.

### What connects D1 to O9

Neither of the example's paths is on disk, so the flagship example is a pure off-disk-candidate claim
and O9's defect reaches it. The example is therefore unrunnable for two independent reasons: its
control compiles, and the stages could not serve a candidate that is not on disk. D1 closes the first;
O9 closes the second; the receipt proof goes green only when both have landed.

That makes D1's proof the sharpest test in the campaign for O9 as well — the package's own flagship
example, held to what it advertises.

### Criterion state, corrected

| # | Criterion | State |
| - | --------- | ----- |
| 1 | Units 1, 2, 3, 5 landed, audited, committed | **Closed** |
| 2 | Units 4a, 4b, 4c landed; no skipped, no todo | **Partly.** 4a and 4b landed; counts clean. 4c is not written |
| 3 | Every reproduced high finding closed with a red-then-green test | **Open.** Eight rows closed, one in flight with O9-U2, two carried by D1 |
| 4 | The candidate-source defect closed, or excluded with the contract changed | **Open.** O9-U2 in flight; U1 landed |
| 5 | Five gates by an independent executor, and guide parity | **Partly.** Gates green. `tests/guides.test.ts` does not exist |
| 6 | `PROBE.md` describes what shipped | **Open.** Work list in `probe-md-worklist.md` |

### Dependency order, redrawn

`O9-U2 → D1 → O9-U3`, then `P1`, `T2`, `U4c` in any order, then `PROBE.md`.

D1 moves ahead of O9-U3 because it is the cheapest unit that closes a criterion, and because its proof
is an independent reading on whether O9 actually worked.

### Criterion 6 gains two entries

`PROBE.md` must also carry:

- That the flagship `Claim` example was unrunnable as shipped in 0.0.1, for both reasons, and what
  changed.
- The eviction finding's corrected severity and the measurement behind it, because the campaign
  published a HIGH label it later withdrew.
