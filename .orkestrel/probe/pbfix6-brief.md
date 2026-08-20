# PBFIX6: three destructive and unsound paths, before this package first publishes

## Role and engine

Role `sol` implementer. Engine GPT-5.6 Sol, high effort, sandbox `workspace-write`, rooted at
`/workspace/probe`. You are the sole writer in this checkout for the duration of this unit.

## Objective

Close three findings. Two are destructive — the package writes and deletes outside its workspace,
and it deletes a caller's own file. One is unsound — the receipt, which is this package's entire
value, is minted in a state that does not justify it.

`@orkestrel/probe` has never been published. `0.0.1` is the cheap moment to correct all three.

## Read first, in this order

1. `AGENTS.md` — in full
2. `.claude/rules/typescript.md`, `.claude/rules/architecture.md`, `.claude/rules/patterns.md`,
   `.claude/rules/tests.md`
3. `guides/probe.md` — the governing spec
4. `src/core/types.ts` and `src/server/types.ts` — authoritative for the public contracts

## The findings

**C1 — containment is lexical, so a symlink escapes the workspace.**

`isSource` accepted `tmp/link/escape.test.ts` while correctly rejecting `../escape.test.ts` and
`/tmp/escape.test.ts`. `resolveWorkspaceFile('/workspace/root', 'tmp/link/escape.test.ts')` returned
the lexical path without resolving symlinks. A `Source.path` beneath an in-workspace symlink lets
`src/server/stages/RuntimeStage.ts:329` create directories, write a specification, run it, and
**unlink it outside the workspace**. A symlink swapped between the write and the cleanup redirects
that unlink onto a pre-existing file carrying the generated basename. A symlinked `tmp/probe`
redirects the fixed boot-dependency writes, mutations, and deletions outside the workspace too.

The guide already says this package executes caller-supplied test code with host privileges and asks
for a caller you would trust with a shell. That does not cover this. A symlink inside a workspace is
ordinary — a monorepo link, a `node_modules` bin link — and a caller who places one is not asking
this package to delete outside the tree. The destructive half is a defect independent of the trust
model.

Enforce **canonical** containment: resolve every existing path component before any write and before
any delete, and refuse a path whose canonical form leaves the workspace. Refuse a symlink component
outright on the write and delete paths rather than following it.

The read reach — TypeScript and Oxlint inspecting outside files through a symlinked candidate path,
and a contained `Claim.project` whose `extends`, `files`, `include`, or references escape — is a
separate disposition. Do not attempt it in this unit. Return, in your report, the exact prose that
states it as a limit, for the guide unit that follows you.

**C3 — the sweep deletes a caller's own unmarked file.**

The ownership marker is the terminal line
`// @orkestrel/probe generated specification <pid>-<uuid>`, with the same revision in the filename.
`RuntimeStage.#owned()` at `src/server/stages/RuntimeStage.ts:527` treats the reserved boot paths as
owned **by path alone**, so a caller-owned, unmarked `tmp/probe/arm-type.probe-<dead-pid>-<uuid>.ts`
is deleted. The existing sweep test creates exactly that collision and asserts the deletion, so the
test encodes the defect and changes with the fix.

Require matching path, revision, **and** marker for every sweep deletion. Mark the boot dependencies
too, so a boot file the package wrote is still recognisable as its own.

**C4 — a receipt is minted over an instrument failure.**

`computeReceipt()` at `src/core/helpers.ts:144` asks only whether the declared control stage contains
some `code` finding. It never rejects an `instrument` finding at that same stage. An executed
hand-built verdict carrying clean case checks plus **both** an `instrument` and a `code` finding at
the declared stage produced a receipt:

```text
probe:case:type:typescript@6:oxlint@1:vitest@4:tsconfig.json@project
```

It correctly rejects findings at another control stage, and case findings.

An instrument finding means the inspection did not complete. A receipt over an incomplete inspection
attests nothing. Reject any `instrument` finding anywhere in either phase before minting the token,
and pin the mixed-origin vector with a permanent test.

`guides/probe.md` states that the declared stage "counts `origin: 'code'` findings alone", which
encodes this defect and contradicts the guide's own conclusion that an incomplete inspection cannot
earn a receipt. Do not edit the guide; return the exact replacement sentence in your report.

## Scope

- **Owned:** `src/core/helpers.ts`, `src/core/validators.ts`, `src/core/types.ts`,
  `src/server/helpers.ts`, `src/server/types.ts`, `src/server/Overlay.ts`,
  `src/server/stages/RuntimeStage.ts`, `src/server/Probe.ts`, and every test file under
  `tests/src/core/` and `tests/src/server/` that covers them.
- **Shared, report-only:** `guides/probe.md`. Return exact replacement text; do not edit it.
- **Off-limits:** every other file. The vendored host — `AGENTS.md`, `CLAUDE.md`, `.agents/`,
  `.claude/`, `.codex/`, `.cursor/`, `configs/helpers.ts`, `scripts/*.sh`, `tests/config.test.ts`,
  `tests/policy.test.ts`, `tests/setupPolicy.ts` — is owned by `@orkestrel/scaffold` and restored by
  `repair`. `package.json` and `vite.config.ts` are scaffold-planned; do not hand-edit either. Do not
  change the version.

## Host conditions

- The tree is committed and clean at `a5da753`. Untracked `tmp/` files are expected.
- The network is unavailable. Do not install or fetch.
- `tests/guides.test.ts` asserts a receipt earned with `tmp/probe` absent. Delete `tmp/probe` before
  any guides-project run: `rm -rf tmp/probe`.
- Your sandbox is `workspace-write`. You can create symlink fixtures inside the workspace, which C1's
  proof needs. A process one level below a child you spawn is denied; the suites here run in
  worker threads rather than child processes, so an ordinary `npx vitest run` works.
- Do not run `npm run build`, tree-wide `npm run format`, or the whole `npm test`. Validate scoped to
  your own files.

## Execution

Perform this assignment directly. Spawn nothing.

## Prohibitions

- Never run `git checkout`, `git restore`, `git stash`, `git reset`, or `git clean`. Each discards a
  working-tree change silently, and this tree has no other copy of your work. To undo your own edit,
  undo exactly that edit.
- Never commit, push, install, or read a credential.
- No `any`, no `as`, no `!`, no `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable`.
- No mocks, behavioral fakes, module replacement, framework spies, or fake clocks. Use real
  symlinks, real files, and real temporary directories inside the workspace.
- State no count in any prose you write, and never name a list item by its position. This binds
  TSDoc, comments, and test names.

## Acceptance criteria

Close them in this order and report each command with its exit code and counts.

1. A permanent test proves the symlink write-and-delete escape is refused. It fails against the
   unfixed source and passes against the fixed source. Record both readings with the exact command.
2. A permanent test proves an unmarked caller file at a reserved boot path survives the sweep. It
   fails against the unfixed source and passes against the fixed source. Record both readings.
3. A permanent test proves no receipt is minted when an `instrument` finding sits at the declared
   control stage alongside a `code` finding. It fails against the unfixed source and passes against
   the fixed source. Record both readings.
4. `npm run lint:check` exits 0.
5. `npm run check` exits 0.
6. `npx vitest run --config vite.config.ts --project src:core` exits 0. Report its counts.
7. `rm -rf tmp/probe && npx vitest run --config vite.config.ts --project src:server` exits 0. Report
   its counts.

Report a whole-suite result as an observation if you take one, never as a criterion.

## Deviation contract

Stop and report if the objective itself conflicts with what you find: expected, found, exact
evidence, done or not done, and at most one short hypothesis. An ancillary choice — a helper's name,
where a guard sits — is yours to decide, record, and carry on from.

## Output

Write your report to `tmp/codex/pbfix6-report.md` and make it your final message too. It contains:
the files you touched and what changed in each; the red-then-green readings with exact commands and
counts; each acceptance criterion with its exit code; the exact guide replacement text for C1's
remaining read reach and for C4's `origin: 'code'` sentence; and anything you could not close. No
process diary.
