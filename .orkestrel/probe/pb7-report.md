PB7 complete. All eleven rows ruled on, all nine acceptance criteria met.

## Per row: what I found, what I changed

| Row | Found at baseline `525d3e0` | Outcome |
| --- | --- | --- |
| 33 | **OPEN.** `src/core/types.ts:350` "whose modification times the revalidation sweep reads" and `:379` "`prove` revalidates every workspace file whose modification time moved". `RuntimeStage.#snapshot` hashes SHA-256 over contents and filters through `matchesWorkspaceModule`; only `TypeStage.#version` keys mtime (`src/server/stages/TypeStage.ts:291`). | **Repaired.** `/workspace/probe/src/core/types.ts:357` and `:388-391` now state the sweep and split the two readers by their real keys. |
| 34 | **OPEN.** `src/server/helpers.ts:178` `@returns The project name, or undefined for the root project`. `RuntimeStage.#project` turns `undefined` into an instrument finding; there is no fallback. | **Repaired.** `/workspace/probe/src/server/helpers.ts:199-204`. |
| 35 | **ALREADY CLOSED by PB5.** `/workspace/probe/src/server/Probe.ts:329` reads `if (await this.#recycle(stage)) this.#emitter.emit('expire', claim)` — the event fires only after a replacement was installed, which is exactly what `types.ts:334` and `:348` claim. Not touched. |
| 36 | **OPEN, at one live site, not three.** `src/core/types.ts:295` `elapsed: 337` against `max(case) + max(control) = 513`. The other two named sites do not carry the arithmetic: `src/core/validators.ts:223`'s example has `checks: []` / `control: []`, and `src/core/helpers.ts` has no `elapsed` literal. | **Repaired.** `/workspace/probe/src/core/types.ts:302` is now `elapsed: 549`. |
| 38 | **OPEN.** `src/core/types.ts:158` "…and for a runtime failure". `RuntimeStage.#finding` sets `line` from the stack frame. | **Repaired.** `/workspace/probe/src/core/types.ts:168-170`. |
| 40 | **OPEN.** `src/core/types.ts:161` "against the path the tool reported". All three stages map: type from the compiler's absolute path, lint from the document URI, runtime from the generated specification. | **Repaired.** `/workspace/probe/src/core/types.ts:163-166`. |
| 23 | **OPEN.** `src/core/helpers.ts:12` and `:14` both omit the required `origin`. | **Repaired.** `/workspace/probe/src/core/helpers.ts:11-25` — two typed `Finding` literals, transcribed into a test so `npm run check` compiles them. |
| 46 | **ALREADY CLOSED by S2 (`abad0f6`).** That commit replaced `startsWith('arm-') \|\| includes('.probe-')` with test-owned stems. Current: `/workspace/probe/tests/src/server/Probe.test.ts:491` (`expiry.test.probe-`) and `:858` (`after-destroy.test.probe-`). Not touched. |
| 44 | **OPEN.** Four hand-written copies of the rewrite in `src/server`. | **Repaired.** One exported `normalizePath` at `/workspace/probe/src/server/helpers.ts:27`, consumed by `Overlay.set/text/covers` (`Overlay.ts:43,53,69`), `RuntimeStage.#evict` (`:390`), and the three helper leaves that carried their own copy. |
| 42 | **OPEN, reproduced.** A symlinked workspace returned `path: "../real/tmp/probe/leak.test.probe-2008-8a839e61-….ts"` — an internal revision file, addressed by a path that escapes the workspace. | **Repaired.** `/workspace/probe/src/server/stages/RuntimeStage.ts:600` (`#real`) and `:624-628`; both sides now compare and project through `realpathSync`. |
| 47 | **OPEN.** `src/server/stages/RuntimeStage.ts:45-47` carried 466/498 ms and 206/215 ms with no date. | **Re-taken on this host and dated.** `/workspace/probe/src/server/stages/RuntimeStage.ts:52-55`: two runs of 66 inspections put the recycling inspection at **480 ms and 269 ms** against medians of **156 ms and 155 ms**, so the budget line is now 110 ms to 330 ms above the rest. |
| 21 | **Struck, verified.** `/workspace/probe/package.json:128-130` reads `"node": "^22.12.0 \|\| >=24.0.0"`. No change. |

## Executed assertions now binding each statement

| Statement | Test | Control |
| --- | --- | --- |
| Runtime sweep is content-keyed, not mtime-keyed (row 33) | `RuntimeStage.test.ts:330` `revalidates a dependency whose contents changed under an unchanged modification time` | Replacing the digest with `` `mtime:${statSync(path).mtimeMs}` `` reddens it: `1 failed`. Restored. |
| Type stage keys a disk file on mtime (row 33) | pre-existing `TypeStage.test.ts:53` | — |
| No root-project fallback (row 34) | pre-existing `RuntimeStage.test.ts:635` (`tests/unmapped.test.ts` → instrument finding) plus `helpers.test.ts:120` | — |
| `elapsed` covers both sequential phases (row 36) | `Probe.test.ts:217` `accounts one verdict for the two phases it ran in sequence` — asserts it on a real verdict **and** parses the seven timings out of the `Verdict` `@example` | Reverting the example to `337` reddens it: `AssertionError: expected 337 to be greater than or equal to 513`. Restored. |
| A runtime failure at a frame carries `line` (row 38) | `RuntimeStage.test.ts:79-88` (`line: expect.any(Number)`) | — |
| Each stage maps its tool's spelling back (row 40) | runtime `RuntimeStage.test.ts:79`; lint `LintStage.test.ts:192`; type `TypeStage.test.ts:103` | — |
| Both documented `formatFinding` calls compile and render (row 23) | `tests/src/core/helpers.test.ts:25` — typed `Finding` literals, so `npm run check` is the compile proof | — |
| One shared `normalizePath` (row 44) | `helpers.test.ts:110`, `helpers.test.ts:120`, `Overlay.test.ts:32` | — |
| Symlinked workspace names the declared test path (row 42) | `RuntimeStage.test.ts:94` | **Red before the fix**, on the exact command below. |

Row 42 failing-first evidence, `npx vitest run --config vite.config.ts --no-cache --project src:server -t "symbolic link"`:

- before: `Tests 1 failed | 108 skipped` — `- "path": "tmp/probe/symlinked.test.ts"` / `+ "path": "../real/tmp/probe/symlinked.test.probe-5881-….ts"`
- after: `Tests 1 passed | 108 skipped`

## Gates

| Command | Exit |
| --- | --- |
| `npm run format:check` | 0 |
| `npm run lint:check` | 0 |
| `npm run check` | 0 |
| `npm run build` | 0 |
| `npm test` | 0 (134 + 86 + 28 + 9 = 257 passed) |
| `npm run test:distribution` | 0 (2 passed) |

## Scope deviation — I edited one file outside the owned list

`guides/probe.md` is not in the brief's Scope, but the appendix ("Any export you add, rename, or move must keep that gate green") cannot be satisfied without it: `tests/guides.test.ts:144` requires every `Object.keys(server)` name to have a backticked row under `## Surface`, and `normalizePath` is barrelled through `export * from './helpers.js'`. Two lines, both minimal, both revertible:

```diff
+| `normalizePath`          | function | `(path: string) => string`      | Rewrites a path into the forward-slash spelling this package compares and reports paths in.                  |
-| `inferTestProject`       | ... | ... or `undefined` for the root project.     |
+| `inferTestProject`       | ... | ... or `undefined` when none collects it.    |
```

The second is row 34's own sentence, repeated in the guide; leaving it would have shipped the defect the unit exists to remove.

## Shared-file patch, report-only

`src/server/stages/LintStage.ts` is off-limits and holds the one remaining hand-written copy of the rewrite (`src/server/stages/LintStage.ts:194`). Criterion 3 still holds — exactly one `normalizePath` declaration exists — but the consolidation is not complete until this lands:

```diff
--- a/src/server/stages/LintStage.ts
+++ b/src/server/stages/LintStage.ts
@@
 import {
 	inferDocumentLanguage,
 	messageFromUnknown,
+	normalizePath,
 	parseContentLength,
 	resolveWorkspaceBinary,
 	resolveWorkspaceFile,
 } from '../helpers.js'
@@ -194,1 +195,1 @@
-			this.#documents.set(uri, source.path.replaceAll('\\', '/'))
+			this.#documents.set(uri, normalizePath(source.path))
```

## Observations, not repairs

- `src/core/validators.ts` is named in the carry check's close condition for row 36 but is not in the owned list. It needs no edit: its `isVerdict` example carries empty check arrays, so it states no arithmetic that can be wrong.
- No test binds the type stage's fileless-diagnostic finding (`TypeStage.ts:320` reports `origin: 'instrument'` against the project). I drafted a sentence for it in the `Finding` remarks and removed it rather than ship an unbound claim; `TypeStage.ts` is off-limits, and the proof would need a deterministic fileless diagnostic. Recorded against the type-stage capability.

## Files changed

- `/workspace/probe/src/core/types.ts` — rows 33, 36, 38, 40: `Finding` remarks split into `origin`, `path`, and `line`; `Verdict` example `elapsed` raised above the two-phase floor; `ProbeOptions` and `ProbeInterface` restated to the implemented sweep.
- `/workspace/probe/src/core/helpers.ts` — row 23: `formatFinding` example rewritten as two typed `Finding` literals carrying `origin`.
- `/workspace/probe/src/server/helpers.ts` — rows 34, 44: `normalizePath` added and exported; four leaves routed through it; `inferTestProject` `@returns` and `@remarks` corrected.
- `/workspace/probe/src/server/Overlay.ts` — row 44: `set`, `text`, and `covers` consume the shared helper.
- `/workspace/probe/src/server/stages/RuntimeStage.ts` — rows 42, 44, 47: `#real` added and stack remapping resolved through it; eviction key routed through `normalizePath`; the recycling-cost figure re-measured and dated.
- `/workspace/probe/guides/probe.md` — the scope deviation above.
- `/workspace/probe/tests/src/core/helpers.test.ts`, `/workspace/probe/tests/src/server/Probe.test.ts`, `/workspace/probe/tests/src/server/Overlay.test.ts`, `/workspace/probe/tests/src/server/helpers.test.ts`, `/workspace/probe/tests/src/server/index.test.ts`, `/workspace/probe/tests/src/server/stages/RuntimeStage.test.ts` — the bindings tabulated above, plus the barrel export list.

Nothing committed. Rollback point `525d3e0` is intact; `tmp/` is clean.