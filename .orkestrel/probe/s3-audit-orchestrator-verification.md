# S3 audit — the Orchestrator's own verification of Sol's refutations

Sol returned `VERDICT: FAIL` with seven claims refuted. Seven is a lot, so each load-bearing refutation
was re-run here rather than accepted. Journal `tmp/codex/s3-audit.jsonl`, thread
`01a01a29-33b3-7d13-92c7-ef4eb34caa55`.

## Claim 15 and 11(b) — CONFIRMED, and it is the round's highest finding

Sol's trace: `#retire` awaits the `shutdown` response before `#destroy` awaits `released`. If the child
exits cleanly during teardown, `#exit` sets `#ending` and then returns at
`if (this.#destroyed && code === 0) return`, so `#fail` never runs and nothing settles the pending
request.

Reproduced against the built package with a protocol-faithful LSP fixture and a discriminating control.
The fixture answers `initialize`; `FIXTURE_MODE` decides only whether it answers `shutdown`:

```text
CONTROL   server answers shutdown            destroy() -> SETTLED  after 7ms
SCENARIO  server exits 0 without answering   destroy() -> HUNG     after 6007ms
```

The control passes, so the instrument distinguishes. **This is the same defect class S3 was dispatched
to repair**, moved from a signal death to a clean exit during teardown. `ProbeInterface.destroy` is
documented as settling when every engine releases its resources.

The instrument first reported `SETTLED` for both modes in 0 ms. That reading was wrong and was not used:
the fixture workspace had no `oxlint/package.json`, so `resolveWorkspaceBinary` threw and the stage never
warmed. It was fixed and re-proved by a positive control — `inspect` must hang, because the fixture
publishes no diagnostics — before either number was believed.

## Claim 6 and 11(a) — CONFIRMED by inspection of both inputs

The two facts the reasoning needs were read directly.

- `.oxlintrc.json:76-80` keys an override on the exact path `configs/policy.ts`.
- `#file` sends any declared path outside `src/**` and `app/**` to `tests/probe-<uuid>.<basename>`.

`tests/probe-a1b2.policy.ts` cannot match the glob `configs/policy.ts`. **S3's C4 repair fixes suffix
globs and leaves exact-path overrides broken.** Sol's behavioural run drove both names with identical
`export default {}` text and got no diagnostics for the declared path and
`import(no-default-export)` for the synthesized one.

## Claim 10 — CONFIRMED, and it is the false green the brief asked for

`applies the workspace lint overrides the declared path selects` exercises only `*.config.ts`, a suffix
glob that survives the synthesis. The test passes while the behaviour it is named for is broken.

## Claim 8 — CONFIRMED as stated

A spawn failure emits `error` and `close` and never emits `exit`, so the `exit` handler that is the sole
writer of `#ending` never runs:

```text
error=ENOENT
close=-2,null
```

## Claim 9 — REFUTED BY SOL, AND SOL'S REFUTATION IS DROPPED

Sol's scenario requires `this.#failures.set(id, reject)` to throw after `this.#responses.set(id, resolve)`
succeeded. Both are plain `Map` instances held in `readonly` private fields, keyed by a number and valued
by a function. `Map.prototype.set` cannot throw there, and nothing can replace or freeze the maps. The
path is unreachable, so the claim stands.

`.agents/orchestration.md` requires dropping, on the record, any finding no lane can substantiate. This
is that.

The reachable question behind it was checked separately and is sound: `#fail` rejects `#failures` and
`#refusals` and clears all four settlement maps. One observation, LOW and not carried into the fix round:
`#documents` is not cleared by `#fail`, so entries survive a terminal failure. It holds strings rather
than promises, and the stage is unusable after `#fail`, so nothing settles differently.

## Claim 12 — CONFIRMED, and already carried

The five module-scope helpers in the owned test file belong in `tests/setupServer.ts`. S3 could not
comply because it did not own the destination. Unit T2 owns both files and its amendment 1 carries the
lift. No new unit is owed.

## A mistake made during this verification, recorded

A probe wrote a canary and removed it in a `finally`, and one of its target paths was the real tracked
file `configs/policy.ts`. The file was deleted. It was caught on the next command by
`git status --porcelain` reporting ` D configs/policy.ts`, restored with `git checkout --`, and the tree
verified clean before anything else ran.

The rule this breaks is the one recorded earlier in this campaign: the Orchestrator's instruments belong
in its own scratchpad, not in the subject repository. A probe that both writes and deletes inside the
subject tree can remove a file it did not create, and a cleanup keyed to a caller-supplied path list is
exactly how.
