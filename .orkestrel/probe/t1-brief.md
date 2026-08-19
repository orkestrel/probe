# Unit T1 — the hostile population in the differential guard test is inert

## Role and engine

`builder` — the harness's cheap native tier. Fully specified, taste-free, one file, mechanical criteria.

## Objective

Make the differential guard test exercise the proxy traps its two guards actually consult.

## The defect

`tests/src/core/validators.test.ts:93` is a **differential** test. It asserts that probe's hand-written
`isClaim` and the contract-compiled guard agree on each value:

```ts
expect(isClaim(nullPrototype), 'null-prototype object').toBe(compiled(nullPrototype))
expect(isClaim(throwingProxy), 'throwing proxy').toBe(compiled(throwingProxy))
```

Its two values are at `:104-105`:

```ts
const nullPrototype = Object.assign(Object.create(null), claim)
const throwingProxy = new Proxy({}, Object.create(WeakMap.prototype))
```

**`throwingProxy` exercises nothing.** The audit instrumented which traps each guard consults:

```text
isClaim  traps consulted: getPrototypeOf, ownKeys, getOwnPropertyDescriptor
compiled traps consulted: getPrototypeOf, ownKeys
```

`Object.create(WeakMap.prototype)` supplies `get`, `set`, `has`, and `delete` as traps. Neither guard
consults any of them. The handler throws on a direct `.get`, but never on the path under test:

```text
isClaim(throwingProxy)  === isClaim({})   -> true
compiled(throwingProxy) === compiled({})  -> true
```

The value is indistinguishable from `{}`. A test named for a hostile population carries a value that
reaches no hostile path.

`@orkestrel/test` publishes `createHostileValues(): readonly unknown[]`, six values whose members 3 and
4 throw from `ownKeys` and `getPrototypeOf` — exactly the two traps both guards consult. All six return
`false` from both guards, so appending them extends the differential cleanly.

## Three prohibitions, and the first is the reason this unit is small

1. **Keep the differential form.** Every assertion stays `expect(isClaim(v), label).toBe(compiled(v))`.
   Rewriting it to `expect(isClaim(v)).toBe(false)` reads as a simplification and destroys the test's
   purpose — it would pass even if `compiled` diverged from `isClaim`. This is the highest false-green
   risk in the change. Probe proves a receipt mechanism; a false green here is worse than a crash.
2. **Keep `nullPrototype` at `:104` and its assertion at `:149`.** Both guards return **`true`** for it —
   it is the only case proving `isClaim` does not gate on prototype identity when valid fields are
   present. It carries three own keys; the package's bare `Object.create(null)` member carries none.
   Deleting it substitutes a rejection case for an acceptance case and loses coverage.
3. **Bind `createHostileValues()` once, to a local constant.** Its TSDoc states the returned array's six
   values are fresh on every call. Calling it in the loop and again in the assertion compares two
   different objects, and one member is a revoked proxy.

## The change

Delete `:105` and its assertion at `:150`. Add `createHostileValues` to the existing `@orkestrel/test`
import. Append one indexed loop over the six published values, each assertion keeping the differential
form and including the index in its label, as the helper's own TSDoc directs.

## Context

Read before acting, in this order: `/home/user/scaffold/AGENTS.md`; `/home/user/scaffold/.claude/rules/`
`names.md`, `typescript.md`, `tests.md`, `quality.md`, `writing.md`; then this brief. No skill is named.
The governing guide is `/home/user/scaffold/PROBE.md`. The full audit is
`/home/user/scaffold/.orkestrel/probe/testhelper-audit.md` and the reconciliation that corrected it is
`testhelper-synthesis.md` — read the synthesis if you need more than this brief carries.

`@orkestrel/test` is ALREADY a declared devDependency at `^0.0.7`. You add no package.

`guides/probe.md` DOES NOT EXIST, so there is no documented claim to keep in step. Do not create it.

## Host facts

- Working directory `/workspace/probe`. You are the sole writer, dispatched from a clean committed
  baseline. Report immediately if `git status --porcelain` is not empty when you start.
- State every completion claim against the BASELINE COMMIT: `git diff --stat <baseline>..` is stable,
  `git status` is not.
- Develop with `npx vitest run --project src:core`. The whole-workspace `npm test` takes roughly three
  minutes.

## Scope

- **Owned**: `tests/src/core/validators.test.ts`. That is the whole list, and it was counted: no live or
  queued unit touches this file.
- **Off-limits**: everything else. Specifically `src/**`, every other test file, `guides/**`,
  `PROBE.md`, `package.json`, `vite.config.ts`, `configs/**`, every dotfile, and the vendored set
  `tests/config.test.ts`, `tests/policy.test.ts`, `tests/setupPolicy.ts` — those three are byte-identical
  to their scaffold host copies and `repair` reverts any edit to them.
- Write any throwaway instrument under `tmp/scratch/` and delete it before returning.
- Do not commit, push, or install. Do not run tree-wide `format` or lint `--fix`.

## Execution

Perform this assignment directly. Spawn nothing.

## Deviation contract

Stop and report when the change needs an off-limits file, or when a gate reddens for a reason your
change does not explain. Report expected, found, the exact command and its output, whether the work is
done, and at most one short hypothesis. Ancillary choices — the local constant's name, assertion order —
are yours to decide, record, and carry on from.

## Naming

`T1` and the value labels in this brief are addressing for this brief only. Name every test for the
behaviour it proves.

## Acceptance criteria

1. `grep -n "WeakMap.prototype" tests/src/core/validators.test.ts` returns nothing.
2. `nullPrototype` is still constructed and still asserted, and its assertion still reads
   `.toBe(compiled(nullPrototype))`.
3. Every assertion added is of the form `.toBe(compiled(...))`. `grep -c "toBe(compiled(" ` rises by
   exactly the number of published members.
4. `createHostileValues()` is called exactly once in the file, bound to a constant.
5. Each new assertion's label includes the member's index.
6. `npx vitest run --project src:core` passes; report the count.
7. `npm run lint:check` and `npm run check` pass.
8. Full `npm test` reports 0 skipped and 0 todo, at a count at least its baseline. Read the baseline
   from your own first run rather than from this brief.

## Output

Return exactly: **Files written**, **What the six members prove that the deleted value did not** (one
line each, from your own run), **Validation** (each gate and its exit code), **Counts**, **Deviation**,
**Decisions**. No process diary. End with `git diff` against the baseline.
