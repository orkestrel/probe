# Unit R1 — bring probe onto scaffold 0.0.43

## Role and engine

`builder` — the harness's cheap native tier. This is a prescribed procedure with mechanical acceptance,
not a design unit. Every judgment call it could raise is named below with its answer.

## Objective

Put `/workspace/probe` on the current vendored host and the current generated configuration, with all
five gates green and every deviation from the generator recorded rather than absorbed.

## Why now

`@orkestrel/scaffold` is the only drifted pin. Verified against the registry:

```text
@orkestrel/contract  ^0.0.12   registry=0.0.12
@orkestrel/emitter   ^0.0.7    registry=0.0.7
@orkestrel/mcp       ^0.0.18   registry=0.0.18
@orkestrel/queue     ^0.0.9    registry=0.0.9
@orkestrel/timeout   ^0.0.7    registry=0.0.7
@orkestrel/tool      ^0.0.11   registry=0.0.11
@orkestrel/guide     ^0.0.12   registry=0.0.12
@orkestrel/test      ^0.0.7    registry=0.0.7
@orkestrel/scaffold  ^0.0.42   registry=0.0.43   <-- DRIFT
```

## What 0.0.43 changes, read from its diff

- `BASE_DEV_DEPENDENCIES` self-pins `@orkestrel/scaffold` at `^0.0.43` and `@orkestrel/test` at `^0.0.7`.
- `EXTRA_NAME_PATTERN` is renamed `FOREIGN_NAME_PATTERN`, and a `FLOOR_RANGE_PATTERN` is added.
- Peer semantics change: an `@orkestrel`-scope peer is a fleet pin, every other peer is a floor, and a
  peer naming an already-selected development tool now keeps that tool's pin rather than overriding it.
- New vendored guides arrive, including `guides/test.md`.

**Project derivation is unchanged.** The `guides`, `setup`, and `distribution` Vitest projects are still
selected by the presence of their proof files. Probe has none of those files, so **this unit must not
create them and must not expect them to appear.** A later unit writes `guides/probe.md` and
`tests/guides.test.ts`; that is not this unit's work.

## The procedure, in this order

Each step's output goes in the report.

1. Confirm `git status --porcelain` is empty. If it is not, STOP — a dirty tree means a writer is live.
2. Re-pin `@orkestrel/scaffold` to `^0.0.43` in `package.json` and install, so the overwrite runs the
   **current** vendored host rather than the old one.
3. Run scaffold's overwrite verb.
4. Force-verify every `@orkestrel` range in `package.json` against a fresh registry read. Report any that
   the overwrite moved and any that it did not.
5. Full install.
6. Run the **mutating** `npm run format` to converge whatever the generator wrote, then `npm run lint`.
   Run them in that order only if lint reports changes; otherwise `format` alone. `AGENTS.md` warns that
   `lint --fix` output is not formatter-clean, so if you run `lint` at all, run `format` again after it.
7. The five gates in order: `format:check`, `lint:check`, `check`, `build`, `test`.

## Known reverts, and what to do about each

`repair` and `overwrite` restore vendored files. Three are known and each has a fixed answer.

- **`.claude/settings.json` is vendored; `.claude/settings.local.json` is the target's own.** If the
  overwrite reverts a permission you find in `settings.json`, that is correct and intended. Never move a
  target-owned grant into the vendored file.
- **`tests/setupPolicy.ts`, `tests/policy.test.ts`, and `tests/config.test.ts` are vendored.** If any
  changes, that is the generator's business and stands. Do not hand-edit them, ever.
- **A vendored file you find hand-edited in the tree** is drift the overwrite corrects. Report it with
  the diff; do not preserve it.

## What must NOT change, and what to do if it does

The campaign's own work lives in files the generator does not own. If the overwrite touches any of these,
**stop and report with the diff** rather than accepting it:

- `src/**` — every stage, the coordinator, the entry, the core contracts.
- `tests/src/**` — every mirrored test.
- `guides/README.md`'s "Not created" row for `probe.md`.

`git` is the walk-back. Because step 1 confirms a clean tree, `git diff` after the overwrite is exactly
what the generator did, and `git checkout --` reverses any file individually.

## Host facts

- Working directory `/workspace/probe`. You are the sole writer. Baseline is the commit HEAD points at
  when you start; state it in your report and measure your diff against it.
- The network is proxied and reachable; `npm view` and `npm install` work.
- `npm test` takes roughly three minutes and reports **194 passed, 0 skipped, 0 todo** at baseline.
- **If a test fails, re-run it alone before believing it.** This tree's server tests share one
  `tmp/probe` directory, and a red under load is a question rather than an answer. Report both readings.

## Scope

- **Owned**: `package.json`, `package-lock.json`, and whatever scaffold's overwrite verb writes.
- **Off-limits to your own hand**: everything the generator does not write. You do not hand-edit a
  vendored file, and you do not edit `src/**` or `tests/src/**` at all.
- Do not commit, push, or publish. Do not add an npm package beyond the re-pin above.

## Execution

Perform this assignment directly. Spawn no subagent and delegate no part of it.

## Deviation contract

Stop and report when the tree is dirty at step 1, when the overwrite touches a file the preceding section
protects, or when a gate reddens for a reason the overwrite does not explain. Report expected, found, the
exact command and its output, whether the work is done, and at most one short hypothesis.

## Acceptance criteria

1. `package.json` pins `@orkestrel/scaffold` at `^0.0.43`, and every other `@orkestrel` range equals what
   the registry serves.
2. `npx scaffold audit` reports no drift. Paste its output.
3. All five gates pass, in order, each with its exit code.
4. `npm test` reports 0 skipped and 0 todo at a count at least 194.
5. No file under `src/**` or `tests/src/**` differs from the baseline commit. Prove it with
   `git diff --stat <baseline> -- src tests/src`, which must be empty.
6. Every file the overwrite changed is listed in the report with one line saying what it is.

## Output

Return exactly: **Baseline commit**, **What the overwrite changed** (the file list with one line each),
**Range verification** (the registry table), **Gates** (each with exit code), **Counts**, **Anything
re-run alone and both readings**, **Deviation**, **Decisions**.
