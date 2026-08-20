# PBFIX7 report

## Outcome

The owned correctness scope is closed. Receipts now require a finding-free case, string-declared runtime projects report incomplete inspection as `instrument`, runtime deadlines distinguish claimant execution from instrument cleanup, boot-derived specifications sweep by their terminal revision marker, and mutation-path inspection failures retain workspace ownership.

## Files touched

- `src/core/helpers.ts`
- `src/core/types.ts`
- `src/server/helpers.ts`
- `src/server/stages/RuntimeStage.ts`
- `src/server/types.ts`
- `tests/guides.test.ts`
- `tests/src/core/errors.test.ts`
- `tests/src/core/helpers.test.ts`
- `tests/src/server/Probe.test.ts`
- `tests/src/server/helpers.test.ts`
- `tests/src/server/stages/RuntimeStage.test.ts`

No shared guide, off-limits file, package metadata, or version was changed.

## Rulings

- C3 uses the last revision marker in the basename. That marker names the generated specification's own revision for ordinary and boot-derived paths; changing the boot name would solve only the current boot shape.
- C5's narrowed categorization population was not defensible. The gate now reads every `src/**/*.ts` module, asserts that `src/server/helpers.ts` is present, and uses a bare-`Error` negative control to prove the detector can fail.
- No completion axis is needed beside `Origin`. Case completion is derived from the absence of findings, while an inspection that did not run is already `origin: 'instrument'`; another stored axis would duplicate those facts.
- The existing non-terminating runtime test now expects `claimant`. Runtime progress rises when claimant execution begins and returns to its snapshot before eviction and deletion, so cleanup stalls remain `instrument`.

## Red-then-green readings

| Proof | Red | Green |
| --- | --- | --- |
| Receipt helper | `npx vitest run --config vite.config.ts --project src:core tests/src/core/helpers.test.ts` — exit 1; Test Files: 1 failed; Tests: 1 failed, 15 passed (16) | Same command — exit 0; Test Files: 1 passed; Tests: 16 passed (16) |
| String-declared project through `Probe.prove` | `npx vitest run --config vite.config.ts --project src:server tests/src/server/Probe.test.ts -t "refuses a receipt when the case reaches a string-declared runtime project"` — exit 1; Test Files: 1 failed; Tests: 1 failed, 21 skipped (22); received `workspace` instead of `instrument` | Same command — exit 0; Test Files: 1 passed; Tests: 1 passed, 21 skipped (22) |
| Non-terminating claimant test | `npx vitest run --config vite.config.ts --project src:server tests/src/server/Probe.test.ts -t "expires only the active inspection"` — exit 1; Test Files: 1 failed; Tests: 1 failed, 21 skipped (22); received `instrument` instead of `claimant` | Same command — exit 0; Test Files: 1 passed; Tests: 1 passed, 21 skipped (22) |
| Runtime eviction stall | `npx vitest run --config vite.config.ts --project src:server tests/src/server/Probe.test.ts -t "attributes a deadline in runtime cleanup"` — exit 1; Test Files: 1 failed; Tests: 1 failed, 21 skipped (22); received `claimant` instead of `instrument` | Same command — exit 0; Test Files: 1 passed; Tests: 1 passed, 21 skipped (22) |
| Boot-derived sweep | `npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/RuntimeStage.test.ts -t "removes the files a dead host left behind"` — exit 1; Test Files: 1 failed; Tests: 1 failed, 32 skipped (33); the double-revision specification survived | Same command — exit 0; Test Files: 1 passed; Tests: 1 passed, 32 skipped (33) |
| Symlink ownership and native inspection translation | `npx vitest run --config vite.config.ts --project src:server tests/src/server/helpers.test.ts` — exit 1; Test Files: 1 failed; Tests: 2 failed, 25 passed (27) | Same command — exit 0; Test Files: 1 passed; Tests: 27 passed (27) |
| Runtime symlink propagation | `npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/RuntimeStage.test.ts -t "refuses a generated specification beneath a symbolic link"` — exit 1; Test Files: 1 failed; Tests: 1 failed, 32 skipped (33); received `instrument` instead of `workspace` | Same command — exit 0; Test Files: 1 passed; Tests: 1 passed, 32 skipped (33) |

## Acceptance criteria

| Criterion | Command and reading | Exit |
| --- | --- | --- |
| Receipt refusal | `npx vitest run --config vite.config.ts --project src:server tests/src/server/Probe.test.ts -t "refuses a receipt when the case reaches a string-declared runtime project"` — Test Files: 1 passed; Tests: 1 passed, 21 skipped (22) | 0 |
| Deadline attribution | `npx vitest run --config vite.config.ts --project src:server tests/src/server/Probe.test.ts -t "expires only the active inspection"` and `-t "attributes a deadline in runtime cleanup"` — each reading: Test Files: 1 passed; Tests: 1 passed, 21 skipped (22) | 0 for each |
| Boot-derived sweep | `npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/RuntimeStage.test.ts -t "removes the files a dead host left behind"` — Test Files: 1 passed; Tests: 1 passed, 32 skipped (33) | 0 |
| Symlink ownership | `npx vitest run --config vite.config.ts --project src:server tests/src/server/helpers.test.ts` — Test Files: 1 passed; Tests: 27 passed (27); the focused runtime propagation proof also passed with 1 passed and 32 skipped (33) | 0 |
| Native `lstatSync` translation | `npx vitest run --config vite.config.ts --project src:server tests/src/server/helpers.test.ts` — Test Files: 1 passed; Tests: 27 passed (27); `npx vitest run --config vite.config.ts --project src:core tests/src/core/errors.test.ts` — Test Files: 1 passed; Tests: 8 passed (8) | 0 for each |
| Lint | `npm run lint:check` | 0 |
| Type checks | `npm run check` | 0 |
| Core project | `npx vitest run --config vite.config.ts --project src:core` — Test Files: 3 passed (3); Tests: 31 passed (31) | 0 |

Additional binding readings: `npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/RuntimeStage.test.ts` exited 0 with Test Files: 1 passed and Tests: 33 passed (33). `npx vitest run --config vite.config.ts --project guides tests/guides.test.ts` exited 0 with Test Files: 1 passed and Tests: 13 passed (13). `npm run format:check` exited 0. `git diff --check` exited 0.

## Observations

- Sandbox command: `npx vitest run --config vite.config.ts --project src:server`. The final sandbox reading returned only the Vitest `RUN` header and no exit status after the process ended. Host command: `npx vitest run --config vite.config.ts --project src:server`.
- Sandbox command: `npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/LintStage.test.ts`. The sandbox reading returned only the Vitest `RUN` header and no exit status after the process ended. Host command: `npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/LintStage.test.ts`.

These are observations, not acceptance criteria. No sandbox workaround or test accommodation was made.

## Exact guide replacement text

In `### Server contracts`, replace the `StageInterface` row with:

```md
| `StageInterface`       | interface | The resident-stage contract; its readonly `stage` names the inspection it performs and its readonly `progress` reports claimant-owned progress for the coordinator to compare with its inspection snapshot. See [`## Methods`](#methods). |
```

In `### Server helpers`, replace the `resolveWorkspaceFile` row with:

```md
| `resolveWorkspaceFile`   | function | `(workspace: string, target: string, mutate?: boolean) => string`                           | Resolves a workspace-relative path to an absolute one and throws when it escapes the workspace. Under `mutate` it refuses a symbolic link as `workspace`/`refused` and translates a native path-inspection fault to `workspace`/`malformed` with the native fault on `cause`. |
```

In `## What a probe proves`, replace the receipt-condition block from `The receipt is issued on these conditions together:` through the paragraph ending in `passed to computeReceipt yourself.` with:

```md
The receipt is issued on these conditions together:

- both phases report one check per stage; and
- the case produced no finding at any stage; and
- the control produced an `origin: 'claimant'` finding at the stage it declared, and neither phase
  produced an `origin: 'instrument'` finding; and
- every other control stage produced no `origin: 'claimant'` finding.

A control that also breaks somewhere else has falsified the instrument rather than the claim, so no
receipt is issued for it. An `origin: 'instrument'` finding in either phase says the inspection did
not complete, so nothing was learned about the code and no receipt is issued either. An
`origin: 'workspace'` finding in the control decides neither break condition: it names the target
tree rather than the candidate. A case carrying any finding did not run clean and earns no receipt.
The check-per-stage condition binds both phases, because the clean-elsewhere condition reads the
control entries a verdict carries: a control that omits a stage would otherwise read as a stage
that stayed clean. `prove` records every stage for both phases, so that condition refuses only a
verdict you assembled by hand and passed to `computeReceipt` yourself.
```

In the following `Finding.origin` paragraph, replace the sentences beginning `A workspace finding` and `An instrument finding` with:

```md
A `workspace` finding carries the target tree's own defect, such as a symbolic link in a mutation
path or a mutation path whose existing components cannot be inspected. An `instrument` finding
carries this package's own message about an inspection that did not complete — a string-declared
Vitest project into which the stage could install no overlay, a specification it could not write,
or a module that ran no test.
```

In `## Failures`, replace the complete origin/code table with:

```md
| Origin       | Code        | Raised when                                                                                                                                                                                           |
| ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claimant`   | `refused`   | An input is rejected: a path escaping the workspace, a claim the tool guard rejects, a candidate naming no scoped project, or a caller-named project whose diagnostic names no file.                 |
| `claimant`   | `missing`   | The declared test path names no configured Vitest project, or names one the root configuration does not define.                                                                                       |
| `claimant`   | `destroyed` | A probe, a server, or a stage is used after its `destroy`.                                                                                                                                            |
| `claimant`   | `deadline`  | `ProbeOptions.deadline` expired while the stage was performing claimant-owned work, so the claim outran the budget. That stage was replaced before the next inspection began.                        |
| `workspace`  | `refused`   | A mutation path crosses a symbolic link in the target tree.                                                                                                                                           |
| `workspace`  | `missing`   | The target tree does not install a tool probe resolves from it, or publishes no binary under that tool's name.                                                                                        |
| `workspace`  | `malformed` | The target tree publishes something probe cannot read: an unparsable manifest, a `bin` entry that is not a path, a TypeScript project its own compiler refuses, an unsupported tool version, or a mutation path whose existing components cannot be inspected. |
| `instrument` | `malformed` | probe's own tooling could not serve: a boot control that did not report red, a language server frame it could not parse, a schema or verdict of its own it could not validate.                        |
| `instrument` | `deadline`  | A stage was not performing claimant-owned work when its budget expired, or a language server did not answer its teardown exchange within the stage's own bound.                                      |
```

In `## Prerequisites`, replace the string-declared-project bullet with:

```md
- **That project is composed in the root configuration, not declared as a path string.** The
  runtime stage installs its own overlay plugin into each project's configuration so the candidate
  sources resolve from memory. A project the root configuration names by path carries no such
  plugin, so the stage installs no overlay and runs no test. The check reports an
  `origin: 'instrument'` finding:
  `The runtime stage cannot instrument the string-declared Vitest project <name> because its configuration carries no runtime overlay plugin`.
  The project's `include` pattern is not the mechanism: the stage builds an explicit specification
  for the file it wrote, so a project whose glob matches nothing still serves a claim.
```

In `## What containment reaches`, replace the physical-containment paragraph with:

```md
**A write or a delete is contained physically as well.** Before probe creates a directory, writes a
generated specification, writes a boot dependency, or unlinks one, it walks the path's existing
components and refuses a symbolic link at any of them with
`Path crosses a symbolic link: <path>`; it then refuses any component whose resolved path leaves
the workspace. The symbolic-link refusal is `origin: 'workspace'`, `code: 'refused'`, because the
link belongs to the target tree. A native fault while inspecting an existing component is
`origin: 'workspace'`, `code: 'malformed'`, and retains that fault on `cause`. Nothing this package
writes or deletes can land outside the target tree, whatever links the tree holds.
```

Replace the measured containment paragraph with:

```md
Measured on 2026-08-20: with `link` a symbolic link to a directory outside the workspace,
`isSource({ path: 'link/secret.ts', text })` returns `true`,
`resolveWorkspaceFile(workspace, 'link/secret.ts')` returns the contained spelling whose real path
is outside the workspace, and the mutating form of the same call throws a `ProbeError` carrying
`origin: 'workspace'`, `code: 'refused'`, and
`Path crosses a symbolic link: link/secret.ts`. A contained `tsconfig.json` whose `extends` names an
absolute path outside the workspace resolved to a different options digest from the same project
without it, so the outside file was read.
```

## Unclosed

No owned-scope defect remains. The full `src:server` and full `LintStage` readings remain for the host commands recorded under Observations because the sandbox returned no exit status.