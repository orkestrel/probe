# O9-U2 audit — the claim list both lanes rule on

## Subject

Commit `81a7485` in `/workspace/probe`, branch `claude/probe-package`, baseline `703bfe6`. The exact
diff is `/home/user/scaffold/.orkestrel/probe/o9-u2-diff.md` (361 lines). The unit's own report is
`/home/user/scaffold/.orkestrel/probe/o9-u2-report.md`; its brief is `o9-u2-brief.md`.

**The report is the claim under test, never evidence for it.**

**Written by GPT-5.6 Sol.** Both lanes therefore run on Opus 5. That is a recorded substitution: the
auditor must be an engine that did not write the unit, and the two lanes stay separate, clean-contexted,
and blind to each other.

## What the change does

`RuntimeStage` previously wrote the case's **test** to disk as a revision file and ran it, while
`subject.files` were never written or overlaid. Every import therefore resolved to the disk copy, and a
receipt could certify runtime evidence over source the runtime never ran.

Each inspection now owns an `Overlay` recording every candidate by resolved declared path. A Vite
`load` plugin, installed onto each configured Vitest project through a root `config` hook, serves that
overlay. The snapshot records a covered path as `overlay:<revision>` so the existing invalidation path
sees a candidate revision change.

## The claims

Rule on every one. Attempt refutation, not confirmation.

1. A candidate in `subject.files` reaches the test through a **direct import**, and the test observes
   the candidate text rather than the disk text.
2. A candidate reaches the test through a **transitive barrel import**, not only a direct one.
3. Two successive inspections of the same declared path on one resident runner each observe their own
   candidate text. The first inspection's text does not survive into the second.
4. After an inspection clears its overlay, a later inspection of that path observes the **disk** text
   again.
5. Serving a candidate leaves the **disk bytes** of the declared path unchanged, before and after.
6. Declared module path and identity are preserved: no revision suffix reaches `import.meta.url`, a
   stack path, or any path a test can observe.
7. `#load` returns overlay text only for a path the overlay holds and `undefined` for every other
   module in the graph — including a path differing only by a query string or a hash fragment, and
   including a path that is a prefix or suffix of a covered path.
8. Mutating `config.test.projects` in place inside `#configure` is **required** — returning the
   augmented array concatenates rather than replaces — and that mutation corrupts nothing outside this
   stage's own resident Vitest.
9. `#load` never observes `this.#overlay` in a state belonging to a different inspection, for every
   interleaving the package's own shipped code can reach.
10. `destroy()` releases the overlay, and a stage destroyed mid-inspection leaves no candidate text
    resident and no revision file behind.
11. The change introduces no `any`, no `as`, no `!`, no `@ts-*` or `oxlint-disable` directive, and every
    new declaration sits in a file its kind permits under `.claude/rules/architecture.md`.
12. Exactly the two owned files changed, and no instrument or scratch artifact was committed.

## Your lane

The dispatch names it. Rule on all twelve claims through your lane's lens.

- **Correctness lane.** What the code and the substrates actually permit: Vite's `load` and `config`
  hook contracts as installed in `node_modules`, Vitest's project configuration shapes, resident-runner
  cache behaviour, path normalization, and the orderings a happy path never reaches.
- **Design-fit lane.** Shape, naming, ergonomics, and fit with `AGENTS.md` and the rules: whether each
  new private method earns its existence under the wrapper test, whether signatures are honest about
  what they take, class member order, TSDoc truth, and whether mutating a caller-owned input is
  defensible here or is a rule violation wearing a justification.

Neither lane defers to the other's territory. Where a claim reads as the other lane's, rule on it
anyway from your own lens and say so.

## Instruments

You are read-only: `Read`, `Grep`, `Glob`, and nothing else. You cannot execute, so do not design a
probe.

Rule from the diff, the installed declarations under `/workspace/probe/node_modules`, the rule files,
and the source at the commit. Where a claim can only be settled by running something, say so plainly
and name the exact command that would settle it — the Orchestrator runs it and hands the result back.
Do not substitute a derivation for an execution and present it as a verdict.

State each instrument's coverage beside its result. A search proves something about the paths it
walked.

## Output

One line per claim, in order, then nothing else before them:

```text
CLAIM <n>: CONFIRMED | REFUTED | PLAUSIBLE | NOT RULED (reason)
Evidence: <file:line, or the installed declaration, or the exact command that would settle it>
```

Then `Out-of-scope findings`, then `What needs execution`, then one terminal line:
`VERDICT: PASS` or `VERDICT: FAIL`.

Return this as your final message. Write no file — you have no write tool, and naming one would stop
you on arrival.

No process diary.
