# Unit 4a — core proofs

## Role and engine

`implementer` on GPT-5.6 Sol. You are the sole serial writer in `/workspace/probe`.

## Objective

Prove every pure leaf and every guard in `src/core` with targeted deterministic tests, including the
two standing obligations the plan records. Nothing in `src/core` performs I/O, so every test here is
a plain call and a plain assertion.

## Context

Read before acting, in this order:

1. `/workspace/probe/AGENTS.md` and every rule under `/workspace/probe/.claude/rules/` that governs
   the files you touch, `.claude/rules/tests.md` above all.
2. `/workspace/probe/src/core/types.ts`, which is authoritative for these contracts.
3. `/workspace/probe/src/core/helpers.ts`, `validators.ts`, `shapers.ts`, `constants.ts`.

No skill is named for this unit. The governing design is `PROBE.md` in the scaffold repository; you
do not need it to close this unit, and the source plus the rules decide every question here.

The surface under proof, read from the committed tree:

```text
$ grep -n "^export " src/core/constants.ts src/core/shapers.ts src/core/validators.ts src/core/helpers.ts
src/core/constants.ts:15:export const PROBE_STAGES: readonly Stage[] = Object.freeze(['type', 'lint', 'runtime'])
src/core/constants.ts:29:export const RECEIPT_PREFIX = 'probe'
src/core/constants.ts:40:export const RECEIPT_SEPARATOR = ':'
src/core/shapers.ts:16:export const SOURCE_SHAPE = objectShape(
src/core/shapers.ts:33:export const CASE_SHAPE = objectShape(
src/core/shapers.ts:54:export const CONTROL_SHAPE = objectShape(
src/core/shapers.ts:80:export const CLAIM_SHAPE = objectShape(
src/core/validators.ts:35:export const isStage: Guard<Stage> = literalOf(PROBE_STAGES)
src/core/validators.ts:56:export const isSource: Guard<Source> = recordOf({ path: isNonEmptyString, text: isString })
src/core/validators.ts:70:export const isCase: Guard<Case> = recordOf({ files: arrayOf(isSource), test: isSource })
src/core/validators.ts:85:export const isControl: Guard<Control> = recordOf({
src/core/validators.ts:110:export const isClaim: Guard<Claim> = recordOf({
src/core/validators.ts:128:export const isFinding: Guard<Finding> = recordOf(
src/core/validators.ts:144:export const isCheck: Guard<Check> = recordOf({
src/core/validators.ts:162:export const isToolchain: Guard<Toolchain> = recordOf({
src/core/validators.ts:185:export const isVerdict: Guard<Verdict> = recordOf(
src/core/helpers.ts:18:export function formatFinding(finding: Finding): string {
src/core/helpers.ts:39:export function formatCheck(check: Check): string {
src/core/helpers.ts:63:export function formatVerdict(verdict: Verdict): string {
src/core/helpers.ts:97:export function computeReceipt(verdict: Verdict, stage: Stage): string | undefined {
```

`compileGuard` and `compileSchema` are installed and exported:

```text
$ grep -n "export declare function compileGuard\|export declare function compileSchema" node_modules/@orkestrel/contract/dist/src/core/index.d.ts
881:export declare function compileGuard<S extends ContractShape>(shape: S): Guard<Infer<S>>;
883:export declare function compileGuard(shape: ContractShape): Guard<unknown>;
996:export declare function compileSchema(shape: ContractShape): JSONSchema;
```

Your project and its command:

```text
$ node -e "console.log(require('./package.json').scripts['test:src:core'])"
vitest run --config vite.config.ts --no-cache --reporter=dot --project src:core
```

The `src:core` project includes `tests/src/core/**/*.test.ts` and nothing else. Its setup file
`tests/setup.ts` is empty, and you do not change that.

## Unknowns

None material. Where a documented `@example` in `src/core/helpers.ts` states an exact output string,
that string is a claim you must execute rather than assume: run the call and assert the real return.
Where the example's literal disagrees with what the code returns, the code is the subject of this
unit and the example is not yours to edit — report the disagreement under Deviation and carry on
with the remaining criteria.

## Scope

- **Owned**: `tests/src/core/**`. You may add files there and you may edit
  `tests/src/core/index.test.ts`.
- **Off-limits**: everything else in the repository. Specifically `src/**`, `tests/src/server/**`,
  `tests/src/bin/**`, `guides/**`, `tests/config.test.ts`, `tests/policy.test.ts`,
  `tests/setup*.ts`, `package.json`, `vite.config.ts`, `configs/**`, and every dotfile. Those files
  are correct as they stand for this unit's purposes.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: do not commit, push, tag, publish, install a dependency, or run a destructive
  command. Do not add an npm package. Do not read, print, or copy any secret.

## Execution

Perform this assignment directly. Spawn no subagent.

## Criteria

Each numbered item is independently checkable.

1. `formatFinding` renders both branches: a finding with a `line` renders `path:line message`, and a
   finding without one renders `path message`.
2. `formatCheck` renders the zero case as one line with the plural noun, the one-finding case with
   the singular noun, and a multi-finding case with one indented line per finding in order.
3. `formatVerdict` renders, in order, the identity line, the toolchain line, every case check
   prefixed `case `, every control check prefixed `control `, and a final line that is
   `receipt <token>` when the verdict carries one and `no receipt` when it does not. Assert both
   final-line branches.
4. `computeReceipt` issues its token for a proven verdict, and the token's segments are
   `RECEIPT_PREFIX`, the verdict id, the stage, and the three `name@version` pairs joined by
   `RECEIPT_SEPARATOR`. Build the expectation from the exported constants, not from a pasted literal,
   so a constant that changes reddens the test rather than passing under a stale copy.
5. `computeReceipt` refuses in each of its four distinct ways, one assertion per way: a case check is
   missing for one of `PROBE_STAGES`; a case check carries a finding; the control carries no check at
   the declared stage; the control's check at the declared stage is clean. Each returns `undefined`.
6. Every one of the nine guards accepts a valid value and rejects at least one value that is wrong in
   exactly one way. `isStage` additionally rejects a string outside `PROBE_STAGES`, and `isSource`
   rejects an empty `path` while accepting an empty `text`.
7. `isClaim` and `compileGuard(CLAIM_SHAPE)` return the identical boolean for every member of a
   hostile population of at least 15 values. The population includes, and names in the test, an empty
   `project`, an empty control `reason`, a stage outside `PROBE_STAGES`, an extra unexpected key, an
   object created with `Object.create(null)`, and a `Proxy` whose `get` trap throws. Assert the two
   results equal each other per value; do not assert a fixed expected boolean per value, because the
   obligation is agreement rather than any particular verdict.
8. `PROBE_STAGES` is frozen and its members are exactly `type`, `lint`, `runtime` in that order.
9. `npm run test:src:core` exits 0 and reports no skipped and no todo test.
10. `npm run lint:check` and `npm run format:check` both exit 0.
11. `npx tsc --noEmit --project tsconfig.json` exits 0.

Name each test for the behaviour it proves. Never name a test for a criterion number in this brief;
this brief's numbering is private to it.

## Deviation contract

Stop and report when reality conflicts with the primary objective: a criterion you cannot close with
the owned files alone, a documented example whose literal the code contradicts, or a guard that
disagrees with its shape. Report expected, found, the exact command and its output, whether the work
is done, and at most one short hypothesis. Do not investigate beyond reproducing it, do not improvise
a fix in an off-limits file, and do not alter the plan.

Decide an ancillary question yourself and record it: which file a test group lives in, the order of
`describe` blocks, and the wording of a test name are yours.

## Output

Return exactly these five sections, and no process diary.

1. **Files written** — each path with a one-line statement of what it proves.
2. **Validation** — each command from criteria 9 through 11 with its exit code.
3. **Acceptance evidence** — for criteria 1 through 8, the criterion number and the name of the test
   that closes it.
4. **Deviation** — the contract above, or `None`.
5. **Decisions** — ancillary decisions you made, or `None`.

## Measured evidence for criterion 7

The Orchestrator ran the agreement check against the built core barrel before writing this brief, so
the criterion is known reachable and the population below is known to close it. Reproduce the
property in the test rather than pasting this table.

```text
$ node agree.mjs
AGREE  valid claim              isClaim=true compiled=true
AGREE  empty project            isClaim=false compiled=false
AGREE  missing project          isClaim=false compiled=false
AGREE  empty control reason     isClaim=false compiled=false
AGREE  bad stage                isClaim=false compiled=false
AGREE  missing stage            isClaim=false compiled=false
AGREE  extra key                isClaim=false compiled=false
AGREE  empty test path          isClaim=false compiled=false
AGREE  files not an array       isClaim=false compiled=false
AGREE  file entry wrong         isClaim=false compiled=false
AGREE  null                     isClaim=false compiled=false
AGREE  undefined                isClaim=false compiled=false
AGREE  array                    isClaim=false compiled=false
AGREE  string                   isClaim=false compiled=false
AGREE  null-prototype object    isClaim=true compiled=true
AGREE  throwing proxy           isClaim=false compiled=false
population=16 disagreements=0
```

Two results are worth stating because they are counter-intuitive and a test author might assert the
opposite: both guards **accept** an object created with `Object.create(null)`, and both **reject** a
`Proxy` whose traps throw rather than propagating the throw. Criterion 7 asks only that the two
agree, so neither result is something you change.
