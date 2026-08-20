All gates green on the final tree. Here is the report.

## What changed, per ruling section

**§1 Contract (`src/core/types.ts`)** — added `Project { path, digest }` beside `Toolchain`; `Verdict` gained required `digest` and `project` in the ruling's member order; the `Verdict` `@example` now carries a real UUID `id`, both new members, and a seven-field receipt.

**§1 Guards (`src/core/validators.ts`)** — added `isProject` (`isNonEmptyString` on both members); `isVerdict` gained `digest: isString` and `project: isProject`.

**§1 Digest leaves (`src/server/helpers.ts`)** — added exported `normalizeValue(workspace, value)` and `computeDigest(workspace, value)`. `normalizeValue` uses `isArray`/`isRecord` from `@orkestrel/contract` rather than `Array.isArray`, which narrows `unknown` to `any[]`.

**§1 Stage member (`src/server/types.ts`, `src/server/stages/TypeStage.ts`)** — declared `TypeStageInterface extends StageInterface` with `candidates`, the two-parameter `inspect`, and `resolve`; `TypeStage` now `implements TypeStageInterface` and carries `resolve`. This closes P19.

**§1 Coordinator (`src/server/Probe.ts`)** — `prove` resolves the project before any inspection and computes the claim digest over `{ case, control }`; `basis` carries both.

**§1 Token (`src/core/helpers.ts`)** — `computeReceipt` joins seven fields, `verdict.digest` replaces `verdict.id`, project last as `path@digest`. The remainder-join parsing rule is stated in its TSDoc and in `RECEIPT_SEPARATOR`'s `@remarks`.

**§1 Rendering (`src/core/helpers.ts`)** — `formatVerdict` emits `claim <digest>` at index 1 and `project <path> <digest>` at index 3.

**§6 P12** — the three stale token `@example` blocks (`computeReceipt`, `RECEIPT_PREFIX`, `RECEIPT_SEPARATOR` with its `// 6`) and the `Verdict` `@example` now all show the ruling's worked seven-field token.

**§6 P10** — `tests/distribution.test.ts` ESM and CJS consumers assert `isProject`, `computeDigest`, `normalizeValue`, `verdict.project`, a 7-field split, `fields[1] === verdict.digest`, and `fields[6] === path + '@' + digest`.

I verified the ruling's two measured constants independently before adopting them: `computeDigest` over `configs/src/tsconfig.core.json` in this checkout returns `3b674fdf121c85efb9ed1bab25ceeec8`, and over the documented `Claim` with P13's control correction returns `6ca20c3bff623031d3955b9d1a76d71d` — both exactly the ruling's values.

## Files written

All 17 are owned. No shared or off-limits file was touched.

| File | Change |
| --- | --- |
| `/workspace/probe/src/core/types.ts` | `Project`; `Verdict.digest`; `Verdict.project`; corrected `Verdict` `@example` |
| `/workspace/probe/src/core/validators.ts` | `isProject`; `isVerdict` gains both members |
| `/workspace/probe/src/core/constants.ts` | Both token `@example` blocks; separator `@remarks` states the rejoin rule |
| `/workspace/probe/src/core/helpers.ts` | Seven-field token; two heading lines; `@remarks` and `@example` for both |
| `/workspace/probe/src/server/helpers.ts` | `normalizeValue`; `computeDigest` |
| `/workspace/probe/src/server/types.ts` | `TypeStageInterface` |
| `/workspace/probe/src/server/stages/TypeStage.ts` | `implements TypeStageInterface`; `resolve` |
| `/workspace/probe/src/server/Probe.ts` | `prove` assembles `digest` and `project` |
| `/workspace/probe/tests/src/core/helpers.test.ts` | Fixtures; criteria 8 and 9; identity-absence proof |
| `/workspace/probe/tests/src/core/validators.test.ts` | Fixtures; `isProject`; criterion 10 |
| `/workspace/probe/tests/src/core/index.test.ts` | Barrel population gains `isProject` |
| `/workspace/probe/tests/src/server/helpers.test.ts` | Criterion 5 and control 3 |
| `/workspace/probe/tests/src/server/index.test.ts` | Barrel population; P19 member equality |
| `/workspace/probe/tests/src/server/Probe.test.ts` | Criteria 1, 2, 6, 7; controls 1 and 2 |
| `/workspace/probe/tests/src/server/stages/TypeStage.test.ts` | Criteria 3 and 4; `resolve` refusals |
| `/workspace/probe/tests/src/server/stages/RuntimeStage.test.ts` | Two `Verdict` fixtures and two token literals |
| `/workspace/probe/tests/distribution.test.ts` | New surface in both consumers |

Diffstat: `17 files changed, 872 insertions(+), 75 deletions(-)`.

## Red-then-green proofs

**Proof 1 — the P4 defect re-planted.** I restored exactly the two defect sites (the token joining `verdict.id` over six fields, and `prove` assembling neither value) and left every other part of the change in place, so nothing reddened beyond the tests that name the defect.

Command, identical both runs:

```
npx vitest run --config vite.config.ts --no-cache --reporter=default --project src:core --project src:server \
  tests/src/core/helpers.test.ts tests/src/server/Probe.test.ts tests/src/server/stages/RuntimeStage.test.ts
```

- Defect present: **exit 1 — 10 failed | 41 passed (51)**
- Defect repaired: **exit 0 — 51 passed (51)**

The 10 failing-first tests: `binds the claim digest, the stage, the toolchain, and the project into one token`; `keeps the field rule total for a project path carrying both token characters`; `decides a receipt on the control code findings and ignores its instrument ones`; `refuses a receipt for a case whose stage reported a fault in its own instrument`; `reports a test that skips itself during execution`; `issues a receipt only for a control whose own code failed at the declared stage`; `binds the project into the token and holds the claim digest across projects`; `names the caller-chosen project in the token the workspace project refuses`; `separates two claims answered under one project`; `mints one token for one claim in two separate processes`.

**Proof 2 — the capability absent.** With `src/` at the baseline `aad0f58` and the new tests in place:

```
npx vitest run --config vite.config.ts --no-cache --reporter=default --project src:core --project src:server \
  tests/src/core/validators.test.ts tests/src/server/helpers.test.ts tests/src/server/index.test.ts \
  tests/src/server/stages/TypeStage.test.ts
```

- Baseline source: **exit 1 — 11 failed | 31 passed (42)** (`isProject is not a function`, `normalizeValue is not a function`, `computeDigest is not a function`, `stage.resolve is not a function`, and both barrel-population assertions)
- Change restored: **exit 0 — 42 passed (42)**

Criterion 7 failed today for the reason the ruling gave. Before the change, one claim minted `probe:27c5fa88-60b9-4f2b-b9a6-8b5089ca4050:type:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11` — a per-call UUID in field 1, so no two runs could ever agree.

## The three controls, and what each proved

Each control is a shipped assertion. I planted the degeneracy each one guards and confirmed it fires.

**Control 1 — a constant project digest must not pass.** Planted `computeDigest` returning `'ffffffffffffffffffffffffffffffff'`. `npx vitest run … tests/src/server/stages/TypeStage.test.ts` → **2 failed | 15 passed (17)**, both `AssertionError: expected 'ffffffff…' not to be 'ffffffff…'`. It guards criterion 1 and criterion 3: without it, two spellings of one project agree under any constant and the equality proves nothing. Its shipped form is `expect(root.digest).not.toBe(declared.digest)` in `TypeStage.test.ts` and the pairing of `honest.project.digest !== chosen.project.digest` with `repeated.project.digest === honest.project.digest` in `Probe.test.ts` — together they rule out both a constant and a per-call value.

**Control 2 — the honest project must issue no receipt.** The audit's original negative control, retained. Planted a candidate that compiles everywhere (`value: string` for `value?: string`). `npx vitest run … -t 'names the caller-chosen project'` → **1 failed | 15 skipped (16)**, `AssertionError: expected 'probe:ba53381f8560e94e3cbe8d3a11ba3dc…' to be undefined`. It is what makes the forgery assertion beside it worth reading: the receipt the caller-chosen project mints is only evidence of forgery because `configs/src/tsconfig.core.json` reports `'value' is possibly 'undefined'` on the same bytes and mints nothing.

**Control 3 — a digest taken without `normalizeValue` must differ across two roots.** Planted a degenerate population by pointing both scratch roots at one directory. `npx vitest run … tests/src/server/helpers.test.ts` → **1 failed | 17 passed (18)**, `AssertionError: expected { strict: true, …(3) } to not strictly equal { strict: true, …(3) }`. It guards criterion 5: without it, the cross-root digest equality passes for a population that was never two things.

## Validation

Every number is a bare exit code on the final tree.

| Gate | Exit | Result |
| --- | --- | --- |
| `npm run format:check` | **0** | criterion |
| `npm run lint:check` | **0** | criterion |
| `npm run check` | **0** | criterion |
| `npm run build` | **0** | observation |
| `npm test` | **0** | observation — src 11 files / 122 tests, policy 86, config 28 |
| `npm run test:distribution` | **0** | observation — 2 tests, packed tarball drives the new surface under ESM and CJS |

Per-file counts moved: `src:core` 13 → 16, `TypeStage` 14 → 17, `helpers` 15 → 18, `Probe` 12 → 16, `index` 1 → 2, `RuntimeStage` 26 → 26. Baseline `npm run test:src:server` at `aad0f58` was 7 files / 90 tests, exit 0.

The emitted declarations carry the change: `dist/src/core/index.d.ts:668 export declare interface Project`, `:830 readonly digest`, `:834 readonly project: Project`; `dist/src/server/index.d.ts:36 computeDigest`, `:226 normalizeValue`, `:580 class TypeStage implements TypeStageInterface`, `:646 interface TypeStageInterface extends StageInterface`.

## What I could not run

Nothing. This host permits nested child creation, and every stage, both criterion-7 processes, the tarball pack-and-install, and all five gates ran for real.

## Shared-file patch — `PROBE.md`, report-only

`PROBE.md` is off-limits and drifts in three places. I made no edit; apply these serially.

**1. `PROBE.md:59-64`, the wire transcript.** Insert a `claim <digest>` line after the `probe <id>` line and a `project <path> <digest>` line after the `toolchain` line, and extend the receipt to seven fields ending `:<project path>@<project digest>`. The two digests are measured values I cannot supply without re-recording that drive, because the transcript's claim text is not reproduced in the file. Settling command: re-run the wire drive at `tests/src/bin/main.test.ts:294` against the built entry and transcribe `formatVerdict`'s output.

**2. `PROBE.md:578-585`, the `Verdict` declaration.** Replace with:

```ts
export interface Verdict {
	readonly id: string
	readonly digest: string
	readonly toolchain: Toolchain
	readonly project: Project
	readonly checks: readonly Check[]
	readonly control: readonly Check[]
	readonly elapsed: number
	readonly receipt?: string
}
```

**3. `PROBE.md:588-590`, the paragraph beginning "A `Verdict` carries the `Toolchain`".** Replace with:

> A `Verdict` carries the `Toolchain` it was produced by and the `Project` that judged its candidate sources, and the receipt token repeats both alongside the claim's own digest. A receipt read away from its verdict still states what was judged, which compiler configuration judged it, and which compiler, linter, and runner stood behind that, so a proof cannot be quoted after the toolchain that produced it has moved on, nor presented as proof of a claim it never answered. The token omits the call's identity deliberately: two honest runs of one claim in one workspace return byte-identical tokens, which is the only verification a keyless receipt can offer.

## Deviation

None. No part of the ruling was wrong, atomicity held inside the owned files, and no criterion needed a file I do not own.

## Decisions

- **The documented token is the ruling's worked token.** Its claim digest corresponds to the documented `Claim` with P13's control correction applied, which is not in this tree — I do not own P13 and the brief does not assign it. The token is therefore a forward reference: when P13 lands, the documented `Claim` reproduces `6ca20c3bff623031d3955b9d1a76d71d` and P9 asserts the literal without rewriting it. I confirmed the value by measurement rather than by copying it.
- **`TypeStage.resolve` carries the destroyed guard the ruling's sketch omitted**, in `inspect`'s two-phase form. Without it a `resolve` after teardown rebuilds a language service on a torn-down stage and leaks it.
- **Criterion 4 needed a control the ruling's own measurement lacks.** Two project files at two paths always digest differently, because `parsed.options.configFilePath` carries the file's own path — the ruling's `6ee26d48…`/`976b08ff…` pair is confounded the same way. The shipped test asserts the literal criterion and then re-reads one fixed path on a stage holding no parse of it, with only the parent's `strict` moved, so the inequality is attributable to the `extends` chain.
- **Criterion 7's second process reaches the package through the workspace's own `probe` Vitest project**, not through a resolver written for the test. I probed a Node type-stripping loader first; it needed a custom alias hook, a `.js`-to-`.ts` hook, and a JSON named-export shim, which is a second resolver duplicating Vite's. The workbench project is the repository's designated seam and uses the real configuration.
- **Atomicity holds in one tree.** `Verdict`, `isVerdict`, `Probe.prove`, and the `createProbeServer` validation that reads them are consistent at every point I left the tree. I made no commit.
- **Unrelated to this unit:** three untracked files appeared under `.orkestrel/probe/` during the run — `pb6-amendment.md`, `pd-c-brief.md`, `pd-c-probe-md-survey.md`. They are not mine; `.orkestrel/` is off-limits and I wrote nothing there.