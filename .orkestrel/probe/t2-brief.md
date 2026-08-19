# Unit T2 — the workspace root is computed by hand at six sites and three depths

## Role and engine

`implementer` — Claude Opus 5. This unit places a new exported symbol in the workspace's shared test
infrastructure and decides which setup module owns it, which is API shape rather than mechanical edit.

## Blocked until S3, S4, and T1 land

This unit owns `tests/src/server/stages/LintStage.test.ts`, which S3 is writing, and
`tests/src/server/stages/TypeStage.test.ts`, which S4 will write. Its whole value is uniformity, so
landing it across five of the seven sites leaves two hand-computed depths behind and makes the tree
worse than either end state. Do not dispatch it early.

## The defect

Probe computes the workspace root by hand at seven sites, in three forms and at three depths. Read at
`e11c389`:

```text
tests/config.test.ts:27                          resolve(dirname(fileURLToPath(import.meta.url)), '..')   VENDORED
tests/src/bin/main.test.ts:10                    fileURLToPath(new URL('../../../', import.meta.url))
tests/src/server/Probe.test.ts:10                fileURLToPath(new URL('../../../', import.meta.url))
tests/src/server/helpers.test.ts:19              fileURLToPath(new URL('../../../', import.meta.url))
tests/src/server/stages/LintStage.test.ts:6      fileURLToPath(new URL('../../../../', import.meta.url))
tests/src/server/stages/RuntimeStage.test.ts:13  fileURLToPath(new URL('../../../../', import.meta.url))
tests/src/server/stages/TypeStage.test.ts:11     fileURLToPath(new URL('../../../../', import.meta.url))
```

`tests/src/server/Probe.test.ts` recomputes the same URL inline three more times, at `:263`, `:276`, and
`:447`, as `new URL('../../../tmp/probe/', import.meta.url)`.

All seven resolve correctly today, so this is latent fragility rather than a live defect. The fragility
is that the correct depth is a function of the file's own location: moving a test between
`tests/src/server/` and `tests/src/server/stages/` silently retargets `ROOT` one directory off, and
nothing fails loudly — `resolve(ROOT, 'tmp/probe')` points at a path that does not exist, so the failure
reads as a stage defect rather than as a moved file.

## The correction, and the trap in it

`@orkestrel/test` publishes `resolveRoot(meta: ImportMeta): URL`, implemented as `new URL('../', meta.url)`.

**It is depth-1 only.** Calling `resolveRoot(import.meta)` in place at the six probe-owned sites yields
`tests/src/server/` — the wrong directory, silently. This is a redesign, not a swap, and a brief that
prescribed the swap would have produced six broken sites.

The correct adoption is a single call site, which is what the helper's own TSDoc describes: "the
workspace root when called from the conventional `tests/setup.ts` location". Both `tests/setup.ts` and
`tests/setupServer.ts` are 0 bytes today and both sit at depth 1.

**Yours to decide: which setup module exports `ROOT`.** The two considerations, stated so you rule on
them rather than rediscover them:

- `.claude/rules/tests.md` § Shared test infrastructure places Node-only helpers anchored to the
  workspace root in `tests/setupServer.ts`, and `fileURLToPath` comes from `node:url`.
- `vite.config.ts` registers `setup.ts` as a `setupFile` on all six projects and `setupServer.ts` on
  `src:server` and `src:bin` only. All six consumers are in `src:server` and `src:bin`.

Rule on it, state your reason, and put the symbol in one place.

## What exporting from a setup module obliges

`.claude/rules/tests.md` cross-cutting table: `tests/setup*.test.ts` proves "Reusable behavior exported
from sibling `tests/setup*.ts` modules works as the workspace's suites require", and that proof runs in
the `setup` project.

**Probe has no `setup` project**, and you must not hand-write one. It is derived:
`src/bin/CLI.ts:568-576` in the scaffold package computes `blueprint.setup` from the presence of a
`tests/setup*.test.ts` file, and `src/core/compilers.ts:779-782` pushes the project when that flag is
true. Create the proof file, then regenerate through scaffold's own command so `vite.config.ts` and
`configs/` gain the project. `AGENTS.md` forbids editing a vendored file by hand.

If the regeneration does not produce the project, STOP and report — that is a scaffold question, not
something to work around by hand-editing `vite.config.ts`.

## Also yours — two absence guards

`@orkestrel/test` publishes `requireValue<T>(value: T | null | undefined, message?: string): T`.
`.claude/rules/tests.md` forbids reimplementing a framework helper. Exactly two probe-owned sites are
pure absence guards:

```text
tests/src/server/stages/TypeStage.test.ts:137-138   const stageId = evaluated.result.objectId
                                                    if (stageId === undefined) throw new Error(…)
tests/src/server/stages/RuntimeStage.test.ts:328-329 const project = vitest.projects.find(…)
                                                    if (project === undefined) throw new Error(…)
```

Convert those two. It is roughly line-neutral, not a line win.

**Do not convert `TypeStage.test.ts:158-165.`** It checks two values against one message, then applies a
`typeof` guard that already subsumes the undefined check. Splitting it turns one message into two and
leaves the `typeof` guard standing. The audit's separate observation that the guard could be deleted
outright is NOT in this unit's scope — record it and move on.

The other nine `throw new Error` sites in probe-owned tests are shape guards (`isRecord`,
`Array.isArray`) or `typeof` narrowings that `requireValue` cannot express. Leave them.

## Context

Read before acting, in this order: `/home/user/scaffold/AGENTS.md`; `/home/user/scaffold/.claude/rules/`
`names.md`, `typescript.md`, `architecture.md`, `tests.md`, `workspace.md`, `quality.md`, `writing.md`;
then this brief. The governing guide is `/home/user/scaffold/PROBE.md`. Supporting evidence:
`/home/user/scaffold/.orkestrel/probe/testhelper-synthesis.md` and `testhelper-audit.md`.

`@orkestrel/test` is ALREADY a declared devDependency at `^0.0.7`. You add no package.

`guides/probe.md` DOES NOT EXIST. Do not create it.

## Host facts

- Working directory `/workspace/probe`. Sole writer from a clean committed baseline. Report immediately
  if `git status --porcelain` is not empty when you start.
- State every completion claim against the BASELINE COMMIT, never against `git status`.
- Full `npm test` takes roughly three minutes.

## Scope

- **Owned**: `tests/setup.ts`, `tests/setupServer.ts`, a new `tests/setup.test.ts`,
  `tests/src/bin/main.test.ts`, `tests/src/server/Probe.test.ts`, `tests/src/server/helpers.test.ts`,
  `tests/src/server/stages/LintStage.test.ts`, `tests/src/server/stages/TypeStage.test.ts`,
  `tests/src/server/stages/RuntimeStage.test.ts`.
- **Granted for regeneration only**: `vite.config.ts` and `configs/**`, written by scaffold's command
  rather than by you. Both halves are granted deliberately: withhold the second and the new proof file
  sits in no project, nothing collects it, and no edit to the owned files can reach the gates.
- **Off-limits**: `src/**`, `guides/**`, `PROBE.md`, `package.json`, every dotfile, and the vendored set
  `tests/config.test.ts`, `tests/policy.test.ts`, `tests/setupPolicy.ts`. Those three are byte-identical
  to their scaffold host copies; `repair` reverts any edit and `scaffold audit` reports it as drift.
  `tests/config.test.ts:27` is therefore NOT an adoption site, despite being the one place `resolveRoot`
  would substitute directly.
- Write any throwaway instrument under `tmp/scratch/` and delete it before returning.
- Do not commit, push, or install.

## Execution

Perform this assignment directly. Spawn nothing.

## Deviation contract

Stop and report when a change needs an off-limits file, when the scaffold regeneration does not produce
the `setup` project, or when a gate reddens for a reason your change does not explain. Report expected,
found, the exact command and its output, whether the work is done, and at most one short hypothesis.

Ancillary choices — where the export sits in its module, the order of the converted guards — are yours
to decide, record, and carry on from.

## Naming

`T2`, `A2`, and `A3` are addressing for this brief only. Name every test for the behaviour it proves.

## Acceptance criteria

1. `grep -rn "new URL('\.\./\.\./" tests/src/` returns nothing.
2. `resolveRoot` is called exactly once in the repository.
3. All six probe-owned consumers import `ROOT` from the setup module you chose.
4. The three inline recomputations at `tests/src/server/Probe.test.ts:263`, `:276`, and `:447` are gone.
5. `tests/setup.test.ts` exists and proves the exported `ROOT` — assert it against a property that could
   disagree, such as the location of a file you know sits at the workspace root, not by recomputing the
   same URL the module computes. Re-deriving the answer the same way the source derives it produces a
   test that passes for every value the source ever returns.
6. The `setup` project appears in `vite.config.ts`, produced by scaffold's regeneration, and collects
   `tests/setup.test.ts`.
7. The two named absence guards use `requireValue`. `TypeStage.test.ts:158-165` is unchanged.
8. The vendored set is byte-identical to its scaffold host copies. Prove it with `md5sum` against
   `node_modules/@orkestrel/scaffold/dist/host/tests/`, and report `npx scaffold audit` showing no drift.
9. `npm run format:check`, `npm run lint:check`, `npm run check`, and `npm run build` pass.
10. Full `npm test` reports 0 skipped and 0 todo, at a count at least its baseline plus your new proof.

## Output

Return exactly: **Files written**, **The ownership ruling** (which setup module holds `ROOT`, and why),
**How the setup proof avoids asserting the implementation against itself**, **Validation** (each gate and
its exit code), **Counts**, **Deviation**, **Decisions**. No process diary. End with `git diff --stat`
against the baseline.

---

# Amendment 1 — written after S3 landed at `dcd50a3`

## S3 handed you a carrier, and it is now part of this unit

S3 added five module-scope helpers to `tests/src/server/stages/LintStage.test.ts` —
`killFixtureServer`, `SERVER`, `FIXTURE`, `PASSING`, and `HOST`. It recorded the placement as a scoped
decision rather than a preference:

> `.claude/rules/tests.md` places shared test infrastructure in a setup file, but `tests/setupServer.ts`
> is off-limits and empty. [...] If you want them moved, the patch is a straight lift of lines 13-112
> into `tests/setupServer.ts` plus an import.

`.claude/rules/tests.md` § Shared test infrastructure is unambiguous: "Test files import shared
infrastructure rather than declaring local fixture factories", and "Export every reusable helper, fixture
type, factory, constant, and guard from setup files." S3 could not comply because it did not own the
destination. **You do.**

Lift them into `tests/setupServer.ts` and import them back. Read the file as it stands at `dcd50a3`
rather than trusting the line range S3 quoted — line numbers move.

Two constraints on the lift, both from the same rule file:

- A setup file owns everything an assertion needs and nothing an assertion is. `describe`, `it`, and
  `expect` never appear in a `setup*.ts`. If any of the five carries an assertion, leave that part in the
  test file and lift only the infrastructure.
- Helper names follow module-helper naming, `{verb}{Noun}`. `killFixtureServer` already does. Rule on
  whether `SERVER`, `FIXTURE`, `PASSING`, and `HOST` read as workspace-level constants once they leave
  the file that gave them their context, and rename any that do not. That naming call is yours.

This also strengthens criterion 5's proof: `tests/setup.test.ts` now has real exported behaviour to
assert, not only `ROOT`.

## One file you own moved under you

`tests/src/server/stages/LintStage.test.ts` grew from 4,472 to roughly 7,200 bytes and
`tests/src/server/stages/TypeStage.test.ts` will move under S4. Re-read both at dispatch. Every line
number this brief quotes for either file is stale by construction.

## Your blocked-on list is unchanged

S3 has landed. S4, T1, and H1 have not. The reason stated in the brief still holds: this unit's value is
uniformity, so landing it while another unit is rewriting one of its seven files leaves a hand-computed
depth behind and makes the tree worse than either end state.

---

# Amendment 2 — amendment 1's carrier is WITHDRAWN

**Do not lift the five helpers.** Amendment 1 assigned that work here; the S3 audit's conformance
verifier refuted the finding it rests on, and it was right on both points it made.

On the rule: `.claude/rules/tests.md` conditions extraction on "as soon as it **could serve another
test**" and on the helper being **reusable**. Amendment 1 read both as unconditional. The verifier
measured the condition instead: no other probe test drives an Oxlint language server. `SERVER` is an
Oxlint-LSP protocol fixture, `FIXTURE` is its package layout, `HOST` hardcodes the `LintStage` import and
its lint-specific flow, and `killFixtureServer` reads the pid that `SERVER` alone writes. Four of the
five are single-consumer by construction, so the rule's trigger is not met.

On the scoping: this unit is ROOT centralization and `resolveRoot` adoption across seven sites. A lift of
Oxlint fixture infrastructure is a different subject riding in a unit that does not own it — the error
`.agents/orchestration.md` names as "Give a small unrelated obligation its own unit."

**Dissent recorded.** The Sol lane confirmed the violation, reading `.claude/rules/tests.md:151-164` as
requiring setup-file placement with no exemption. Two defensible readings; the verifier's is the one
grounded in a measurement of the rule's own trigger, so it wins. If a second Oxlint-driving test ever
appears, the trigger is met and the extraction is owed then.

Amendment 1's other content stands: re-read both stage test files at dispatch, and the blocked-on list is
unchanged.
