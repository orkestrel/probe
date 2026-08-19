# The nested-spawn constraint, and the three symptoms it explains

Measured by unit S2's fix round, 2026-08-19, with a throwaway probe after the symptom cost that unit
most of a round.

**Inside the Codex bench sandbox, a Node process spawned by another Node process exits cleanly but
never receives stdin and never publishes stdout.** The channel does not work at all.

## It explains three things this campaign had been treating separately

1. **`tests/config.test.ts` failing with `spawnSync /opt/node22/bin/node EPERM`.** Recorded across
   several units as an intermittent sandbox artifact. It is this constraint, surfacing when the sandbox
   is in its stricter mode.
2. **Unit 4b's report that "the bench sandbox buffers a Node-created pipe until EOF."** That was the
   same constraint read through a narrower instrument.
3. **Unit S2's stalled-lint proof passing for the unit and failing for the gate.** The LSP fixture
   could not initialize inside the sandbox, so the probe's own BOOT lint inspection timed out — and a
   boot timeout carries the identical message a genuine stage timeout carries. The assertion matched
   the message and accepted the wrong source.

The third is the dangerous shape: the constraint produces a FALSE GREEN rather than an obvious failure,
because the error a blocked spawn eventually causes is indistinguishable by message from the error the
test is looking for.

## What is unprovable inside a bench, and what to do about it

Anything whose subject is a child process speaking a protocol over stdio: `LintStage` in its entirety,
any LSP fixture, and the built entry's MCP transport wherever a test drives it as a spawned child.

- **Unit S3 was re-routed** to the harness's native `implementer` on this evidence. Its whole subject is
  `LintStage`'s behaviour when its child dies or hangs, which a bench unit cannot arm, drive, or observe.
- **Where a bench unit must keep a subject it cannot measure**, the Orchestrator takes the measurement
  and returns it. That is what happened here: the unit repaired the proof, could not verify it, and the
  Orchestrator ran it outside the sandbox.

## The verification the unit could not take

Three isolated runs of the repaired proof, outside the sandbox:

```text
--- isolated run 1 ---  Tests  1 passed | 7 skipped (8)
--- isolated run 2 ---  Tests  1 passed | 7 skipped (8)
--- isolated run 3 ---  Tests  1 passed | 7 skipped (8)
```

So the lint bound does fire, the implementation was correct throughout, and the defect was entirely in
the proof: it accepted a boot-origin rejection as evidence about a candidate-origin one.

The repaired proof requires the `arm` event before it begins, so a boot timeout can no longer satisfy
it, and the fixture's safety exit moved from 10 s to 30 s so it outlives boot plus the deadline. No
implementation or contract change was needed.

## Reading this in a report

A unit reporting green on a subject that touches nested spawns has not proven it. Ask which environment
the run happened in before accepting it, and take the measurement outside the sandbox if the answer is
"inside".
