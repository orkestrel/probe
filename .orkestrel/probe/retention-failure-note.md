# Retention failure — a unit's report was never written to disk

## What happened

The S3fix audit stopped on arrival. Its brief cited
`/home/user/scaffold/.orkestrel/probe/s3fix-report.md` as the record of what the unit claims it did, and
that file did not exist:

```text
ls: cannot access '.../s3fix-report.md': No such file or directory
```

The Orchestrator committed S3fix's **code** at `078946d` and never wrote its **returned report** beside
its brief. The report existed only in the Orchestrator's own context.

## The rule this breaks

`.agents/orchestration.md` § Dispatch anatomy: "Capture the unit's returned report to a file beside its
brief under the same unit name, so a unit's instruction and its outcome are one pair on disk."

And the retention clause naming why: "Promote anything that must outlive the campaign into a durable
artifact before the sweep. What is only in a swept file did not survive, and a debrief that must quote
the record verbatim has nothing to quote." A report held only in a context window is worse than a swept
file — it cannot be read by anyone, including the next lane.

## Why the failure was invisible

Every other retention step ran. The brief was on disk, the amendments were on disk, the audit
reconciliation was on disk, the code was committed and pushed. The one artifact missing was the one the
Orchestrator had just read most recently, which is exactly why it felt already handled.

The commit is not a substitute. A commit message states what changed; the report states what the unit
measured, what it decided, what it could not close, and which of its own claims it flagged. The audit's
subject is that second thing.

## The bridge behaved correctly

The `analyst` bridge did not guess. It checked every other authority the brief cited, confirmed all of
them present, noted that `s3fix-brief.md` and `s2fix-report.md` both exist and that neither is a
substitute, refused to improvise a replacement, launched no exec, and returned a deviation report naming
the missing path and the recommended next step.

That is the deviation contract working as written, and it cost one cheap round trip instead of an audit
ruling on a file nobody had.

## Binding for the rest of this campaign

Write a unit's report to `.orkestrel/<package>/<unit>-report.md` **in the same action that commits its
code**, not afterwards. The code commit and the report are one step, and the report goes in whether or
not an audit is planned — a later reader needs it as much as the next lane does.
