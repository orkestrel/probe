# Finding — the published CommonJS artifact crashes on both resolving stages

Severity HIGH. Found from a build warning the gates pass through, on 2026-08-19, at commit `dcd50a3`.

## What ships

`package.json` publishes a dual-condition surface. For `@orkestrel/probe/server`:

```json
"./server": {
  "import": { "types": "./dist/src/server/index.d.ts",  "default": "./dist/src/server/index.js" },
  "require": { "types": "./dist/src/server/index.d.cts", "default": "./dist/src/server/index.cjs" }
}
```

`vite.config.ts:65` declares `formats: ['es', 'cjs']` for that environment, so both artifacts are built
and both are reachable by a consumer.

## What breaks

Two stages resolve a peer through the ESM host:

```text
src/server/stages/RuntimeStage.ts:158   fileURLToPath(import.meta.resolve('vitest/node'))
src/server/stages/TypeStage.ts:133      fileURLToPath(import.meta.resolve('typescript'))
```

`import.meta` has no meaning in CommonJS, so the CJS transpile emits the literal `{}`:

```text
dist/src/server/index.cjs:581   ... !== (0, node_url.fileURLToPath)({}.resolve("vitest/node")) ...
dist/src/server/index.cjs:906   ... !== (0, node_url.fileURLToPath)({}.resolve("typescript")) ...
```

Driven as a real consumer through the published entry, with the ESM condition as the control:

```text
TypeStage(cjs)    THROWS -> TypeError: {}.resolve is not a function
RuntimeStage(cjs) THROWS -> TypeError: {}.resolve is not a function
TypeStage(esm)    OK
RuntimeStage(esm) OK
```

The control is drawn from outside the population the finding covers — the same two classes, the same
call, through the other condition — and it passes. So the instrument distinguishes, and the defect is
the CJS artifact rather than the stages.

**Every CommonJS consumer of `@orkestrel/probe/server` crashes on the first inspection.**

## Why no gate caught it

Three things had to line up, and all three did.

1. The build **warns** rather than fails: `[EMPTY_IMPORT_META] import.meta may not be a valid syntax with
   the cjs output format`, printed twice, exit 0.
2. Every test drives the SOURCE through the ESM host. Nothing loads `dist/src/server/index.cjs`.
3. **Probe has no `tests/distribution.test.ts`.** `.claude/rules/tests.md` reserves that path for proving
   "The packed package installs and resolves through its public exports", and probe publishes a
   two-condition surface with no proof that either condition works.

The third is the root cause. The first two are how it stayed invisible.

## Blast radius beyond probe

Bounded, and checked rather than assumed. `grep -rn "import.meta.resolve" src/ app/` in the scaffold
repository returns nothing, so scaffold itself is not affected. `pathToCondition` in
`src/core/compilers.ts:110-116` emits the `require` condition only when the blueprint declares the `cjs`
format, so this reaches a package only when that package both declares `cjs` and uses `import.meta`.

## What makes the repair cheap

`npm view @orkestrel/probe version` returns `E404`. **Probe is unpublished.** There is no consumer to
break, so dropping the CJS condition costs nothing today and costs a deprecation later.

## Which published entries are affected — measured, not inferred

Probe emits three environments. `dist/bin` builds `formats: ['es']` and publishes no CommonJS at all.
The other two both emit `.cjs`:

```text
dist/src/core/index.cjs
dist/src/server/index.cjs
```

**Only the server entry is broken.** `grep -c "{}\.\(resolve\|url\)" dist/src/core/index.cjs` returns 0,
and driving the core CJS artifact as a real consumer loads all 22 exports and runs its guards:

```text
core cjs exports: 22 -> CASE_SHAPE,CLAIM_SHAPE,CONTROL_SHAPE,FINDING_ORIGINS,PROBE_STAGES,...
isClaim(valid): false
isClaim({}):   false
```

The `false` on the first line is the probe's own input being wrong, not a defect: `Claim` requires
`project` (`src/core/types.ts:106`) and the hand-built object omitted it. Checked before recording, so the
line is not read later as a core failure.

So the repair's blast radius inside probe is `src/server` alone. `src/core`'s CommonJS condition is sound
and must stay working whatever P1 rules about the server one — which makes it the natural control for the
distribution proof.
