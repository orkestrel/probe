# PBFIX13 report — the shape-and-prose readiness rows

Every row BR9 through BR19 is closed. All ordered acceptance criteria pass. Baseline `8749d69`,
clean at dispatch; the tree is now dirty with the 24 files listed in the diffstat.

## BR9 — the `Source` collision

`Source` is renamed to `Draft`, `isSource` to `isDraft`, and `SOURCE_SHAPE` to `DRAFT_SHAPE`.

**Name decision.** The concept is a file as the claimant proposes it: a path and its text, which
need not exist on disk. Candidates weighed, with the reason each lost or won:

| Candidate   | Ruling                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------- |
| `Draft`     | Chosen. Short common English, states the proposed-not-committed property the TSDoc already gave.  |
| `Candidate` | Refused. The guide reserves "candidate" for `Case.files` alone, and `Case.test` is one too.       |
| `Exhibit`   | Refused. A legal metaphor; `AGENTS.md` § Writing bans metaphor and asks what the thing is.        |
| `Listing`   | Refused. Collides in sense with the directory listing `OverlayInterface.covers` documents.        |
| `File`      | Refused. Shadows the platform global declared by the WebWorker lib and by Node.                   |
| `Artifact`  | Refused. Collides in the fleet sweep.                                                             |
| `Specimen`  | Refused. Longer and rarer than `Draft` for the same meaning.                                      |

**Fleet collision sweep.** The instrument is every `export declare` top-level declaration in every
installed `@orkestrel/*` distribution bundle, plus the one aliased re-export those bundles carry.

```
find node_modules/@orkestrel -name '*.d.ts' -path '*dist*' -print0 | xargs -0 rg -o --no-filename -N \
  '^export declare (?:interface|type|class|const|function|abstract class) ([A-Za-z_$][A-Za-z0-9_$]*)' -r '$1' \
  | sort -u
```

That reads 34 bundles and yields 1,657 names. Coverage: top-level exported declarations only; it
does not read a package's unexported internals, and it does not read a package the workspace has not
installed.

Controls, run before the sweep was trusted: `Source` is present (the positive control, and the
finding BR9 rests on), `Artifact` is present (a second positive), and `Zzyzx` is absent. Results:

```
Draft: clear        isDraft: clear        DRAFT_SHAPE: clear
describeUnknown: clear                    PROBE_PARTIES: clear
Source: COLLIDES    Artifact: COLLIDES
```

No fleet name contains `draft` in any case. No TypeScript lib declares a global `Draft`.

**Residue sweep after landing**, over `src`, `tests`, `configs`, `guides/probe.md`, `README.md`:

```
rg -n 'isSource'      → NO HIT
rg -n 'SOURCE_SHAPE'  → NO HIT
rg -n '\bSource\b'    → guides/probe.md:7  (the fleet guide-header convention "Source: [`src/core`]")
                        tests/setupPolicy.ts:236  (vendored; the English word in a TSDoc line)
```

Both remaining hits are the English word, and neither names this package's type.

Files: `src/core/types.ts:31` declares `Draft`; `src/core/validators.ts:60` declares `isDraft`;
`src/core/shapers.ts:20` declares `DRAFT_SHAPE`. Consumers moved with it in `src/core/helpers.ts`,
`src/server/types.ts`, `src/server/ProbeServer.ts`, `src/server/Overlay.ts`,
`src/server/stages/TypeStage.ts`, `src/server/stages/LintStage.ts`,
`src/server/stages/RuntimeStage.ts`, and the prose term "candidate sources" became "candidate
drafts" throughout `src/` and `guides/probe.md`.

## BR10 — `Verdict.checks` becomes `Verdict.case`

`src/core/types.ts:334` declares `readonly case: readonly Check[]`. The wire shape follows the type,
so a `tools/call` reply's verdict record carries `case`.

Swept: the declaration and its remarks (`src/core/types.ts`), `isVerdict`
(`src/core/validators.ts:261`), `computeReceipt` and `formatVerdict` (`src/core/helpers.ts:94`,
`:145`, `:148`, `:152`), `Probe.prove`'s assembly (`src/server/Probe.ts:161`, `:169` — the local
binding is now `subject` and the member is `case: subject`), the guide's `Verdict` row
(`guides/probe.md:45`), and the proofs in `tests/src/core/helpers.test.ts`,
`tests/src/core/validators.test.ts`, `tests/src/server/Probe.test.ts`,
`tests/src/server/stages/RuntimeStage.test.ts`.

Residue sweep: `rg -n '[A-Za-z_$)\]]\.checks\b'` and `rg -n '^\s*checks[,:]'` both return no hit.
The `checks` occurrences that remain are the English verb ("the type stage checks"), the plural of
`Check`, and local array bindings.

## BR11 — `messageFromUnknown` becomes `describeUnknown`

`src/server/helpers.ts:462` declares `describeUnknown`. Consumers moved in `src/server/Probe.ts`,
`src/server/stages/LintStage.ts` (5 call sites), `src/server/stages/RuntimeStage.ts` (5 call
sites), the guide's server-helper row, and `tests/src/server/helpers.test.ts`. Import lists were
re-sorted where the rename moved a member out of order.

Residue sweep: `rg -n 'messageFromUnknown'` returns no hit.

## Rename proof: red then green

The three renames are one typecheck-shaped defect, so the type move is the red and the consumer
sweep is the green. Both readings are from the same command.

- After the types moved and before any consumer followed:
  `npm run check` → **73 `error TS` lines** (the root project short-circuits the chain, so the count
  is that project's). First lines included
  `src/core/errors.ts(3,10): error TS2305: Module '"./constants.js"' has no exported member 'PARTIES'.`,
  `src/core/helpers.ts(94,14): error TS2339: Property 'checks' does not exist on type 'Verdict'.`,
  and `src/core/validators.ts(10,2): error TS2305: Module '"./types.js"' has no exported member 'Source'.`
- After every consumer followed: `npm run check` → **0 `error TS` lines**, exit 0, all four scoped
  projects run.

## BR12 — banned senses, per hit

| Hit                                                      | Sense              | Ruling                                                                          |
| -------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------- |
| `src/core/types.ts` `arm` event remark                   | temporal `now`     | Fixed → "the instrument has begun answering calls".                             |
| `src/core/types.ts` warm-service remark                  | temporal `now`     | Fixed → "judged as it stands on disk".                                          |
| `src/server/helpers.ts` `captureListeners` `@returns`    | temporal `now`     | Fixed → "at the moment of the call".                                            |
| `src/server/stages/RuntimeStage.ts:380`                  | temporal `now`     | Fixed → "one a live host still holds". Not in the row's list; same sweep, `src/`. |
| `performance.now()` throughout                           | code identifier    | Permitted. The substitution table exempts a literal identifier.                 |
| `guides/probe.md` `arm` event sentence                   | temporal `once`    | Fixed → "fires after those controls have reported red".                         |
| `guides/probe.md` "read once per stage"                  | one time           | Permitted. Not the `after` sense.                                               |
| `guides/probe.md` "ends the process at once"             | immediately        | Permitted. Not the `after` sense.                                               |
| `src/server/Probe.ts:47` "never serves two claims at once" | simultaneously   | Permitted. Not the `after` sense.                                               |
| `guides/probe.md` § Cost opener                          | positional `below` | Fixed → "The following measurements".                                           |
| `src/server/Probe.ts:232`                                | positional `below` | Fixed → "The dependencies that follow".                                         |
| `src/server/Probe.ts:431`                                | positional `below` | Fixed → "the replacement that follows".                                         |
| `src/server/stages/TypeStage.ts:111`                     | positional `below` | Fixed → "the clear that follows".                                               |
| `src/server/stages/RuntimeStage.ts:721`                  | positional `below` | Fixed → "the mapping that follows".                                             |
| `src/server/stages/RuntimeStage.ts:64` "330 ms above"    | comparative        | Kept, as the row directs.                                                       |
| `tests/src/bin/main.test.ts:17` "far above that"         | comparative        | Kept. Same reason.                                                              |
| `src/server/types.ts` `StageInterface.destroy`           | `guarantees`+`both`| Fixed. See the following entry.                                                 |

The `destroy` sentence now reads: "A coordinator replaces a stage whose worker no longer returns
because teardown neither waits for an inspection nor waits past that deadline." The two checkable
properties are named and `both` is gone.

## BR13 — the reply shape

`guides/probe.md` § Registering the server gains two paragraphs in the section's own voice. The
first states that a successful `tools/call` answers with one `content` entry of `type: 'text'`
carrying what `formatVerdict` rendered, that the closing line is the receipt line spelled
`receipt <token>` or `no receipt`, that no wire field carries `verdict.id`, `verdict.digest`, or a
per-stage `elapsed` as data, and that a caller needing the record holds a `Probe` in process.

The second records the structured-content decision as deferred, in one sentence plus its reason:
the server sends no `structuredContent`, publishing the `Verdict` as structured content fixes a
second wire shape the package then owes compatibility to, and no consumer needs one. This
repository keeps no `ROADMAP.md`, and its declared-gap prose already lives in this guide
(`guides/probe.md`, the `StageInterface.progress` paragraph reading "has no executed proof"), so
the deferral is recorded there rather than in a file the repository does not have.

The claim is not prose-only. The driven-client proof added for BR14 asserts
`typeof outcome.value === 'string'` and that the last line matches `/^receipt probe:/`.

## BR14 — the driven client

**Path taken: `@orkestrel/mcp` can drive a child stdio server, so the real-client proof is added.**

Reading:
`rg -o '^export declare (?:interface|type|class|const|function|abstract class) ([A-Za-z_$][A-Za-z0-9_$]*)' node_modules/@orkestrel/mcp/dist/src/server/index.d.ts`
lists `StdioClientTransport`, `StdioClientTransportOptions`, and `createStdioClientTransport`. The
declaration's own remarks state it "spawns and drives a CHILD PROCESS MCP server over
newline-delimited JSON-RPC on `stdin`/`stdout`" and pairs with `createMCPClient` from the core
entry. `@orkestrel/mcp` is a runtime dependency of this package (`package.json` `dependencies`,
`^0.0.19`).

Before writing the test I ran the round trip as a throwaway host script against the built entry.
It reported `connected version= 2025-11-25`, `tools= [ 'prove' ]`, `resultType= complete`,
`typeof value= string`, and a closing line of
`receipt probe:a40605e652ce52071d97acd27364bfd3:type:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8`.

The landed proof is `tests/src/bin/main.test.ts`, the test named "answers a driven third-party
client with one text block". It builds the client over `createStdioClientTransport({ command:
process.execPath, args: [BUILT_ENTRY] })`, connects, asserts `connected`, asserts a negotiated
`version`, asserts the tool list is exactly `['prove']`, calls `prove`, and asserts the complete
arm, the string value, the `probe ` opening, and the `receipt probe:` closing line. The client
timeout is set to 300,000 ms because the first call waits on arming and the client's own default is
30,000 ms.

Scoped run: `npx vitest run --project src:bin -t 'driven third-party client'` → 1 passed,
9 skipped, 4.72 s. Whole project: `npm run test:src:bin` → 10 passed, 30.17 s.

The guide names the client in § Registering the server and states the honest limit: no other
third-party client has been driven, so a claim about another one is untested, and the transport
facts stated earlier came from this repository's own hand-written line client. The § Tests row for
`main.test.ts` names both clients.

Note that the proof drives `dist/bin/main.js`, so `npm run build` must have run against the current
source. I rebuilt before running it; `dist/` is untracked and does not appear in `git status`.

## BR15 — the bin config comment

`configs/src/vite.bin.config.ts:4` now opens "The `probe` executable build". I also replaced the
`via` on line 5 with `through` in the same comment, because the substitution table bans it and I was
rewriting that sentence.

`rg -n "scaffold" configs/src/vite.bin.config.ts` → no hit.

## BR16 — the `deadline` default

`src/core/types.ts:393` documents `deadline` as "Default: 30,000 ms." The implementation applies
`options?.deadline ?? 30_000` at `src/server/Probe.ts:82`, and the guide's `ProbeOptions` row
already published the same figure.

## BR17 — the frozen list and the qualifier

`src/core/constants.ts:14` is now `export const PROBE_STAGES = Object.freeze([...] as const)` and
`src/core/types.ts:16` is `export type Stage = (typeof PROBE_STAGES)[number]`. That reverses the
import edge: `constants.ts` no longer imports `Stage` from `types.ts`, and `types.ts` type-imports
`PROBE_STAGES` beside `PROBE_ERROR_CODES` and `PROBE_PARTIES`. A stage the list omits is now a
stage no union member names, so `isStage` cannot refuse one silently.

Qualifier settled in the qualifying direction, which is the one `.claude/rules/names.md` fixes for a
constant (`{QUALIFIER}_{NOUN}`): `PARTIES` becomes `PROBE_PARTIES`, joining `PROBE_STAGES` and
`PROBE_ERROR_CODES`. `RECEIPT_PREFIX` and `RECEIPT_SEPARATOR` keep their own `RECEIPT` qualifier;
they name a different noun domain and were already in the fixed form.

Consumers updated: `src/core/types.ts` (`Party`), `src/core/errors.ts` (import, the `isProbeError`
remark, the guard body), `src/core/validators.ts` (`isParty`), the guide's Constants table, and
`tests/guides.test.ts`.

Residue sweep: `rg -n '\bPARTIES\b'` returns no hit. The word boundary does not fire inside
`PROBE_PARTIES`, so the pattern discriminates; it returned the two `tests/guides.test.ts` hits
before the change.

## BR18 — the example data

**Choice: make the example visibly not the flagship claim, and align one dataset consistently.**

The `Verdict` example carried the flagship claim's candidate path and reason under a digest the
guide's measured receipt contradicts. Aligning it on the measured values instead would have turned a
TSDoc example into a dated measurement that moves on every toolchain bump, in seven places. So the
example now depicts a different claim: the broken issue's path is `src/core/farewell.ts` and the
reason is "a number annotation must reject the string literal beside it". Its digest
`6ca20c3bff623031d3955b9d1a76d71d` and its receipt token are example values that no measured run in
this repository now contradicts.

One toolchain dataset across every example: `{ typescript: '6.0.3', oxlint: '1.79.0', vitest:
'4.1.11' }`. The `Toolchain` example (`src/core/types.ts:223`) and the `isToolchain` example
(`src/core/validators.ts:205`) carried `1.78.0`/`4.1.10` and now carry the same pair the `Verdict`
example, the `computeReceipt` example, and the `RECEIPT_PREFIX`/`RECEIPT_SEPARATOR` examples already
carried. `rg -n "1\.78\.0|4\.1\.10\b" src tests guides/probe.md` returns no hit.

I also aligned the one remaining copy of the retired pair, a `Toolchain` fixture in
`tests/src/core/validators.test.ts:44`. It is test data rather than a documented example, so it sits
just outside the row's wording; leaving it would have kept a second version dataset alive. Recorded
here as my own judgment call.

The guide's measured flagship receipt is untouched: `verdict.digest` is still
`0806fb30f428edb8ea85adfb4b355441`, taken on 2026-08-20, and `tests/guides.test.ts` re-earns it.

## BR19 — the hoisted declarations

`tests/src/server/helpers.test.ts:33` now declares `onExit` and `onExitAgain` at module scope, with
the `Object.defineProperty(onExitAgain, 'name', { value: 'onExit' })` beside them, under a comment
saying why the name is assigned rather than declared.

The name-vs-identity proof is intact and now stated rather than implied: the test asserts
`onExitAgain.name === onExit.name` and `onExitAgain !== onExit` before it attaches either, then
asserts that `releaseListeners` leaves exactly `[onExit]`. Scoped run: the `src:server` project
passes 135 tests.

## Shared and off-limits files

Two off-limits files carry an assertion a rename broke, which the brief's exception covers. Each
assertion moved with the rename and nothing else in the file changed.

- `tests/guides.test.ts:332` and `:347` — `core.PARTIES` → `core.PROBE_PARTIES`. Without this the
  `guides` project fails on an undefined export.
- `tests/distribution.test.ts:161` and `:187` — `verdict.checks.length !== 3` →
  `verdict.case.length !== 3`, inside the generated consumer scripts. Without this the packed-package
  proof reads `undefined.length` and throws.

One unowned file carries a BR12-class hit I did not edit. Exact patch for
`configs/src/vite.server.config.ts`, lines 4 through 8:

```diff
 // vite-plugin-dts rolls this face into one declaration, and the roll-up reaches
 // src/core through a relative source path the tarball does not carry. The rewrite
-// below externalizes core through the package's own published root export, on the
-// final roll-up only.
+// that follows externalizes core through the package's own published root export,
+// on the final roll-up only.
```

## Observations, not closed here

- **Banned-sense hits outside BR12's enumeration, in test files.** The row enumerated `src/` and the
  guide, and I kept to that population. The remaining positional `above`/`below` comments sit at
  `tests/src/core/errors.test.ts:47`, `:165`, `:285`; `tests/src/server/ProbeServer.test.ts:8`,
  `:153`, `:215`; `tests/src/server/Probe.test.ts:18`, `:248`, `:1244`;
  `tests/src/server/stages/RuntimeStage.test.ts:297`; `tests/src/server/stages/TypeStage.test.ts:457`,
  `:490`; `tests/src/server/stages/LintStage.test.ts:323`, `:350`, `:508`, `:513`, `:718`. Several
  are comparative and stay; the rest are positional. They belong to a successor sweep against BR12.
- **A TSDoc remark names a binding that does not exist.** `src/core/helpers.ts:113` says "`strayed`
  reads the control entries a verdict carries" while the binding at `:154` is `stayed`. It predates
  this unit and no row names it. Left as it stands.
- **My own claim to flag.** The `Draft` collision sweep proves nothing about a package the workspace
  has not installed and nothing about an unexported internal name. If the fleet standard is meant to
  reach the whole registry rather than the declared dependency set, this sweep is narrower than that
  standard.

## Deviation state

No deviation. Every row closed against its prescription; the two judgment calls the deviation
contract leaves to me (the BR9 name and the BR18 direction) are recorded earlier with their reasons.

## Acceptance criteria

| # | Criterion                                             | Result                                                              |
| - | ----------------------------------------------------- | ------------------------------------------------------------------- |
| 1 | `npm run lint:check` exits 0                          | Pass. Oxlint clean, no warnings.                                    |
| 2 | `npm run check` exits 0                               | Pass. 0 `error TS` lines across all four scoped projects.           |
| 3 | `npm run format:check` exits 0                        | Pass, after `npm run format` converged 2 files.                     |
| 4 | Residue sweeps return no hit                          | Pass. `isSource`, `SOURCE_SHAPE`, `messageFromUnknown`, `PARTIES`, and `.checks` as a member all return no hit. |
| 5 | Fleet collision sweep for the BR9 name                | Pass. `Draft`, `isDraft`, `DRAFT_SHAPE` all clear; controls held.   |
| 6 | `rg -n "scaffold" configs/src/vite.bin.config.ts`     | Pass. No hit.                                                       |
| 7 | `npm run test:guides` exits 0                         | Pass. 13 passed, 5.16 s, including the flagship receipt run.        |
| 8 | Scoped vitest runs over the touched files pass        | Pass. `src:core` 32; `src:server` 135; `src:bin` 10; `policy` 86; `config` 28. |

Observation, not a criterion: I did not take a whole-suite reading. The container carries concurrent
load, so a timing-sensitive suite result taken from inside this unit is not the authoritative one.

## Review evidence

`git status --short`:

```
 M configs/src/vite.bin.config.ts
 M guides/probe.md
 M src/core/constants.ts
 M src/core/errors.ts
 M src/core/helpers.ts
 M src/core/shapers.ts
 M src/core/types.ts
 M src/core/validators.ts
 M src/server/Overlay.ts
 M src/server/Probe.ts
 M src/server/ProbeServer.ts
 M src/server/helpers.ts
 M src/server/stages/LintStage.ts
 M src/server/stages/RuntimeStage.ts
 M src/server/stages/TypeStage.ts
 M src/server/types.ts
 M tests/distribution.test.ts
 M tests/guides.test.ts
 M tests/src/bin/main.test.ts
 M tests/src/core/helpers.test.ts
 M tests/src/core/validators.test.ts
 M tests/src/server/Probe.test.ts
 M tests/src/server/helpers.test.ts
 M tests/src/server/stages/RuntimeStage.test.ts
```

`git diff --stat`:

```
 configs/src/vite.bin.config.ts               |   4 +-
 guides/probe.md                              | 144 +++++++++++++++------------
 src/core/constants.ts                        |  13 ++-
 src/core/errors.ts                           |   6 +-
 src/core/helpers.ts                          |  30 +++---
 src/core/shapers.ts                          |  24 ++---
 src/core/types.ts                            |  72 +++++++-------
 src/core/validators.ts                       |  40 ++++----
 src/server/Overlay.ts                        |   2 +-
 src/server/Probe.ts                          |  14 +--
 src/server/ProbeServer.ts                    |   2 +-
 src/server/helpers.ts                        |  14 +--
 src/server/stages/LintStage.ts               |  30 +++---
 src/server/stages/RuntimeStage.ts            |  24 ++---
 src/server/stages/TypeStage.ts               |  32 +++---
 src/server/types.ts                          |  14 +--
 tests/distribution.test.ts                   |   4 +-
 tests/guides.test.ts                         |   4 +-
 tests/src/bin/main.test.ts                   |  60 +++++++++++
 tests/src/core/helpers.test.ts               |  54 +++++-----
 tests/src/core/validators.test.ts            |  64 ++++++------
 tests/src/server/Probe.test.ts               |  46 ++++-----
 tests/src/server/helpers.test.ts             |  27 +++--
 tests/src/server/stages/RuntimeStage.test.ts |   6 +-
 24 files changed, 409 insertions(+), 321 deletions(-)
```

The guide's line count moves further than its prose does: the formatter re-widened every Surface
table column after the renames changed the widest cell.
