# Unit 5 — bring the probe workspace onto scaffold 0.0.42

## Role and engine

Orchestrator-owned. Network-dependent work — a real install against the registry — belongs to the
Orchestrator's own tracked commands rather than to a bench sandbox, which denies the network. This
unit is briefed, owned, and audited like any other.

## Objective

Re-pin the probe onto the current published `@orkestrel/scaffold`, install, re-vendor, and prove the
gates still green. Nothing else.

## Why it is its own unit

`scaffold overwrite` does three unrelated things at once, measured by the Orchestrator in a throwaway
copy of the tree:

```text
0 of 127 planned paths drifted from the plan.
vite.config.ts replaced (16 lines added).
8 written, 129 unchanged, 0 removed in ..
46 published, 7 guides fetched, 0 no longer listed.
@orkestrel/test: HTTP 404
```

It re-pins `@orkestrel/scaffold` from `^0.0.41` to `^0.0.42` and `@orkestrel/test` from `^0.0.6` to
`^0.0.7`, it refreshes the catalog table in `.claude/agents/orkestrel.md`, and it vendors the guides
of every declared dependency — five of which this workspace has never carried, because those
dependencies were added after it was scaffolded.

None of that belongs to the unit that writes the package guide. Riding it along there would put a
dependency upgrade inside a documentation unit, and its failure would block work that has nothing to
do with it.

There is a second reason to take it now. Scaffold `0.0.42` carries the repaired vendored
`tests/config.test.ts`, which resolves Oxlint's real Node entry through `createRequire` and spawns it
with `process.execPath` instead of invoking the extensionless `node_modules/.bin/oxlint` shim. That
shim is a POSIX `sh` script, so Windows cannot execute it and a restricted sandbox refuses it — the
exact failure that made unit 3 report `npm test` red under the bench while it was green outside.

## The sequence, in this order

The order is not free. `scaffold overwrite` refuses a half-change:

```text
TARGET: The manifest at . does not reach a Vitest project the planned configuration registers: guides.
No chain from test or prepublishOnly invokes it.
```

1. Re-pin `@orkestrel/scaffold` and `@orkestrel/test` in `package.json`. The Orchestrator swept the
   registry rather than guessing from the local manifest, and only those two moved.
2. `npm install`, so the new vendored host is on disk before anything runs it.
3. `npx scaffold overwrite`, so the vendored files and the catalog come from the installed version.
4. Run the five gates in order and read their output.

## The registry sweep, already taken

Seven packages were republished — `scaffold`, `test`, `database`, `server`, `sea`, `terminal`, and
`middleware`. Only two of them are declared here. The other five are not dependencies of this package
in any form, so nothing about them reaches this workspace.

Every runtime dependency this package declares is already pinned to what the registry serves. Nothing
in `dependencies` moves.

| Package                | Declared    | Registry | Action              |
| ---------------------- | ----------- | -------- | ------------------- |
| `@orkestrel/contract`  | `^0.0.12`   | 0.0.12   | none, already latest |
| `@orkestrel/emitter`   | `^0.0.7`    | 0.0.7    | none, already latest |
| `@orkestrel/mcp`       | `^0.0.17`   | 0.0.17   | none, already latest |
| `@orkestrel/timeout`   | `^0.0.7`    | 0.0.7    | none, already latest |
| `@orkestrel/tool`      | `^0.0.11`   | 0.0.11   | none, already latest |
| `@orkestrel/guide`     | `^0.0.12`   | 0.0.12   | none, already latest |
| `@orkestrel/scaffold`  | `^0.0.41`   | 0.0.42   | **re-pin**          |
| `@orkestrel/database`  | not declared | 0.0.11   | none                |
| `@orkestrel/server`    | not declared | 0.0.14   | none                |
| `@orkestrel/sea`       | not declared | 0.0.8    | none                |
| `@orkestrel/terminal`  | not declared | 0.0.11   | none                |
| `@orkestrel/middleware`| not declared | 0.0.15   | none                |

`@orkestrel/test` is declared at `^0.0.6` and the registry serves 0.0.7, so it re-pins too.

Both are development dependencies, so under the fleet's publish rules this reaches no consumer and
obliges no version bump of `@orkestrel/probe` — unless the rebuilt `dist` differs materially from
what a publish would have produced, which this package has never published, so the question is moot
until its first release.

## Scope

- **Owned**: `package.json`, `package-lock.json`, and every file `scaffold overwrite` writes —
  `vite.config.ts`, `.claude/agents/orkestrel.md`, the vendored `tests/config.test.ts` and
  `tests/setupPolicy.ts` and `tests/policy.test.ts`, and the newly vendored `guides/*.md` mirrors.
- **Off-limits**: `src/**`, `tests/src/**`, `guides/README.md`, and any guide this repository authors
  itself. A vendored mirror is fetched bytes, never authored prose; do not edit one.
- The `guides` Vitest project is **not** this unit's business. It appears only once
  `tests/guides.test.ts` exists, which unit 4c creates.

## Acceptance criteria

1. `@orkestrel/scaffold` and `@orkestrel/test` are pinned to the versions the registry serves, and
   `npm ls` resolves both.
2. `npx scaffold audit` reports zero drift.
3. `tests/config.test.ts` resolves Oxlint through `createRequire` rather than spawning
   `node_modules/.bin/oxlint`.
4. `npm run format:check`, `npm run lint:check`, `npm run check`, `npm run build`, and `npm test` each
   exit 0.
5. `npm run test:config` exits 0 when run alone.

## Known conditions, so they are not reported as deviations

- `@orkestrel/test: HTTP 404` appears during the guide fetch. It is an upstream gap in that package's
  published guide, not a failure of this unit. Record it and continue.
- Five new `guides/*.md` mirrors appear. That is correct: they are the vendored guides of runtime
  dependencies declared after this workspace was scaffolded.
