# Unit Q1 — one queue mechanism, not six

## Role and engine

`implementer` — Claude Opus 5, high reasoning effort. This unit collapses a duplicated invariant onto
a published primitive and decides where that invariant belongs, which is API-shape work.

## Why this unit exists, and why it runs before S3 and S4

The user asked why this campaign had been repairing probe without checking what the Orkestrel fleet
already publishes. It had not been checking. An overlap map was then built — read
`/home/user/scaffold/.orkestrel/probe/ecosystem-overlap.md` in full before starting — and it found one
thing that is not a reuse opportunity but a defect:

**Probe serializes the same work twice, in six places.**

```text
src/server/Probe.ts:48-50              #typeTail, #lintTail, #runtimeTail
src/server/stages/TypeStage.ts:44      #tail
src/server/stages/LintStage.ts:43      #tail
src/server/stages/RuntimeStage.ts:55   #tail
```

Each stage already chains its inspections onto a private `#tail`, so only one runs at a time. Unit S2
then added a second layer in the coordinator to start each deadline after queue admission. The
coordinator now serializes work the stage was already serializing.

Two of those six live in `LintStage.ts` and `TypeStage.ts` — the files units S3 and S4 are queued to
repair next. This unit runs first so those two repair one mechanism rather than repairing tail chains
scheduled for deletion.

## The decision this unit owns

`@orkestrel/queue` version `0.0.9` publishes `createQueue({ concurrency: 1 })`: FIFO, one in flight,
`enqueue` returning the settling promise, no idle polling. Read `/home/user/scaffold/guides/queue.md`
before designing.

**The design question is whose queue it is — the coordinator's or the stage's — and that is yours to
rule.** The duplication exists precisely because nobody answered it. Consider at least:

- **The stage owns it.** Each stage holds one `Queue` and the coordinator holds none. Simplest, and it
  keeps the serialization next to the resource it protects. But S2 added the coordinator layer to start
  deadlines after admission, so the coordinator needs to know when admission happened — say how.
- **The coordinator owns it.** One `Queue` per stage in `Probe`, and the stages become non-serializing.
  Puts admission and deadline in one place, but a stage used directly, outside a `Probe`, loses its
  serialization guarantee. Say whether any consumer does that.

Rule it, state the law you ruled it on, and implement one answer. Do not implement both and leave a
flag.

## What does not transfer, and must not change silently

`Queue` has a per-attempt timeout that **retries**. Probe's deadline races and then **recycles** the
stage. Those are different recoveries. Adopt at `concurrency: 1, retries: 0` and keep probe's
deadline-and-recycle layered above, or the semantics change without anyone noticing.

`Queue` also emits lifecycle events probe does not need. Confirm they do not leak into `Probe`'s own
`emitter` contract, which is a published surface with a fixed event map.

## Scope

- **Owned**: `src/server/Probe.ts`, `src/server/stages/TypeStage.ts`, `src/server/stages/LintStage.ts`,
  `src/server/stages/RuntimeStage.ts`, `src/server/types.ts`, `package.json` for the one dependency
  addition, and every mirrored test your change reddens under `tests/src/server/`.
- **The dependency addition is authorized.** The user explicitly asked for production-ready fleet
  packages to be brought in. Add `@orkestrel/queue` at the version the registry serves, verified with
  `npm view @orkestrel/queue version` rather than taken from the catalog table.
- **Instruments**: `tmp/scratch/` only, deleted before you return.
- **Off-limits**: `src/core/**`, `src/bin/main.ts`, `guides/**`, `vite.config.ts`, `configs/**`, every
  dotfile, and `tests/src/bin/main.test.ts`.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: no commit, push, publish, or destructive command. No type assertion, no suppression.

## Criteria

Each owes a committed test, red before the change and green after where a red state can exist.

1. Exactly one serialization mechanism remains. No `#tail` promise chain survives in any of the four
   files.
2. Two claims arriving together still run one at a time per stage, in arrival order.
3. A claim queued behind a claim that expires still completes and still earns a receipt — the guarantee
   unit S2 proved, which must not regress.
4. A stalled stage still rejects at its deadline rather than hanging, for all three stages.
5. `Probe`'s published event map is unchanged. No queue lifecycle event reaches a consumer.
6. `npm test` exits 0 with no skipped and no todo tests.

## Execution

Perform this assignment directly. Spawn no subagent.

## Host facts

- Working directory `/workspace/probe`, baseline `abad0f6`, tree clean, no other unit writing.
- **Run `npm run build` before any test that drives the built entry.** The entry tests need
  `dist/bin/main.js` and nothing else creates it; a missing artifact fails three tests in ways that look
  like unrelated defects.
- `npm test` is green at 171 tests right now. Any red is yours.
- Several tests drive real resident TypeScript, Vitest, and Oxlint hosts. Expect minutes.

## Deviation contract

Stop and report if the ruling needs an off-limits file, if adopting `Queue` cannot preserve criterion 3
or 4, or if a gate reddens for a reason your change does not explain.

## Naming

Criterion numbers are addressing for this brief only. Name every test for the behaviour it proves.

## Output

Return exactly: **Files written**, **Validation**, **Acceptance evidence**, **Deviation**, **Decisions**.

Under **Decisions**, lead with whose queue it is and the law you ruled it on.
