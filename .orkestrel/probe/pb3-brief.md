# PB3 — make the runtime stage actually serve the candidates it certifies

## Role and engine

`sol` (GPT-5.6 Sol), direct `codex exec`. Perform the assignment directly and spawn nothing.

## The defect

Row P5 of `.orkestrel/probe/readiness-grade.md`, a release blocker, and the package's advertised
primary capability. Read the grade first.

`Case.files` is documented as "The candidate sources the test imports" — in `src/core/types.ts:54`, in
the shipped `dist/src/core/index.d.ts`, and in the **live MCP tool schema** a client reads. The audit
supplied a candidate as text and had the test import it, three specifier forms, against the real
workspace:

```text
../../../src/core/greeting.js   type: clean   runtime: code Cannot find module '../../../src/core/greeting.js'
../../../src/core/greeting.ts   type: clean   runtime: code Cannot find module '../../../src/core/greeting.ts'
../../../src/core/greeting      type: clean   runtime: code Cannot find module '../../../src/core/greeting'
```

The type stage resolves the text-only candidate. The runtime stage does not. And the failure carries
`origin: 'code'`, which blames the consumer's source and lets the receipt condition treat it as a real
code defect.

## The mechanism, already established — confirm it, do not rediscover it

The overlay plugin registers **`load` only**:

```text
$ grep -n "name: 'orkestrel-runtime-overlay'" -A3 src/server/stages/RuntimeStage.ts
					name: 'orkestrel-runtime-overlay',
					enforce: 'pre',
					load: this.#load.bind(this),
```

Vite's pipeline is `resolveId` → `load` → `transform`. A specifier naming a file that does not exist
on disk fails at **resolution**, so `load` is never reached. Serving bytes was never the problem;
being resolvable was.

Confirm that with a probe before repairing, then repair it.

## The repairs

### P5 — resolve what the overlay covers

Give the overlay plugin a `resolveId` that resolves a specifier to a covered path when the overlay
holds it, so `load` then serves the text. Keep it honest:

- resolve **only** what the overlay actually covers; everything else returns undefined and Vite's own
  resolution proceeds untouched;
- handle the specifier forms a real test uses — extensionless, `.js` pointing at a `.ts` source, and
  `.ts` — because a consumer writes whichever their editor produces;
- do not resolve a bare package specifier to a candidate. A candidate shadowing a real dependency is
  a supply-chain shape, not a feature.

**A candidate that shadows a file already on disk was NOT tested by the audit** and is explicitly in
your scope. Decide what it must do, implement that, test it, and state the ruling in your report.

### P17 — an instrument fault must not masquerade as a code defect

A missing target directory or a write failure currently rejects with a bare `Error`, losing the other
two stages' checks. Return an `origin: 'instrument'` finding on the runtime check instead, so the
verdict still carries what the other stages found.

### P18 — the type stage infers the project from the declared spelling

`inspect` infers a candidate's project before resolving its path, so two spellings of one resolved
file can select different projects and produce a **false finding carrying `origin: 'code'`** — the
origin `computeReceipt` counts. Resolve each candidate path before inferring, and prove two spellings
of one file return the same findings.

## Scope

Owned: `src/server/stages/RuntimeStage.ts`, `src/server/stages/TypeStage.ts`, `src/server/Overlay.ts`,
`src/server/helpers.ts`, and the matching files under `tests/src/server/`.

Report-only: `src/core/types.ts` — if `Case.files`' documented meaning must change rather than the
behaviour, say exactly which sentence and leave it. A later unit owns core.

Off-limits: `src/core/**`, `package.json`, `vite.config.ts`, `tests/distribution.test.ts`,
`.orkestrel/`, `guides/`.

## Standing conditions

- Units PB1 and PB2 land before you. PB2 changes how these two files resolve package entries; take
  their state as given and do not revert it.
- This executor's sandbox may deny **nested** child creation with `EPERM`. Spawn-dependent tests can
  fail for a reason that is not the product. Record those as observations, name the exact command
  that would settle each, and carry on — never substitute a weaker instrument for a proof.

## Execution

Perform this assignment directly. Spawn nothing.

## Acceptance criteria

1. `npm run format:check`, `npm run lint:check`, and `npm run check` each exit 0.
2. A claim whose test imports a text-only candidate resolves at the runtime stage and the case runs,
   proven red-then-green, for **all three** specifier forms above.
3. A candidate shadowing an existing disk file behaves as you ruled, with a test and the ruling in
   your report.
4. A missing target directory yields an `origin: 'instrument'` finding on the runtime check, and the
   verdict still carries the type and lint checks — proven red-then-green.
5. Two spellings of one resolved candidate path return identical findings from the type stage, proven
   red-then-green.
6. No new `origin: 'code'` finding can be produced by an instrument fault. State how you checked.

**`npm run build` and the test projects are observations, not criteria.** Report each command's
**bare** exit code; a pipe masks it.

## Deviation contract

Stop and report if closing P5 requires changing `Case.files`' documented meaning rather than the
behaviour, if a repair needs a file you do not own, or if the shadowing ruling has consequences you
cannot bound. The resolution strategy, the helper shapes, and test naming are yours.

## Output

**Per numbered row: what changed and why**, **The shadowing ruling and its evidence**, **Files
written**, **Red-then-green proofs** with exact commands and both counts, **Validation** (each gate,
bare exit code), **Spawn-dependent tests you could not run**, **Core sentences that must move**,
**Deviation**, **Decisions**. No process diary.
