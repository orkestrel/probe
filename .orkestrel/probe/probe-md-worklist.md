# `PROBE.md` reconciliation — the consolidated work list

Criterion 6 requires `PROBE.md` to describe what shipped, including every measurement that moved and
every claim this campaign withdrew. Its entries accumulated across three re-baselines in `plan.md`
(lines 259, 343, 393). **This is the single list.** The unit that reconciles the guide reads this file,
not the three sections.

## Measurements that moved or need re-taking

- **The latency table at `PROBE.md:76-79`** — boot 4392 ms, one `prove` 530-621 ms, one inspection
  264 ms, the runtime stage alone 187 ms — is accurate per inspection and **incomplete**. The runtime
  stage recycles its resident runner every 64 written specifications, and that replacement costs
  **260-285 ms** on the inspection that triggers it, measured through the real stage across two runs
  whose spike lands on inspection 65 alone. A reader budgeting latency from that table is wrong once in
  64 calls, which is exactly the reader the table exists for.
- **The per-stage figures at `:241-243` and `:279-281`** were taken before six rounds of repair.
  Re-measure or mark them as of a stated date. Do not silently carry them.

## Claims the campaign withdrew, which the file must stop asserting

- **That the entry orphans its resident hosts on termination.** Measured false — the processes exit.
  What stands is that arming files survive and contained faults are discarded.
- **Any wording implying a receipt certifies runtime evidence over source the runtime never ran.** This
  is O9's subject and criterion 4 forbids leaving the contract as it stands.
- **The orphan's reachability.** S3 concluded it was reached through the signal door. Measured wrong: a
  signal death leaves `exitCode` null, so the pre-repair write never threw and never orphaned — **the
  signal door reaches the deadlock**. The orphan's real door is a **code-0 exit**, and a lone surrogate
  in candidate text is a reachable one, driving real oxlint 1.79.0 to exit 0 mid-inspection.

## Claims the campaign added that the file does not carry

- **A receipt is issued only when every stage ran clean on the case AND the control produced at least one
  `origin: 'code'` finding at the stage it declared.** `Finding` carries that discriminant now.
- **A clean runtime check means every collected test passed**, not that the module reported `passed`.
- **The formatters render both finding origins identically**, so an agent reading `formatVerdict` output
  cannot distinguish a control failure from an instrument fault. Carried out of scope on the record; the
  file must not imply otherwise.
- **What the lint stage does when its language server dies** — it reports the death rather than hanging,
  and teardown of a stage whose server already died is a clean shutdown rather than a process kill.
- **That a candidate document can kill the real Oxlint server.** Measured: `textDocument/didOpen`
  carrying 400,000 nested `(` returns `code=null signal=SIGSEGV` against oxlint 1.79.0.
- **That a candidate is linted at the path it was declared**, with no synthesized identity — and that
  this is what makes an exact-path override selectable at all.
- **That the lint stage refuses a concurrent second inspection of one open path**, and why the
  coordinator rather than the stage is where inspections serialize.
- **That a path the workspace's version-control ignore excludes is a path the gate never lints**, and the
  stage reports the same nothing for it. `.gitignore` alone causes this; `.oxlintignore` is not honoured
  in LSP mode and a negation does not reverse it.
- **Which module conditions probe publishes**, after P1 rules on the CommonJS one.
- **That candidate sources are served to the type stage through an inspection-scoped `Overlay`**, that
  both host callbacks are load-bearing, and that directory listings stay on disk because they feed a
  glob expansion cached per project at service creation.

## Not yet surveyable

- Whatever O9 unit 2 changes about how the runtime stage serves candidates.
- Whatever the receipt-honesty unit changes about when a receipt is issued.
- P1's ruling on the published module conditions.

## The standing rule for this reconciliation

Every entry above is either a measurement with a recorded number or a claim with a recorded refutation.
**Do not add a sentence to `PROBE.md` that neither describes shipped behaviour nor cites a measurement.**
The guide is the product's truth, and this campaign's whole subject is a package that must not certify
what it did not check.
