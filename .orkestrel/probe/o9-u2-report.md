## What you measured about the resident runner first

- Appending a `load` hook after the first resident run produced 0 hook calls. Vitest retained the cached hook list.
- Returning augmented `test.projects` from Vite’s `config` hook concatenated the array instead of replacing it. Every project name appeared twice.

## The mechanism

`RuntimeStage` creates one inspection-scoped `Overlay`, records every `subject.files` candidate by its resolved declared path, and clears it in `finally`.

A root configuration hook augments each inline or functional Vitest project with a Vite `load` plugin. It preserves the workspace configuration and project identity rather than replacing the config file or supplying alternate test settings. Because Vite invokes `load` throughout the module graph, candidates work through direct imports and barrels.

The snapshot records covered paths as `overlay:${overlay.revision}`. `#revalidate` invalidates the path when candidate revisions change and when a cleared overlay returns the path to its disk digest. No revision suffix changes module identity, `import.meta.url`, or stack paths.

## Files written

- `src/server/stages/RuntimeStage.ts`
- `tests/src/server/stages/RuntimeStage.test.ts`

`src/server/types.ts` and `src/server/Overlay.ts` were unchanged.

## Red-then-green proofs

Command:

```text
npm run test:src:server -- tests/src/server/stages/RuntimeStage.test.ts
```

Before implementation, exit code 1:

```text
Tests  3 failed | 12 passed (15)
```

The direct-import and barrel tests received `'disk'` instead of `'candidate'`. The sequential-revision test received `'disk'` instead of `'first'`.

After implementation, exit code 0:

```text
Tests  15 passed (15)
```

The tests prove direct imports, transitive barrel imports, two candidate revisions on one resident path, disk restoration after clearing, and unchanged disk bytes before and after inspection.

## Validation

All readings came from the executor’s loaded container:

- `npm run format:check` — exit 0
- `npm run lint:check` — exit 0
- `npm run check` — exit 0
- `npm run build` — exit 0
- `npm test` — exit 1 under executor load; `test:src` reported 12 unrelated failures across off-limits bin, probe, and lint-stage tests

The independent verifier owns the authoritative idle-container gate run.

## Counts

- Added tests: 3
- Targeted runtime-stage result: 15 passed, 0 skipped, 0 todo
- Expected full population from the 201-test baseline: 204
- The loaded executor run stopped after `test:src` failed and reported 78 passed and 12 failed; it did not produce an authoritative full-suite count.

## Anything re-run alone with both readings

Under executor load:

- `main.test.ts`: full run 1 `ENOENT ... tmp/probe` failure; isolated run 1 failed and 4 passed with the same known flake.
- `Probe.test.ts`: full run 2 timeout failures; isolated run repeated them with 2 failed and 8 passed.
- `LintStage.test.ts`: full run 9 timeout failures; isolated run repeated them with 9 failed and 11 passed.

The Orchestrator reran the unchanged tree on an idle container:

```text
helpers.test.ts       14 passed, exit 0
Probe.test.ts         10 passed, exit 0, 35s
LintStage.test.ts     20 passed, exit 0, 6s
```

The readings disagreed because the executor’s `codex exec`, code-mode host, and sandbox remained resident and consumed enough capacity to miss the real-host test budgets.

## Deviation

No implementation or scope deviation occurred. The executor’s full test gate was red because of confirmed container contention and the named pre-existing bin flake. No off-limits file was edited.

## Decisions

- Install the overlay plugin while each Vitest project is created.
- Preserve declared module paths and identities.
- Use Vite’s complete load graph for transitive candidate visibility.
- Use `Overlay.revision` through the existing snapshot invalidation path.
- Clear every inspection’s overlay in `finally`.
- Leave receipt honesty and served-candidate recording to the later unit.