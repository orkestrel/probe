# S3 audit — reconciliation

Two lanes ruled on one claim set, blind to each other, on different engines. GPT-5.6 Sol held the
independent objective lane because Claude Opus 5 wrote the unit. Six blind Opus lenses over disjoint
seams held the second, each with its own adversarial verifier on a clean context. The Orchestrator
reconciles and re-ran every load-bearing refutation itself.

**Both lanes refuted the same seven claims independently: 6, 7, 8, 9, 11, 12, 15.** Neither saw the
other's answer.

## The findings that go into the fix round

### F1 — one suppression causes three refutations. HIGH.

`src/server/stages/LintStage.ts:349`, `if (this.#destroyed && code === 0) return`.

Claims 9, 11(b), and 15 are not three defects. They are three doors onto this line. It sets `#ending`
and returns before `#fail`, and `#fail` is the only thing that rejects a `#failures` entry, so any
request outstanding when a clean exit lands is never settled and never deleted.

Two reachable paths, both measured with a map census:

```text
PATH A  child exits 0 without answering shutdown    HUNG 6007ms  responses:1 failures:1 ending="code 0"
PATH B  destroy during warm, exits 0 before init    HUNG 6007ms  responses:1 failures:1 ending="code 0"
```

Four controls isolate the line, one character changed in the fixture each time:

```text
exit code 3 on shutdown    SETTLED    5ms   census all 0
exit code 3 during warm    SETTLED  142ms   census all 0
SIGKILL instead of exit 0  SETTLED          census all 0
suppression deleted        SETTLED          (mutation control, through a load hook)
```

The Orchestrator reproduced PATH A independently against the built package: control 7 ms, scenario hung.

**Reachability is not exotic.** A lens measured the real oxlint 1.79.0 `--lsp` and **code 0 is its only
code-exit shape** — stdin EOF gives 0, the `exit` notification gives 0, and SIGINT, SIGTERM, and SIGHUP
all die by signal. The suppression blankets exactly the code Oxlint uses.

This is the defect class S3 was dispatched to repair, relocated from a signal death to a clean exit.
`src/core/types.ts` documents `ProbeInterface.destroy` as settling when every engine releases its
resources.

### F2 — the repair introduced a regression. HIGH.

A spawn failure emits `error` then `close` and **never** `exit`. Line 133's `exit` handler is the only
writer of `#ending`, and there is no class-level `close` handler.

```text
healthy child     exit:0/null | close:0/null
missing binary    error:ENOENT | close:-2/null      <- no exit
```

Consequence, run against the real source with a workspace whose binary cannot spawn: `inspect` rejects,
then `destroy()` **HUNG after 4000ms**. `#destroy`'s guard at line 98 does not take its early return
because `#ending` is undefined, and the `once('exit')`/`once('close')` listeners at 100-101 are attached
after `close` already fired.

**The control is what makes this a regression rather than a defect:** the baseline `e11c389` source in
the identical scenario **SETTLED**, because the old `child.exitCode !== null` check reads `-2` and
returns early. A second control, `dcd50a3` on a healthy workspace with the same delay, also SETTLED.

### F3 — the C4 repair is half a repair. HIGH.

`#file` keeps the declared basename and discards the declared **directory**. That fixes suffix globs and
leaves path-anchored overrides broken.

`.oxlintrc.json:76-80` keys an override on the exact path `configs/policy.ts`. A candidate declaring it
is linted as `tests/probe-<uuid>.policy.ts`, which cannot match. Driven with identical
`export default {}` text: no diagnostics for the declared path, `import(no-default-export)` for the
synthesized one.

### F4 — the test written for F3 cannot detect it. MEDIUM.

`applies the workspace lint overrides the declared path selects` exercises only `*.config.ts`, a suffix
glob that survives the synthesis. It passes while the behaviour it names is broken, and it never
compares a declared path against its own synthesized path.

### F5 — an assertion in the host test can never fail. MEDIUM.

The spawned-host proof asserts on the string `unhandledRejection`, which Node does not print. The
assertion is inert.

### F6 — two more tests do not bind to what they name. MEDIUM and LOW.

Test 4 binds to no single repair. Test 5's red on the unrepaired source is produced by the C4 repair
rather than by the stdin listener it is named for.

### F7 — the unit's own reachability reasoning was wrong. HIGH, and it is about the report.

S3 concluded the orphan was reachable through the signal door. A lens refutes it: **the signal door
reaches the deadlock, never the orphan.** The orphan is reachable, by a code-0 vector the change never
measured — a lone surrogate in candidate text.

The repair was still correct. Its stated justification was not, and `PROBE.md` must not inherit it.

### F8 — the stdin comment claims a recycle that does not exist. MEDIUM.

The comment says the coordinator can recycle around a stdin fault. `Probe.ts` holds the lint stage
`readonly` and replaces only the runtime stage, so a faulted lint stage degrades permanently.

### F9 — `#ending` persists state Node already carries. MEDIUM.

A design observation on the mechanism F1 and F2 both touch. Rule on it while repairing them.

## Dropped on the record

- **Sol's mechanism for claim 9.** It requires `this.#failures.set(id, reject)` to throw after the
  preceding `set` succeeded. Both are plain `Map` instances in `readonly` private fields, keyed by a
  number and valued by a function; `Map.prototype.set` cannot throw there. Unreachable. The Opus lens
  found the reachable mechanism, which is F1.
- **S3's forget-then-refuse blocks are sound.** A lens exercised both under 40 sequential documents, a
  six-source subject, three concurrent inspections, a concurrent kill, a concurrent destroy, and 40
  randomized destroy/inspect races: zero leaks, zero unhandled rejections. The refutation of claim 9 is
  not in the repair S3 wrote.
- **The `#retire` comment finding.** Killed on two grounds, both measured: the comment's operative clause
  is scoped to a reply "a dead pipe swallowed", which the code does satisfy; and bounding destroy makes
  both disjuncts true with no edit.
- **`signal ?? 'unknown'` as a forbidden sentinel.** Killed: the branch is unreachable. Node emits `exit`
  with exactly one non-null argument, and even unnamed real-time signals (`kill -34`, `-40`, `-64`) give
  `code=0 signal=null`. The token is also byte-identical to the baseline, so the change did not introduce
  it.
- **The module-scope test helpers.** Sol confirmed a violation; the conformance verifier refuted it by
  measuring the rule's own trigger — no other probe test drives an Oxlint language server, so four of the
  five declarations are single-consumer by construction and "could serve another test" is not met. The
  measured reading wins. **Dissent recorded.** The lift has been withdrawn from T2, which never owned that
  subject.
- **`stdout`/`stderr` error listeners.** Killed by the stream verifier.

## Carried out of scope, recorded against the capability that owns them

- A language server that accepts stdin but never answers `initialize` deadlocks `destroy()`. Distinct
  from F1: the server stays live, so no exit event arrives at all. This needs a bound on the
  conversation, not a fix to the suppression.
- `Probe.ts:50` holds the lint stage `readonly`, so the coordinator has no replacement path for a faulted
  lint stage. That is a coordinator design question, not this unit's.

## Every finding has a carrier

F1 through F9 go to unit S3fix. The two out-of-scope items are recorded here against `LintStage` and
`Probe` respectively, for a later change. The six dropped findings carry no work by construction.
