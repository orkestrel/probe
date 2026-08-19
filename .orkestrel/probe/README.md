# The `@orkestrel/probe` campaign record

Start with `plan.md`. It carries the decomposition, the re-baselines, and the campaign's exit
criterion. Everything else here is evidence or instruction, and this file says which is which.

## Read these to understand the subject

- `plan.md` — units, ownership, order, and the explicit exit criterion. The one file that says when
  this campaign is finished.
- `../../PROBE.md` — the design ruling the package implements, and § What was built, which records
  what shipped, what it measures, and every claim this campaign withdrew.

## Evidence — what was measured, and what was found

- `u3-orchestrator-findings.md` — the Orchestrator's own measurements, in order. Includes the
  findings it raised, the two it **withdrew** after re-testing, and the latency numbers that moved.
- `seam-sweep-findings.md` — 29 findings from a six-lens adversarial sweep that survived refutation,
  with the evidence for each. Thirteen more were refuted and are not here.
- `high-finding-verification.md` — independent reproduction of the high-severity sweep findings, with
  the corrections each verifier made to the original claim.
- `u3fix3-audit-verdict.md`, `u3-gates.txt`, `o9-objective-ruling.md` — returned reports, kept as
  received.

## Rulings — where two lanes disagreed and someone decided

- `u3-audit-reconciliation.md` — the first audit round, two lanes, including findings dropped on the
  record because no lane could substantiate them.
- `u3fix2-audit-reconciliation.md` — the second round, and the referral the Orchestrator confirmed as
  a defect the round opened while closing another.
- `o9-reconciliation.md` — the candidate-source design round: six decisions two blind lanes reached
  independently, two they split on, and the correction that made one ruling's severity change.
- `seam-sweep-triage.md` — the 29 findings grouped into six repair units, ordered by damage.

## Instructions — briefs, in the order they ran

Implementation: `u1` (contracts), `u2` (stages), `u3` (coordinator), `u5` (re-pin), `u4a` (core
proofs), `u4b` (server proofs), `u4c` (guide and parity).

Repairs of unit 3: `u3fix1` (lifecycle), `u3fix2` (contract and publication), `u3fix3` (audit
findings).

Sweep repairs, in dispatch order: `s1` (the runtime stage certifying what it never ran), `s2` (the
deadline bounding the queue rather than the work), `s3` (the lint stage surviving its child's death),
`s4` (the type stage's overlay outliving its inspection), `s5` (the contract describing a package that
does not exist), `s6` (the entry owning its shutdown). `seam-sweep-triage.md` explains why they run in
that order and which finding each one carries.

Not yet run: `s2` through `s6`, and `o9-u1` (the candidate-source overlay's foundation), which now
depends on `s4`. `o9-design-brief.md` is the brief both design lanes executed.

Audit briefs sit beside the round they audit, named `*-audit-brief.md`.

`carry-ledger.md` walks all 29 sweep findings and names the unit carrying each, so a dropped finding
is visible rather than silent. It also records what its instrument could and could not answer.

## Verification — what was independently checked, and what came back

`high-finding-verification.md` covers all ten HIGH sweep findings. Read its coverage section before
citing it: five carry executed evidence, two were settled by inspection because their subject is static
text, two have their mechanism confirmed by reading with the behavioural consequence owed to a repair
unit, and one was measured in full as O9. A "mechanism confirmed" verdict is not a closed finding.

`doc-truth-verification.md` carries nine doc-truth claims, each given to a blind lane with a refutation
posture. Two reproduced as written, six with corrections, and **M6 was refuted** — the sweep misquoted
the document it indicted. That finding is dropped on the record and struck from `s4-brief.md`, with the
refutation kept beside it so nobody re-raises it.

`critic-findings-routing.md` carries five defects a completeness lane found that the doc-truth lens
missed, four with executed evidence. Two are not documentation defects at all, which is the reason to
run a critic over a dimension rather than only within it. It also records what the critic checked and
found SOUND, so the next round does not re-walk it.

`s1-audit-verdict.md` is the campaign's most productive round: `VERDICT: FAIL`, three of eight claims
broken. Its closing note is worth reading on its own — the claims that broke were the three asserting a
property of a DEPENDENCY's behaviour, and the ones that held were restatements of the diff's own text.

## Evidence files a read-only lane can consume

A `reviewer` or `checker` lane carries no shell, so executed evidence is captured to files it can read:
`s1-diff.md` (diff, stat, status), `s1-report.md` (the unit's own return), and `s1-gates.md` (five gates
run by an independent verifier outside the bench sandbox). Name these paths in a read-only lane's brief
rather than asking it to run a command it has no tool for.

## Instruments

`instruments/` holds what works and why. Read its README before writing a client for the probe's
stdio server; three units have now lost time to that surface.

`wire.mjs` drives the built entry over its real stdio transport. `liveness.mjs` settles what a
signal-killed child reports, with a control that discriminates it from a clean exit — it is the
instrument behind the lint stage's liveness finding, and it is retained because that finding's repair
owes a regression guard built on the same question.

## What this record is for

Two things, and it is worth stating because they pull in opposite directions.

It is the audit trail: every claim here is traceable to the command that produced it, including the
claims that turned out to be wrong. A withdrawn finding is kept with its refutation rather than
deleted, because the next person to see the same symptom needs to know it was already chased.

It is also disposable. `.agents/orchestration.md` says to prune the campaign folder at acceptance, so
the tree ends clean and the record stays recoverable by hash. Anything here that must outlive the
campaign belongs somewhere durable first — a rule, a guide, a commit message, or `PROBE.md`.
