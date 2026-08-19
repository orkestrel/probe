# Adoption unit — the terrain, measured before the brief

Facts the adoption unit must not rediscover. Every one was run, not recalled.

## `@orkestrel/test` is already declared

`^0.0.7` in probe's `devDependencies`. Every adoption is deletion of a local re-implementation. No
package is added, so `AGENTS.md`'s dependency ban is not engaged.

## The audit's verdicts

`testhelper-audit.md` carries the evidence. Summarized:

| Helper | Verdict |
| ------ | ------- |
| `createHostileValues` | ADOPT, keeping probe's one null-prototype ACCEPT case |
| `createTeardown` | ADOPT at the 14 multi-statement `finally` blocks; REJECT at the 18 single-statement ones |
| `requireValue` | ADOPT at two sites |
| `captureError`, `roundTripJSON` | REJECT — no hand-rolled equivalent, and Vitest matchers already own the throw assertions |
| `resolveContained`, `createLoopback`, `removeTree`, `matchesIdentity`, `readInventory`, `isExcluded`, the three `REMOVE_TREE_*` constants | REJECT — no subject in probe, or the symbol cannot legally reach the site |

`createTeardown` is a correctness win, not a line win. Do not write a criterion promising deletion there.

## `ROOT` is hand-computed in six files at two different depths

```text
tests/src/server/stages/LintStage.test.ts:6     '../../../../'
tests/src/server/stages/TypeStage.test.ts:11    '../../../../'
tests/src/server/stages/RuntimeStage.test.ts:13 '../../../../'
tests/src/server/helpers.test.ts:19             '../../../'
tests/src/server/Probe.test.ts:10               '../../../'
tests/src/bin/main.test.ts:10                   '../../../'
```

Two depths is the defect class: the correct depth is a function of the file's own location, so every new
test file is a fresh chance to write the wrong one, and a wrong root fails as a missing file rather than
as a wrong root.

`@orkestrel/test` publishes the fix:

```ts
export declare function resolveRoot(meta: ImportMeta): URL
```

TSDoc: "Resolves the parent directory of a calling module, which is the workspace root when called from
the conventional `tests/setup.ts` location."

## Both setup files are empty, and that has a consequence

`tests/setup.ts` and `tests/setupServer.ts` are 0 bytes. Both are registered as `setupFiles` in
`vite.config.ts` — `setup.ts` on every project, `setupServer.ts` on `src:server` and `src:bin`.

`.claude/rules/tests.md` § Shared test infrastructure places Node-only helpers anchored to the workspace
root in `tests/setupServer.ts`. That is where `ROOT` belongs. Its six consumers all use it as an absolute
path string with `resolve(ROOT, ...)`, so export the string rather than the URL `resolveRoot` returns.

## Exporting from a setup file obliges a proof, and the proof obliges a Vitest project

`.claude/rules/tests.md` cross-cutting table: `tests/setup*.test.ts` proves "Reusable behavior exported
from sibling `tests/setup*.ts` modules works as the workspace's suites require", and each such proof goes
in the `setup` project.

Probe has no `setup` project. `vite.config.ts:195` registers `src:core`, `src:server`, `src:bin`,
`policy`, `config`, and `probe`.

The project is CONDITIONAL and scaffold derives it, so this is not a hand edit. `src/bin/CLI.ts:568-576`
computes `blueprint.setup` from the presence of a `tests/setup*.test.ts` file, and
`src/core/compilers.ts:779-782` pushes the `setup` project when that flag is true. Creating
`tests/setup.test.ts` and re-running scaffold's overwrite regenerates `vite.config.ts` and `configs/`
with the project already in them.

**So the adoption unit's scope must grant all three halves**: `tests/setupServer.ts`, the new
`tests/setup.test.ts`, and the regenerated `vite.config.ts` plus `configs/`. Withhold the third and no
edit to the owned files reaches the gates, because the new proof file sits in no project and nothing
collects it.

`AGENTS.md` § Non-negotiable rules forbids editing a vendored file by hand. Regenerate through scaffold;
do not hand-write the project into `vite.config.ts`.

## Sequencing

The adoption unit runs LAST among the test-touching units. S3 owns `tests/src/server/stages/LintStage.test.ts`
and S4 owns `tests/src/server/stages/TypeStage.test.ts` — the file holding the worst `finally` block, at
`:188` with five statements. Adopting before those land would repair the same drift the other way.
