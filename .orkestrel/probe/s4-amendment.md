# Unit S4 — amendment 1, written 2026-08-19 after Q1 landed

`s4-brief.md` stands. This file records what moved between writing it and dispatching it. Read both.

## The line numbers moved by roughly 64 lines

Unit Q1 replaced the three per-stage `#tail` serializers with one `QueueInterface` owned by `Probe`, and
folded each stage's private `#inspect` into its public `inspect`. `TypeStage.ts` is 264 lines now.

The brief quotes defect A at `src/server/stages/TypeStage.ts:148-169`. Verified against the file at
commit `e11c389`, the same code is at **84-105**:

```text
84:		this.#revision += 1
85:		this.#overlay(subject.test)
86:		for (const source of subject.files) this.#overlay(source)
87:		try {
101:		} finally {
102:			this.#overlays.delete(resolveWorkspaceFile(this.#workspace, subject.test.path))
104:				this.#overlays.delete(resolveWorkspaceFile(this.#workspace, source.path))
```

`#overlay` is at 162. The defect is byte-for-byte what the brief describes — two overlay applications
outside the `try` whose `finally` removes them. Re-read the file for exact positions rather than
trusting either set of numbers.

## The engine is unchanged

`sol` — GPT-5.6 Sol. This unit's subject is a TypeScript language-service overlay map, not a spawned
child's stdio, so the nested-spawn constraint that re-routed S3 does not reach it. Confirm the bench is
live with a round-tripped call before launching; a version string and an authentication check are not
liveness.

## The dispatch order changed

S4 runs AFTER S3, not beside it. Both are writers and the contract serializes writers in the main
checkout. S3 owns `LintStage.ts`; S4 owns `TypeStage.ts`; they are disjoint files and the rule still
binds, because a concurrent tree-wide gate reads a sibling's in-flight failure.

The test-helper adoption unit runs after BOTH. It sweeps `tests/src/server/stages/TypeStage.test.ts`,
which S4 edits, so it must see S4's final shape rather than repair the same drift the other way.

## A neighbouring unit changes which paths escape — write your test against a genuine escape

Unit H1 repairs `resolveWorkspaceFile` in `src/server/helpers.ts`, which S4's defect A depends on
throwing. H1 makes it throw on FEWER paths, not more: `path.startsWith('..')` is a bare prefix test
today, so it refuses three contained files whose names begin with dots. Measured:

```text
DIFFER  "..hidden.ts"            probe=THROW pkgform=ok
DIFFER  "..config/value.ts"      probe=THROW pkgform=ok
DIFFER  "...weird.ts"            probe=THROW pkgform=ok
agree   "../outside.ts"          probe=THROW pkgform=THROW
agree   ".."                     probe=THROW pkgform=THROW
agree   "/etc/passwd"            probe=THROW pkgform=THROW
agree   "./a/../../escape.ts"    probe=THROW pkgform=THROW
```

Defect A is unchanged: a genuine escape still throws before the `try` is entered, and the `finally`
still never runs. Only the population of "genuine escape" narrows.

**The obligation this puts on S4: build defect A's proof on a path from the agreeing rows.** Use
`../outside.ts` or `/etc/passwd`. A proof built on `..hidden.ts` passes today and reddens the moment H1
lands, and it would read as S4's repair regressing rather than as the test naming the wrong escape.

H1 owns `src/server/helpers.ts` and `tests/src/server/helpers.test.ts`. Both are off-limits to S4, and
they already were.
