# O9 unit 1 — returned report

Transcribed at the same moment the code was committed. Baseline `b7be693`.

## Files written

| File | Change |
| ---- | ------ |
| `src/server/types.ts` | Declares `OverlayInterface`: `revision`, `paths`, `set`, `text`, `covers`, `clear` — no Vite or TypeScript type |
| `src/server/Overlay.ts` | **New.** The entity over one `Map<string, string>`; `covers` derives from the held paths, `revision` is a per-instance identity |
| `src/server/stages/TypeStage.ts` | Drops `#overlays`, `#versions`, `#revision`; each inspection creates, installs, and clears its own `Overlay`; `fileExists` and `directoryExists` become overlay-aware; adds the `candidates` observable |
| `src/server/index.ts` | Barrels `./Overlay.js` |
| `tests/src/server/index.test.ts` | Adds `Overlay` to the barrel population |
| `tests/src/server/stages/TypeStage.test.ts` | Three importability and shadowing regressions; **both `node:inspector` censuses replaced with behavioural tests**; asserts `stage.candidates` after a failing inspection, a successful one, and `destroy` |

## Failing-first proof

Before any source edit, with the two new tests in place:

```text
Tests  2 failed | 10 passed (12)
× imports a candidate that exists only as overlay text
    Cannot find module '../../src/core/overlay-only-<id>.js' or its corresponding type declarations.
× imports a candidate whose directory does not exist
    Cannot find module '../../src/overlay-absent-<id>/signal.js' or its corresponding type declarations.
```

After: `Tests 12 passed (12)`.

**Criterion 5 was already green before the change** and the unit said so rather than claiming a red.
`readFile` and `getScriptSnapshot` already consulted the overlay, so the shadowing test had nothing to
redden; it now guards the behaviour and asserts the disk bytes are unchanged.

## The measurements that make the criteria real

**Listings are unaffected, with a control that moves.** A project whose include glob covers an overlaid
`virtual.ts` and an overlaid `absent/deep.ts`, parsed during the inspection that set them:

```text
BEFORE     [".../real.ts"]
AFTER      [".../real.ts"]
IDENTICAL  true
CONTROL    [".../real.ts", ".../second.ts"]
CONTROL MOVED (must be true) true
```

The control is a real disk file under the same glob, so the identical reading is a result rather than a
constant.

**Both host callbacks are load-bearing in this implementation, not merely in the design round.** With
`directoryExists` reverted to `typescript.sys.directoryExists` and `fileExists` left overlay-aware:
`Tests 1 failed | 1 passed` — the missing-directory import fails and the existing-directory import
passes. That reproduces the brief's settled measurement against the unit's own code rather than
inheriting it.

**Clearing is falsifiable.** Replacing `overlay.clear()` with `void overlay` gives
`Tests 4 failed | 8 passed (12)` — the three escape-position tests plus the release test. The unit states
plainly that the destroy leg's only falsifiable window is an inspection abandoned mid-flight, which is
timing-dependent and is **not** asserted, rather than claiming it.

**The service-cache census is replaced by behaviour.** A caller-named project is inspected, three
spellings of a resident project are inspected, that project's file is rewritten from
`noImplicitAny: true` to `false`, and the retained service still reports the error; then a second
caller-named project takes the slot and the rebuilt service reports none. Neutralising the dispose in
`#recycle` fails it.

## Validation

| Gate | Exit code |
| ---- | --------- |
| `format:check` | 0 |
| `lint:check` | 0 |
| `check` | 0 |
| `build` | 0 |
| `test` | 0 — **201 passed** (87 + 86 + 28), 0 skipped, 0 todo, against 198 baseline |

Three new tests; the two censuses were replaced one for one.

## Deviation 1 — a pre-existing flake, proved pre-existing

`tests/src/bin/main.test.ts` failed in two of two gate-chain runs:

```text
Error: ENOENT: no such file or directory, scandir '/tmp/orkestrel-test-<id>/tmp/probe'
  ❯ tests/src/bin/main.test.ts:343:20
```

The unit **stashed its work, returned the tree to `b7be693`, and ran the same chain twice**: run 1 passed
at 198, run 2 failed identically. So it is a pre-existing budget too thin for a contended run, in a file
this unit does not own. `.claude/rules/tests.md` names the rule it breaks — "size its budget from a full
contended run rather than from an isolated one". The unit's three added tests increase parallel load,
which can surface it more often.

## Deviation 2 — `Overlay` ships without its mirrored test, and no gate detects that

`tests/src/server/Overlay.test.ts` was not in the owned list, so the unit did not create it — correct.
What it also established: **the policy sweep's mirror rule runs test → module, not module → test**, so
`test:policy` is green with a source file that has no mirrored test at all.

Every member is exercised and falsifiable through the owned tests. A successor that owns
`tests/src/server/Overlay.test.ts` can prove the entity directly, including the two cases the stage never
produces: an empty `covers`, and a directory argument with a trailing separator.

## Decisions

- **Inspection scope is expressed by ownership of the object, not by the field.** `#inspect` constructs
  its own `Overlay`, installs it for the resident hosts to read, and clears it through its own reference,
  so one inspection cannot clear another's set and the clear no longer re-resolves caller input. S4's
  repair is kept and simplified rather than reverted. What still rests on the caller admitting one
  inspection at a time is which overlay the resident services read — now stated in a comment at the
  assignment instead of being unwritten.
- **`covers` compares on forward slashes on both sides**, because a tool that normalizes its own paths
  asks in a spelling the recorded path may not share.
- **No `count` member.** `paths.length` answers it, and a second tally can only duplicate the map.
- **`revision` is a `randomUUID` per instance, not a counter.** A per-inspection overlay cannot hold a
  stage-wide counter, and module-scope state is banned.
- **The observable seam is `TypeStage.candidates`.** The entity's own `paths` is unreachable from a test
  because the overlay is inspection-scoped, so the retention question needed a seam on the stage.
  `candidates` derives from `#overlay.paths` and returns a fresh array, so no mutable internal escapes,
  and reports paths only — the text belongs to the case that supplied it.
- **`realpath` was not applied to overlay keys.** `o9-amendment.md` raises it for symlinked roots; this
  unit's criteria do not name it, and `realpathSync` is the identity on this host, so nothing here
  distinguishes the two. It belongs to whichever unit owns a symlinked-workspace control.
