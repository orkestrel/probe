# VERIFY-A4: authoritative gates on probe after the A4 integration

## Role and engine

Role `verifier`, native cheap tier. You run commands and report exit-code truth. You never fix.

## Objective

Run probe's authoritative quality gates in order and report each command, its exit code, and its
counts. Return the truth whatever it is.

## Context

- Working directory `/workspace/probe`. The tree is dirty: it carries the A4 unit (the runtime stage
  now creates the parent directory of the specification it writes) plus an integration patch to
  `tests/src/server/Probe.test.ts`. That dirty state is the subject under verification. It is
  expected, not damage.
- `npm run format` has already been run, so `format:check` starts clean.
- `tests/guides.test.ts` asserts a receipt earned with `tmp/probe` absent. Delete `tmp/probe` before
  the test gate: `rm -rf tmp/probe`.
- Other agents are working in other repositories on this host. Do not touch any path outside
  `/workspace/probe`.

## Scope

Read-only plus command execution. Own nothing. Edit nothing. Spawn nothing. Perform this assignment
directly.

## The gates, in this order

```
npm run format:check
npm run lint:check
npm run check
npm run build
npm test
```

Run every one even if an earlier one fails, and report each separately. `npm test` is long; allow it
at least 20 minutes.

## Prohibitions

Never run `git checkout`, `git restore`, `git stash`, `git reset`, or `git clean`. A gate run needs
none of them, and this tree carries an uncommitted unit that has no other copy.

## Output

One row per gate: the exact command, its exit code, and its counts (test files, tests, and the per
project breakdown where the reporter gives one). Then the exact failure excerpt for any gate that did
not exit 0. Nothing else. No process diary, no assessment, no fix.
