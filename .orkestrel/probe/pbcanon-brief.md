# PBCANON — close the conformance audit's probe rows

## Role and engine

`implementer` (Claude Opus 5, native). Perform the assignment directly and spawn nothing.

## Read first

`.orkestrel/probe/canon-audit.md` — six rule-domain lanes audited both packages letter of the law and
a reviewer reconciled them. It carries the rule line each row breaks. Read it, then read
`/workspace/probe/AGENTS.md` and the `.claude/rules/` files it names — at minimum `typescript.md`,
`architecture.md`, `names.md`, `tests.md`, `documentation.md`, `writing.md`.

Row 1 of that table is a `@orkestrel/process` row and is **not yours**; it is with the owner.

## Row A — probe has no error type at all, and 33 plain throws

This is the largest real gap in the package, and it is a first-release gap: `@orkestrel/probe` has
never published, so this is the cheapest moment it will ever have.

`.claude/rules/typescript.md:45` requires a programmer error or invalid argument to throw an
`AppError`; `:68` requires an error class to expose a machine-readable `code` and optional `context`;
`:69` requires a guard for safe `catch` narrowing. Probe has no `src/core/errors.ts`, no code union,
and no guard, so a consumer catching from `Probe`, `ProbeServer`, or any stage can read a message
string and nothing else.

`@orkestrel/process/src/core/errors.ts` is the pattern to mirror, and mirror it deliberately rather
than by copying: it brands with `Symbol.for` and reads the brand through
`Object.getOwnPropertyDescriptor`, because `instanceof` fails across an ESM and CJS copy of one
package. That defect is real and this package will meet it too.

Do **not** reuse `ContractError` from `@orkestrel/contract`. Its codes describe contract-shape
failures and probe's domain is not that.

Define the code union in `src/core/types.ts` and the frozen tuple it derives from in
`src/core/constants.ts`, the way process does after its own audit. Route every one of the 33 throws
through the new error. Where a throw is genuinely an instrument fault rather than a programmer error,
say so in your report rather than forcing it into the wrong code.

## Row B — `Overlay` and `INTERNAL`

**The audit's recommendation on this row is overruled by the owner, and the rule agrees with the
owner.** Do not follow `canon-audit.md` row 3's fix as written.

`INTERNAL` is not a mechanism for keeping a declaration out of the published surface. It is a narrow
exception for a file that is genuinely isolated — a different environment, process, or thread that
cannot import from this package and therefore carries its own copies of what it needs. Worker-type
work, and nothing else. `@orkestrel/process` declares it `Object.freeze([])`, which is the healthy
state.

`.claude/rules/architecture.md:253` gives the test: *barrel that class when a consumer can construct
it from values they already hold.* `new Overlay()` takes no arguments, so a consumer can. It must be
barrelled.

So:

1. Restore `export * from './Overlay.js'` to `src/server/index.ts`.
2. Set `INTERNAL` in `tests/guides.test.ts` to an empty frozen array.
3. Delete the TSDoc sentences at `src/server/types.ts:35-39` and in `Overlay.ts` that claim either name stays out of the barrel. They describe a state that should not exist.
4. Add the `Overlay` and `OverlayInterface` rows the `## Surface` table of `guides/probe.md` now owes, with the runnable `@example` a barrel row obliges. `Overlay` already carries one; check it runs.

The design fact PB6 was protecting stays true and stays documented: each inspection mints its own
overlay, and one supplied from outside would be reused across inspections and report a stale answer as
fresh. State that as guidance in the guide, which is where a consumer meets it. It is a reason not to
share an instance, not a reason to hide the class.

## Row C — the parity gate cannot see a type-only export

`tests/guides.test.ts` derives its population from `Object.keys(server)`, which never observes a
type-only export, and `extractDocumented` discovers only exports that already carry documentation. So
the gate that exists to catch an undocumented export is blind to two whole classes of them.

Scan the source for exported declarations and check documentation against that population. **Prove the
new gate fails**: plant an undocumented export, watch it red, remove it. A gate you cannot make fail
is not a gate.

## Row D — two test files exist only for barrels

`.claude/rules/tests.md:43` forbids a test file created solely for a barrel, `constants.ts`, error
definitions, or `types.ts`. `tests/src/core/index.test.ts` and `tests/src/server/index.test.ts` are
both entirely membership and `typeof` assertions.

Delete them. Move what they uniquely prove — the interface-member checks — beside the parity test in
`tests/guides.test.ts` that already owns that question. Losing coverage is not the point; having one
owner for it is.

## Row E — one writing breach

`guides/probe.md:478` uses `above` for a cross-reference. `.claude/rules/writing.md:51` requires
`preceding`, `following`, `earlier`, or `later`. Name the section it points at.

## Standing conditions

- The tree is clean at the commit the dispatch names, except `tmp/`, which is gitignored and expected dirty.
- This host permits nested child creation and real installs. Take every measurement.
- Do not edit `.agents/`, `.claude/`, `configs/`, or `vite.config.ts`. `.orkestrel/` is off-limits.
- Adding an error class adds exports, which moves the guide's Surface table and the parity gate. Both are yours.

## Scope

**Owned:** everything under `src/` and `tests/` except vendored paths, plus `guides/probe.md` and
`package.json` if a new script is required.

## Execution

Perform this assignment directly. Spawn nothing. Insert a failing proof before each behavioural
change and before the gate repair.

## Acceptance criteria

1. Row B: `Overlay` is barrelled, `INTERNAL` is empty, and no TSDoc claims otherwise.
2. Row A: a `ProbeError` with a code union, optional context, and a cross-copy guard exists, and no `throw new Error(` remains in `src/`.
3. Row A: the guard recognises an error thrown by a second copy of the package, proven the way process proves it.
4. Row C: the parity gate detects an undocumented type-only export, proven by planting one.
5. Row D: both barrel-only test files are gone and their unique assertions live in the parity gate.
6. Row E: no `above` or `below` cross-reference remains in `guides/probe.md`.
7. `npm run format:check` exits 0.
8. `npm run lint:check` exits 0.
9. `npm run check` exits 0.
10. `npm run build` exits 0.
11. `npm test` exits 0.
12. `npm run test:distribution` exits 0.

## Deviation contract

A conflict with the objective stops the unit: expected, found, exact evidence, done or not done, one
short hypothesis. Do not restructure `Verdict`; three findings about its shape are a design round the
Orchestrator holds.

## Output

Per row: what you changed and the `file:line`. The red-then-green command and both counts per
behavioural change. Which throws you classed as instrument faults rather than programmer errors, and
why. The gate table with bare exit codes. Files changed.

No process diary.
