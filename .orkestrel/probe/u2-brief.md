# @orkestrel/probe — Unit 2: the three stages

You are the sole serial writer in `/workspace/probe`, at a clean committed baseline. Unit 1 landed
the contracts; units 3 and 4 build the coordinator and the proofs on what you write.

## Read first

- `/workspace/probe/AGENTS.md` and `/workspace/probe/.claude/rules/` — especially
  `architecture.md`, `names.md`, `typescript.md`, `patterns.md`.
- `/workspace/probe/src/core/types.ts` — the contracts you consume. `Stage`, `Source`, `Case`,
  `Finding`, `Check` are already defined. A `Check` is `{ stage, elapsed, findings }`; a `Finding`
  is `{ path, message, line? }` and carries no stage.
- `/home/user/scaffold/PROBE.md` — the accepted design, read-only to you.

## Objective

Implement the three inspections as resident stage classes, each independently usable, each
returning one `Check`.

## Owned files

`src/server/types.ts`, `src/server/helpers.ts`, `src/server/stages/TypeStage.ts`,
`src/server/stages/LintStage.ts`, `src/server/stages/RuntimeStage.ts`. Nothing else — not
`src/server/index.ts`, not `factories.ts`, not `src/core`, not `tests`, not the manifest. Unit 3
barrels and constructs these.

## The contract

Define `StageInterface` in `src/server/types.ts`: a `stage` getter naming which stage it is, an
`inspect(case)` returning `Promise<Check>`, and `destroy()` with its fixed lifecycle meaning. Each
class warms what it owns on construction and holds it across calls. `stages/` is a designed
extension category, so the three classes nest there while their contract stays in the module root.

## Measured facts. These are not suggestions; each was reproduced.

**The tools come from the target workspace, never from this package.** Resolve each through
`createRequire` against the workspace's own `package.json`. That is what makes a verdict predict
the workspace's gate, and it is also what makes the peers honest.

**Type stage.**

- `ts.createLanguageService` over a host you supply. The probe's file is a virtual path inside the
  project root and is never written to disk. Cold 1198 ms, warm 11–90 ms.
- A host that versions only the probe SERVES STALE SOURCE. Measured: a dependency changed from
  `string` to `number` on disk, the probe still asserted `string`, and the service reported 0
  diagnostics. The same host re-statting dependencies reported the error. Version every dependency
  snapshot by its modification time.
- A path outside the project root fails with `Cannot find module 'vitest'`, because Node resolution
  walks upward and finds no `node_modules`. The virtual path must sit inside the workspace.
- Project selection matters. The root `tsconfig.json` reports 0 diagnostics for a `core` file using
  `process`; `configs/src/tsconfig.core.json` correctly reports `Cannot find name 'process'`. Check
  a `Case.test` against the root project and any candidate source file against the scoped project
  for its environment.

**Lint stage.**

- Oxlint has a Language Server Protocol mode: spawn it with `--lsp` and drive newline-framed
  JSON-RPC over stdio with `Content-Length` headers. `textDocument/didOpen` with a document URI
  that NEED NOT EXIST returns diagnostics through `textDocument/publishDiagnostics`. Measured:
  initialize 269 ms, first document 20 ms, later documents 1–5 ms, and `existsSync` was false for
  every document linted.
- Oxlint REFUSES a gitignored path and reports `No files found to lint`, which reads as a clean
  result. A refusal that reads as a pass is the failure mode this stage must not have. The virtual
  URI avoids it entirely; do not lint a real path under `tmp/`.
- Resolve the binary portably: `createRequire(<workspace>/package.json).resolve('oxlint/package.json')`,
  read its `bin` field, and spawn `process.execPath` against that entry. Do NOT spawn
  `node_modules/.bin/oxlint`: it is a `.cmd` and `.ps1` pair on Windows that `spawn` cannot execute
  without a shell, and `shell: true` reintroduces quoting this project refuses. Verified working on
  this host.

**Runtime stage.**

- `createVitest` from `vitest/node`, then `project.createSpecification(file)` and
  `vitest.runTestSpecifications([spec], false)`. Boot 358 ms, warm run 228–290 ms with
  `pool: 'threads'`, which measured 32 ms faster than the default `forks`.
- NEVER `rerunFiles`. Measured: one reused path with `rerunFiles` reported `pass` in 2–4 ms for a
  test asserting `expect(2).toBe(3)`. Give every revision a fresh specification identity.
- A fresh identity protects the test file and NOT what it imports. Measured: a mutated helper made
  the service return `pass` for an assertion false against the file on disk. Call `invalidateFile`
  for every workspace module whose modification time moved since the previous call. The whole sweep
  costs 0.5 ms over 60 files, so do it every call.
- The specification file must exist on a real path. Three attempts prove a virtual one cannot run:
  a Vite virtual module, a path-shaped plugin-served identifier inside the project, and a
  never-written project path all fail `Cannot find module`. Write it, run it, delete it.
- `reporters: []` crashes inside Vitest's own `MinimalReporter`; pass an object reporter such as
  `[{ onInit() {}, onTestRunEnd() {} }]`.
- `state.getFiles()` accumulates one record per run without bound, measured growing 50, 100, 150
  across 150 probes. Evict each result after reading it.

**Startup.** Importing `typescript` or `vitest` at module scope delayed a server's first reply from
57.6 ms to 869 ms. Load the heavy tools with a dynamic `import` inside the warmer, not at module
scope.

## Laws

- One class per implementation file with `#` fields; no module-scope declaration in it. Pure leaves
  go to `src/server/helpers.ts`; `helpers.ts` imports no implementation class.
- No function declared inside another function. No `any`, no `as`, no non-null assertion, no
  suppression directive. Narrow `unknown` off the wire with real guards.
- Every collection returned is readonly. Entity members are one word.
- A stage that cannot start throws rather than returning an empty `Check`. There is no sentinel.
- No polling loop: await events and process exits.

## Execution

Perform this directly and spawn nothing. Do not install dependencies, commit, or push. Validate
with `npm run check` and `npm run lint:check` from `/workspace/probe`.

You may write a throwaway probe under `/workspace/probe/tmp/probe/` and run `npm run test:probe` to
prove behaviour; `tmp/` is gitignored. Delete every probe before you finish — unit 4 owns the tests.

## Deviation contract

Stop and report if the objective conflicts with what you find: expected, found, exact evidence,
done or not done, one short hypothesis. An ancillary choice is yours to make and record.

## Acceptance criteria

1. `npm run check` exits 0 and `npm run lint:check` exits 0.
2. Each stage class returns a well-formed `Check` for a clean case and for a failing one.
3. The type stage reports a diagnostic after a dependency changes on disk between two calls.
4. The lint stage reports a finding for a document that exists nowhere on disk.
5. The runtime stage reports `fail` for a failing assertion and reports it again after the imported
   helper changes, rather than serving the earlier verdict.
6. No probe file remains under `tmp/`.

## Output

Files written with a one-line reason each, the exact validation commands and exit codes, the
evidence for criteria 3 to 5 as the commands you ran and what they printed, any deviation, and
anything you decided that this brief left open. No process diary.
