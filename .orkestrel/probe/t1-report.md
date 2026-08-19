# Unit T1 — returned report

Transcribed at the same moment the code was committed. Baseline `2ecddc2`.

## Files written

`tests/src/core/validators.test.ts` — added `createHostileValues` to the `@orkestrel/test` import;
replaced the inert `throwingProxy` and its assertion with one call to `createHostileValues()` bound to
`hostileValues`, followed by an indexed loop asserting `isClaim(value)` against `compiled(value)` for each
of the six published members, in the differential form throughout.

## What the six members prove that the deleted value did not

From the unit's own run.

| Index | Member | What it proves |
| ----- | ------ | -------------- |
| 0 | cyclic self-reference | the guards do not loop or crash walking a value that references itself; the deleted proxy carried no cycle |
| 1 | revoked proxy | every trap throws `TypeError`, including `getPrototypeOf` and `ownKeys`; the deleted proxy answered those normally through the default handler |
| 2 | `get`-throwing proxy | property reads throw — the same trap the deleted proxy's handler covered, but through an actual override instead of an unreachable inherited one |
| 3 | `ownKeys`-throwing proxy | throws from `Reflect.ownKeys`, a trap both guards consult and the deleted proxy never overrode |
| 4 | `getPrototypeOf`-throwing proxy | throws from `Object.getPrototypeOf`, the other trap both guards consult and the deleted proxy never overrode |
| 5 | bare `Object.create(null)` | a null-prototype object with zero own keys is rejected, complementing `nullPrototype`, which keeps three own keys and must be accepted |

## Validation

| Gate | Result |
| ---- | ------ |
| `npx vitest run --project src:core` | exit 0, 3 files, 13 passed |
| `npm run lint:check` | exit 0 |
| `npm run check` | exit 0 across all four tsconfigs |
| `npm test` | exit 0 — 74 + 86 + 28 = **188 passed, 0 skipped, 0 todo** |

## Criteria

- `grep -n "WeakMap.prototype"` — no matches.
- `nullPrototype` still constructed at line 105 and still asserted at line 150 as
  `.toBe(compiled(nullPrototype))`.
- `grep -c "createHostileValues()"` — 1, bound to `hostileValues`.
- Every new assertion's label is `hostile value ${index}`.

## Deviation — a contradiction in the brief, reported rather than hidden

Acceptance criterion 3 required `grep -c "toBe(compiled("` to rise by exactly 6. The brief's own "The
change" section directs "one indexed loop over the six published values". **These conflict.** A loop is
one source occurrence executed six times, so a static source-text grep cannot rise by 6.

The unit followed the loop instruction over the grep arithmetic, because the loop is the more specific
and deliberate direction and because it is what satisfies prohibition 3 — bind `createHostileValues()`
once. The count is 8, unchanged from 8 at baseline.

**The Orchestrator's error, not the unit's.** The brief-check rule "Ask what the change will do to the
facts you just measured. A criterion fixed to a measured set is unreachable if the change alters that
set" names exactly this, and the criterion was written without applying it.

## Decisions

- Local constant `hostileValues`, matching the existing `nullPrototype` convention in the same test.
- `for (const [index, value] of hostileValues.entries())`, mirroring the published TSDoc idiom.
- The loop sits where the deleted `throwingProxy` assertion was, immediately after the `nullPrototype`
  assertion.
