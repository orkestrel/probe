# Unit 3 audit — reconciliation

Two lanes ran against commit `f7104c7`, both on engines that did not write it. The unit was written
by GPT-5.6 Sol; the subjective lane ran on Opus 5 and the mechanical lane on the cheap native tier.

The Orchestrator rules below. A lane's verdict is a proposal.

## Mechanical lane — `VERDICT: FAIL`

Confirmed 11 claims, refuted 3, left 1 unproven.

### Refutations upheld

**Claim 2 — a boot arming failure terminates the host process.** Upheld, and it independently
reproduces the Orchestrator's own finding O1 from a different reading. `Probe.ts:70` assigns
`this.#warmth = this.#warm()` with no handler attached, and `#warm` re-throws after emitting. Nothing
observes that promise until `prove` or `destroy`. Node ends the process on the unhandled rejection
before any caller exists.

This defect is larger than it looks, because it is what breaks the delivery of the toolchain refusal
in claim 14. The stages refuse correctly; the refusal reaches the caller as a process death rather
than as an error on `prove`.

### Refutations dropped, with the reason

**Claim 10 — exported function names.** Dropped. The lane is right that `createProbe` and
`createProbeServer` are two words and right that `AGENTS.md` § Design laws permits exactly that for a
module-scope helper. The claim's own wording was wrong, not the code. A brief defect, recorded here
rather than charged to the unit.

**Claim 14 — no refusal when the toolchain disagrees with the gate.** Dropped. The lane read
`Probe.#version` in isolation and concluded no refusal exists. The refusals live in the stages, one
per peer, and the Orchestrator read all three:

```text
$ grep -n "does not share" src/server/stages/*.ts
TypeStage.ts:87:  throw new Error('The type stage does not share the workspace TypeScript installation')
RuntimeStage.ts:80:  throw new Error('The runtime stage does not share the workspace Vitest installation')
```

`TypeStage:84-87` and `RuntimeStage:77-80` each compare `resolveWorkspaceModule(workspace, name)`
against `import.meta.resolve(name)` and refuse on disagreement. `LintStage` needs no comparison,
because it never loads a second copy: `resolveWorkspaceBinary` reads the workspace's own
`oxlint/package.json` `bin` field and `LintStage:90` spawns `process.execPath` against that entry, so
the copy it runs is the workspace copy by construction.

That resolution is also the portable one. It spawns a real Node entry rather than the extensionless
`node_modules/.bin/oxlint` shim, which Windows `CreateProcess` cannot execute and which a restricted
sandbox refuses — the same failure that made the vendored `tests/config.test.ts` report `EPERM` under
the bench.

### Unproven claim settled

**Claim 5 — expiry destroys the hung stage and a later claim is served.** The lane had no execution
tool and correctly marked it `UNPROVEN` rather than guessing. Unit 3's own instrument settles the
mechanism:

```text
DEADLINE rejected=true elapsed=5014ms expiries=1 survived=true
```

The claim is confirmed on that evidence. It still owes a committed test, which is unit 4b's
criterion 11, not a fix-round item.

## Orchestrator findings

O1 is upheld and carries into the fix round. O2 was closed by the unit's own cleanup before the
commit. O3 and O4 carry, and O4 survives the mechanical lane having missed it:

```text
$ sed -n '32p' src/server/factories.ts
			parameters: Object.fromEntries(Object.entries(compileSchema(CLAIM_SHAPE))),
```

O3 is upheld for a reason the lane did not weigh. The lane ruled the inline
`ReturnType<typeof createStdioServer>` acceptable because the commit introduces no new type. Guide
parity decides it instead: a public return type that has no name cannot appear in the guide's surface
table as a resolvable export, so unit 4c cannot document `createProbeServer` without one.

## Design lane — `VERDICT: FAIL`

Confirmed 7 claims, refuted 5, left 3 unproven. It rules on far more than the claims, and most of its
value is in what it attached to rows it confirmed. Every finding below is upheld and carried.

### Refutations upheld

- **Claim 2.** Same defect as the mechanical lane's claim 2 and the Orchestrator's O1, reached a third
  way. Three lanes agreeing from three readings is why this one is first in the fix round.
- **Claim 8.** The inline `ReturnType<typeof createStdioServer>` puts a value import of
  `createStdioServer` into the published `dist/src/server/index.d.ts`, purely to spell a type. The
  Orchestrator confirmed the leak in the built declaration. This is a stronger argument than the
  Orchestrator's own O3, which rested on guide parity alone, and it overrides the mechanical lane's
  claim 8, which ruled the construction acceptable without reading the emitted declaration.
- **Claim 9.** `@orkestrel/contract` already exports `schemaToParameters`, documented as the single
  sanctioned narrowing from a compiled schema to the open tool-parameters record. Confirmed at
  `index.d.ts:5587`. This **corrects the Orchestrator's O4**, which proposed a spread. A spread is
  still a hand-rolled crossing of a boundary the ecosystem already owns.
- **Claim 10.** Agrees with the mechanical lane that the claim's wording was wrong, and finds the real
  defect underneath it: `createProbeServer` names an entity the package declares nowhere. Same fix as
  claim 8.
- **Claim 14.** Two deferred behaviours ship with no annotation. `Claim.project` is required of every
  caller, advertised to every client, and read by nothing. And arming mutates only a value, so it
  proves the runtime half of the staleness defect and never the type half — a probe whose type host
  has gone stale arms successfully and serves confident wrong answers all session.

### Unproven claims settled by the Orchestrator

The lane is read-only and correctly refused to infer runtime behaviour from source. The Orchestrator
supplied the executed evidence.

- **Claim 5, second half.** Confirmed. After a deadline expiry the replacement stage serves:
  `a later ordinary claim served: type=0 lint=0 runtime=0`.
- **Claim 11 and claim 13.** Confirmed. The Orchestrator spawned the built entry and drove it over
  newline-delimited JSON: `initialize` returned `{"name":"probe","version":"0.0.1"}`, `tools/list`
  returned `prove`, and `tools/call` returned the six-check verdict with a receipt as raw text. No
  stray output corrupted a frame.

### Referrals answered

The lane referred four questions to an executing lane. Three are now measured.

- Does the unhandled rejection terminate? Yes — reproduced in isolation, `EXIT=1`.
- Does the abandoned inspection leave its revision file in the checkout? Yes, until `destroy`. That
  window is finding O7, and the file can hold an infinite loop that the `probe` project's glob picks
  up.
- Does inlining the manifest matter beyond size? Yes. The published bundle carries `scripts` and
  `devDependencies`. A named JSON import tree-shakes it away and a default import does not, measured
  against this workspace's own bundler.
- Does `vitest.close()` return against a spinning worker? Partly. Unit 3 measured 10 ms and the
  Orchestrator's expiry run recovered, but the unguarded `await stage.destroy()` and the undeadlined
  recovery path are both real and are fix-round items regardless.

## Deferred, with reasons

- **The boot control lives in `tmp/probe/`, coupled to the `probe` Vitest project.** Real, and
  entangled with an open question `PROBE.md` already carries: retiring that project is a scaffold
  release plus a 44-target propagation. Do not churn it inside this campaign. It is recorded as an
  open question against the design, not as a defect against the unit.
- **The barrel's second test passes vacuously.** `tests/src/server/index.test.ts` belongs to unit 4b,
  which carries it.

## Routing

Fix round 1, lifecycle and safety, on Opus 5, because Sol wrote the original.
Fix round 2, contract and publication, on Sol, because Opus wrote round 1.
Each round is then audited by a lane on the engine that did not write it.
