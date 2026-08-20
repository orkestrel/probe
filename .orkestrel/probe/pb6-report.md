## Per numbered row

**P9 — no documented claim can earn a receipt (BLOCKER). Closed.** The guide's flagship claim earns a receipt against this workspace, and `tests/guides.test.ts` runs the literal and asserts the token. The same literal is pinned in three places — `guides/probe.md`, the `Claim` `@example` in `/workspace/probe/src/core/types.ts`, and the test — and a parity assertion extracts all three and refuses any difference, so the runnable claim and the documented claim cannot drift apart.

**P13 — two doc-truth defects. Closed.** `src/core/types.ts` no longer declares a control byte-identical to its case; the `Claim` remarks now state the rule ("a control byte-identical to its case cannot break"). `src/core/shapers.ts:69` now names `isClaim` as the guard the tool applies, and holds it to `compileGuard(CLAIM_SHAPE)`'s admitted set rather than claiming the compiled guard runs. `src/core/validators.ts:99` is untouched (`git diff --stat` shows no entry for it). The `Case`, `Control`, and `Source` examples moved to the same runnable form, because a reader copying any of them was getting `test is not defined`.

**P11 — guide, README, registry metadata, prerequisites. Closed.** `guides/probe.md` (505 lines) states the prerequisites, the receipt's field order and remainder rule, its verification method, its lack of a key, the boundary it does not vouch for, the TypeScript-version digest movement, and the privilege statement. `README.md` states what a probe proves, the binary, the MCP tool, and one runnable claim. `package.json` carries a real description and seven keywords. `guides/README.md` indexes the new guide.

**P20 — `Overlay`. Interned.** See the ruling section.

**P21 — barrelled server helpers with no `@example`. Closed.** Eleven were missing; all fifteen now carry one, and `tests/src/server/helpers.test.ts` executes every one of the eleven verbatim in a single named test. `tests/guides.test.ts` sweeps both barrels' modules and fails on any exported declaration whose comment carries no `@example`, skipping only the parity `INTERNAL` names.

**P22 — the revision-file cleanup comment. Closed, and the correction is not the one the brief expected.** The glob claim is false in *both* directions: the generated name is `<stem>.probe-<pid>-<uuid><ext>`, so a specification generated from `greeting.test.ts` is `greeting.test.probe-….ts` and ends in `.ts`, not `.test.ts`. **No** Vitest project collects it. Measured: `vitest list --project src:core` reports 0 matches for a planted orphan, while `tsc --noEmit -p tsconfig.json` reports its 2 diagnostics and `oxlint --deny-warnings .` reports it. Both comments in `src/server/stages/RuntimeStage.ts` now name `check` and `lint:check` as the gates it enters and drop the glob claim.

## The claim that earns a receipt

```ts
const claim: Claim = {
	project: 'configs/src/tsconfig.core.json',
	case: {
		files: [{ path: 'src/core/greeting.ts', text: "export const GREETING = 'hi'\n" }],
		test: {
			path: 'tmp/probe/greeting.test.ts',
			text: "import { expect, test } from 'vitest'\nimport { GREETING } from '../../src/core/greeting.js'\ntest('greets', () => expect(GREETING).toBe('hi'))\n",
		},
	},
	control: {
		files: [{ path: 'src/core/greeting.ts', text: "export const GREETING: number = 'hi'\n" }],
		test: {
			path: 'tmp/probe/greeting.test.ts',
			text: "import { expect, test } from 'vitest'\nimport { GREETING } from '../../src/core/greeting.js'\ntest('greets', () => expect(GREETING).toBe('hi'))\n",
		},
		stage: 'type',
		reason: 'a string literal assigned to a number must not compile',
	},
}
```

Its receipt, returned by the built `dist/bin/main.js` driven over stdio by a foreign JSON-RPC client on 2026-08-20, and identically by `Probe.prove` in process:

```
probe:0806fb30f428edb8ea85adfb4b355441:type:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8
```

The test executes the claim and asserts fields 0–2 against the documented literals, the three tool fields against versions read independently from the installed manifests (not from `verdict.toolchain`, which would agree with itself), and the field-6 remainder against the documented path and a 32-hex digest.

## The Overlay ruling

**`Overlay` leaves the barrel and is named, with `OverlayInterface`, in the parity `INTERNAL` list in `tests/guides.test.ts`.** The alternative — a stage constructor accepting an `OverlayInterface` — reintroduces the defect the design exists to prevent: `TypeStage.inspect` and `RuntimeStage.inspect` each construct `new Overlay()` per inspection, and the fresh `revision` is what forces the resident language service and the resident Vitest runner to re-read a path the previous inspection held. One injected instance is reused across inspections and reports a stale answer as a fresh one. `.claude/rules/architecture.md` also fixes the disposal: a class no consumer can hand to anything is interned, and its barrel row obliges an `@example` it cannot honestly carry — so `OverlayInterface`'s `@example`, which constructed the now-unexported class, is gone and replaced by a sentence naming the implementation and why there is no example. The class keeps its own example; its test reaches it at `../../../src/server/Overlay.js`, since the alias resolves the barrel only. `OverlayInterface` stays exported as a type, because a selective barrel row is forbidden; the `INTERNAL` list is what records it as outside the documented surface, and the parity gate fails if `Overlay` returns to the barrel.

## Files written

| File | Change |
| --- | --- |
| `/workspace/probe/guides/probe.md` | New, 505 lines. The consumer guide. |
| `/workspace/probe/tests/guides.test.ts` | New, 267 lines. Both parity directions, the `@example` sweep, the guard-name proof, the metadata proof, the three-way claim literal pin, the constants, and the executed receipt fence. |
| `/workspace/probe/README.md` | Rewritten: what a probe proves, the binary, the MCP registration, one runnable claim, the privilege statement. |
| `/workspace/probe/guides/README.md` | Index points at `probe.md` instead of the "Not created" placeholder. |
| `/workspace/probe/package.json` | Description, seven keywords, `test:guides` script, `test` chain entry. |
| `/workspace/probe/vite.config.ts` | `guides` project, written by `npx scaffold repair`. |
| `/workspace/probe/src/core/types.ts` | P13a; `Source`/`Case`/`Control`/`Claim` examples made runnable; the control-difference rule. |
| `/workspace/probe/src/core/shapers.ts` | P13b. |
| `/workspace/probe/src/server/helpers.ts` | Eleven `@example` blocks. |
| `/workspace/probe/src/server/index.ts` | `Overlay` row removed. |
| `/workspace/probe/src/server/types.ts` | `OverlayInterface` example replaced by the interning note. |
| `/workspace/probe/src/server/stages/RuntimeStage.ts` | P22, two comments. |
| `/workspace/probe/tests/src/server/{Overlay,index,helpers}.test.ts`, `tests/src/server/stages/RuntimeStage.test.ts` | Import repoint, barrel population, eleven example transcriptions, the glob assertion. |
| `/workspace/probe/PROBE.md` | Deleted (staged as `D`; not committed). |

Diffstat over tracked files: 14 files changed, 302 insertions, 41 deletions, plus the two new files and the deletion.

## Red-then-green proofs

| Defect | Command | Before | After |
| --- | --- | --- | --- |
| P9 | `npx vitest run --config vite.config.ts --project probe tmp/probe/pb6-old-claim.test.ts` (the claim documented at `types.ts:93-102`, run verbatim) | 1 failed — `no receipt`; case lint `Test has no assertions`, case runtime `test is not defined`, control type `0 findings` | replaced by the guides fence: 9 passed, receipt returned |
| P13a, metadata, P20, P21, P13b | `npm run test:guides` | `5 failed \| 4 passed (9)` | `9 passed (9)` |
| P20 | same run, `keeps every interned symbol out of the barrels and out of the guide` | `expected [ 'resolveWorkspaceFile', …(21) ] to not include 'Overlay'` | passes |
| P21 | same run, `carries a documented example for every barrelled export` | `expected [ …(11) ] to strictly equal []` | passes; `tests/src/server/helpers.test.ts` 18 → 19 passed |
| P22 | `npx vitest run --project src:server tests/src/server/stages/RuntimeStage.test.ts -t "workbench project collects"` (the old comment's claim asserted as a test) | `1 failed` — `expected false to be true` | the corrected assertion `writes a generated specification no Vitest project collects` passes; whole file 28 passed |

The two throwaway probe files under `tmp/probe/` are deleted; `tmp/probe` is empty.

## Validation

| Gate | Bare exit code |
| --- | --- |
| `npm run format:check` | 0 |
| `npm run lint:check` | 0 |
| `npm run check` | 0 |
| `npm run build` | 0 |
| `npm test` | 0 — 11+1+1+1 files, 128 + 86 + 28 + 9 tests passed |
| `npm run test:distribution` | 0 — 2 passed |
| `npx scaffold audit` | 0 — `0 of 127 planned paths drifted from the plan` |

`npx scaffold repair` wrote exactly one file: `vite.config.ts`, adding the `guides` project factory and its entry in `projects`. Nothing else moved; the alignment took.

## What I could not run

Nothing. Every measurement in the guide was taken on this host during this unit. `.oxlintignore` behaviour in language-server mode is the one claim I dropped rather than state: `tmp` appears only in `.gitignore` here, so I could attribute the exclusion to `.gitignore` but could not separate `.oxlintignore` without editing a file I do not own. Settling command: add a path to `.oxlintignore` that `.gitignore` does not carry, then `LintStage.inspect` a candidate at it.

## Deviation

No stop condition fired. Three factual corrections to the brief's inputs, each measured:

1. **The grade's second prerequisite is false.** "That project including `tmp/probe/**/*.test.ts`" is not what binds. The runtime stage selects the project by **name** and builds an explicit specification with `project.createSpecification(file, …)`, so the include glob never collects it — proven twice: the specification's own name does not match that glob, and the full `test:guides` suite passes with `tmp/probe/` emptied of every `.ts` file. The guide states the two conditions that do bind (the project is composed in the root configuration rather than declared as a path string; the declared test path's directory exists), which makes the list five rather than four. Shipping the grade's phrasing would have shipped a false prerequisite.
2. **The instruments record over-states the `_meta` requirement.** Two reserved keys are required, not three: `protocolVersion` and `clientCapabilities`. `clientInfo` is optional. Measured against the shipped binary — version-only and version-plus-`clientInfo` are both refused `-32602`; version-plus-`clientCapabilities` answers `tools/list` — and confirmed at `parseRequestContext` in `@orkestrel/mcp`. An unknown revision string is refused differently, `-32022` with a `data.supported` list.
3. **P21's count.** Eleven of **fifteen** barrelled server helpers lacked an `@example`, not eleven of twelve. The eleven names match the row exactly.

Files edited that appear in neither the brief's Owned nor its Off-limits list, each required by a criterion: `src/server/stages/RuntimeStage.ts` (P22's subject), `guides/README.md` (the index `.claude/rules/documentation.md` requires), `tests/src/server/stages/RuntimeStage.test.ts` and `tests/src/server/Overlay.test.ts` (matching files under `tests/src/`).

## Decisions

- **The extraction helpers live at module scope in `tests/guides.test.ts`.** Moving them to a setup module would create `tests/setup.test.ts`, which sets scaffold's `setup` structural fact and pulls in another project and another script — scope this unit does not own. They serve one file, and the policy sweep does not reach test files.
- **The receipt fence carries `{ timeout: 300_000 }` rather than a `testTimeout` in the generated `guides` project.** `vite.config.ts` stays exactly what `repair` wrote.
- **The guide states no measurement copied from `PROBE.md`.** Every number in it is either read from shipped source (the 30,000 ms `deadline` default, the 64-specification recycle bound) or measured on 2026-08-20 with its host recorded: boot 4.1–4.4 s over 4 runs, one warm `prove` 437–495 ms over 4 runs, and the lint-exclusion reading of 0 findings against 2.
- **What I judged not worth carrying out of `PROBE.md`**, beyond the four superseded sections and the whole undated measurement corpus: the "receipt must not be described as certifying runtime evidence over source that stage never ran" caution, which the P5 repair superseded — the runtime stage now serves candidates from memory, proven by the flagship test importing one; the single-executable rejection, the socket-versus-MCP transport comparison, and the "how simple is this to implement" material, all design-round narrative about options that no longer exist; and the withdrawn orphan-reachability claims, which belong to the campaign record.
- **Two findings outside this unit's scope**, recorded against the capabilities that own them. First, a host killed mid-boot leaves `tmp/probe/arm-<uuid>.ts` dependency files behind: `Probe.#boot` removes them in a `finally` that a `SIGKILL` never reaches, and `RuntimeStage.#sweep` matches only the `.probe-<pid>-<uuid>` marker, so nothing collects them. Reproduced twice at 03:33 by killing the stdio client's child; a completed run leaves none. Owner: P16. Second, `src/server/stages/RuntimeStage.ts:41-46` carries an undated latency measurement in a source comment — the same defect class the `PROBE.md` ruling exists to stop, in a file this unit's rows do not reach.