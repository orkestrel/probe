# Adoption synthesis — the cross-group reconciliation

This overturns two lane claims. Read it before either adoption brief.

Verified everything. Writing the plan.

---

# Adoption plan: `@orkestrel/test` into `@orkestrel/probe`

## 0. Baseline correction — the lanes read a stale tree

The lanes read `abad0f6`. **HEAD is now `e11c389`** ("Collapse six serializers onto one"), working tree clean. `tests/src/server/Probe.test.ts` (+159) and `tests/src/server/stages/LintStage.test.ts` (+71) both moved, so **every lane line number in those two files is stale**. All line numbers below are re-read at `e11c389`.

Two lane claims do not survive verification. Both are corrected in place.

---

## 1. Ranked adoptions

### A1 — `createHostileValues` → `tests/src/core/validators.test.ts` · **DEFECT-CLOSING** · do this now

This is the only adoption that closes a live defect, and the lane understated it.

Probe's test at `tests/src/core/validators.test.ts:93` is **differential**: it asserts `isClaim(x) === compiled(x)`, not that `x` is rejected. Its two hand-rolled values are `validators.test.ts:104-105`:

```ts
const nullPrototype = Object.assign(Object.create(null), claim)
const throwingProxy = new Proxy({}, Object.create(WeakMap.prototype))
```

I ran both values and both guards against the built `dist/src/core/index.js`:

| value | `isClaim` | `compiled` | ruling |
| --- | --- | --- | --- |
| `nullPrototype` (`:104`, asserted `:149`) | **`true`** | **`true`** | **positive-agreement case — KEEP** |
| `throwingProxy` (`:105`, asserted `:150`) | `false` | `false` | **inert — REPLACE** |

**`throwingProxy` is a dead test value.** I instrumented which proxy traps each guard consults:

```
isClaim  traps consulted: getPrototypeOf, ownKeys, getOwnPropertyDescriptor
compiled traps consulted: getPrototypeOf, ownKeys
```

`Object.create(WeakMap.prototype)` supplies only `get`/`set`/`has`/`delete` as traps. **Neither guard consults any of them.** The handler throws on a direct `.get` (confirmed `true`), but never on the code path under test. Result:

```
isClaim(throwingProxy)  === isClaim({})   -> true
compiled(throwingProxy) === compiled({})  -> true
```

It is indistinguishable from `{}`. The test named "a named hostile population" carries a value that exercises no hostile path. `createHostileValues()` members 3 (`ownKeys` throws) and 4 (`getPrototypeOf` throws) hit **exactly** the traps both guards consult. All six members return `false`/`false`, so appending them is a clean differential extension.

**`nullPrototype` must survive.** It is the only assertion proving `isClaim` does *not* gate on prototype identity when valid fields are present — it carries 3 own keys against the package member's 0. `createHostileValues()` contains no equivalent. Deleting it substitutes a rejection case for an acceptance case and loses coverage outright. This is where the lane's "ADOPT WITH A DIFFERENCE" would have caused a regression if executed literally.

Net: delete `:105` and `:150`, keep `:104`/`:149`, append a six-member loop.

---

### A2 — `resolveRoot` via `tests/setup.ts` · **LATENT-defect-closing** · redesign, not a swap · **BLOCKED**

**The lane's framing is wrong and would produce broken code.** `resolveRoot` is one level, hard-coded:

```js
function resolveRoot(meta) { return new URL("../", meta.url) }   // core/index.js:101-103
```

The seven sites sit at three different depths. I resolved each:

| site | depth | ownership |
| --- | --- | --- |
| `tests/config.test.ts:27` | 1 | **VENDORED — off-limits** |
| `tests/src/bin/main.test.ts:10` | 3 | probe-owned |
| `tests/src/server/Probe.test.ts:10` | 3 | probe-owned |
| `tests/src/server/helpers.test.ts:19` | 3 | probe-owned |
| `tests/src/server/stages/LintStage.test.ts:6` | 4 | **S3 live** |
| `tests/src/server/stages/TypeStage.test.ts:11` | 4 | **S4 queued** |
| `tests/src/server/stages/RuntimeStage.test.ts:13` | 4 | probe-owned |

Calling `resolveRoot(import.meta)` in place at the six depth-3/4 sites yields `tests/src/server/` — the wrong directory, silently. And the single site where it fits exactly, `tests/config.test.ts:27`, is **byte-identical to `node_modules/@orkestrel/scaffold/dist/host/tests/config.test.ts`** (verified by `md5sum`, along with `policy.test.ts` and `setupPolicy.ts`). `repair` reverts any edit there.

The correct adoption is a **single call site**, which is what the helper's own TSDoc describes ("the workspace root when called from the conventional `tests/setup.ts` location"):

```ts
// tests/setup.ts  — currently 0 bytes, probe-owned, already a setupFile for all six projects
import { resolveRoot } from '@orkestrel/test'
import { fileURLToPath } from 'node:url'
export const ROOT = fileURLToPath(resolveRoot(import.meta))
```

Six probe-owned tests then import `ROOT` and delete their own computation. Policy sanctions this import: `tests/setupPolicy.ts:228` defines `POLICY_TESTS_MODULE_GLOB = 'tests/**/setup*.ts'` as "The tests-axis setup module population available to mirrored tests", and `:774` makes `tests/setup.ts` a resolution candidate for a `setup`-prefixed import.

**All seven roots resolve correctly today** (verified). So this is a latent fragility, not a live bug — real, but it buys uniformity rather than a fix.

### A3 — `requireValue` · **TIDYING** · 2 lines · ride with A2

Only two of the eleven `throw new Error` sites in probe-owned tests are pure absence guards:

- `tests/src/server/stages/TypeStage.test.ts:137-138` — `const stageId = evaluated.result.objectId` / `if (stageId === undefined) throw …`
- `tests/src/server/stages/RuntimeStage.test.ts:328-329` — `const project = vitest.projects.find(…)` / `if (project === undefined) throw …`

The other nine are shape guards (`isRecord`, `Array.isArray`, `instanceof Map`) or `typeof` narrowings that `requireValue` cannot express. One partial: `TypeStage.test.ts:158-162` checks two values against one message; splitting it into two `requireValue` calls turns one message into two and leaves the `typeof` guard at `:163` standing. **Skip the partial** — it changes failure text for no gain.

### A4 — `createTeardown` · **DEFER** · do not do this now

29 `finally {` blocks in probe-owned tests (not the lane's 32 — LintStage and Probe moved): `main.test.ts` 3, `Probe.test.ts` 8, `LintStage.test.ts` 2, `RuntimeStage.test.ts` 12, `TypeStage.test.ts` 4. **26 of 29 sit in `tests/src/server/**`.**

The defect is real but low-probability. At `main.test.ts:219` and `:309`, `output.close()` runs before the child kill — if it throws, a **spawned child leaks**. At `:353`, `await exited` precedes `scratch.destroy()` — if it rejects, a **temp directory leaks**.

Against that: a `try/finally` is a language construct, not a reimplemented framework helper, so `.claude/rules/tests.md` does not compel this the way it compels A1. The change is 29 sites of churn across exactly the files being actively rewritten, and it alters failure identity — `destroy()` rethrows by identity for one failure but raises `AggregateError` for several, which can change what a `.rejects.toThrow(…)` sees. Cost exceeds benefit this round.

---

## 2. Cross-group conflicts the per-group lanes could not see

1. **A2 subsumes nothing but is blocked by two live units.** `LintStage.test.ts` is owned by S3 (running); `TypeStage.test.ts` is owned by S4 (queued). A2's value *is* uniformity — landing it across five of seven files leaves two hand-computed depths behind and makes the tree worse than either end state. **A2 must wait for S3 and S4 to land.**
2. **A3 collides with A2 in the same two files** (`TypeStage.test.ts`, `RuntimeStage.test.ts`). Ship them as one unit once unblocked; two units over one file is a serialization violation for two deleted lines.
3. **A1 conflicts with nothing.** `tests/src/core/validators.test.ts` is untouched by every live unit and by A2/A3.
4. **`removeTree` REJECT stands, with a better reason than the lane gave.** `createScratch` already calls `removeTree` internally (`server/index.js:193`, `:261`, `:271`), so probe's four `scratch.destroy()` sites already have the retry. The two bare `rmdirSync(directory)` calls at `main.test.ts:229` and `:320` are deliberately wrapped in `try {} catch {}` — best-effort removal of a possibly-non-empty shared directory. `removeTree` retries then *throws*, so adopting it inside that `catch {}` buys a 1-second Windows stall and no behaviour change.
5. The `captureError` REJECT's two bare `catch {}` clauses (`main.test.ts:230`, `:321`) are the *same* two sites as item 4. They are intentional, not omissions.

---

## 3. What must NOT change

Probe proves a receipt mechanism; a false green is worse than a crash. State these as prohibitions in the brief:

- **Keep the differential form.** Every assertion stays `expect(isClaim(v), label).toBe(compiled(v))`. Rewriting the loop to `expect(isClaim(v)).toBe(false)` reads as a simplification and destroys the test's purpose — it would pass even if `compiled` diverged from `isClaim`. This is the single highest false-green risk in the whole plan.
- **Keep `nullPrototype`** (`validators.test.ts:104`, asserted `:149`). It is a `true`/`true` acceptance case, not a hostile one.
- **Bind `createHostileValues()` once.** Its TSDoc: "A frozen array whose six values are fresh on every call." Calling it inside the loop condition and again in the assertion compares two different objects, and one member is a revoked proxy.
- **Never edit `tests/config.test.ts`, `tests/policy.test.ts`, `tests/setupPolicy.ts`** — vendored, byte-identical to scaffold 0.0.42, reverted by `repair`.
- **Do not convert `try { rmdirSync } catch {}`** at `main.test.ts:229`/`:320` into anything that throws.
- **Do not touch the timeout racers.** `Probe.test.ts:342-344` and `:348` are `waitForDelay` races, not teardown and not guards.

---

## 4. Sequence

**Unit 1 — ship now, unblocked.** Owned file: `tests/src/core/validators.test.ts` (sole file). Delete `:105` and `:150`; keep `:104`/`:149`; add `createHostileValues` to the `@orkestrel/test` import; append an indexed loop.
Criteria: `npx vitest run --project src:core` green; `validators.test.ts` contains no `WeakMap.prototype`; `nullPrototype` still present and still asserted; every new assertion is `.toBe(compiled(...))`; test count rises by exactly 6 assertions in the `:93` test.

**Unit 2 — blocked on S3 and S4.** Owned files: `tests/setup.ts`, `tests/src/bin/main.test.ts`, `tests/src/server/Probe.test.ts`, `tests/src/server/helpers.test.ts`, `tests/src/server/stages/LintStage.test.ts`, `tests/src/server/stages/TypeStage.test.ts`, `tests/src/server/stages/RuntimeStage.test.ts`. A2 plus A3 together.
Criteria: `grep -rn "fileURLToPath(new URL('\.\./" tests/src/` returns zero hits for `ROOT`; exactly one `resolveRoot` call in the repo; `tests/config.test.ts` unchanged (`md5sum` matches the scaffold host copy); full `npm test` green; `npx scaffold audit` reports no vendored drift.

**Not scheduled: A4.** Reason stated in §1.

**Dropped from the lane list:** `resolveRoot` as a seven-site in-place swap (would break six sites); `createHostileValues` as a replacement for both probe values (would delete an acceptance case). Both are corrected above rather than carried forward as written.

Scratch probes: `/tmp/claude-0/-home-user-scaffold/75034726-f81c-5f56-9643-b4a6748f097d/scratchpad/{hostile,traps,inert,roots}.mjs`