# PBFIX15 report

## Item 1: pinned legacy driven client

Added `answers a pinned legacy client through the initialize path` at
`tests/src/bin/main.test.ts:386` (immediately after the sibling driven-client case), mirroring the
existing case with the file paths `src/core/legacy.ts` and `tmp/probe/bin/legacy-runtime.test.ts`,
`version: '2025-06-18'` in `createMCPClient`, and `expect(client.version).toBe('2025-06-18')` in
place of `toBeDefined`. Everything else — tools listing, `prove` call, `resultType` narrowing, the
`probe ` prefix assertion, and the closing `receipt probe:` assertion — is unchanged from the
sibling case.

## Item 2: TSDoc first sentences

`src/core/constants.ts`:

- `src/core/constants.ts:2` — `Lists the stages a claim passes through, in the order a verdict reports them.`
- `src/core/constants.ts:17` — `Lists the parties that can own action on an issue or probe failure.`
- `src/core/constants.ts:31` — `Lists the conditions that can end a probe operation.`
- `src/core/constants.ts:52` — `Names the leading token every receipt carries.`
- `src/core/constants.ts:68` — `Names the character joining a receipt's tokens.`

`src/core/shapers.ts`:

- `src/core/shapers.ts:5` — `Describes one proposed file a claim carries.`
- `src/core/shapers.ts:29` — `Describes the drafts a claim asserts about and the test that exercises them.`
- `src/core/shapers.ts:46` — `Describes the negative control, which is a case plus where and why it must break.`
- `src/core/shapers.ts:68-69` — `Describes one claim and is the sole source of both the published tool schema and the guard applied to an arriving claim.` (sentence-internal grammar for `CLAIM_SHAPE`: rewrote the trailing `, and the sole source` clause to `and is the sole source` so the sentence stays one clause under the new `-s` verb, per the deviation contract's grant to settle this in place.)

`@remarks`, `@example`, and every other sentence in both files are untouched.

## Item 3: instrument control

Command: `npm run test:src:bin -- -t 'answers a pinned legacy client'`

Red reading (version assertion flipped to `'2025-11-25'`):

```
FAIL  |src:bin| tests/src/bin/main.test.ts > bin entry > answers a pinned legacy client through the initialize path
AssertionError: expected '2025-06-18' to be '2025-11-25' // Object.is equality

Expected: "2025-11-25"
Received: "2025-06-18"

 ❯ tests/src/bin/main.test.ts:425:28
    423|     await client.connect()
    424|     expect(client.connected).toBe(true)
    425|     expect(client.version).toBe('2025-11-25')

 Test Files  1 failed (1)
      Tests  1 failed | 10 skipped (11)
```

Green rerun (assertion restored to `'2025-06-18'`):

```
 Test Files  1 passed (1)
      Tests  1 passed | 10 skipped (11)
```

The flip failed at the version assertion as expected, confirming the pin is honored.

## Guide-mirror ruling

`grep -n "Blueprint for\|The stages a claim passes\|The parties that can own\|The conditions that can end\|The leading token every receipt\|The character joining a receipt" guides/probe.md`
returned no matches. `guides/probe.md` mirrors none of the replaced first sentences, so no guide
edit was needed and `guides/probe.md` was left untouched.

## Acceptance criteria evidence

1. `npm run lint:check` — exit 0.
2. `npm run check` — exit 0.
3. `npm run format:check` (after `npm run format`, which touched only formatting) — exit 0.
4. `awk '/^\/\*\*/{getline; print NR": "$0}' src/core/constants.ts src/core/shapers.ts`:

```
2:  * Lists the stages a claim passes through, in the order a verdict reports them.
17:  * Lists the parties that can own action on an issue or probe failure.
31:  * Lists the conditions that can end a probe operation.
52:  * Names the leading token every receipt carries.
68:  * Names the character joining a receipt's tokens.
86:  * Describes one proposed file a claim carries.
110:  * Describes the drafts a claim asserts about and the test that exercises them.
127:  * Describes the negative control, which is a case plus where and why it must break.
149:  * Describes one claim and is the sole source of both the published tool schema and the guard
```

Every first sentence begins with a third-person `-s` verb (`Lists`, `Names`, `Describes`).

5. `npm run test:guides` — exit 0, 13 passed (13).
6. `npm run test:src:bin -- -t 'answers a pinned legacy client'` — exit 0:

```
 Test Files  1 passed (1)
      Tests  1 passed | 10 skipped (11)
```

7. Item-3 control readings recorded above: red at the version assertion when flipped to
   `'2025-11-25'`, green on restore to `'2025-06-18'`.

## Review evidence

`git diff --stat`:

```
 src/core/constants.ts      | 10 ++++----
 src/core/shapers.ts        |  8 +++----
 tests/src/bin/main.test.ts | 59 ++++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 68 insertions(+), 9 deletions(-)
```

`git status --short`:

```
 M src/core/constants.ts
 M src/core/shapers.ts
 M tests/src/bin/main.test.ts
```
