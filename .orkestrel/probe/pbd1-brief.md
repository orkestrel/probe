# PB-D1: make every sentence in the guide true of the code that ships

## Role and engine

Role `implementer`. Engine Claude Opus 5, high effort. Sole writer in `/workspace/probe` for the
duration of this unit. This unit is documentation voice and behavioural truth, which is why it is
not on the objective bench.

## Objective

`@orkestrel/probe` publishes `0.0.1` after this unit. The guide is the package's contract with a
reader, and an audit found sentences the code contradicts, a categorization gate that inspects text
instead of running anything, and prose that states counts. Close all of it, and document the
ownership axis three units before you built.

## Read first, in this order

1. `AGENTS.md` — § Writing and § Documentation contract especially
2. `.claude/rules/documentation.md`, `.claude/rules/writing.md`, `.claude/rules/tests.md`
3. `guides/probe.md` — the subject
4. `.orkestrel/probe/probe-audit-verdict.md` — C6 and C7 are yours
5. `.orkestrel/probe/pbdesign-ruling.md` — PB-Q3 is the axis you document
6. `.orkestrel/probe/pbe1-report.md` and `.orkestrel/probe/pbe2-report.md` — what the axis became,
   and the exact replacement text those units returned for you

## What earlier units already did — do not redo

- The server factories section is gone and the fences construct `Probe` and `ProbeServer` directly.
- The `TypeStageInterface` row no longer names `candidates`.
- The `Inspection` row names the coordinator seam.
- `Origin` and the narrowed `ProbeErrorCode` exist in source and are proved by tests.

## D0 — three gates are RED right now, and closing them is the objective

Host readings taken at `PB-E2`'s completion. `format:check`, `lint:check`, `check`, `build`, and the
`src`, `policy`, and `config` projects are green — `src` at 11 files and 166 tests. These are not:

```text
guides:       2 failed | 10 passed (12)
distribution: 1 failed |  1 passed (2)
```

**The two guide failures are your subject.** `documents every public export, and publishes every
documented name` fails because the guide does not yet document the renamed surface, and
`states the constants at the values it publishes` fails because the guide still shows the old
constant values. D1 closes both.

**The distribution failure is a stale test, not a defect.** Its consumer builds
`new required.ProbeError('cross-copy failure', { code: 'invalid' })`. `invalid` is a
`ProbeErrorCode` value the migration removed, and no `origin` is supplied where one is now required,
so the guard refuses it and the cross-copy assertion fails with
`The guard refused a failure from the required copy`.

The guard is right. Give the consumer a currently declared pair. Keep what that assertion exists to
prove — that a failure minted by the required CommonJS copy is still recognised by the imported ESM
copy's guard, which is the dual-package hazard this test was written for. Do not weaken it to a
same-copy check.

## Your work

**D1 — document the ownership axis.**

§ Failures loses any prose column that says who acts, and gains an `Origin` column carrying the value
itself — `claimant`, `workspace`, `instrument` — beside a `Code` column of conditions: `refused`,
`missing`, `malformed`, `destroyed`, `deadline`. The same table, readable as a value rather than as
an instruction.

State the invariant plainly, because it is what makes one union sound: **a `claimant` finding is a
tool's diagnostic about a candidate source, and nothing else. Every other claimant fault is a throw.**

§ What a probe proves changes `origin: 'code'` to `origin: 'claimant'`, and "no findings of either
origin" to "no findings of any origin". § Prerequisites rewrites the entry about a test path naming
no configured Vitest project, because it now throws rather than reporting. § Surface and § Constants
update the renamed rows.

Show a consumer what the axis buys them: one branch answering "is this my fault, the workspace's, or
the tool's" from a value, for every failure the package raises.

**D2 — two exact replacements an earlier unit returned.**

Insert in the receipt-limit section, verbatim except that you must reconcile it with the current
vocabulary:

> **Write and delete containment does not bound reads.** TypeScript and Oxlint can inspect files
> outside the workspace through a symlinked candidate path, and a contained `Claim.project` can reach
> outside through `extends`, `files`, `include`, or project references. A receipt does not vouch that
> those reads stayed inside the workspace.

Replace the receipt-condition bullet with this, **corrected for the rename** — the unit that wrote it
predates `Origin`, so `'code'` there is now `'claimant'`:

> - the control produced an `origin: 'claimant'` finding at the stage it declared, and neither phase
>   produced an `origin: 'instrument'` finding; and

**D3 — the categorization gate inspects text instead of running anything.**

`tests/src/core/errors.test.ts` strips comments and searches source for `new Error(`. That cannot see
a native failure raised by a dependency, which is exactly the class that escaped: an audit lane
measured `readWorkspaceManifest(process.cwd(), 'definitely-absent-package')` raising a native `Error`
with `isProbeError(error) === false`, while the guide claimed every failure this package raises is a
`ProbeError`.

The unit before you translated those failures. Replace the text sweep with **real failure-path
executions**: drive each failure and assert the value it raises. Where a path cannot be driven, say
so and keep a text check for that path alone, naming why.

Prove the repaired gate fails against a planted untranslated failure and passes without it. Plant it
in a file this unit owns and name exactly how you removed it.

**D4 — the guide claims behaviours the code contradicts.**

The audit named these. Reproduce each before you write, then correct the guide to what the code does:

- The contained-path claim, against the symlink read reach D2 documents.
- The claim that a same-shaped caller file survives everywhere, against the reserved boot-path rule.
- The claim that every package failure is a `ProbeError` — now true after the translation, so verify
  rather than assume.
- Configuration state persists: the type stage returns an existing service before reparsing a
  caller-named project, while the lint and runtime configurations are resident. A modified
  configuration can therefore produce a different answer from a newly constructed stage, and the guide
  does not admit that cache boundary. Document it, or say why it needs no admission.

**D5 — the count sweep.**

The audit found prohibited prose across `README.md`, `guides/probe.md`, `src/core`, `src/server`, the
stages, and several test files: listener tallies, a claim named by position, a call named by
position, a line named by position, and a receipt-field inventory numbered in prose.

Sweep `README.md`, `guides/probe.md`, `guides/README.md`, and every TSDoc and comment under `src/`
and `tests/`, case-insensitively and across inflections including spelled-out numbers and ordinals.
Name the pattern and the paths behind your result, including a clean one. An external identifier is
not a count: a version, a date, an exit code, a limit, a duration, and a size all stay. Do not touch
`.orkestrel/`. Express the receipt as a named grammar rather than a numbered inventory.

## Scope

- **Owned:** `guides/probe.md`, `README.md`, `tests/guides.test.ts`, `tests/src/core/errors.test.ts`,
  `tests/distribution.test.ts`, and the TSDoc and comments inside `src/**/*.ts` and `tests/**/*.ts`. You may change executable
  source only where D3's real executions require a translated failure that is genuinely missing — and
  if you find one, stop and report first.
- **Off-limits:** every other file. The vendored host — `AGENTS.md`, `CLAUDE.md`, `.agents/`,
  `.claude/`, `.codex/`, `.cursor/`, `configs/helpers.ts`, `scripts/*.sh`, `tests/config.test.ts`,
  `tests/policy.test.ts`, `tests/setupPolicy.ts` — is owned by `@orkestrel/scaffold` and restored by
  `repair`. `package.json` and `vite.config.ts` are scaffold-planned. Do not change the version.

## Host conditions

- The tree is committed and clean when you start.
- `tests/guides.test.ts` asserts a receipt earned with `tmp/probe` absent. Remove it with
  `rm -rf tmp/probe` before any guides-project run.
- You are native, so no bench sandbox restricts you. Every project runs here.
- Run `npm run format` before `format:check`; `lint --fix` and hand edits leave files the formatter
  has not seen.

## Execution

Perform this assignment directly. Spawn nothing.

## Prohibitions

- Never run `git checkout`, `git restore`, `git stash`, `git reset`, or `git clean`.
- Never commit, push, install, or read a credential.
- No `any`, no `as`, no `!`, no `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable`.
- No mocks, behavioral fakes, module replacement, or framework spies.
- State no count in any prose you write, and never name a list item by its position. You are closing
  the finding that says so.

## Acceptance criteria

Close them in this order and report each command with its exit code and counts.

1. Each D4 behaviour is reproduced and recorded before its guide sentence changes. Paste the commands
   and their output.
2. The repaired categorization gate fails against a planted untranslated failure and passes without
   it. Record both readings and the exact plant-and-remove steps.
3. `rg -n -i "origin: 'code'|FindingOrigin|FINDING_ORIGINS" guides/ README.md src/ tests/` returns no
   hit.
4. `npm run format` then `npm run format:check` exits 0.
5. `npm run lint:check` exits 0.
6. `npm run check` exits 0.
7. `rm -rf tmp/probe && npm test` exits 0. Report every project's counts.
8. `npm run test:distribution` exits 0. Report its counts.

## Deviation contract

Stop and report if the objective itself conflicts with what you find: expected, found, exact
evidence, done or not done, and at most one short hypothesis. An ancillary choice — where a paragraph
sits, a heading's wording — is yours to decide, record, and carry on from. A change to executable
source is not ancillary: it stops the unit.

## Output

Write your report to `tmp/pbd1-report.md` and make it your final message too. It contains: the files
you touched and what changed in each; each D4 reproduction with its exact command and output; the
plant-and-remove steps; the sweep's pattern, paths, and clean control; each acceptance criterion with
its exit code and counts; and anything you could not close. No process diary.
