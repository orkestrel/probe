# PBFIX2 — report

Unit: `implementer`, Opus 5. Brief: `pbfix2-brief.md`. Eight rows from the campaign audit: R1, R2,
R4, R5, R6, D1, D4, D5. Routed native rather than to the objective lane because R4's proof needs a
fixture language server, which is a grandchild of a bench exec and denied there.

## R1 and R5 — one digest rule, stated once

`guides/probe.md` now states that `verdict.digest` covers the case bytes, the control bytes
including the reason, and the workspace those bytes were read against. Both false sentences are
gone. Receipt field 2 is annotated "read against this workspace". `Verdict`'s `@remarks` and the
`reason` member TSDoc agree. `reason` still enters the digest.

Proven by an executed test that calls the shipped `computeDigest` and pins four facts: the flagship
body digests to `0806fb30f428edb8ea85adfb4b355441`, a reworded reason does not, the flagship body is
workspace-invariant, and a claim carrying an absolute string digests differently in two workspaces.

The unit removed a `toContain` presence check it had drafted beside those assertions, on
`.claude/rules/documentation.md` § Parity: a substring check is not a proof and the executed digest
assertions are.

## R2 — the guard and its published schema, and the refusal that names the member

The `isClaim` remark and the `SOURCE_SHAPE` and `CLAIM_SHAPE` remarks now state the real
relationship: the schema is the wire shape, `isClaim` is the admission rule, and the rule is
narrower on `Source.path` alone.

`ProbeServer`'s refusal now names the member:
`The prove tool refuses case.files.0.path: a source path must stay inside the workspace, which the
advertised schema does not constrain`.

`@orkestrel/contract` 0.0.12 cannot supply the failing member — measured, `compileGuard(CLAIM_SHAPE)`
returns true and `compileAuditor(CLAIM_SHAPE, claim)` returns `[]` for an escaping claim. The
narrowing is a depth-counting containment rule that no `StringShapeOptions` keyword can express:
`a/../../b` escapes while `a/b/../../c` does not, so no regex decides it. The unit added
`findRefusedPaths` to `src/core/helpers.ts`, which walks the claim's four source positions and tests
each `path` with `isSource` itself, restating none of the rule.

## R4 — teardown is bounded

`LintStage` gained `readonly #deadline = 2_000` and `#warmed()`, which races `#warmth` against an
expiry and falls back to the already-spawned `#child`. `StageInterface.destroy` records that teardown
is bounded whatever the tool does.

The bound is the stage's own teardown deadline, which was already the literal in `#release` bounding
the shutdown exchange. Both now read one field. Worst-case `destroy()` is 4 s: 2 s for the abandoned
warm, then up to 2 s for the ending. A public constant was rejected because the bound is one stage's
internal budget and would oblige a guide row for a value no consumer sets.

Proven against a `silent-initialize` marker on the existing protocol-faithful fixture server, which
accepts the connection, never answers `initialize`, and stays alive. The test asserts the elapsed
interval with `performance.now()`.

## R6 — `destroy()` restores the flow it found

`ProbeServer` records `#flowing = !process.stdin.isPaused()` in `start` and pauses in `#destroy` only
when `start` found the stream paused. Proven in both directions against a real server.

## D1 — the sweep deletes only what this package wrote

`RuntimeStage.#specification` appends `// @orkestrel/probe generated specification <pid>-<uuid>` as
the file's last line. `#sweep` defers to `#owned(path, revision)`, which attributes a file by that
marker or by the coordinator's two fixed boot-dependency paths. The false comment is replaced.

**A location bound would have been unsound.** `RuntimeStage.#specification` writes at
`createRevisionFile(workspace, test.path, …)` and `test.path` is whatever the caller declares, so
this package writes generated specifications anywhere in the target tree. Bounding by location would
leave every orphan outside the bound unswept. The file's own bytes are the only sound discriminator.
The marker is appended last so a reported stack frame's line numbers still name the caller's lines,
and `matchesSpecification` is `text.endsWith(formatSpecification('', revision))` so the writer and
the reader cannot drift.

Proven in both directions: a developer file `src/core/notes.probe-<dead>-<uuid>.ts` outside the
workbench and one inside it at `tmp/probe/draft.test.probe-<dead>-<uuid>.ts` both survive, while the
marked orphan and the dead-host boot dependency are still swept and a live neighbour's files are
still kept.

## D4 — the receipt requires both phases to name every stage

`computeReceipt`'s `ran` condition now requires the control to name every stage, the same way the
case already must. TSDoc and the guide list four conditions. `Probe.prove` already satisfied it, so
no shipped path changed behaviour; five existing verdicts in two owned test files were rebuilt to the
shape `prove` produces.

## D5 — the documented refusal is proven

No source change: the guard was already correct and the refusal was unproven. The containment test
now also asserts `/etc/hosts` and `C:\Windows\System32\drivers\etc\hosts`. Both run on every host
because the rule reads the string.

No natural red existed, so the unit ran two mutation controls on the guard instead: dropping the
`[\\/]` alternative gave 2 failed and 5 passed; dropping the `[A-Za-z]:` alternative gave 1 failed
and 6 passed. The guard was then restored byte-for-byte and re-run green.

## Red then green

| Row | Scope | Before | After |
| --- | ----- | ------ | ----- |
| D4 | `src:core tests/src/core/helpers.test.ts` | 1 failed, 10 passed | 11 passed, then 15 with the new tests |
| R6 | `src:server tests/src/server/ProbeServer.test.ts` | 1 failed, 2 passed | 3 passed |
| R4 | `src:server LintStage.test.ts -t 'never answers its warming exchange'` | 1 failed, 21 skipped, timed out at 20000 ms | 1 passed; whole file 22 passed |
| D1 | `src:server RuntimeStage.test.ts -t 'removes the files a dead host left behind'` | 1 failed, 30 skipped | 1 passed; whole file 31 passed |
| D5 | `src:core tests/src/core/validators.test.ts` | two mutation controls, 2 failed / 1 failed | 7 passed on the restored guard |

## Carried to a successor

`Probe.#boot` authors the text of its two boot dependencies in `src/server/Probe.ts`, which this unit
did not own, so those two files carry no marker and are attributed by their exact path instead. Route
those writes through `formatSpecification` and the fixed-path branch in `RuntimeStage.#owned` can be
deleted, leaving one rule.

## Boundaries held

No barrel row changed. `src/server/types.ts` was edited only at the two sentences R4 and R6 name.
`Inspection`, `INTERNAL`, `Verdict`'s shape, and the threat-model prose are unchanged. All 15
modified files are in the owned list.
