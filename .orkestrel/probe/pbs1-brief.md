# PB-S1: take out the surface that earns nothing, before this package first publishes

## Role and engine

Role `implementer`. Engine Claude Opus 5, high effort. Sole writer in `/workspace/probe` for the
duration of this unit.

## Objective

`@orkestrel/probe` has never been published. Remove two pieces of public surface that a design lane
ruled unearned, and carry every consumer with them in the same change.

## Read first, in this order

1. `AGENTS.md` — § Design laws especially
2. `.claude/rules/architecture.md` — § Wrapper test and § Declaration placement decide this unit
3. `.claude/rules/patterns.md`, `.claude/rules/names.md`, `.claude/rules/documentation.md`
4. `guides/probe.md` — the governing spec
5. `.orkestrel/probe/pbdesign-ruling.md` — the ruling this unit executes

## What was ruled, and is not yours to reopen

**`createProbe` and `createProbeServer` are deleted, and `src/server/factories.ts` goes with them.**
Both are one-line constructor pass-throughs. `.claude/rules/architecture.md` § Wrapper test names a
pass-through factory for deletion. `src/core/index.ts` already carries no factories row, so the
precedent is inside the package.

**`TypeStageInterface.candidates` and its getter on `TypeStage` are deleted.** The getter's whole
body is `return this.#overlay.paths`, over a member already public on an already-barrelled,
no-argument-constructible `Overlay`. § Wrapper test names a rename-only getter for deletion.
`LintStage` and `RuntimeStage` hold overlays and expose no such member.

**`Inspection` stays exported.** An earlier lane called it dead weight; the design lane refuted that
and the refutation was accepted. `architecture.md` § Declaration placement forbids a module-scope
interface in an implementation file, so `*/types.ts` is its only home and a type there is barrelled by
construction — "intern it" means "delete it", and the capability should exist because the guide
publishes a coordinator seam on purpose. Add one TSDoc sentence to its remarks naming who mints one,
in the voice `OverlayInterface`'s remarks already use. Change no type text.

## The one thing the ruling could not settle

The design lane derived, **by reading and not by running**, that `this.#overlay.clear()` inside
`TypeStage.#destroy` is unreachable: `inspect` installs a fresh `Overlay` and clears it in a `finally`,
so `#overlay` is empty whenever no inspection is in flight.

Prove it before you delete it. Run the type stage's suite with the line removed and with it present,
and trace the path where `await this.#typescript` rejects before the overlay is installed. If any path
leaves the overlay non-empty at teardown, **keep the line**, and keep an assertion that reads it —
through `OverlayInterface.paths` on an overlay the test owns, never through a restored `candidates`.
Report which way it went and the evidence.

## What the three `candidates` assertions become

`tests/src/server/stages/TypeStage.test.ts` reads `candidates` at three places. Two already prove
their claim through the consumer door in the same `it` block:

- The release-on-failure claim is proved by the following `inspect` importing the same paths and the
  test asserting the disk text came back. Delete the `candidates` assertion; the proof stands.
- The release-after-inspection claim is proved by the released inspection's test text compiling clean
  and its findings being empty.
- The post-teardown claim has no other door. Replace it with the contract teardown actually carries:
  `await expect(stage.inspect(subject)).rejects.toThrow('The type stage has been destroyed')`.

Read each site before editing it. The line numbers in the ruling were taken while another unit was
editing this tree, so re-resolve every one.

## Scope

- **Owned:** `src/server/factories.ts` (delete), `src/server/index.ts`, `src/server/types.ts`,
  `src/server/stages/TypeStage.ts`, `src/bin/main.ts`, `tests/src/server/stages/TypeStage.test.ts`,
  `tests/src/server/ProbeServer.test.ts`, `tests/src/bin/main.test.ts`, `tests/distribution.test.ts`,
  and — for the factory substitution only — `guides/probe.md` and `README.md`.
- **In `guides/probe.md` and `README.md` you own the factory change and nothing else.** Delete the
  § Server factories section, move what its TSDoc said into the engine table's `Probe` and
  `ProbeServer` rows, and rewrite every fence that calls a factory to construct the class directly.
  Do not touch § Failures, § What a probe proves, or § Prerequisites; a later unit owns those and a
  conflicting edit costs both units.
- **Off-limits:** every other file. The vendored host — `AGENTS.md`, `CLAUDE.md`, `.agents/`,
  `.claude/`, `.codex/`, `.cursor/`, `configs/helpers.ts`, `scripts/*.sh`, `tests/config.test.ts`,
  `tests/policy.test.ts`, `tests/setupPolicy.ts` — is owned by `@orkestrel/scaffold` and restored by
  `repair`. `package.json` and `vite.config.ts` are scaffold-planned; do not hand-edit either. Do not
  change the version. Do not touch `src/core/`.

## Host conditions

- The tree is committed and clean when you start. Untracked files under `.orkestrel/` are the
  campaign record and are expected.
- `tests/distribution.test.ts` drives the packed tarball through its public exports, so it is the
  proof the barrel still serves a consumer after the row is gone. It is not run by `npm test`; it runs
  from `test:distribution` and needs a build and a real pack. Take that reading if you can and report
  it as an observation; it is not a criterion, because it installs a tarball and that can exceed what
  this container grants.
- `tests/guides.test.ts` asserts a receipt earned with `tmp/probe` absent. Delete `tmp/probe` before
  any guides-project run: `rm -rf tmp/probe`.
- Do not run `npm run build`, tree-wide `npm run format`, or the whole `npm test`. Validate scoped.

## Execution

Perform this assignment directly. Spawn nothing.

## Prohibitions

- Never run `git checkout`, `git restore`, `git stash`, `git reset`, or `git clean`. Each discards a
  working-tree change silently, and this tree has no other copy of your work. To undo your own edit,
  undo exactly that edit.
- Never commit, push, install, or read a credential.
- No `any`, no `as`, no `!`, no `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable`.
- No mocks, behavioral fakes, module replacement, or framework spies.
- State no count in any prose you write, and never name a list item by its position. This binds
  TSDoc, comments, test names, the guide, and the README.

## Acceptance criteria

Close them in this order and report each command with its exit code and counts.

1. `rg -n 'createProbe|createProbeServer' src/ tests/ guides/ README.md` returns no hit, and
   `src/server/factories.ts` does not exist.
2. `rg -n 'candidates' src/server/ tests/src/server/` returns no hit that names the removed member.
3. `npm run lint:check` exits 0.
4. `npm run check` exits 0.
5. `npx vitest run --config vite.config.ts --project src:server` exits 0. Report its counts.
6. `npx vitest run --config vite.config.ts --project src:bin` exits 0. Report its counts.
7. `rm -rf tmp/probe && npx vitest run --config vite.config.ts --project guides` exits 0. Report its
   counts. This is what proves you carried the guide and README with the deletion.

## Deviation contract

Stop and report if the objective itself conflicts with what you find: expected, found, exact
evidence, done or not done, and at most one short hypothesis. An ancillary choice — where the engine
table's new sentence sits, what a replacement test is named — is yours to decide, record, and carry
on from.

## Output

Write your report to `tmp/pbs1-report.md` and make it your final message too. It contains: the files
you touched and what changed in each; your ruling on `#overlay.clear()` with the evidence that
decided it; each acceptance criterion with its exit code and counts; the `test:distribution`
observation if you took it; and anything you could not close. No process diary.
