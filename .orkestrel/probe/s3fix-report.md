# Unit S3fix — returned report

Transcribed from the unit's return at commit `078946d`. Baseline `dcd50a3`.

## Findings closed

- **F1** — deleted `if (this.#destroyed && code === 0) return` from `#exit`. The exit handler settles
  unconditionally, so a `shutdown` request outstanding when a clean exit lands is refused instead of held
  forever. `src/server/stages/LintStage.ts:361-364`.
- **F2** — `#ending` is derived from the child (`signalCode`, then `exitCode`), so a spawn failure
  (`error` + `close`, never `exit`, `exitCode === -2`) makes `#destroy`'s guard fire.
  `src/server/stages/LintStage.ts:173-181`.
- **F3** — `#file` keeps the declared **directory** as well as the declared basename; only a candidate
  staged under the probe's own `tmp/probe` scratch directory is collapsed to `tests`, because the
  workspace's ignore files keep that directory out of linting entirely.
  `src/server/stages/LintStage.ts:205-222`.
- **F4** — added `applies an override the workspace anchors to the declared directory`, driving the real
  Oxlint binary against a scratch workspace whose `.oxlintrc.json` exempts `configs/**` from
  `no-debugger`, comparing a declared path against the path the stage synthesizes for it. Both
  directions asserted.
- **F5** — the host proof's two weak assertions (`not.toContain('Error:')`,
  `not.toContain('unhandledRejection')`) are replaced by `expect(reported).toBe('')`. Proven
  load-bearing by mutation.
- **F6** — the fixture server routes on **document text** (`PROBE_SILENT`, `PROBE_CLOSES_INPUT`) rather
  than on the synthesized URI, so no test's scenario depends on what `#file` produces. Test 4 gained a
  map-census assertion; test 5 now reddens only on the stdin listener.
- **F7** — reported below; no file edit, `PROBE.md` off-limits. Added `rejects an inspection whose
  candidate text ends the real language server`, the only test in the file driving a real server into a
  code exit.
- **F8** — the stdin comment no longer claims a coordinator recycle. It says the fault refuses the
  inspection that raced the death. `src/server/stages/LintStage.ts:125-128`.
- **F9** — ruled and implemented; see below.

## The F9 ruling

**Remove the stored `#ending` field; derive the ending from the child.**

`AGENTS.md` § Design laws — "Derive state. Compute facts from existing fields. Do not store a second flag
or label that can drift" — decides it, and F2 is the drift: the field had one writer, the `exit` handler,
and a spawn failure never fires that event, so teardown read `undefined` on a child Node had already
marked ended. Node carries the whole fact, and it is readable before the event that announces it:

```text
SPAWNFAIL at error exitCode=-2   signalCode=null      order error:ENOENT | close:-2/null
EXIT0 at exit      exitCode=0    signalCode=null      order exit:0/null | close:0/null
EXIT7 at exit      exitCode=7    signalCode=null      order exit:7/null | close:7/null
SIGNAL at exit     exitCode=null signalCode='SIGKILL' order exit:null/SIGKILL | close:null/SIGKILL
```

The getter reads `signalCode` first, then `exitCode`, returning `undefined` only while both are null. One
private `#describe(code, signal)` formats an ending for both the getter and the `exit` handler, so there
is no second copy of the message shape and no unreachable early return that would silently skip
settlement.

## The corrected reachability (F7)

S3's report concluded the orphan was reachable through the signal door. That is wrong: a signal death
leaves `exitCode` null, so the pre-repair `#send` never threw and `#document` never orphaned — **the
signal door reaches the deadlock**. The orphan's real door is a **code-0 exit**, and a lone surrogate in
candidate text is a reachable one. Measured against real oxlint 1.79.0 through a stage-shaped LSP
handshake:

```text
initialized
serialized frame contains escaped surrogate: true  byteLength ok: true
SERVER EXIT code=0 signal=null
RESULT NO-PUBLISH
child exitCode 0 signalCode null
```

The candidate text was `const value = "<U+D800>"`. The frame is well formed — `JSON.stringify` escapes
the surrogate to the ASCII sequence and `Buffer.byteLength` matches — so this is the stage's own
serialization reaching the server, not an instrument artefact.

**For the guide:** the reachability sentence must say the orphan is reached by a candidate whose text
ends the server with code 0, not by a signal death.

## Red-then-green proofs

Command, identical in every case:

```text
npx vitest run --config vite.config.ts --no-cache --reporter=verbose --project src:server tests/src/server/stages/LintStage.test.ts
```

Against `dcd50a3` — `Tests 4 failed | 10 passed (14)`:

```text
× applies an override the workspace anchors to the declared directory 103ms
    AssertionError: expected [ { origin: 'code', …(3) } ] to strictly equal []
× settles teardown when the language server exits without answering shutdown        20003ms
    Error: Test timed out in 20000ms.
× settles teardown when destroy interrupts a language server that never answers initialize 20022ms
    Error: Test timed out in 20000ms.
× settles teardown when the language server cannot spawn                            20004ms
    Error: Test timed out in 20000ms.
```

After the repair — `Tests 14 passed (14)`, exit 0.

Criterion 3's red needed a correction the brief could not have known: with no wait between the spawn
failure and `destroy()`, the baseline **settles in 3 ms**, because `close` has not fired and `#destroy`'s
listeners still catch it. Measured against the real source at `dcd50a3`:

```text
INSPECT REJECTED:spawn /opt/node22/bin/node ENOENT
DESTROY SETTLED 3ms          # no wait
DESTROY HUNG 5006ms          # after a 250 ms wait
```

The test waits 250 ms, and the comment beside it says why the wait is load-bearing.

## What each of the six inherited tests now binds to

Every row measured: the mutation applied to the repaired source, the named test run alone, the source
restored.

| Test | Its red now comes from | Mutation evidence |
| ---- | ---------------------- | ----------------- |
| 1 `applies the workspace lint overrides the declared path selects` | the declared **basename** half of `#file` | `basename` → `extname`: this test red, the directory test green |
| 2 `settles teardown after the language server dies by signal` | the liveness read covering `signalCode` | `#ending` reading `exitCode` only: red at 20019 ms |
| 3 `rejects a later inspection with the signal that killed the language server` | the same read, on the write path | same mutation: red at 20021 ms |
| 4 `reports the exit code when the language server dies mid-inspection` | the class-level `exit` settlement | deleting `child.on('exit', …)`: red at 20021 ms |
| 5 `refuses an inspection through a stage fault when the language server closes its input` | the `child.stdin` error listener, no longer `#file` | deleting `child.stdin.on('error', …)`: red at 20019 ms |
| 6 `tears down a stage whose language server died without ending the host process` | the cleanup attached before the open | restoring the pre-S3 `#document` shape: red |

The two repairs bind disjointly:

```text
suppression restored → only the two teardown tests red; signal and spawn tests green
#ending stored again → only the spawn test red; the two teardown tests green
directory collapsed  → only the directory-override test red; the suffix-glob test green
```

The census instrument was proven able to fail before being trusted: a stage with its `initialize`
request outstanding reports `{"#responses":1,"#failures":1,"#documents":0,"#publishes":0,"#refusals":0}`,
and the same stage after teardown reports all five at 0.

## Validation

| Gate | Exit code |
| ---- | --------- |
| `npm run format:check` | 0 |
| `npm run lint:check` | 0 |
| `npm run check` | 0 |
| `npm run build` | 0 |
| `npm test` | 0 |

## Counts

`npm test`: **185 passed, 0 skipped, 0 todo** (71 + 86 + 28), against 180 at `dcd50a3`. Five new tests.

## Deviation

None that stopped the unit. One acceptance criterion closes in part, recorded rather than hidden:

**Criterion 5 closes for a directory-anchored override and not for an exact-path one.**
`.oxlintrc.json:76-80` keys its exemption on the literal path `configs/policy.ts`, and no synthesized
identity can match that glob while remaining distinct from the declared path. Measured against real
oxlint 1.79.0 with the text `export default { value: 1 }`:

```text
declared exact                configs/policy.ts                          []
directory kept, uuid basename configs/probe-<uuid>.policy.ts             ["Prefer named exports"]
directory collapsed (today)   tests/probe-<uuid>.policy.ts               ["Prefer named exports"]
uuid dir above declared       probe-<uuid>/configs/policy.ts             ["Prefer named exports"]
exact path + uri query        configs/policy.ts?probe=<uuid>             []
```

Only the last two rows match, and both require the linted path to be the declared path itself. Rejected:
the uniqueness the stage needs would have to move into a URI query, which works today only because
oxlint's URL-to-path conversion drops the query — undocumented behaviour of a third-party server the
package pins at `>=1.77.0`, whose failure mode is a silent hang rather than a wrong answer.

## Decisions

- **The `tmp/probe` carve-out is required, not test-fitting.** `Probe.ts:152-164` arms itself with
  candidates declared at `tmp/probe/arm-*.test.ts`, and `.gitignore:11` ignores `tmp`, so oxlint
  publishes `[]` for anything declared there. Measured: `tmp/probe/lint-stage.test.ts` with `debugger`
  → `[]`; `tests/probe-<uuid>.lint-stage.test.ts` with the same text → the finding. Preserving that
  directory would have made the arming's lint leg a permanent false green. The carve-out reuses
  `inferTestProject`, the one place already naming that staging area.
- **The map census reads private state through `node:inspector`.** Criterion 4 asks for membership across
  five `#`-private maps and no observable proxy covers `#documents`. `util.inspect` does not expose
  private fields (measured: `Holder {}` even with `showHidden`), so the census attaches a real inspector
  session and reads `Runtime.getProperties`. It observes the real object, replaces nothing, and uses no
  mock, fake, or spy. **It does sit against `.claude/rules/tests.md` § "Test observable behavior, not
  implementation details", and I am flagging that rather than burying it.**
- **`#describe` over a narrowing guard.** The exit handler formats from the event's own arguments through
  the same private method the getter uses. A getter-only handler would need an unreachable
  `if (ending === undefined) return` that would silently skip settlement if reached.
- **The three refuted items were not re-done.** `signal ?? 'unknown'` disappeared with the stored field;
  no `error` listeners on `stdout`/`stderr`; `#retire`'s comment unchanged; nothing lifted into
  `tests/setupServer.ts`; `Probe.ts` untouched and no recycle path built.
- **Out of scope, recorded:** a server that accepts stdin and never answers `initialize` still deadlocks
  `destroy()` — no exit event ever arrives, so this needs a bound on the conversation rather than a fix
  to the settlement. Unchanged by this round.

## Touched files

```text
 src/server/stages/LintStage.ts            |  49 ++++--
 tests/src/server/stages/LintStage.test.ts | 277 ++++++++++++++++++++++++++++--
 2 files changed, 297 insertions(+), 29 deletions(-)
```
