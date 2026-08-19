# Repair round — the runtime staleness, now diagnosed with server-level evidence

Your unit-2 work is uncommitted in `/workspace/probe`. Keep it and correct it in place. Owned
files: `src/server/stages/RuntimeStage.ts` and `src/server/helpers.ts` only.

Four independent lenses diagnosed this defect by executing code. Three named the same primary
cause and one ruled out the hypothesis you acted on last round. Both repairs below are already
proven to flip a failing sequence to a correct one. Implement them; do not redesign.

## What the evidence actually shows

The only cache that can serve a stale dependency here is the **per-project server-side Vite
`moduleGraph.transformResult`**, and the only call that clears it is `vitest.invalidateFile(path)`.
A lens read that graph directly rather than inferring from findings:

```
ROOT project,  invalidateFile + watcher.invalidates every call:
  root-1  expect=ORIGINAL findings=0  server-serves ROOT/ssr=ORIGINAL
  root-2  expect=CHANGED  findings=1  server-serves ROOT/ssr=ORIGINAL   <- frozen
  root-3  expect=ORIGINAL findings=0  server-serves ROOT/ssr=ORIGINAL   <- frozen
named probe project, identical calls:
  probe-2 expect=CHANGED  findings=0  server-serves probe/ssr=CHANGED   <- correct
```

## Cause 1 — a specification can run in a project `invalidateFile` cannot reach

`src/server/stages/RuntimeStage.ts:127`:

```ts
return name === undefined ? vitest.getRootProject() : vitest.getProjectByName(name)
```

`vitest.getRootProject()` returns `coreWorkspaceProject`, which is **not a member of
`vitest.projects`** (measured: `vitest.projects includes getRootProject() = false`), and
`Vitest.invalidateFile` iterates `this.projects` only. A module served to a root-project run is
transformed once and never re-transformed.

Two routes reach that branch, and the second is the serious one:

- `inferTestProject` returns `undefined` for any path outside `tmp/probe/**` and
  `tests/{src,app}/{environment}/**`.
- `vitest.getProjectByName(name)` **silently falls back to the root project when the named project
  does not exist** (measured: `getProjectByName('absent') === rootProject = true`). This package
  runs against arbitrary target workspaces, and a target whose `vite.config.ts` declares no `probe`
  project takes this route on every call. The defect is therefore latent in production even where
  this repository's own tests pass, because this repository does declare `probe`.

**Repair.** Resolve to a member of `vitest.projects` and fail loudly when none serves the path,
rather than falling back to a project that cannot be invalidated. A stage that cannot run a
specification correctly must throw, per the unit's own law that a stage which cannot start throws
rather than returning an empty check. Proven: the identical sequence on the identical resident
instance returns the correct `[0, 0, >0]` when run in a named project.

## Cause 2 — `#revalidate` decides "changed" from modification time alone

`#snapshot` stamps each module with `statSync(path).mtimeMs`. A revision that lands without moving
`mtimeMs` is invisible, no `invalidateFile` is issued, and the previous content is served.

```
named project, mtime stamp,  PINNED mtime  [0,1,0] DEFECT  served=ORIGINAL,ORIGINAL,ORIGINAL
named project, DIGEST stamp, PINNED mtime  [0,0,1] CORRECT served=ORIGINAL,CHANGED,CHANGED
```

**Repair.** Stamp by content, not by clock. Use a hash of the file's bytes, or size and content
together — anything that changes when the bytes change regardless of what the filesystem records.
Keep the `vitest.invalidateFile(path)` call itself; a lens proved it sufficient once it reaches the
right project.

## Explicitly ruled out — do not implement these

- **Snapshot timing.** One lens ruled it out: the snapshot is captured at the start of each call and
  rewritten from that same read, so the comparison is self-consistent.
- **A fresh identity for the dependency, or a query-rewritten import specifier.** One lens proved
  these produce a perfect sequence *with invalidation removed entirely*, so they hide the failure
  rather than repair it, and each leaks a permanent module entry per revision into a resident graph.
- **`watcher.invalidates` as the mechanism.** It reaches only the worker's evaluated-module cache,
  and with the default `isolate: true` the worker is destroyed between calls, so that cache is
  already empty. Keeping it is harmless; relying on it is what failed last round.

## Proof discipline, and one warning

The lenses could NOT reproduce the Orchestrator's `[0, 1, 0]` against the current file — one
reported 19 consecutive correct calls. So a passing run of your own harness does not close this.

You must re-run the Orchestrator's exact reproduction, which is:

- one `RuntimeStage`, workspace `/workspace/probe`
- dependency at `tmp/probe/rtdep.ts`, specification path `tmp/probe/rtspec.test.ts`
- spec text: `import { expect, it } from 'vitest'` / `import { value } from './rtdep.ts'` /
  `it('v', () => { expect(value).toBe('<WANT>') })`
- write dep `ORIGINAL`, inspect asserting `ORIGINAL` → expect 0 findings
- write dep `CHANGED`, inspect asserting `CHANGED` → expect 0 findings
- inspect asserting `ORIGINAL` → expect more than 0 findings

Then the reversed sequence on the same stage: write `ALPHA`, assert `ALPHA` → 0; write `BETA`,
assert `ALPHA` → more than 0; write `ALPHA`, assert `ALPHA` → 0.

Add a third proof for cause 1 that does not depend on this repository's own configuration: point a
`RuntimeStage` at a path whose project name does not exist among `vitest.projects` and assert it
throws rather than silently running in the root project.

Write these under `/workspace/probe/tmp/probe/`, record the counts before your change and after,
and delete every probe before finishing.

## Execution

Perform this directly and spawn nothing. Do not commit or push. Validate with `npm run check`,
`npm run lint:check`, and `npm run test:probe`.

## Output

Files changed with a one-line reason each, the before and after counts with exact commands, the
result of each of the three proofs above, and any deviation. No process diary.
