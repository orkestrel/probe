# PBFIX11 amendment — the owner's instruction: resolve the collision, name it right from the start

Successor to `tmp/pbfix11-brief.md`. The brief stands, with these additions and one reversal. The
owner's instruction, 2026-08-20, outranks the recorded PBFIX8 ruling: the `Finding`/`isFinding`
collision with `@orkestrel/scaffold` is resolved by rename, not documented, and `guides/probe.md`
carries no mention of scaffold. Probe renames because it is unpublished and free; scaffold's
published names stay.

## C6 — rename the concept

Rename probe's `Finding` type to `Issue` and `isFinding` to `isIssue`, and carry the concept's
one term through every member and helper that holds it — the `findings` members become `issues`,
`formatFinding` becomes `formatIssue`, and the wire schema's property follows, so the type, the
members, the guard, the formatter, and the published JSON schema all speak one word. Search for
the actual symbol set rather than trusting this list; the sweep covers `src/`, `tests/`,
`guides/probe.md`, and `README.md`.

Evidence, measured by the Orchestrator 2026-08-20 with a validated instrument (its control found
scaffold's `Finding`, `isFinding`, and `Origin` exports):

- Outward: `Issue` is exported by no installed `@orkestrel` package —
  `grep -rn '\bIssue\b' node_modules/@orkestrel/*/dist/**/*.d.ts` returns nothing.
- Inward: `Issue` appears in no `src/` identifier. The one inward wrinkle is the receipt verb;
  C7 removes it.

## C7 — one sense for the new word

The receipt prose says a receipt is `issued`. With the noun `Issue` arriving, that verb would
give one word two senses in the package's most load-bearing paragraphs. Unify the receipt verb
to `mint`: the TSDoc in `src/core/helpers.ts`, `src/core/constants.ts`, and `src/server/types.ts`
where it says `issue`/`issued`/`issuing` about receipts, and the matching guide sentences. The
vocabulary is already in use — the campaign record says a receipt "mints" throughout.

## C8 — no scaffold in the guide

Delete the section `### A name this package shares with @orkestrel/scaffold` whole. Every
`scaffold` mention in `guides/probe.md` sits inside it (measured: the only hits are that
section's lines), so after the deletion `grep -n scaffold guides/probe.md` returns nothing —
that grep is a criterion. Check `README.md` the same way. PBFIX8's compile evidence for the
alias stays in the campaign record as history; the note it proved is superseded by the owner's
instruction.

## Interactions with the brief's existing changes

- C1's restored-`workspace` proofs and C3's guide re-edits are written in the renamed vocabulary
  (`Issue`, `issues`) in the same pass — one sweep, not two.
- C4's contract sentence and C5's proven-surface statement are unaffected.
- The `Party` doc sentence ("Names who must act on a finding or probe failure") follows the
  rename: who must act on an issue or a probe failure.

## Criteria additions, after the brief's own

7. `rg -n '\bFinding\b|\bisFinding\b|\bfindings\b|\bformatFinding\b' src/ tests/ guides/probe.md
   README.md` returns no hit naming probe's own concept; paste any permitted residue and why.
8. `grep -n scaffold guides/probe.md README.md` returns nothing.
9. `rg -in '\bissu' src/ guides/probe.md` returns no receipt-verb hit; a hit in another sense is
   named and permitted.
10. `rm -rf tmp/probe && npm run test:guides` exits 0 after the sweep (parity holds under the
    renamed surface).

## Scope expansion

Owned files gain the rest of `src/core/` and `src/server/` and `src/bin/`, and every test file
under `tests/` the sweep reaches, plus `README.md`. The off-limits list is unchanged: the
vendored host files, `package.json`, `vite.config.ts`, and the version.
