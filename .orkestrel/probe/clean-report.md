# CLEAN-PROBE — report

Unit: `implementer`, Opus 5. Brief: `clean-brief.md`. The owner's ruling: no count in prose, anywhere.

19 files, 176 insertions, 174 deletions. No vendored file and no guide mirror touched.

## The sweep found counts that had already drifted

Two, in a package that has never published, in prose that passed every gate:

- `guides/probe.md` said "satisfy both receipt conditions". The guide lists four.
- `tests/guides.test.ts` said "so the two assertions below are read against the digest". Four follow.

Neither is a hypothetical. Both are the exact failure the ban exists to stop, sitting in the tree
while the campaign argued about whether the ban was too blunt.

## Naming beats counting

- "Three nouns carry the package." → "A `Claim`, a `Verdict`, and a `receipt` carry the package."
- "the rule is narrower on one member: see …" → "the rule is narrower on `Source.path`"
- "which is why prerequisites 1 through 3 gate the boot" → names the Vitest project, its composition
  in the root configuration, and the declared test directory
- "The first control is …" / "The second control is …" → "The `clean` control" / "The `elsewhere`
  control", using the variables' own names
- "**Verify a receipt one of two ways.**" → "**Verify a receipt by recomputation, or by re-running
  the claim.**"

Both named breaches closed: `currently` in `TypeStage.ts` and `just` in `Probe.test.ts`. The verifier
confirms neither word survives anywhere in `src/`, `tests/`, `guides/probe.md`, or `README.md`.

## Two judgment calls the unit flagged, both upheld

**The receipt-parsing indices stay.** "Take fields 0 through 5, rejoin everything from index 6" is
the documented parsing rule, and it stops being executable without them. An array index is code.

**"Thirty candidates is about 38 seconds of compiler work" stays.** It restates a `{ length: 30 }`
literal in prose, which looks like a count — but it is an input size paired with a timing, which is a
measurement rather than a tally of members.

## The ban is not in this checkout yet

`grep -rn "NEVER state a count" AGENTS.md CLAUDE.md .claude/rules/ .agents/` returns nothing here.
`AGENTS.md` is vendored and off-limits in a target; the bytes arrive through `repair` after
`@orkestrel/scaffold` publishes. The unit executed against the brief's quoted text and said so rather
than pretending the file already carried it. `CLEAN-PROCESS` reported the same independently.

## Gate evidence

`verifier`, Sonnet: `format:check`, `lint:check`, `check`, `build`, `test`, `test:distribution`, and
`scaffold audit` all exit 0. `test:src` 11 files, 158 tests; `test:policy` 86; `test:config` 28;
`test:guides` 12; `test:distribution` 2. No flake, no re-run.
