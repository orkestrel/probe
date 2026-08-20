# PBFIX8: give the ownership axis a name the fleet has free

## Role and engine

Role `implementer`. Engine Claude Opus 5, high effort. Sole writer in `/workspace/probe` for this
unit. This is naming and guide voice, which is why it is not on the objective bench.

## Objective

Rename probe's ownership union so it stops colliding with a package probe installs, carry the rename
through every consumer, and make the guide state the collision that remains.

`@orkestrel/probe` has never published. `0.0.1` cements every name.

## Read first

1. `AGENTS.md` — § Non-negotiable rules and § Design laws
2. `.claude/rules/names.md`, `.claude/rules/documentation.md`, `.claude/rules/writing.md`
3. `guides/probe.md`
4. `.orkestrel/probe/pbaudit2-brief.md` and the audit verdict beside it

## The collision, measured

`@orkestrel/scaffold` — a devDependency of this package, installed in this tree — publishes three
names probe also publishes, for different concepts:

```text
node_modules/@orkestrel/scaffold/dist/src/core/index.d.ts
  export declare type Origin = 'host' | 'template' | 'computed'   // how an artifact's content is produced
  export declare type Finding = { ... }
  export declare const isFinding: Guard<Finding>
```

The campaign **created** the `Origin` collision. The name it replaced, `FindingOrigin`, appears
nowhere in scaffold's declarations.

Nothing fails to compile, because a collision between two packages' exports is only a problem for a
consumer importing both. That is exactly why no gate caught it.

## Ruled: rename `Origin` to `Party`, and keep `Finding`

`Party` is free across every `@orkestrel` package this one declares, verified rather than assumed:

```text
checked against contract, emitter, mcp, queue, timeout, tool, guide, scaffold, test
  Party        free
  Owner        free across the fleet, but see the ruling below
  Note         free
  Report       free
  Remark       free
  Detection    free
  Diagnostic   free
  Fault        TAKEN by @orkestrel/contract — a runtime dependency of this package
```

`Party` reads as the concept's own documentation already states it: the party that must act. Rename
`Origin` to `Party`, `ORIGINS` to `PARTIES`, and `isOrigin` to `isParty`. The member stays `origin` on
`Finding` and on `ProbeError` — the axis is named `Party` and the field names what it holds, which is
the distinction `.claude/rules/names.md` already draws.

**`Owner` was the first candidate and is rejected, on a second collision inside this package.**
`src/server/stages/RuntimeStage.ts` already carries `#owned(path, revision)`, which answers whether
this package generated a file. That is a different concept wearing the same word, and both would
appear in that one file — `this.#owned(...)` beside a value typed `Owner`. `AGENTS.md` § Design laws
forbids one term for two concepts as firmly as two terms for one. `Party` carries no such second
sense here.

**`Finding` and `isFinding` stay, and the guide says why.** Three reasons, in order:

- The campaign created the `Origin` collision and did not create this one. `Finding` is this
  package's core noun and appears throughout its public surface.
- `Origin` names two genuinely unrelated axes — how an artifact's content is produced, against which
  party must act — so a reader meeting both is actively misled. `Finding` names two similar things in
  both packages, so a reader is inconvenienced rather than misled.
- The most precise alternative, `Diagnostic`, is worse here: `src/server/stages/TypeStage.ts` already
  handles TypeScript's own `Diagnostic` objects, so probe's `Diagnostic` would sit beside a foreign
  `Diagnostic` in the file that most needs the distinction. That trades a cross-package collision for
  a within-file one.

State this in `guides/probe.md`, in the section a consumer reads before importing: a consumer using
`@orkestrel/scaffold` and `@orkestrel/probe` together must alias `Finding` or `isFinding` on one
side, and name which. Do not bury it in a limits list at the end.

If you conclude `Finding` should be renamed after all, stop and report with your reasoning rather
than renaming it. That decision is expensive and belongs to the owner.

## What a correctness unit landed before you

`PBFIX7` ran first, against the same audit, and changed the receipt condition, the deadline
attribution boundary, the sweep's revision reading, the symlink ownership classification, and a
native rethrow. Read its report at `.orkestrel/probe/pbfix7-report.md` and read the tree; the
committed state is not what you inherit if that unit is uncommitted. Do not revisit its rulings.

## Scope

- **Owned:** `src/core/types.ts`, `src/core/constants.ts`, `src/core/validators.ts`,
  `src/core/errors.ts`, `src/core/helpers.ts`, `src/core/shapers.ts`, everything under `src/server/`,
  `src/bin/`, every test file under `tests/`, `tests/guides.test.ts`,
  `tests/distribution.test.ts`, `guides/probe.md`, and `README.md`.
- **Off-limits:** the vendored host — `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `.codex/`,
  `.cursor/`, `configs/helpers.ts`, `scripts/*.sh`, `tests/config.test.ts`, `tests/policy.test.ts`,
  `tests/setupPolicy.ts`. `package.json` and `vite.config.ts` are scaffold-planned. Do not change the
  version.

## Host conditions

- You are native, so no bench sandbox restricts you. Every project runs here and you take every
  reading yourself.
- `tests/guides.test.ts` asserts a receipt earned with `tmp/probe` absent. Run `rm -rf tmp/probe`
  before any guides-project run.
- Run `npm run format` before `format:check`.

## Execution

Perform this assignment directly. Spawn nothing.

## Prohibitions

- Never run `git checkout`, `git restore`, `git stash`, `git reset`, or `git clean`.
- Never commit, push, install, or read a credential.
- No `any`, no `as`, no `!`, no `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable`.
- State no count in any prose you write, and never name a list item by its position.

## Acceptance criteria

Close them in this order and report each with its exit code and counts.

1. `rg -n '\bOrigin\b|\bORIGINS\b|\bisOrigin\b' src/ tests/ guides/probe.md README.md` returns no hit
   naming probe's own union, and `rg -n '\bOwner\b' src/ tests/` returns no hit — the rejected
   candidate must not appear either. A quotation of scaffold's `Origin` in the guide's collision note is the
   only permitted hit; name it in your report.
2. `guides/probe.md` states the `Finding` collision and the alias a dual consumer needs, in a section
   a consumer reads before importing.
3. `npm run format` then `npm run format:check` exits 0.
4. `npm run lint:check` exits 0.
5. `npm run check` exits 0.
6. `rm -rf tmp/probe && npm test` exits 0. Report every project's counts.
7. `npm run test:distribution -- --mode release` exits 0. Report its counts.

## Deviation contract

Stop and report if the objective itself conflicts with what you find. An ancillary choice — where the
collision note sits within its section, a test's name — is yours. Renaming `Finding` is not
ancillary: it stops the unit.

## Output

Write your report to `tmp/pbfix8-report.md` and make it your final message too: files touched; the
permitted `Origin` hit if any; where the collision note landed; each criterion with its exit code and
counts; and anything you could not close. No process diary.
