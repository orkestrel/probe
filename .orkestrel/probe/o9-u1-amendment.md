# O9 unit 1 — amendment 1, written after S4 landed

`o9-u1-brief.md` stands. Its "What is already settled" measurements are host-callback facts that nothing
since has touched. Two things change.

## The owned list gains `tests/src/server/stages/TypeStage.test.ts`, and this is not optional

The brief owns `tests/src/server/index.test.ts` "only to keep the barrel population assertion true" and
puts every other file under `tests/` off-limits. **That makes the unit's own criteria unreachable.**

Unit S4 added regressions to `tests/src/server/stages/TypeStage.test.ts` that consume the exact state
this unit moves. One of them reads a private field directly:

```text
tests/src/server/stages/TypeStage.test.ts:1     import { Session } from 'node:inspector/promises'
tests/src/server/stages/TypeStage.test.ts:192   property.name === '#versions'
```

Moving overlay and version state into an `Overlay` entity makes that test's subject vanish. The unit
would break a file it cannot edit, and stop.

`.agents/orchestration.md` § Dispatch anatomy names this failure: "Scope a fleet-wide refactor by the
files that **consume** a symbol, not by the files that declare it. A criterion that removes a symbol, or
that makes an existing state or fixture shape unreachable, closes only when every consumer that exercises
it is owned."

**Own the file.** S4's regressions are the acceptance evidence for the lifetime this unit rebuilds — the
three escape-position tests especially — so they must survive in behaviour even where their mechanism
moves. Do not delete a test to make a refactor pass; if one cannot be preserved, report it.

## The entity is the public seam two units said was missing, so use it

This codebase now carries a `node:inspector` census in a test for the second time. Unit S3fix2 removed
one from `tests/src/server/stages/LintStage.test.ts` after two lanes agreed it asserts private
implementation state against `.claude/rules/tests.md` § "Test observable behavior, not implementation
details". Unit S4 then added one to `TypeStage.test.ts` and flagged it against itself:

> A public resident-resource metric would have been a better observable seam, but none exists.

**This unit creates that seam.** An `Overlay` is an entity with a lifetime; whether it holds anything is
a property of the entity, not a private field of the stage. Give it an observable that answers what the
census was reaching for, and rewrite S4's version-release regression against it.

Two constraints on that observable, both from `AGENTS.md` § Design laws:

- **Single-word entity API.** One descriptive word.
- **Derive state.** It reports what the overlay currently holds; it does not store a second count that
  can drift from the map.

If you conclude the entity should expose nothing — that the release is provable through the type stage's
own diagnostics alone, with no new member — that is a legitimate answer. Say so, prove the release that
way, and delete the census. What is not acceptable is leaving a `node:inspector` session in a file this
unit owns.

## One fact re-verified at dispatch

`src/server/stages/TypeStage.ts` is 264 lines at `b7be693` and S4's repair is in it: overlays are
recorded before either map changes, and the `finally` deletes the recorded paths without resolving caller
input a second time. **Build on that, do not revert it.** The lifetime this unit rebuilds must keep the
property S4 proved: an escape in any position of the candidate list leaves no overlay behind.
