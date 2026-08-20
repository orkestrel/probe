# PBFIX6 report

## Outcome

C1, C3, and C4 are implemented and their regression proofs pass. The lint, type-check, and core-project acceptance commands pass. The server-project acceptance command remains unclosed because this harness reproduces Oxlint child-process timeouts and standard-input timing failures outside the changed surface.

## Files touched

- `src/core/types.ts` — states that a receipt is absent when either phase reports an instrument failure.
- `src/core/helpers.ts` — rejects a receipt when any case or control finding has `origin: 'instrument'`.
- `src/server/helpers.ts` — adds canonical mutation validation to `resolveWorkspaceFile`; mutation paths resolve existing descendants, reject symlink components, and retain lexical resolution for read paths.
- `src/server/Probe.ts` — validates every boot write, mutation, deletion, and workbench removal; writes the ownership marker to boot dependencies.
- `src/server/stages/RuntimeStage.ts` — validates generated-specification writes and every deletion; sweep ownership now always requires a matching filename revision and terminal marker.
- `tests/src/core/helpers.test.ts` — pins the mixed `code` plus `instrument` control vector as receipt-ineligible.
- `tests/src/server/helpers.test.ts` — pins lexical read resolution and symlink refusal for mutation resolution.
- `tests/src/server/stages/RuntimeStage.test.ts` — pins refusal of a symlinked write target, survival of an unmarked caller file at a boot path, deletion of a marked boot dependency, and the existing runtime-stage behavior.
- `tmp/codex/pbfix6-report.md` — records this implementation and its acceptance evidence.

## Red then green

### Symlink write and delete containment

Command:

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/RuntimeStage.test.ts -t "refuses a generated specification beneath a symbolic link"
```

- Red: exit 1. Test files: 1 failed. Tests: 1 failed, 32 skipped, 33 total. The unfixed stage returned no findings and followed the symlink.
- Green: exit 0. Test files: 1 passed. Tests: 1 passed, 32 skipped, 33 total.

### Caller-owned boot-path collision

Command:

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/RuntimeStage.test.ts -t "removes the files a dead host left behind, at construction"
```

- Red: exit 1. Test files: 1 failed. Tests: 1 failed, 32 skipped, 33 total. The unmarked caller file was deleted.
- Green: exit 0. Test files: 1 passed. Tests: 1 passed, 32 skipped, 33 total.

### Instrument failure at the declared control stage

Command:

```text
npx vitest run --config vite.config.ts --project src:core tests/src/core/helpers.test.ts -t "refuses a receipt when an instrument finding shares the declared control stage"
```

- Red: exit 1. Test files: 1 failed. Tests: 1 failed, 14 skipped, 15 total. The mixed-origin verdict minted a receipt.
- Green: exit 0. Test files: 1 passed. Tests: 1 passed, 14 skipped, 15 total.

## Acceptance criteria

- Symlink refusal proof: exit 0. Test files: 1 passed. Tests: 1 passed, 32 skipped, 33 total.
- Caller-file survival proof: exit 0. Test files: 1 passed. Tests: 1 passed, 32 skipped, 33 total.
- Mixed-origin receipt proof: exit 0. Test files: 1 passed. Tests: 1 passed, 14 skipped, 15 total.
- `npm run lint:check`: exit 0.
- `npm run check`: exit 0.
- `npx vitest run --config vite.config.ts --project src:core`: exit 0. Test files: 3 passed. Tests: 27 passed.
- `rm -rf tmp/probe && npx vitest run --config vite.config.ts --project src:server`: no exit code because the harness rejected the command before process creation with `rm -f style commands are not permitted`. The empty `tmp/probe` directory was removed with `rmdir tmp/probe`, exit 0. The unchanged Vitest portion then exited 1. Test files: 3 failed and 4 passed, 7 total. Tests: 16 failed and 112 passed, 128 total.

Supporting final-source runs:

- `npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/RuntimeStage.test.ts`: exit 0. Test files: 1 passed. Tests: 33 passed.
- `npx vitest run --config vite.config.ts --project src:server tests/src/server/helpers.test.ts`: exit 0. Test files: 1 passed. Tests: 26 passed.
- `npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/LintStage.test.ts`: exit 1. Test files: 1 failed. Tests: 10 failed and 12 passed, 22 total. The isolated run reproduced the Oxlint child-process timeouts seen in the server project.

## Exact guide text

### C1 remaining read reach

Insert this prose in the receipt-limit section:

> **Write and delete containment does not bound reads.** TypeScript and Oxlint can inspect files outside the workspace through a symlinked candidate path, and a contained `Claim.project` can reach outside through `extends`, `files`, `include`, or project references. A receipt does not vouch that those reads stayed inside the workspace.

### C4 receipt condition

Replace the existing `origin: 'code'` receipt-condition bullet with:

> - the control produced an `origin: 'code'` finding at the stage it declared, and neither phase produced an `origin: 'instrument'` finding; and

## Could not close

The server-project acceptance criterion did not reach exit 0. Its final run failed in unchanged `LintStage`, `Probe`, and `ProbeServer` tests. The changed `RuntimeStage` and server-helper suites pass in full. Hypothesis: the harness restriction on descendant processes prevents the Oxlint and subprocess fixtures from completing and adds enough host pressure for the standard-input timing assertions to miss their bounds.