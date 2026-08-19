# S3fix audit — reconciliation

Sol held the independent objective lane, because Opus wrote the unit. `VERDICT: FAIL` — 8 refuted, 1
confirmed, 6 `NOT RULED`. The Orchestrator re-ran the load-bearing refutations rather than accepting them.

**Six claims went unruled for one honest reason.** The bench sandbox strips stdio from a Node-spawned
Node child, and the lane probed that itself before ruling:

```text
the sandbox removes stdout from a Node-spawned Node child while returning exit 0,
so the protocol tests can produce false greens
```

It then declined to treat scoped Vitest results as behavioural evidence. That is the correct call: an
unruled claim is worth more than a green nobody can trust.

## Carried into the fix round

### F1 — the sixth design. HIGH, and it closes the criterion S3fix declared unclosable.

S3fix reported that an exact-path override cannot be matched by any synthesized identity that stays
distinct from the declared path, and gave a five-row table of rejected alternatives. Every row varies the
**path**. Sol found a sixth that does not:

> use the declared URI unchanged, serialize inspections sharing that URI, and use the existing document
> version sequence for freshness

**All three ingredients already exist in the tree**, verified:

```text
src/server/Probe.ts:92-96      #lintQueue = createQueue({ concurrency: 1, retries: 0 })
LintStage.ts:157              const inspected = diagnostics.finally(() => this.#close(uri))
LintStage.ts:159,203          didOpen … / didClose …
LintStage.ts:163              version: this.#sequence
```

Inspections are already serialized at the coordinator, every `didOpen` is already paired with a
`didClose` through a `finally`, and a version counter is already sent. The uuid exists to make URIs
unique; serialization plus open/close pairing plus versioning is what uniqueness was for.

**Using the declared path unchanged removes path synthesis entirely**, and with it every glob mismatch —
suffix, directory-anchored, filename-sensitive, and exact-path alike.

### F2 — replace the inspector census with public outcomes. HIGH, two lanes agree.

`tests/src/server/stages/LintStage.test.ts` opens a `node:inspector` session and reads V8
`privateProperties` to count five `#` maps. `.claude/rules/tests.md` says "Test observable behavior, not
implementation details."

**S3fix flagged this against itself** and Sol independently refuted claims 12 and 13 on it. Sol also
supplied the replacement: every pending inspection settles, `destroy` resolves idempotently, a later
inspection rejects, and the owned child is no longer live. Those are public and they are what the census
was standing in for.

### F3 — `inferTestProject` used outside its contract. MEDIUM.

`src/server/helpers.ts` documents it as selecting "the Vitest project whose environment matches one test
path". `#file` uses it as a generic `tmp/probe` directory predicate over every `Source`, including
candidate files that are not tests.

**Likely dissolved by F1.** With no synthesis there is no predicate. Check rather than assume — the
`tmp/probe` staging area still needs its lint leg not to be a permanent false green, and that problem
survives F1 in a different shape.

### F4 — the fix covers directory-only globs, not every directory-anchored glob. MEDIUM.

`configs/candidate.ts` becomes `configs/probe-<uuid>.candidate.ts`. Both match `configs/**`, but a
filename-sensitive glob anchored to a directory — `configs/candidate*.ts` — matches only the declared
path. **Dissolved by F1** if F1 lands.

### F5 — one test binds to no repair. MEDIUM, and it is honest to say so.

`rejects an inspection whose candidate text ends the real language server` would pass against `dcd50a3`:
it calls `inspect()` before `destroy()`, and the baseline suppressed code 0 only when `#destroyed` was
true, so during the inspection the baseline produced the same rejection.

S3fix's own report shows this implicitly — it lists five new tests and only four red-then-green proofs.
**Keep the test**: it proves a real reachability fact, that a candidate's text can end the server with
code 0. Correct the record so it is not counted as a proof of a repair.

### F6 — the report's own table contradicts its prose. LOW.

The table shows rows 1 and 5 returning `[]`; the prose says "Only the last two rows match." Row 1 is the
declared path — the baseline the others are measured against — and row 4 reports a finding. Fix the
sentence when the table is rewritten under F1.

## Dropped on the record

- **Claim 14, "an instrument was committed."** Sol's ground is that the test file contains the census and
  the report calls it "the census instrument". That is an argument from the report's vocabulary, not from
  a rule. `.claude/rules/tests.md` § Probes defines an instrument as a **throwaway** that "is not a test
  and never ships", living under `tmp/scratch/` or beside its subject and deleted before return. The
  census is permanent test infrastructure inside a test file, serving assertions. The substantive concern
  is real and is carried as F2; the scope-honesty claim is not.
- **Claim 5's refutation.** Sol refuted it on read order — the guard names `exitCode` first — while
  stating "no missed ending was found" and confirming every ending. `#describe` gives `signal` priority
  for the label, so the behaviour the claim asserted holds. The brief's wording was imprecise; the code
  is not. No work.

## Every finding has a carrier

F1 through F6 go to unit S3fix2. The two dropped items carry no work by construction. Nothing from this
round is left without a home.
