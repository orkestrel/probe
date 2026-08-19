# Unit P1 — probe publishes a CommonJS surface that crashes

## Role and engine

`implementer` — Claude Opus 5, native. Two reasons. The unit's central question is what surface probe
should publish, which is API shape. And its proof must pack, install, and drive a real Node consumer, so
it cannot run in a bench sandbox — the same host constraint that re-routed S3.

## Objective

Make every published condition of `@orkestrel/probe` work when a real consumer uses it, and prove it.

## The defect

Read `/home/user/scaffold/.orkestrel/probe/cjs-artifact-finding.md` first. It carries the measurement,
the control, and the blast radius. Summarized:

`package.json` publishes `require` conditions pointing at `.cjs` artifacts. `RuntimeStage` and
`TypeStage` call `import.meta.resolve(...)`, which has no meaning in CommonJS, so the transpile emits the
literal `{}` and the shipped artifact reads `{}.resolve("typescript")`. Driven as a real consumer:

```text
TypeStage(cjs)    THROWS -> TypeError: {}.resolve is not a function
RuntimeStage(cjs) THROWS -> TypeError: {}.resolve is not a function
TypeStage(esm)    OK          <- control
RuntimeStage(esm) OK          <- control
```

The build warns `[EMPTY_IMPORT_META]` twice and exits 0, so no gate fails.

## The decision this unit owns

**Rule on whether probe publishes a CommonJS condition at all, then implement your ruling.** Both options
are priced; pick one, state the reason, and do not hedge by doing both.

- **Drop `'cjs'` from the affected environment's `formats`.** Probe is `"type": "module"`, it drives ESM
  toolchains, and it spawns Node children. `npm view @orkestrel/probe version` returns `E404` — probe is
  **unpublished**, so removing a condition breaks no consumer today and costs a deprecation later. Cost:
  a CommonJS consumer cannot use probe at all, which may be correct rather than a loss.
- **Keep CommonJS and make resolution work under both hosts.** Cost: a resolution mechanism that behaves
  in both module systems, in published runtime source, plus the proof that it does. Do not reach for
  `createRequire(import.meta.url)` without checking it survives the same transpile — that is the trap
  this defect is made of, one layer down. Measure before choosing it.

`vite.config.ts` and `configs/**` are scaffold-generated. If your ruling changes the build formats,
change them through scaffold's own command, never by hand — `AGENTS.md` forbids editing a vendored file,
and `scaffold audit` reports the drift.

## The root cause is the missing proof, and closing it is not optional

Probe publishes a two-condition surface with **no `tests/distribution.test.ts`**. `.claude/rules/tests.md`
reserves that path for proving "The packed package installs and resolves through its public exports", and
places such a proof in its own `distribution` Vitest project with its own setup and timeout.
`.claude/rules/workspace.md` fixes which gate runs that project, and it differs between a publishing and
a `private: true` workspace — read it rather than guessing.

The project is **derived**, not hand-written: `src/bin/CLI.ts` in the scaffold package computes
`blueprint.distribution` from the file's presence, and `src/core/compilers.ts` pushes the project when
that flag is true. Create the proof, then regenerate. If regeneration does not produce the project, STOP
and report — that is a scaffold question, not something to work around by editing `vite.config.ts`.

The proof must drive every condition the package actually publishes. A proof that exercises only the
condition your ruling keeps is the same gap one size smaller.

## Context

Read before acting, in this order: `/home/user/scaffold/AGENTS.md`; `/home/user/scaffold/.claude/rules/`
`names.md`, `typescript.md`, `architecture.md`, `tests.md`, `workspace.md`, `quality.md`, `writing.md`;
then `cjs-artifact-finding.md`; then this brief. The governing guide is `/home/user/scaffold/PROBE.md`.

`guides/probe.md` DOES NOT EXIST. `guides/README.md` records it as "Not created". Do not create it.

## Host facts

- Working directory `/workspace/probe`. Sole writer from a clean committed baseline. Report immediately
  if `git status --porcelain` is not empty when you start.
- Nested process spawns work here. `npm pack` and a local install work here. The network is proxied; a
  real registry install may be unavailable, so prefer packing the tarball and installing it from disk.
- State every completion claim against the BASELINE COMMIT, never against `git status`.
- Full `npm test` takes roughly three minutes; a distribution proof adds to that, which is why the rules
  give it its own project and timeout.

## Unknowns

- Whether the `distribution` project's gate placement puts it inside `npm test` or behind a separate
  script. `.claude/rules/workspace.md` decides it; read that file rather than choosing.
- Whether a from-disk tarball install resolves probe's `@orkestrel/*` dependencies in this container. Make
  that your FIRST step, and report what you found. If it cannot resolve them, say so and report what the
  proof can establish without it rather than inventing a substitute.

## Scope

- **Owned**: `package.json`, `src/server/stages/RuntimeStage.ts`, `src/server/stages/TypeStage.ts`, and a
  new `tests/distribution.test.ts`.
- **Granted for regeneration only**: `vite.config.ts` and `configs/**`, written by scaffold's command
  rather than by you. Both halves are granted deliberately: withhold the second and the new proof sits in
  no project and no edit to the owned files reaches the gates.
- **Off-limits**: `src/core/**`, `src/server/Probe.ts`, `src/server/stages/LintStage.ts`,
  `src/server/helpers.ts`, `src/bin/**`, `guides/**`, `PROBE.md`, every other test file, every dotfile,
  and the vendored set `tests/config.test.ts`, `tests/policy.test.ts`, `tests/setupPolicy.ts`.
- **Coordination**: unit S4 owns `src/server/stages/TypeStage.ts` for a different defect and runs before
  you. Re-read that file at dispatch; every line number quoted here is stale by construction.
- Write any throwaway instrument under `tmp/scratch/` and delete it before returning.
- Do not commit, push, or add an npm package.

## Execution

Perform this assignment directly. Spawn no subagent. Do not delegate any part of it.

## Deviation contract

Stop and report when a repair needs an off-limits file, when the scaffold regeneration does not produce
the `distribution` project, when the tarball install cannot resolve dependencies, or when a gate reddens
for a reason your change does not explain. Report expected, found, the exact command and its output,
whether the work is done, and at most one short hypothesis.

Ancillary choices — the proof's internal structure, the fixture consumer's name — are yours to decide,
record, and carry on from.

## Naming

`P1` is addressing for this brief only. Name every test for the behaviour it proves.

## Acceptance criteria

1. Your ruling on the CommonJS condition is implemented, and `package.json`'s `exports` matches what the
   build actually emits. No condition points at an artifact that is not built.
2. `tests/distribution.test.ts` exists, packs the package, installs the tarball, and drives every
   published condition through its public exports as a real consumer.
3. That proof FAILS against the current defect. Record the exact command and its failing output before
   your repair, and the same command green after. A distribution proof that never ran red does not bind
   to the defect it claims.
4. The proof drives at least the two stages the defect reaches, and asserts they inspect rather than
   throw. Assert both directions where a condition is meant to be absent: a removed condition is absent
   from `exports` AND its artifact is not emitted.
5. `npm run build` emits no `EMPTY_IMPORT_META` warning. Report the build output.
6. The `distribution` project appears in `vite.config.ts`, produced by scaffold's regeneration, and the
   gate that `.claude/rules/workspace.md` names runs it.
7. The vendored set is byte-identical to its scaffold host copies — prove with `md5sum` against
   `node_modules/@orkestrel/scaffold/dist/host/tests/` — and `npx scaffold audit` reports no drift.
8. `npm run format:check`, `npm run lint:check`, `npm run check`, `npm run build`, and `npm test` all
   pass. Report each exit code.
9. `npm test` reports 0 skipped and 0 todo, at a count at least its baseline plus your new proof. Read
   the baseline from your own first run.

## Output

Return exactly: **The ruling** (which condition probe publishes, and why), **Files written**,
**Red-then-green proof** (the exact command with both outputs), **What the distribution proof drives**,
**Validation** (each gate and its exit code), **Counts**, **Deviation**, **Decisions**. No process diary.
End with `git diff --stat` against the baseline.

---

# Amendment 1 — the affected surface is narrower than the finding first stated

Measured after the brief was written. Probe emits three environments:

| Entry | Formats | CommonJS artifact | State |
| ----- | ------- | ----------------- | ----- |
| `dist/bin` | `['es']` | none | not affected |
| `dist/src/core` | `['es', 'cjs']` | `index.cjs` | **sound** — loads, 22 exports, guards run |
| `dist/src/server` | `['es', 'cjs']` | `index.cjs` | **broken** — `{}.resolve` at two sites |

`grep -c "{}\.\(resolve\|url\)" dist/src/core/index.cjs` returns 0.

Two consequences for this unit.

- **Your ruling is about the SERVER condition only.** Do not drop `cjs` from the core environment; it
  works, and removing a working published condition is a reduction nothing in this finding justifies.
- **The core CommonJS entry is your control.** The distribution proof must show it still loads and runs
  after your change. A proof that only exercises the broken entry cannot tell a real repair from a
  packaging change that quietly broke everything else.
