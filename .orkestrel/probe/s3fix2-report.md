# Unit S3fix2 — returned report

Transcribed at the same moment the code was committed. Baseline `7721a20`.

## F1's verification — taken before any source was touched

**The declared URI holds against the real Oxlint server.** One URI, five sequential inspections, each
`didOpen` → await publish → `didClose`, ascending versions, against `oxlint 1.79.0 --lsp`:

```text
1 dirty   [1] `debugger` statement is not allowed
2 clean   [0]
3 dirty   [2] `debugger` … | `debugger` …
4 clean   [0]
5 dirty   [1] `debugger` …
```

Reuse without an intervening `didClose` also holds, so the close is not load-bearing for freshness. All
four selection shapes resolve correctly at the declared path against the repository's own `.oxlintrc.json`:

```text
exact-path exempt  configs/policy.ts     [0]
exact-path control configs/other.ts      [1] Prefer named exports
suffix exempt      x.config.ts           [0]
suffix control     x.ts                  [1] Prefer named exports
directory deny     src/core/x.ts         [1] 'node:fs' import is restricted …
directory allow    src/server/x.ts       [0]
```

Path synthesis is gone. `#file` is deleted, and with it the `randomUUID`, `basename`, `dirname`,
`inferTestProject`, and `relativeWorkspaceFile` imports.

## Findings closed

- **F1 closed.** `#document` builds the URI from `resolveWorkspaceFile(this.#workspace, source.path)`.
- **F2 closed.** Census deleted; see the next section.
- **F3 dissolved.** `inferTestProject` no longer appears in `LintStage.ts`. Its one remaining consumer,
  `RuntimeStage.ts:194`, uses it inside its documented contract. No reach into `helpers.ts` was needed.
- **F4 dissolved and proved.** `applies an override the workspace anchors to a file name inside a
  directory` drives `guides/candidate*.ts`; red at baseline, green now.
- **F5 record corrected, test kept and renamed.**
- **F6 corrected**, in Decisions.

## What replaced the census

`CENSUS`, `RELEASED`, `readMapSizes`, `censusStage`, the `node:inspector/promises` import, and the
`isRecord` import are all gone. Two public helpers replace them:

- `expectReleased(stage)` — `destroy()` resolves again with `undefined`, and a later `inspect` rejects
  with `The lint stage has been destroyed`. Seven sites.
- `isProcessLive(id)` with `readFixtureServer(scratch)` — the fixture announces its own process id, so a
  test reads whether the child the stage owned privately is gone. `process.kill(id, 0)` delivers nothing
  and reports only reachability. Four sites.

One census site had no teardown to prove. `reports the exit code when the language server dies
mid-inspection` now asserts a second inspection of the **same declared path** is admitted and refused on
the ending's own terms — a document still registered from the first would instead be refused by the
collision guard, so the assertion distinguishes the two.

`tests/src/server/stages/TypeStage.test.ts` still holds a `node:inspector` session. Off-limits and
outside F2's subject; reported, not touched.

## What the reachability test proves and does not

Renamed to **`reports the real language server ending when a candidate text ends it`**.

- **Proves:** a candidate's own text can drive real oxlint 1.79.0 to exit code 0 mid-inspection (a lone
  surrogate surviving `JSON.stringify` framing); the stage reports that ending rather than a finding or a
  hang; teardown afterwards settles under 5 s and releases.
- **Does not prove** any repair from the S3fix round. It passes against `dcd50a3` too. It is a
  reachability fact, not a proof of a fix.

## Red-then-green proofs

Command identical before and after:

```text
npx vitest run --config vite.config.ts --no-cache --reporter=verbose \
  --project src:server tests/src/server/stages/LintStage.test.ts
```

Before the source change, tests written and `LintStage.ts` untouched at `7721a20`:
**`Tests 6 failed | 14 passed (20)`**

| Test | Failure at baseline |
| ---- | ------------------- |
| `applies an override the workspace anchors to one exact path` | `expected [ { origin: 'code', … } ] to strictly equal []` at `lib/exempt.ts` |
| `reports a finding for a boot control candidate the target workspace lints` | `expected [] to deeply equal [ ObjectContaining{…} ]` |
| `applies an override the workspace anchors to a file name inside a directory` | finding at `guides/candidate.ts` |
| `reports nothing for a path the target workspace excludes from linting` | finding at `tmp/probe/lint-excluded.test.ts` |
| `serves sequential inspections of one declared path from one resident server` | assertion failure |
| `refuses a second inspection of a path already open` | timed out at 20007 ms, both inspections hung |

After: **`Tests 20 passed (20)`**.

## Validation

| Gate | Exit code |
| ---- | --------- |
| `npm run format:check` | **1** — pre-existing at baseline, see Deviation 2 |
| `npm run lint:check` | 0 |
| `npm run check` | 0 |
| `npm run build` | 0 |
| `npm test` | 0 |

Scoped to owned files: `oxfmt --check` 0, `oxlint --deny-warnings` 0.

## Counts

`npm test`: **194 passed, 0 skipped, 0 todo** (80 + 86 + 28). Baseline 188. No test deleted; the owned
file went from 14 `it` blocks to 20, two renamed in place.

## Deviation 1 — criterion 4 cannot be closed from `LintStage.ts`

The `tmp/probe` arming leg is a false green and the cause is outside the owned files. Measured in scratch
workspaces varying one file at a time:

```text
no ignore file at all                 tmp/probe [1] `debugger`   lib [1] `debugger`
.gitignore holds tmp                  tmp/probe [0]              lib [1] `debugger`
.oxlintignore holds tmp               tmp/probe [1] `debugger`   lib [1] `debugger`
.gitignore holds tmp, negated         tmp/probe [1] `debugger`   lib [1] `debugger`
.gitignore holds tmp + oxlintignore ! tmp/probe [0]              lib [1] `debugger`
```

`.gitignore:11` (`tmp`) alone is the cause. `.oxlintignore` is not honoured in LSP mode and a negation
does not reverse it. No server-side escape exists: the LSP settings the binary accepts are `run`,
`configPath`, `tsConfigPath`, `unusedDisableDirectives`, `typeAware`, `disableNestedConfig`, `fixKind`,
and `rulesCustomization`, none of which controls ignore handling. The server publishes
`{"diagnostics":[],"version":3}` for an ignored path — byte-identical to a genuinely clean one — so the
stage has no signal to read.

Every remedy is out of scope: `Probe.ts:152-165` chooses `tmp/probe`, `vite.config.ts:177-190` binds the
`probe` project to `tmp/probe/**`, and `.gitignore:11` excludes it. **Successor brief for whoever owns
`Probe.ts`.** Note that `#arm()` asserts `findings.length > 0` on the aggregate, so any change that makes
this leg speak — including reporting the exclusion as an `origin: 'instrument'` finding — turns the boot
control red for **every** workspace that gitignores `tmp`, which is every scaffolded workspace. That is a
product decision, not an edit.

Closed inside the owned files instead: a boot-control candidate at `tmp/probe/arm-runtime-89ab.test.ts`
carrying `debugger` produces a finding at its declared path in a workspace that lints that directory,
with two controls; and `reports nothing for a path the target workspace excludes from linting` pins the
residue against `ROOT` with a control at a linted path, so the false green is a stated, tested fact that
turns red the day synthesis returns. The class TSDoc states it.

## Deviation 2 — `format:check` is red at the clean baseline, on a file this unit does not own

Confirmed by stashing and re-running: `BASELINE_FORMAT_CHECK_EXIT=1`, same single file. Exact patch for
serial integration, `tests/src/server/helpers.test.ts` lines 69-72:

```diff
-		expect(resolveWorkspaceFile(ROOT, '..config/value.ts')).toBe(
-			resolve(ROOT, '..config/value.ts'),
-		)
+		expect(resolveWorkspaceFile(ROOT, '..config/value.ts')).toBe(resolve(ROOT, '..config/value.ts'))
```

Hypothesis: `2ecddc2` added that assertion and ran `lint --fix` after `format`, the ordering `AGENTS.md`
warns leaves `format:check` red on the file `lint` rewrote.

## Decisions

- **F6 stated correctly.** Row 1 of the S3fix alternatives table is **the declared path unchanged**, and
  it is the baseline every other row is measured against, not a rejected option. Its `[]` for
  `tmp/probe/lint-stage.test.ts` was never evidence against the declared path; it was evidence that
  `.gitignore` excludes `tmp`. The prose "Only the last two rows match" was wrong on both counts.
- **The stage refuses a concurrent second inspection of one open path rather than serializing it.**
  Removing the uuid removed the uniqueness that made two concurrent same-path inspections safe: one URI
  carries one registration in `#publishes`, so the second silently orphaned the first and both hung.
  `Probe.ts:79-82` states the coordinator is the only place inspections are serialized and "a stage
  admits nothing itself", so a queue inside the stage would duplicate it. The stage refuses, naming the
  path, and the failure is diagnosable instead of silent.
- **Fixture-driven test paths moved off `tmp/probe/` to `tests/src/server/`.** After F1 that prefix
  carries a specific meaning — excluded from linting — and those tests are about teardown and protocol.
- **`guides/candidate*.ts`** was chosen for the filename-sensitive case over `configs/candidate*.ts`,
  because the fixture already exempts all of `configs/**` and the two would not have been separable.

## Diff

```text
 src/server/stages/LintStage.ts            |  42 ++-
 tests/src/server/stages/LintStage.test.ts | 423 ++++++++++++++++++++++--------
 2 files changed, 324 insertions(+), 141 deletions(-)
```
