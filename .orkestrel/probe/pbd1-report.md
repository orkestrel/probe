# PB-D1 report

Every gate the brief names is green. The guide documents the ownership axis, the categorization
gate drives real failure paths instead of reading source text, and the count sweep is closed over
the population the brief scoped.

One guide sentence the brief prescribed is false of the code, and one guide claim the brief told me
to verify rather than assume turned out to be false at a boundary the audit did not name. Both are
recorded under **Deviations and rulings**. Neither needed a source change.

## Files touched

| File | What changed |
| ---- | ------------ |
| `guides/probe.md` | § Surface, § Constants, § Errors, § Validators, § Server contracts, § Server helpers, and § Methods carry the renamed surface and the corrected signatures; § What a probe proves states the receipt conditions the code applies and the claimant invariant; § Failures is one `Origin`/`Code` table with a routing branch; § Prerequisites is unnumbered and states the throw the runtime stage now raises; § Reading a receipt is a named grammar; a new § What containment reaches states the read reach; § Lifecycle gains the configuration cache boundary and loses the listener tallies, the path-attribution claim, and the positional references. |
| `README.md` | "before the first claim" became "before you make a claim". |
| `tests/src/core/errors.test.ts` | The `new Error(` text sweep is replaced by real failure-path executions reading the raised value's `origin` and `code`, a permanent untranslated-failure control, and a narrow text check over the resident modules alone. |
| `tests/guides.test.ts` | New assertion `names every declared origin and condition in the failure table`, which reads the guide's § Failures table against `ORIGINS` and `PROBE_ERROR_CODES`. |
| `tests/distribution.test.ts` | The cross-copy consumer mints `{ origin: 'workspace', code: 'malformed' }`, asserts both axes survive the crossing, and adds an undeclared-origin refusal across the copies. |
| `src/core/errors.ts` | TSDoc only: the universality claim is scoped to a served claim, and the leaf boundary is named. |
| `src/core/helpers.ts` | Comment only: "the last line" became "the closing line". |
| `src/server/ProbeServer.ts` | Comments only: the listener tallies became the `data`, `close`, and `error` forwarder names. |
| `src/server/types.ts` | TSDoc only: the idempotence sentence no longer names a call by position. |
| `tests/src/server/ProbeServer.test.ts` | Comments only: the listener tallies and "the fourth flow case" are named rather than counted. |

No executable source changed. Every `src/` edit is inside a comment or a TSDoc block.

## Diffstat

```text
 README.md                            |   2 +-
 guides/probe.md                      | 406 ++++++++++++++++++++++-------------
 src/core/errors.ts                   |  10 +-
 src/core/helpers.ts                  |   2 +-
 src/server/ProbeServer.ts            |  12 +-
 src/server/types.ts                  |   9 +-
 tests/distribution.test.ts           |   8 +-
 tests/guides.test.ts                 |  12 ++
 tests/src/core/errors.test.ts        | 201 ++++++++++++++++-
 tests/src/server/ProbeServer.test.ts |   6 +-
```

## D0 — the three red gates

```text
rm -rf tmp/probe && npm run test:guides
exit 1
Test Files  1 failed (1)
     Tests  2 failed | 10 passed (12)
```

The two failures were `documents every public export, and publishes every documented name` (the
guide still documented `FindingOrigin` and `FINDING_ORIGINS` while the barrels publish `Origin` and
`ORIGINS`) and `states the constants at the values it publishes`.

```text
npm run test:distribution
exit 1
Test Files  1 failed (1)
     Tests  1 failed | 1 passed (2)
Error: The guard refused a failure from the required copy
```

The consumer minted `new required.ProbeError('cross-copy failure', { code: 'invalid' })`. `invalid`
is no longer a declared condition and no `origin` was supplied, so `isProbeError` refused it
correctly. The consumer now mints `{ origin: 'workspace', code: 'malformed' }`, still across the
CommonJS-to-ESM boundary, still with the `instanceof` control that proves the copies are distinct,
and it now also asserts that both axes survive the crossing and that an origin this copy never
declared stays outside the type.

## D4 — each behaviour reproduced before the guide changed

Reproduced with a runtime probe at `tmp/probe/d4.test.ts` through the `probe` project, and removed
afterwards. `rg -n "PLANTED|d4.test.ts" tests/ src/` returns nothing and `tmp/probe` is empty.

### The contained-path claim, against the symlink read reach

```text
npx vitest run --config vite.config.ts --no-cache --reporter=verbose --project probe
exit 0

isSource(link/secret.ts) = true
read resolution   = <workspace>/link/secret.ts
real path         = <outside>/secret.ts
inside workspace? = false
write resolution  = ProbeError: Path crosses a symbolic link: link/secret.ts
control read      = ProbeError: Path escapes the workspace: ../secret.ts

project reaching outside = tsconfig.json 0839ee872a076d3793b1fd62f6c99a85
project reading nothing  = tsconfig.json 799ad55436efd6492892316a087b6b43
outside file changed the answer = true
```

The mutating resolution refuses the link and the reading resolution does not, and a contained
`tsconfig.json` whose `extends` names an absolute path outside the workspace resolved to a
different options digest from the same project without it, so the outside file was read. The
lexical-escape control is refused on both paths, so the instrument is not admitting everything.
Written into the new § What containment reaches and into the receipt-limit bullet the brief
supplied verbatim.

### The claim that a same-shaped caller file survives everywhere

```text
npx vitest run --config vite.config.ts --no-cache --reporter=verbose --project src:server \
  tests/src/server/stages/RuntimeStage.test.ts \
  -t 'removes the files a dead host left behind, at construction'
exit 0
Test Files  1 passed (1)
     Tests  1 passed | 32 skipped (33)
```

That test asserts `existsSync(arming)` is `true` for "a caller's unmarked file at a boot path" and
`existsSync(abandoned)` is `false` for a marked boot dependency whose writer is gone, so
`RuntimeStage.#owned` attributes a boot dependency by its marker rather than by its path. The
guide's sentence "the boot dependencies carry text probe authored, at the fixed paths
`tmp/probe/arm-type.ts` and `tmp/probe/arm-runtime.ts`, so their own path attributes them" was
false on both counts: the boot writes revision-named files and every deletion is marker-backed. The
guide now says every deletion is marker-backed and that nothing under `tmp/probe/` is deleted for
sitting there.

### The claim that every package failure is a `ProbeError`

Driven, not assumed:

```text
readWorkspaceManifest absent       isProbeError=true workspace/missing
readWorkspaceManifest malformed    isProbeError=true workspace/malformed
resolveWorkspaceModule absent      isProbeError=true workspace/missing
loadWorkspaceModule absent         isProbeError=true workspace/missing
resolveWorkspaceBinary no bin      isProbeError=true workspace/missing
resolveWorkspaceBinary wrong key   isProbeError=true workspace/missing
resolveWorkspaceFile escape        isProbeError=true claimant/refused
inferTypeProject unmapped          isProbeError=true claimant/refused
untranslated JSON.parse            isProbeError=false SyntaxError: Expected property name or '}' in JSON at position 2 (line 1 column 3)
```

The audit's exact escaped case — `readWorkspaceManifest(cwd, 'definitely-absent-package')` — now
raises a branded `workspace/missing` failure. Then the same probe read the exported pure leaves:

```text
computeDigest cyclic         RangeError: Maximum call stack size exceeded isProbeError=false
computeDigest bigint         TypeError: Do not know how to serialize a BigInt isProbeError=false
normalizeValue cyclic        RangeError: Maximum call stack size exceeded isProbeError=false
parseContentLength junk      no throw
messageFromUnknown cyclic    no throw
```

So the unqualified sentence is still false through a public export. See **Deviations and rulings**.

### Configuration state persists

```text
digest before the edit          = 8feed091ccfc8a58b9bcf796020ee05a
same stage after the edit       = 8feed091ccfc8a58b9bcf796020ee05a
a newly constructed stage       = 0839ee872a076d3793b1fd62f6c99a85
resident answer moved with file = false
fresh answer moved with file    = true
```

`TypeStage.#service` returns the service it already holds for a resolved project path and never
re-reads the project file, so a `tsconfig.json` rewritten under a live stage does not move the
options digest the receipt carries, while a stage built afterwards reports the moved one. The
newly built stage is the control: without it the unchanged reading could have meant the edit itself
changed nothing. Documented as a new § Lifecycle entry, **Configuration is read once per stage, not
per claim**, which also names the Oxlint and Vitest configurations and tells a caller to rebuild the
probe after editing `tsconfig.json`, `.oxlintrc.json`, or `vite.config.ts`.

## D3 — the repaired categorization gate

`tests/src/core/errors.test.ts` no longer strips comments and searches for `new Error(` across the
package. It now carries:

- `classifies every failure path a test can drive without a resident tool` — a table of real drives
  over `createDestroyedError`, `resolveWorkspaceFile` (lexical escape and symlink mutation),
  `inferTypeProject`, `resolveWorkspaceModule`, `loadWorkspaceModule`, `readWorkspaceManifest`
  (absent, unparsable, and non-record manifests), and `resolveWorkspaceBinary` (no `bin` field, no
  entry of its own name, and a `bin` entry that is not a path). Each drive's raised value is
  rendered as `origin/code`, or as `unclassified <value>` when the guard refuses it, and the whole
  rendering is compared against the declared pairs, so a failed run names the drift. The translated
  manifest failure is additionally asserted to keep the dependency's own fault on `cause`.
- `refuses a failure a dependency raised and this package did not translate` — the permanent
  control, drawn from outside the population the gate covers: the untranslated shape
  `readWorkspaceManifest` replaced.
- `constructs no unclassified failure in the resident modules` — the narrow text check the brief
  allows, kept for `src/server/Probe.ts`, `src/server/ProbeServer.ts`, and the three stage files
  alone. Named reason, stated in the file: their failures cannot be raised without a resident
  TypeScript, Oxlint, or Vitest, which the `src:core` project starts none of; their own mirrored
  proofs drive them for real. The check is also stronger than the one it replaces — it reads every
  `throw new <X>(` and refuses any `X` other than `ProbeError`, not `new Error(` alone.

### Plant and remove

Planted one row in the drive table in `tests/src/core/errors.test.ts`, a file this unit owns,
immediately after the `oddbin` row:

```ts
['PLANTED an untranslated manifest read', 'workspace', 'malformed', () =>
	JSON.parse(workspace.read('node_modules/unparsable/package.json') ?? '')],
```

Red with the plant:

```text
npx vitest run --config vite.config.ts --no-cache --reporter=verbose --project src:core \
  tests/src/core/errors.test.ts
exit 1
Test Files  1 failed (1)
     Tests  1 failed | 7 passed (8)

-   "PLANTED an untranslated manifest read: workspace/malformed",
+   "PLANTED an untranslated manifest read: unclassified SyntaxError: Expected property name or '}' in JSON at position 2 (line 1 column 3)",
```

Removed by deleting exactly those two lines — the same string that was inserted, asserted present
once and replaced with the empty string. Green without it:

```text
npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:core
exit 0
Test Files  3 passed (3)
     Tests  31 passed (31)
```

`rg -n "PLANTED" tests/ src/` returns nothing.

### The new guides assertion was controlled too

`names every declared origin and condition in the failure table` was proved able to fail by
temporarily spelling one § Failures row's origin `tooling`:

```text
npx vitest run --config vite.config.ts --no-cache --reporter=verbose --project guides \
  -t 'names every declared origin'
exit 1
AssertionError: expected [ 'claimant', 'instrument', …(2) ] to strictly equal [ 'claimant', 'instrument', …(1) ]
```

The guide was restored from a copy taken before the edit and `rg -c "instrument. \| .deadline"`
confirms the row is back.

## D5 — the count sweep

Patterns, applied case-insensitively over whole Markdown files and over comment and TSDoc lines
alone in TypeScript files:

```text
\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|dozen|pair|both|\d+)\b
\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|final|penultimate|\d+(?:st|nd|rd|th))\b
```

Population swept: `README.md`, `guides/probe.md`, `guides/README.md`, every `.ts` file under `src/`,
and every `.ts` file under `tests/`. `guides/README.md` is the clean control: the sweep returned no
line from it. `.orkestrel/` was not touched.

Candidate-bearing paths were `README.md`; `guides/probe.md`; `src/core/{constants,errors,helpers,shapers,types,validators}.ts`;
`src/server/{Overlay,Probe,ProbeServer,helpers,types}.ts`; every stage implementation file;
`tests/{config,distribution,guides,setupPolicy}.test.ts` and `tests/setupPolicy.ts`;
`tests/src/bin/main.test.ts`; `tests/src/core/{errors,helpers,validators}.test.ts`;
`tests/src/server/{Probe,ProbeServer,helpers}.test.ts`; and every stage test file.

Ruled a violation and corrected:

- **Listener tallies.** `guides/probe.md` § Lifecycle "the five listeners `start` attached — three
  on standard input and one on each signal" and "the three that forward into that stream";
  `src/server/ProbeServer.ts` "the three that forward into it" and "exactly the three listeners
  `start` attached"; `tests/src/server/ProbeServer.test.ts` "the three listeners it attached ... the
  other two are back at it". Each now names the `data`, `close`, and `error` forwarders and the
  `SIGINT` and `SIGTERM` handlers.
- **A claim named by position.** `README.md` and `guides/probe.md` § Prerequisites, § Lifecycle.
  "before the first claim" and "rather than the first claim" now read "before you make a claim" and
  "rather than a claim".
- **A call named by position.** `src/server/types.ts` "every call after the first returns the first
  call's promise" now names what each call joins.
- **A line named by position.** `guides/probe.md` "appends the marker as its last line" now says
  probe closes the file with the marker; `src/core/helpers.ts` "the last line" became "the closing
  line".
- **A list item named by position.** `tests/src/server/ProbeServer.test.ts` "The fourth flow case"
  now names what the case proves.
- **A receipt-field inventory numbered in prose.** `guides/probe.md` § Reading a receipt is now a
  grammar line with a named part per field, and the parsing rule names the `vitest` field as the
  boundary instead of indices 0 through 6.
- **A numbered list whose order does not rank.** `guides/probe.md` § Prerequisites is now bulleted.
- **A count I wrote myself.** "Two further limits belong beside those" became "Further limits belong
  beside those"; "the guide's own copy of the two axes" became "the ownership and condition axes".

Ruled permitted, by the sense the ban names rather than by the match:

- Versions, dates, exit codes, durations, and byte and character sizes — `30,000 ms`, `2 s`,
  `2026-08-20`, `32 lowercase hex characters`, `0.0.19`.
- Measurements reported with the run that produced them — `4.1 s to 4.4 s over 4 runs`,
  `0 findings ... and 2 findings`, `2.2 s to 2.3 s ... over 3 runs`, `three orders of magnitude`,
  `Linux 6.18.5 x64 with 4 processors`.
- The declared limit `64` and the arithmetic on it (`the other 63`), which move only when the
  constant moves.
- Relationships over a fixed pair in a scenario — "two claims that differ only in the reason",
  "one commit checked out at two paths", "two runs of one claim", "two spellings of one file".
- An instance in a scenario rather than a position in a list — "a second copy of this package", "a
  second process", "a second inspection", "another signal".
- Format order that names a structural element rather than an index — "the project field goes last",
  "renders the value first as `[claimant]`", "creates that file's directory first".
- `@orkestrel/mcp` 0.0.19 "attaches three anonymous listeners": a measurement pinned to the version
  it was measured against, unlike this package's own listener set, which moves silently.
- `tests/setupPolicy.ts`, `tests/policy.test.ts`, and `tests/config.test.ts` carry candidate hits and
  are vendored by `@orkestrel/scaffold`, so they were not touched.

## Acceptance criteria

Run in the brief's order. Every command was run on this host, natively.

1. **Each D4 behaviour reproduced before its guide sentence changed.** Closed. Commands and output
   under **D4** above; the probe ran before any guide edit and was deleted afterwards.
2. **The repaired gate fails against a planted untranslated failure and passes without it.** Closed.
   Both readings and the exact plant-and-remove steps under **D3** above.
3. **`rg -n -i "origin: 'code'|FindingOrigin|FINDING_ORIGINS" guides/ README.md src/ tests/`.**
   Closed.

   ```text
   exit 1
   matches 0
   ```

   The nonzero status is ripgrep's no-match result.
4. **`npm run format` then `npm run format:check`.**

   ```text
   npm run format
   exit 0
   Finished in 3748ms on 148 files using 4 threads.

   npm run format:check
   exit 0
   All matched files use the correct format.
   Finished in 3765ms on 148 files using 4 threads.
   ```
5. **`npm run lint:check`.**

   ```text
   exit 0
   errors 0
   warnings 0
   ```
6. **`npm run check`.**

   ```text
   exit 0
   tsc --noEmit --project tsconfig.json
   tsc --noEmit -p configs/src/tsconfig.core.json
   tsc --noEmit -p configs/src/tsconfig.server.json
   tsc --noEmit -p configs/src/tsconfig.bin.json
   ```
7. **`rm -rf tmp/probe && npm test`.**

   ```text
   exit 0
   src:core, src:server, src:bin   Test Files 11 passed (11)   Tests 168 passed (168)
   policy                          Test Files  1 passed (1)    Tests  86 passed (86)
   config                          Test Files  1 passed (1)    Tests  28 passed (28)
   guides                          Test Files  1 passed (1)    Tests  13 passed (13)
   ```

   `src` moved from 11 files and 166 tests to 11 files and 168 tests: `errors.test.ts` gained the
   untranslated-failure control and the resident-module text check while losing the source sweep.
   `guides` moved from 12 tests, 2 of them failing, to 13 passing, the added one being the failure
   table's parity assertion.
8. **`npm run test:distribution`.**

   ```text
   exit 0
   Test Files  1 passed (1)
        Tests  2 passed (2)
   ```

   Re-run after `npm run build` so the reading is against the current `dist/`; both runs were green.

Also observed, not a criterion: `npm run build` exits 0.

## Deviations and rulings

**The receipt's case condition.** D1 directed changing "no findings of either origin" to "no
findings of any origin". That sentence is false of the code, and a permanent test proves it false.
`computeReceipt` computes `clean` as every case check carrying no `origin: 'claimant'` finding, and
`faulted` separately over `origin: 'instrument'` findings in either phase, so a case carrying a
`workspace` finding still earns a receipt — which is exactly what
`tests/src/core/helpers.test.ts > permits workspace messages outside the claimant failure` asserts.
Writing the prescribed sentence would have defeated the unit's own objective, so I wrote the
condition the code applies and kept D2's merged bullet verbatim. The list now reads: both phases
report one check per stage; the case produced no `claimant` finding at any stage; the control
produced a `claimant` finding at the stage it declared and neither phase produced an `instrument`
finding; every other control stage produced no `claimant` finding. A paragraph beneath states that a
`workspace` finding decides neither condition. Recorded rather than stopped, because the conflict is
between the brief's phrasing and the code, not between the objective and what I found.

**"Every failure this package raises is a `ProbeError`" is still false at a boundary.** D4 told me
to verify rather than assume. Verified, and it fails through an exported pure leaf given a value the
guards would refuse: `computeDigest(workspace, cyclic)` raises a native `RangeError` and
`computeDigest(workspace, { n: 1n })` a native `TypeError`. No claim arriving over the wire can
carry either shape, because `isClaim` refuses both, so this is not reachable through `prove` and I
judged it a prose defect rather than a code defect — and the brief stops the unit on a source
change. The guide now says "Every failure probe raises **while serving a claim** is a `ProbeError`"
and carries a named limit under § Failures with both measured messages and the date. `errors.ts`
TSDoc says the same. If the Orchestrator would rather close it in code, the successor unit is a
containment guard or a documented refusal on those leaves, and it needs a source-owning brief.

**Ancillary decisions I took and carried on from.**

- `tests/src/core/errors.test.ts` now imports `@src/server`. The gate's subject is package-wide
  failure adoption and the escaped class lives in `src/server/helpers.ts`, so the drives cannot stay
  inside core. The brief named this file as the one to repair and both setup modules are off-limits.
- The drive table is declared local to that test file rather than in a setup module.
  `.claude/rules/tests.md` puts a data table in a setup file; `tests/setup.ts` is host-independent
  and cannot hold Node-driven failure paths, `tests/setupServer.ts` is not loaded by the `src:core`
  project, and neither file is owned by this unit. The rows are closures over this one proof's
  scratch fixtures rather than a matrix another test would share.
- § What containment reaches is a new top-level section rather than a bullet inside the
  receipt-limit list, because it states a rule about the whole package and the receipt bullet the
  brief supplied verbatim now points at it.
- The § Failures table lists the `(origin, code)` pairs the package actually raises rather than the
  full product, and `tests/guides.test.ts` pins its columns against `ORIGINS` and
  `PROBE_ERROR_CODES` so the table cannot drift into a value neither tuple declares.

## Nothing left open

No current-scope requirement is deferred, skipped, or left as a TODO. The tree carries only the
files listed under **Files touched**, `tmp/probe` is empty, and no probe or plant remains.
