# Unit H1 — returned report

Transcribed at the same moment the code was committed. Baseline `078946d`.

## Files written

- `src/server/helpers.ts`
- `tests/src/server/helpers.test.ts`

## The empty-target ruling

**The empty target is refused.** The workspace root is not a file, so `resolveWorkspaceFile(ROOT, '')`
throws `Path escapes the workspace: `. This matches the `pkgform` row of the Orchestrator's measurement
and is asserted in `refuses the empty target because the workspace root is not a file`.

## Red-then-green proof

Command: `npx vitest run tests/src/server/helpers.test.ts`

- Before: `Test Files 1 failed (1)` / `Tests 3 failed | 11 passed (14)`
- After: `Test Files 1 passed (1)` / `Tests 14 passed (14)`

## Validation

| Gate | Result |
| ---- | ------ |
| `npm run lint:check` | exit 0 |
| `npm run check` | exit 0 |
| `npx vitest run tests/src/server/helpers.test.ts` | 14 passed, 0 failed |
| `npm test` | 74 + 86 + 28 = **188 passed, 0 skipped, 0 todo** (baseline 185 + 3 new) |

## Deviation

None.

## Decisions

- Added `sep` to the existing `node:path` import rather than a new import statement.
- The refuse condition became `path === '' || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)`,
  keeping the existing throw message and shape.
- Placed the two dot-prefix tests directly after the existing containment test in the same `describe`
  block, and the empty-target test immediately after, to keep related assertions adjacent.
- Deleted `tmp/scratch/` before returning; no other tmp artifacts remain.

## Diff

```text
 src/server/helpers.ts            |  4 ++--
 tests/src/server/helpers.test.ts | 23 +++++++++++++++++++++++
 2 files changed, 25 insertions(+), 2 deletions(-)
```

The load-bearing hunk:

```ts
-	if (path.startsWith('..') || isAbsolute(path)) {
+	if (path === '' || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
```
