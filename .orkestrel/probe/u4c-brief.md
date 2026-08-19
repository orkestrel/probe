# Unit 4c — the package guide and its parity proof

## Role and engine

`implementer` on Claude Opus 5. You are the sole serial writer in `/workspace/probe`.

## Objective

Write the package guide, index it, and bind it to the source with the parity proof, so every
backticked API in the guide resolves to a real public export and every public export is documented.

## Context

Read before acting, in this order:

1. `/workspace/probe/AGENTS.md` and `/workspace/probe/.claude/rules/documentation.md`, which govern
   guides and parity, plus `/workspace/probe/.claude/rules/writing.md` for the prose.
2. `/workspace/probe/src/core/types.ts` and `/workspace/probe/src/server/types.ts`.
3. `/workspace/probe/guides/README.md`, whose `## By concept` rows this unit fills in.
4. `/home/user/scaffold/PROBE.md`, the design ruling, for what the mechanism is and why. The guide's
   opening paragraphs state the doctrine; take it from there rather than inventing one.

Seven guides already sit in `guides/` and none of them is yours:

```text
$ ls guides/
README.md  contract.md  emitter.md  guide.md  mcp.md  scaffold.md  timeout.md  tool.md
```

All seven are vendored mirrors of other packages' guides, refetched by a scaffold verb. They are not
yours to edit, they are not concept rows, and their relative links address an upstream tree rather
than this one, so they sit outside local-link parity. Five arrived after this workspace was
scaffolded, when its runtime dependencies were declared. Read `guides/guide.md` as the model for
section structure, table shape, and voice — and only as a model.

### The model to copy for the parity proof

`/home/user/scaffold/tests/guides.test.ts` is a working parity proof over the same
`@orkestrel/guide` API, in a repository with the same layout. Read it in full and adapt it. Its
inventory glob, its `FENCE_LANGUAGES` list, and its handling of vendored mirrors as non-rows are all
decisions you will need to make the same way or deliberately differently.

`@orkestrel/guide` is already a devDependency here:

```text
$ node -e "console.log(require('./package.json').devDependencies['@orkestrel/guide'])"
^0.0.12
```

### The config change this unit forces, and both halves of it

`tests/guides.test.ts` is the file whose presence selects the `guides` Vitest project. From the
scaffold source:

```text
$ grep -n "GUIDES_TEST_PATH" /home/user/scaffold/src/core/constants.ts /home/user/scaffold/src/bin/CLI.ts
src/core/constants.ts:234:export const GUIDES_TEST_PATH = 'tests/guides.test.ts'
src/bin/CLI.ts:556:		const guides = resolveContainedPath(target, GUIDES_TEST_PATH)
```

`vite.config.ts` is a scaffold **content-owned** artifact:

```text
$ grep -n "path: 'vite.config.ts'" -A 3 /home/user/scaffold/src/core/compilers.ts
869:			path: 'vite.config.ts',
871:			ownership: 'content',
```

A content-owned file is regenerated, so **never hand-edit `vite.config.ts`**. Create
`tests/guides.test.ts` first, then run `npx scaffold overwrite` in `/workspace/probe`, which adds the
`guides` project because the file now exists. Read the resulting diff and confirm it added only that.

`package.json` is not a scaffold artifact, so the same verb does not add the script. Add
`test:guides` by hand, matching the exact form the sibling scripts use, and add it to the `test`
chain. The vendored `tests/config.test.ts` checks that the planned projects and the npm scripts
agree, so adding one half without the other turns `npm run test:config` red. Grant yourself both
halves or neither.

### The surface the guide must document

Core, published as `@orkestrel/probe`. Twenty runtime exports:

```text
$ node -e "console.log(Object.keys(require('./dist/src/core/index.cjs')).sort().join(', '))"
CASE_SHAPE, CLAIM_SHAPE, CONTROL_SHAPE, PROBE_STAGES, RECEIPT_PREFIX, RECEIPT_SEPARATOR, SOURCE_SHAPE, computeReceipt, formatCheck, formatFinding, formatVerdict, isCase, isCheck, isClaim, isControl, isFinding, isSource, isStage, isToolchain, isVerdict
```

Twelve core types, from `src/core/types.ts`: `Stage`, `Source`, `Case`, `Control`, `Claim`,
`Finding`, `Check`, `Toolchain`, `Verdict`, `ProbeEventMap`, `ProbeOptions`, `ProbeInterface`.

Server, published as `@orkestrel/probe/server`. Eighteen runtime exports, asserted in
`tests/src/server/index.test.ts`, plus three types from `src/server/types.ts`: `StageInterface`,
`WorkspaceManifest`, and `ProbeServerInterface`.

`ProbeInterface`, `StageInterface`, and `ProbeServerInterface` are the three behavioral interfaces, so each owns a
`#### \`Interface\`` method table under `## Methods`, and each implementing class exposes exactly
those methods. `Probe` implements `ProbeInterface`; `TypeStage`, `LintStage`, and `RuntimeStage` each
implement `StageInterface`; `createProbeServer` returns a `ProbeServerInterface`.

## Unknowns

- Whether the parity proof, once written, reports drift the guide must close. That is the proof
  working. Close the drift in the guide, not by weakening the proof.

Nothing else here is unknown. The Orchestrator measured `scaffold overwrite` against a throwaway copy
of this tree before writing this brief, and the measured behaviour is stated in the following section
so you do not rediscover it.

## The order the config change must run in

The order is not free. `scaffold overwrite` refuses a half-change, and its refusal names the exact
line you are missing:

```text
TARGET: The manifest at . does not reach a Vitest project the planned configuration registers: guides.
No chain from test or prepublishOnly invokes it. To continue, add this exact script line to
package.json: "test:guides": "vitest run --config vite.config.ts --no-cache --reporter=dot --project guides",
```

So run these three steps in this order:

1. Create `tests/guides.test.ts`. Its presence is what selects the project.
2. Add the `test:guides` script to `package.json` and chain it into `test`. Both halves, or the verb
   refuses.
3. Run `npx scaffold overwrite`. It adds the `guides` project to `vite.config.ts` and puts `guides`
   into the `projects` array between `config` and `probe`.

Measured result of step 3 in the copy, for comparison against yours:

```text
vite.config.ts replaced (16 lines added).
projects: [srcCore, srcServer, srcBin, policy, config, guides, probe],
```

A separate unit has already brought this workspace onto the current scaffold and re-vendored it, so
`overwrite` here changes `vite.config.ts` and nothing else. If it writes any other file, that is a
real deviation: stop and report it.

## The three behavioral interfaces and their exact members

Read from the source rather than recalled, so the method tables match:

```text
ProbeInterface        emitter, toolchain (readonly data)   prove(claim), destroy()
StageInterface        stage (readonly data)                inspect(subject), destroy()
ProbeServerInterface                                       start(), stop()
```

Readonly data properties stay in the interface's `## Surface` row; only the call-signature members
belong in a `## Methods` table.

One divergence needs documenting honestly rather than hidden. `TypeStage.inspect` takes an optional
second parameter, `project`, which `StageInterface.inspect` does not declare. That is deliberate: a
repair round moved it off the shared contract because no consumer read it there, and onto the one
class where it is real. The method sets still match exactly, which is what parity checks. Document the
extra parameter on `TypeStage`, and do not add it to the interface's table.

## The published front page is still the scaffold placeholder

Three fields reach npm and every one of them is starter text:

```text
$ cat README.md
# @orkestrel/probe

The @orkestrel/probe package.

## Development
…
$ node -e "const p=require('./package.json'); console.log(p.description); console.log(JSON.stringify(p.keywords))"
The @orkestrel/probe package.
[]
```

`README.md` is listed in the manifest's `files`, so it is the first thing anyone sees on the registry
page. Write it for someone deciding whether to install this: what the package does, the one-paragraph
doctrine that a claim carries its own negative control and earns a receipt only when the case is clean
and the control fails where it said it would, the two-step install and `.mcp.json` registration, and
one worked example of a claim and the verdict it returns. Take the numbers from `PROBE.md` § What was
built rather than inventing any. Keep it short; the guide carries the detail and the README points at
it.

Give `description` one sentence that says what the package does, and `keywords` the handful of terms
someone would actually search. Neither is decoration: both are how the registry finds this package.

## Scope

- **Owned**: `guides/probe.md`, `guides/README.md`, `README.md`, `tests/guides.test.ts`,
  `package.json`, and `vite.config.ts` **only through `npx scaffold overwrite`**.
- **Off-limits**: `src/**`, `tests/src/**`, `tests/config.test.ts`, `tests/policy.test.ts`,
  `tests/setup*.ts`, `guides/guide.md`, `guides/scaffold.md`, `configs/**`, and every dotfile.
- **Tools**: read, write, and `Bash` for validation and the one scaffold verb.
- **Permissions**: do not commit, push, tag, publish, install a dependency, or run a destructive
  command. Do not add an npm package. Do not read, print, or copy any secret.

## Criteria

1. `guides/probe.md` exists and carries `## Surface`, `## Methods`, and `## Tests` sections.
2. Every one of the twenty core runtime exports, the twelve core types, the eighteen server runtime
   exports, and the three server types appears in the guide's surface with its correct kind.
3. The guide documents no name that is not a real public export.
4. `## Methods` carries one table per behavioral interface, keyed by its backticked name, and each
   table's rows exactly match that interface's call-signature members.
5. Every code fence in the guide imports through the published specifier `@orkestrel/probe` or
   `@orkestrel/probe/server`, never through an `@src/*` alias.
6. Every fence that states an exact value is true. Execute it and assert the real value; a fence
   whose comment disagrees with what the call returns is a defect of the same kind as a wrong return
   value.
7. `guides/README.md` names `guides/probe.md` in both its concept index and its directory index, and
   carries no remaining "Not created" placeholder.
8. `tests/guides.test.ts` proves, in both directions, that the direct declarations equal the barrel
   surface and the barrel surface equals the documented surface, and that every link in the guide
   resolves. Every parity check reduces to comparing an empty list against an empty list, so a
   failure names exactly what drifted.
9. All seven vendored mirrors in `guides/` are excluded from parity as non-rows, and the test says
   in a comment why. Do not name them individually where a rule can exclude them, because the set
   grows whenever a dependency is declared.
10. `npx scaffold overwrite` adds the `guides` project to `vite.config.ts`, `package.json` gains a
    `test:guides` script matching its siblings' form, and that script joins the `test` chain.
11. `npm run test:guides` exits 0.
12. `npm run test:config` exits 0, proving the projects and the scripts agree.
13. `npm test` exits 0 and reports no skipped and no todo test.
14. `npm run format:check` and `npm run lint:check` both exit 0.
15. `npx scaffold audit` reports no drift, proving no content-owned file was hand-edited.
16. `README.md` carries no starter placeholder text, and states what the package does, how it is
    installed and registered, and one worked claim with the verdict it returns.
17. `package.json` carries a `description` that is one sentence about what the package does, and a
    non-empty `keywords` list.

## Prose requirements

`.claude/rules/writing.md` binds every sentence you write. The rules that most often go wrong in a
guide of this kind: write `must`, `can`, or `might` and never `should`; address the developer as
`you` and never write `we` or `our`; give the software no human faculties; put a code token in
backticks and follow it with a noun; claim only what the reader can check, and never write `ensure`,
a superlative, or an effort adjective as a claim about behavior; introduce every list, table, and
fence with a complete sentence naming what follows.

## Execution

Perform this assignment directly. Spawn no subagent.

## Deviation contract

Stop and report when reality conflicts with the primary objective: `scaffold overwrite` rewriting a
file this brief did not grant you, a parity failure whose only fix is in an off-limits file, or a
documented behaviour the code contradicts. Report expected, found, the exact command and its output,
whether the work is done, and at most one short hypothesis.

Decide an ancillary question yourself and record it: section order, table column choice, the wording
of a row, and which example illustrates which capability are yours.

## Output

Return exactly these five sections, and no process diary.

1. **Files written** — each path with a one-line statement of what it carries.
2. **Validation** — each command from criteria 11 through 15 with its exit code.
3. **Acceptance evidence** — for criteria 1 through 10, the criterion number and how it is closed.
   For criterion 6, name each executed fence and the value it returned.
4. **Deviation** — the contract above, or `None`.
5. **Decisions** — ancillary decisions you made, or `None`.
