# PB2 — the CommonJS entry that crashes, and the warning that let it ship

## Role and engine

`sol` (GPT-5.6 Sol), direct `codex exec`. Perform the assignment directly and spawn nothing.

## The defect

Row P3 of `.orkestrel/probe/readiness-grade.md`, a release blocker. Read the grade first.

Two of the three stages are dead for every CommonJS consumer:

```text
$ grep -n 'import.meta.resolve' src/server/stages/*.ts
src/server/stages/RuntimeStage.ts:185:	const packageEntry = fileURLToPath(import.meta.resolve('vitest/node'))
src/server/stages/TypeStage.ts:148:	const packageEntry = fileURLToPath(import.meta.resolve('typescript'))
```

Those transpile to `{}.resolve("vitest/node")` and `{}.resolve("typescript")` at
`dist/src/server/index.cjs:681` and `:1061`. The audit drove the built artifact:

```text
require('./dist/src/server/index.cjs')   -> loads, 19 exports
new TypeStage(cwd).inspect               -> TypeError: {}.resolve is not a function
new RuntimeStage(cwd).inspect            -> TypeError: {}.resolve is not a function
```

`Overlay` alone survives. Worse, the failure is **swallowed at construction** by
`void this.#typescript.catch(() => {})`, so a consumer sees nothing until their first `prove`.

## Two things are broken, and the second is why the first shipped

1. **The resolution mechanism is ESM-only.** `import.meta.resolve` has no CommonJS equivalent, and the
   bundler emitted `{}` for `import.meta` rather than failing.
2. **The build warned and passed anyway.** Rollup raises `EMPTY_IMPORT_META` for exactly this. Nothing
   reads it.

Repair both. Fixing only the first leaves the next `import.meta` use free to ship the same way.

## The repairs

### The resolution

Find a mechanism that resolves a package entry in **both** module systems and keep the two call sites
on one shared implementation — this is the same operation twice, and `.claude/rules/architecture.md`
puts a repeated pure leaf in `helpers.ts`.

`node:module`'s `createRequire` is the obvious candidate. Whatever you choose, it must work when the
module is loaded as ESM **and** as CommonJS from an installed tarball, and it must not reintroduce a
`dist`-only difference. State what you chose and why in your report.

### The gate

Make the build **fail** on `EMPTY_IMPORT_META` rather than warn. The build config is shared, so place
the handler where every emitted target gets it, and confirm a deliberate reintroduction of
`import.meta.resolve` turns the build red.

**That reintroduction is your negative control and it is required.** A build gate nobody has seen fail
is not a gate.

## Standing condition

Unit PB1 lands before you and owns `package.json` and `vite.config.ts`. It also adds
`tests/distribution.test.ts` carrying an assertion that **no `{}.` artifact remains** in the emitted
CommonJS — that assertion is failing on purpose, waiting for you. Making it pass is the proof this
unit worked; do not weaken it, and report its before and after counts.

## Scope

Owned: `src/server/stages/RuntimeStage.ts`, `src/server/stages/TypeStage.ts`, `src/server/helpers.ts`,
the build configuration under `configs/`, `vite.config.ts`, and the matching test files under
`tests/src/server/`.

Report-only: `tests/distribution.test.ts` — PB1 owns it. If its assertion needs a different shape to
express what you fixed, say exactly what and leave it.

Off-limits: `src/core/**`, `package.json`, `.orkestrel/`, `guides/`.

## Execution

Perform this assignment directly. Spawn nothing.

## Acceptance criteria

1. `npm run format:check`, `npm run lint:check`, and `npm run check` each exit 0.
2. `grep -c "{}\." dist/src/server/index.cjs` reports **0** after a build.
3. From an installed tarball, `require('@orkestrel/probe/server')` then
   `createProbe({workspace}).prove(claim)` returns a verdict — not a `TypeError`.
4. The same call through `import` still returns a verdict. **Both module systems, both proven.**
5. Reintroducing an `import.meta.resolve` makes `npm run build` exit non-zero, proven and then
   reverted.
6. The construction-time `void this.#typescript.catch(() => {})` no longer hides a resolution failure
   from the first `prove` — either it surfaces at construction, or the first `prove` reports it as a
   named `origin: 'instrument'` finding rather than a bare `TypeError`.

**`npm run build` and the test projects are observations, not criteria** beyond what is named above.
Report every command's **bare** exit code; a pipe masks it.

## Deviation contract

Stop and report if the dual-mode resolution needs a file you do not own, or if failing the build on
`EMPTY_IMPORT_META` turns an unrelated target red for a cause you cannot close in scope. The mechanism,
the helper's name, and where the handler sits are yours to decide and carry on from.

## Output

**What changed and why**, **The mechanism you chose and why**, **Files written**, **Red-then-green
proofs** including the `{}.` count before and after and the dual-mode tarball drive, **The build-gate
control and what it proved**, **Validation** (each gate, bare exit code), **Deviation**, **Decisions**.
No process diary.
