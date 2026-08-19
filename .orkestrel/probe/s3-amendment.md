# Unit S3 — amendment 1, written 2026-08-19 after Q1 landed

`s3-brief.md` stands. This file records what changed between writing it and dispatching it. Read both.

## The engine changed

The brief's **Role and engine** section names `sol` — GPT-5.6 Sol. **It runs on the native Opus 5
`implementer` instead.**

The reason is a measured host constraint, not a work-class judgement. `nested-spawn-constraint.md`
records it: the bench sandbox gives a Node-spawned-Node child no working stdio, so the child exits
cleanly and never receives stdin or publishes stdout. Every defect in this brief is about arming,
driving, and observing an Oxlint child, which is exactly that child. A bench unit would report green
because it could not reach the subject.

`routing-ledger.md` carries the deviation. The work class still belongs to Sol; the host does not
permit it.

## The line numbers moved, and one method disappeared from the brief's map

Unit Q1 replaced the three per-stage `#tail` serializers with one `QueueInterface` owned by `Probe`,
and folded each stage's `#inspect` into its public `inspect`. `LintStage.ts` is 298 lines now, not 305.

Verified against the file at commit `e11c389`:

```text
94:		if (child === undefined || child.exitCode !== null) return
188:		if (child === undefined || child.exitCode !== null) {
193:		child.stdin.write(header + content)
166:			`${directory}/probe-${randomUUID()}${extname(declared)}`,
```

Defect A is lines 94 and 188, not 89 and 198. Defect C is line 193. Defect C4's synthesis is line 166.
Defect B's `#document` is still there, reached from `inspect` at line 68 rather than from a private
`#inspect`. Every defect the brief describes is still present; re-read the file for exact positions
rather than trusting either set of numbers.

## One sentence in the brief is now stale

The brief says "`#inspect` opens with `await this.#warmth`, so a failed warm rejects the inspection
before `#document` is called". That is now `inspect` at line 67. The reasoning is unchanged: that
vector still does not reach defect B, so do not build the proof on it.

## What Q1 did not change

The coordinator now admits each inspection into a queue with `concurrency: 1`. That bounds how many
inspections are in flight; it does nothing about a promise the stage orphans inside one. Defect B
reaches `unhandledRejection` exactly as the brief describes.
