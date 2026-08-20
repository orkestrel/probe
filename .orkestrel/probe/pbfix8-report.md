# PBFIX8 report — `Origin` renamed to `Party`

The rename landed and every acceptance criterion closed. Both demoted observations ran green,
including the standing intermittent proof.

## Files touched

Working tree against `17c0edd`, all inside the brief's owned list.

| File                               | Change                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/core/constants.ts`            | `ORIGINS` renamed to `PARTIES`; its TSDoc remark and `@example` follow the name.                                       |
| `src/core/types.ts`                | `Origin` renamed to `Party`; the import from `constants.js`, the `@example` binding, and the `{@link}` follow it.      |
| `src/core/validators.ts`           | `isOrigin` renamed to `isParty`; its TSDoc, its `@example` calls, and `isFinding`'s `origin` guard reference follow it. |
| `src/core/errors.ts`               | `ProbeError.origin` retyped to `Party`; the guard reads `PARTIES`; the `{@link}` targets follow.                       |
| `tests/guides.test.ts`             | Reads `core.PARTIES`; the failure-table proof's local set and its name renamed to the party it asserts about.          |
| `tests/src/core/validators.test.ts` | Imports and drives `isParty`.                                                                                          |
| `tests/src/core/errors.test.ts`    | The `Drive` tuple's `origin` element typed `Party`.                                                                    |
| `guides/probe.md`                  | The `Party`, `PARTIES`, and `isParty` rows and the failure table's first column header; the collision note added.      |

The member name stays `origin` on `Finding` and on `ProbeError`, per the ruling. `Finding` and
`isFinding` were not renamed.

Diffstat, `git diff --stat` after the final gates:

```text
 guides/probe.md                   | 25 +++++++++++++++++++++----
 src/core/constants.ts             |  8 ++++----
 src/core/errors.ts                | 12 ++++++------
 src/core/types.ts                 | 14 +++++++-------
 src/core/validators.ts            | 20 ++++++++++----------
 tests/guides.test.ts              |  8 ++++----
 tests/src/core/errors.test.ts     |  4 ++--
 tests/src/core/validators.test.ts | 10 +++++-----
 8 files changed, 59 insertions(+), 42 deletions(-)
```

## The permitted `Origin` hit

`guides/probe.md:41`, inside the collision note, quoting scaffold's own union:

```text
The ownership axis carries no such collision: probe names it `Party` and scaffold's `Origin` names
how an artifact's content is produced, so the packages share no spelling there. Measured on
2026-08-20 against `@orkestrel/scaffold` 0.0.44.
```

It names scaffold's type, not probe's. No other hit remains in the searched scope.

## Where the collision note landed

`guides/probe.md`, as `### A name this package shares with @orkestrel/scaffold`, the first
subsection of `## Surface` and ahead of `### Contracts`. A consumer reaches it before every table
that names an importable symbol. It states the shared `Finding` type and `isFinding` guard, the
different subject each names, the `Duplicate identifier 'Finding'` refusal a dual import earns, and
the alias to write:

```ts
import type { Finding as ProbeFinding } from '@orkestrel/probe'
import { isFinding as isProbeFinding } from '@orkestrel/probe'
```

The note claims what a compile settles, so it was compiled. A probe under `tmp/` importing
`Finding` and `isFinding` from both packages with those aliases typechecked at exit 0; its negative
control, the same file with the aliases stripped, reported
`error TS2300: Duplicate identifier 'isFinding'` on each import line, and a type-only variant
reported `error TS2300: Duplicate identifier 'Finding'`. The probe file, its control, and the
`tsconfig.json` file extending the root that compiled them were removed; `git status` is clean of
them.

## Acceptance criteria

| # | Command                                                                       | Exit | Result                                                                             |
| - | ----------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------- |
| 1a | `rg -n '\bOrigin\b\|\bORIGINS\b\|\bisOrigin\b' src/ tests/ guides/probe.md README.md` | 0 | One hit, `guides/probe.md:41`, the permitted quotation named earlier. Zero in `src/` and `tests/`. |
| 1b | `rg -n '\bOwner\b' src/ tests/`                                               | 0    | One hit, `tests/setupPolicy.ts:119`. See the carve-out that follows.                |
| 2 | `guides/probe.md` states the `Finding` collision and the alias                 | —    | Closed, at the section named earlier.                                              |
| 3 | `npm run format` then `npm run format:check`                                   | 0, 0 | `All matched files use the correct format. Finished in 3433ms on 148 files`.       |
| 4 | `npm run lint:check`                                                          | 0    | `oxlint --config .oxlintrc.json --deny-warnings .`, no diagnostic.                 |
| 5 | `npm run check`                                                              | 0    | Root typecheck plus `check:src:core`, `check:src:server`, `check:src:bin`.         |

Criterion 1b's single hit is `"interface:\n  display_name: 'Owner''s Fixture'\n"`, a YAML fixture
string in the policy sweep. `tests/setupPolicy.ts` is vendored and on the brief's off-limits list,
the line is byte-identical to `17c0edd` (`git show 17c0edd:tests/setupPolicy.ts | rg '\bOwner\b'`
returns the same line at 119), and `git diff -- tests/setupPolicy.ts` is empty. The rejected
candidate appears in no name this unit wrote: the ownership axis is `Party` everywhere, and
`RuntimeStage.ts` keeps `#owned(path, revision)` untouched, which the case-sensitive pattern does
not match. I did not edit an off-limits file to close the criterion.

## Observations

Taken after `npm run build` (exit 0), on this 4-CPU container with nothing else running.

| Command                                          | Exit | Counts                                                                                                                                  |
| ------------------------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `rm -rf tmp/probe && npm test`                   | 0    | `test:src` 11 files, 171 tests passed; `test:policy` 1 file, 86 tests passed; `test:config` 1 file, 28 tests passed; `test:guides` 1 file, 13 tests passed. No failure, no skip. |
| `npm run test:distribution -- --mode release`    | 0    | 1 file, 2 tests passed, 14.31 s.                                                                                                        |

`attributes a deadline in runtime cleanup to the instrument` in `tests/src/server/Probe.test.ts`
passed in the `test:src` run. The standing condition did not fire here. I did not touch that test:
the rename moved the `Origin` type name, and that proof reads the `origin` member, whose name and
values are unchanged.

Both observation commands ran twice, once before and once after a wording revision to the collision
note. Every reading reported here is the second run; the first reported the same exit codes and the
same counts.

## Not closed

Nothing. Every criterion closed and both observations ran green.

One finding outside this unit's scope, recorded rather than acted on: `PARTIES` and `PROBE_STAGES`
each open their TSDoc with a noun repeating the symbol's own name, which
`.claude/rules/typescript.md` bans for the first sentence. `PROBE_STAGES` carries it at the
baseline, so the two belong to one wording pass rather than to this rename. `Party` itself was
reworded to `Names who must act on a finding or probe failure.` for that reason.
