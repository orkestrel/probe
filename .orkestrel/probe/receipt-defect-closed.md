# The receipt defect, closed and re-measured with the instrument that found it

The campaign's most serious defect: a control whose test never ran earned a receipt, which is the
package's product. It was created by a correct repair — making "this test never ran" a finding closed
the false green on the case side and opened one on the control side.

## Before, measured against a real `Probe.prove`

```text
SKIPPED-CONTROL receipt : "probe:204337f2-43f7-451f-8354-13d53b9a0575:runtime:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11"
CONTROL-A real failure  : "probe:a3a84d5a-40ea-...:runtime:..."
CONTROL-B passing ctrl  : undefined
```

## After, the identical instrument re-run against the repair

```text
SKIPPED control  : undefined
REAL FAILURE     : "probe:db7900d4-11d0-4d02-bf0e-b532c005355d:runtime:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11"
PASSING control  : undefined
DEFECT CLOSED    : true
```

All three rows are now correct, and the middle row is what makes this a repair rather than a
capitulation: a control that genuinely fails still earns a receipt, so the fix did not close the hole
by making receipts unobtainable.

## The mechanism

`Finding` gained `origin: 'code' | 'instrument'`, and `computeReceipt` reads only `'code'` findings when
asking whether the control broke. The case's `clean` term keeps counting **both**, so a case whose stage
faulted still refuses the receipt — that is the constraint bounding the fix against over-correction, and
it is a separate test.

23 construction sites carry the discriminant: 16 in `RuntimeStage`, 3 in `TypeStage`, 4 in `LintStage`.
The typechecker is the completeness proof, because `origin` is required — a `Finding` built without it
does not compile.

## Why this closed without a fifth audit round

`.claude/rules/quality.md` budgets three rounds at one seam and allows a fix that adopts the auditor's
prescription verbatim to close with a mutation probe rather than a fresh cross-engine round. This round
adopted the ruling as written and produced something stronger than a mutation probe: a **revert proof**.
With `src/` reverted to `5e88c91` and every test left as written, 16 tests failed across all seven test
files that assert on the discriminant; with `src/` restored, none did. Every new assertion binds to the
source change rather than passing for an unrelated reason.

Plus the end-to-end re-measurement above, taken by the Orchestrator with the instrument that originally
found the defect.

## What the round could NOT prove, recorded rather than glossed

One clause of one criterion asked for an `'instrument'` finding from every stage. Two cannot produce one:

- **The lint stage constructs none at any reachable path.** All four of its sites are Oxlint diagnostics
  about the supplied text, and every fault of its own — server not running, invalid frame, server exit —
  rejects the inspection rather than returning a finding. Manufacturing one would be an unauthorized
  behaviour change that no consumer asked for.
- **The type stage has one site that its own calls cannot reach.** Probed: a language service driven with
  a broken `types` option and three real errors returned `fileless count: 0`, because
  `getSyntacticDiagnostics` and `getSemanticDiagnostics` attach a file to every diagnostic, and file-less
  ones come from `getCompilerOptionsDiagnostics`, which this stage never calls. The branch must still
  exist because `Diagnostic.file` is optional, and `'instrument'` is the fail-closed classification for
  it.

The closable half was proved for both.

## Carried out of scope, deliberately

`formatFinding` and `formatCheck` render both origins identically, so an agent reading `formatVerdict`
output still cannot tell a real control failure from an instrument fault. That is outside this round's
enumerated scope and is recorded against the formatting capability for whoever owns it next, per the
completion law, rather than reopening a seam already at four rounds.
