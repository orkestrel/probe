# PBFIX11 report

Every criterion in the brief and the amendment closes green. One red predates this unit: the
`src:core` project fails one assertion that PBFIX10 left behind, in a file this unit does not own.
The exact patch is at the end.

## Files touched

| File                                          | Change                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/types.ts`                           | `Finding` becomes `Issue`; `Check.findings` becomes `Check.issues`; the doc prose follows the one term.                              |
| `src/core/validators.ts`                      | `isFinding` becomes `isIssue`; `isCheck` reads `issues`.                                                                             |
| `src/core/helpers.ts`                         | `formatFinding` becomes `formatIssue`; `formatCheck` and `computeReceipt` read `issues`; the receipt verb becomes `mint`.            |
| `src/core/constants.ts`                       | `PARTIES` prose reads `issue`; the receipt travels away from the verdict that `minted` it.                                           |
| `src/server/types.ts`                         | `StageInterface.progress` carries the obligation contract; the stage remark drops `issuing` for `starting`.                          |
| `src/server/helpers.ts`                       | One TSDoc line reads `issues`.                                                                                                       |
| `src/server/Probe.ts`                         | Boot control reads `check.issues`.                                                                                                   |
| `src/server/stages/RuntimeStage.ts`           | The string-declared project reports `origin: 'workspace'`; the class remark names every origin the stage emits; the rename lands.    |
| `src/server/stages/LintStage.ts`              | The rename lands: `#issues`, `Issue`, `issues`.                                                                                      |
| `src/server/stages/TypeStage.ts`              | The rename lands: `#issues`, `#issue`, `Issue`.                                                                                      |
| `guides/probe.md`                             | Scaffold section deleted; rename carried; ownership prose restored; failure rows corrected; `progress` contract and proof statement. |
| `tests/src/server/stages/RuntimeStage.test.ts` | The string-declared expectation asserts `workspace`; the rename lands; the receipt-verb test name reads `mints`.                     |
| `tests/src/server/Probe.test.ts`              | The string-declared receipt refusal asserts `workspace`; the rename lands; the receipt-verb prose reads `mints`.                     |
| `tests/src/core/helpers.test.ts`              | The rename lands; one message reads `minted no receipt`.                                                                             |
| `tests/src/core/validators.test.ts`           | The rename lands.                                                                                                                    |
| `tests/src/server/stages/LintStage.test.ts`   | The rename lands.                                                                                                                    |
| `tests/src/server/stages/TypeStage.test.ts`   | The rename lands.                                                                                                                    |

Diffstat: 17 files changed, 423 insertions(+), 423 deletions(-).

## Criteria

### 1. C1's proofs, red before the origin restore and green after

Both proofs were edited to assert `origin: 'workspace'` first, run red, then the source changed.
The commands and their readings, taken 2026-08-20:

```text
npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:server \
  tests/src/server/stages/RuntimeStage.test.ts -t 'refuses a string-declared project without an overlay'
before: exit 1 — Tests 1 failed | 34 skipped (35)
        expected [ { origin: 'instrument', …(2) } ] to strictly equal [ { origin: 'workspace', …(2) } ]
after:  exit 0 — Tests 1 passed | 34 skipped (35)

npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:server \
  tests/src/server/Probe.test.ts -t 'refuses a receipt when the case reaches a string-declared runtime project'
before: exit 1 — Tests 1 failed | 20 skipped (21)
        expected [ { origin: 'instrument', …(2) } ] to deeply equal [ ObjectContaining{…} ]
after:  exit 0 — Tests 1 passed | 20 skipped (21)
```

The receipt is still refused: the `Probe` proof keeps `expect(verdict.receipt).toBeUndefined()`
beside the restored origin, and it passes.

### 2. The class remark names every origin the stage emits

`src/server/stages/RuntimeStage.ts`, as landed:

```text
/**
 * Inspects tests through one resident Vitest service from the target workspace.
 *
 * @remarks
 * Construction starts Vitest with the threads pool and instruments each inline or function-declared
 * project with a Vite plugin that reads the active inspection's candidate overlay. A selected
 * string-declared project reports a workspace issue because its configuration carries no runtime
 * overlay plugin. Every inspection writes one fresh sibling specification, invalidates each
 * workspace module whose disk content or candidate revision changed, runs that specification,
 * evicts its result, and deletes the file. Clearing the overlay makes the next snapshot differ from
 * the candidate revision, so the next inspection invalidates that module and reads disk again.
 *
 * Vite retains one unresolved URL for every specification path, so the stage replaces its whole
 * Vitest service after 64 specifications rather than deleting from each map that service owns. Any
 * bound holds the retention flat, because the replacement releases everything the instance held,
 * and 64 is the value chosen. The inspection that crosses the bound pays the replacement
 * synchronously: it closes the resident service and warms a new one before it runs. On 2026-08-20,
 * over this package's own workspace on the host `guides/probe.md` § Cost names, two runs of 66
 * inspections put that one at 480 ms and 269 ms against median inspections of 156 ms and 155 ms, so
 * budget one call in 64 at 110 ms to 330 ms above the rest.
 *
 * Every issue this stage emits names its party, and the stage emits an issue for every party
 * `Party` declares. An `origin: 'claimant'` issue is a failure Vitest reported about the candidate.
 * An `origin: 'workspace'` issue names the target tree: a project the root configuration declares
 * as a path string, into which the stage can install no overlay, and a specification path that
 * crosses a symbolic link or whose existing components this host cannot inspect. An
 * `origin: 'instrument'` issue names this package's own machinery: a specification it could not
 * write, run, evict, or delete for a reason the target tree does not own, and a run that reported
 * no test. An unmapped caller test and a test whose named project is absent are claimant failures
 * with `code: 'missing'`, thrown rather than reported, because a test that never ran is no
 * evidence about the candidate.
 *
 * @example
 * ```ts
 * const stage = new RuntimeStage('/srv/checkout')
 * const check = await stage.inspect(subject)
 * await stage.destroy()
 * ```
 */
```

### 3. `rm -rf tmp/probe && npm run test:guides`

Exit 0 — Test Files 1 passed (1), Tests 13 passed (13). Run on the final tree at 19:43:09. The
flagship fence still earns its receipt and the parity sweeps hold under the renamed surface.

### 4. `npm run format` then `npm run format:check`

`npm run format` exit 0 (148 files). `npm run format:check` exit 0 — "All matched files use the
correct format."

### 5. `npm run lint:check`

Exit 0.

### 6. `npm run check`

Exit 0 across `tsconfig.json`, `configs/src/tsconfig.core.json`, `configs/src/tsconfig.server.json`,
and `configs/src/tsconfig.bin.json`.

### 7. The rename sweep leaves no hit

```text
rg -n '\bFinding\b|\bisFinding\b|\bfindings\b|\bformatFinding\b' src/ tests/ guides/probe.md README.md
exit 1 — no match
```

No permitted residue: the pattern returns nothing at all, in source, tests, the guide, and the
README. `README.md` carried no hit before the sweep either.

### 8. No scaffold mention

```text
grep -n scaffold guides/probe.md README.md
exit 1 — no match
```

The section `### A name this package shares with @orkestrel/scaffold` is deleted whole, its alias
fence with it.

### 9. No receipt-verb hit

```text
rg -in '\bissu' src/ guides/probe.md          → 154 hits, every one the noun
rg -ino '\bissu[a-z]*' src/ guides/probe.md   → Issue 37, issue 77, issues 77
rg -n '\bissues (a|an|the|one|receipts|it|them)\b' src/ guides/probe.md tests/ README.md
exit 1 — no match
```

No `issued`, no `issuing`, and no `issues` in the verb sense. One inward hit needed rewording
rather than the receipt verb: `src/server/types.ts` said "Await an inspection before issuing the
next one", about inspections rather than receipts. It reads "before starting the next one" now, so
the word carries one sense in the package.

### 10. `rm -rf tmp/probe && npm run test:guides` after the sweep

The same run as criterion 3, taken after the whole sweep and the format pass: exit 0, 13 passed.

## The `progress` contract, as landed

`src/server/types.ts`:

```ts
	/**
	 * Claimant-owned progress the coordinator compares with its inspection snapshot.
	 *
	 * @remarks
	 * When claimant-owned work begins, raise `progress`. Where this stage performs work of its own
	 * after the claimant's, such as cleanup or eviction, return `progress` to its pre-inspection
	 * reading before that work starts, so an expiry during stage-owned work reads level with the
	 * coordinator's snapshot and is attributed to the instrument rather than to the claimant.
	 */
	readonly progress: number
```

The guide's `StageInterface` surface row derives from it:

```text
| `StageInterface` | interface | The resident-stage contract; its readonly `stage` names the inspection it performs, and its readonly `progress` rises when claimant-owned work begins and returns to its pre-inspection reading before the stage performs work of its own, so an expiry during stage-owned work reads level with the coordinator's snapshot. See [`## Methods`](#methods). |
```

## The proven-surface statement, as landed

In `### Server contracts`, directly after the table:

```text
`StageInterface.progress` is the seam a foreign coordinator reads to decide whose budget an expiry
belongs to, and this is the proof behind it.
[`RuntimeStage.test.ts`](../tests/src/server/stages/RuntimeStage.test.ts) proves the gauge boundary
deterministically: it holds one inspection at the results cache with a FIFO, reads `progress`
elevated while the caller's run is in flight, and reads it level with its pre-inspection value while
the stage evicts. Claimant-side expiry is proven end to end through `Probe`, which rejects a claim
that outran the budget with `origin: 'claimant'`, `code: 'deadline'`, and the expired stage in
`context`. The composed instrument-side expiry — a real expiry during stage-owned work, attributed
through `Probe` — has no executed proof, and the gauge is the seam a proof of it reads.
```

## Ancillary decisions

Each of these is inside an owned file and serves a change the brief or the amendment names. Each is
recorded here rather than raised as a deviation.

- **The guide's `resolveWorkspaceFile` helper row.** C3 corrects the `## Failures` table for
  PBFIX10's classification change. The server-helper table carried the same stale reading — "it
  refuses a symbolic link as `workspace`/`refused` and translates a native path-inspection fault to
  `workspace`/`malformed`" — with no exception for the caller-caused fault. It now names the
  `claimant`/`refused` case and translates *every other* native fault to `workspace`/`malformed`.
- **The receipt verb in tests.** C7 names source TSDoc and the guide. Leaving "issues a receipt" in
  a test title while the guide says "mints" is the drift C7 exists to remove, so the test prose
  moved with it: two test titles, one thrown message, and the local `issued` binding in
  `Probe.test.ts`, which reads `minted`.
- **The `Party` doc sentence** follows the rename as the amendment directs: "Names who must act on
  an issue or probe failure."

## Observations, not criteria

- **`npx vitest run --config vite.config.ts --no-cache --project src:server`** — exit 0, Test Files
  7 passed (7), Tests 133 passed (133), duration 101.88 s. Taken on the final tree at 19:43:27, on a
  host running nothing else of mine. The count matches the brief's baseline reading.
- **`npm run test:src:bin`** — exit 0, Tests 8 passed (8).
- **`npm run test:policy`** — exit 0, Tests 86 passed (86).
- **`npm run test:config`** — exit 0, Tests 28 passed (28).

## Could not close: a pre-existing red in `src:core`, in a file this unit does not own

`npm run test:src:core` exits 1 — Test Files 1 failed | 2 passed (3), Tests 1 failed | 30 passed
(31). The failure is `tests/src/core/errors.test.ts > failure adoption > classifies every failure
path a test can drive without a resident tool`:

```text
-   "an unreadable mutation path: workspace/malformed"
+   "an unreadable mutation path: claimant/refused"
 ❯ tests/src/core/errors.test.ts:274:21
```

It predates this unit and is not reached by the rename sweep. PBFIX10 (`b972062`, the baseline this
unit started from) reclassified the caller-caused native fault in `resolveWorkspaceFile`:

```text
git show HEAD -- src/server/helpers.ts
+		const claimant =
+			typeof error === 'object' && error !== null && 'code' in error &&
+			(error.code === 'ENAMETOOLONG' || error.code === 'ERR_INVALID_ARG_VALUE')
```

The drive at `tests/src/core/errors.test.ts:206-211` passes `'invalid\0path.ts'`, which is exactly
the NUL-byte `ERR_INVALID_ARG_VALUE` fault that reclassification moved, and its expected pair was
never updated. `git status` confirms this unit did not modify that file, and this unit's only edit
to `src/server/helpers.ts` is one TSDoc word.

The exact patch, for serial integration by the Orchestrator:

```diff
--- a/tests/src/core/errors.test.ts
+++ b/tests/src/core/errors.test.ts
@@
 				[
 					'an unreadable mutation path',
-					'workspace',
-					'malformed',
+					'claimant',
+					'refused',
 					() => resolveWorkspaceFile(workspace.path, 'invalid\0path.ts', true),
 				],
```

The row's label reads correctly either way, and the classification it asserts is the one
`resolveWorkspaceFile` states in its own TSDoc. Nothing else in this unit's scope depends on it.
