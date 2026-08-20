# Ruling: `PROBE.md` does not survive as a third document

## What it is today

71,917 bytes at the repository root. **Not published** — `files` ships `dist/src`, `dist/bin`, and
`README.md` only. **Gated by nothing** — no test reads it.

## Why it cannot stay

Unit PB6 creates `guides/probe.md`, the guide `.claude/rules/documentation.md` requires and
`tests/guides.test.ts` will enforce. That would leave three documents describing one package:

| Document | Audience | Gated |
| -------- | -------- | ----- |
| `README.md` | a consumer at the registry | by the parity gate, after PB6 |
| `guides/probe.md` | a consumer using the package | by the parity gate, after PB6 |
| `PROBE.md` | nobody defined | never |

`AGENTS.md` § Instruction files: *give a rule one home. Restating it elsewhere creates two copies that
drift, and an agent reading the stale one is following this file.* `.agents/orchestration.md` says the
same for narrative: keep it in the durable artifact that owns it — the guide for product truth, a rule
or role file for process truth, the commit message for the decision itself.

`PROBE.md` is a fourth category that owns nothing, and it is already drifting: the readiness grade
records that `PROBE.md:584` reproduces the `Verdict` declaration and `:588` explains the token's
fields, both of which unit PB4 changes underneath it.

## The ruling

**Dissolve it.** Its content goes to the artifact that owns each part:

- **Product truth** — what a probe proves, the prerequisites, the receipt's meaning and limits, the
  measurements that still hold → `guides/probe.md`, where the parity gate reaches it.
- **Campaign narrative** — what moved, what was withdrawn, what was measured and when →
  `.orkestrel/probe/`, which already holds the grade, the rulings, the briefs, and the reports.
- **Decisions** — the commit messages that made them, which is where they already are.

Then delete `PROBE.md`. Nothing imports it, nothing ships it, and nothing tests it.

## Why not simply keep it unpublished and ungated

Because that is the condition that produced every documentation defect this audit found. An ungated
document is one nobody re-reads: it was `PROBE.md:584` reproducing a declaration that a later unit
changed, exactly as `guides/process.md` in the sibling package described a surface removed two releases
earlier. A document with no gate and no owner becomes false and stays false, and the next campaign
reads it as current.

## What this obliges

- **PB6 owns the migration**, and its acceptance gains one condition: no statement worth keeping is
  lost, and `PROBE.md` is gone.
- The measurements it carries — the latency table, the recycle cost, the withdrawn claims — are
  re-stated in the guide **with their dates**, or dropped as superseded with the reason. A measurement
  reproduced without its date is the drift this ruling exists to stop.
- Criterion 6 of the original campaign plan, *"`PROBE.md` describes what shipped"*, closes as
  **transformed** rather than satisfied: the obligation was that the package's behaviour be described
  where a reader finds it, and the guide is that place.
