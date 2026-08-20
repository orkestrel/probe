# PBFIX5 — unit report

## What the unit changed

`src/server/stages/RuntimeStage.ts` — `#specification` calls
`mkdirSync(dirname(file), { recursive: true })` where it refused over a missing directory. The
`ProbeError` import left the file with that throw, which was its only use there.

`tests/src/server/stages/RuntimeStage.test.ts` — the two-row `it.each` became three tests: the
directory the stage creates, the directory it cannot create, and the write failure.

`tests/guides.test.ts` — the flagship receipt test deletes `tmp/probe` before constructing the probe
and asserts the deletion took.

`guides/probe.md` — the runtime prerequisite, the `invalid` row of the failures table, and the arming
bullet.

## Red then green

```
rm -rf tmp/probe && npx vitest run --config vite.config.ts --no-cache --reporter=dot \
  --project src:server tests/src/server/stages/RuntimeStage.test.ts -t 'directory'
    before: Tests  2 failed | 30 skipped (32)   exit 1
    after:  Tests  2 passed | 30 skipped (32)   exit 0

rm -rf tmp/probe && npx vitest run --config vite.config.ts --no-cache --reporter=dot \
  --project guides -t 'earns the receipt'
    before: Tests  1 failed | 11 skipped (12)   exit 1
    after:  Tests  1 passed | 11 skipped (12)   exit 0
```

The receipt the fixed source produced, with `tmp/probe` absent, byte-identical to the token
`guides/probe.md` documents:

```
digest:  0806fb30f428edb8ea85adfb4b355441
receipt: probe:0806fb30f428edb8ea85adfb4b355441:type:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8
```

## The unit's deviation, and how it closed

One acceptance criterion could not close with the files the brief owned. The `src:server` project
held `probe > retains all stage checks when the runtime test directory is missing` in
`tests/src/server/Probe.test.ts`, an off-limits file, and that test asserted the refusal this ruling
deletes. The dispatch was at fault: the brief marked off-limits a file the change invalidates. The
unit reported it rather than editing, and returned an exact patch it had executed against the fixed
source.

The Orchestrator applied that patch as integration. The replacement test reaches the same
`origin: 'instrument'` finding through a cause that survives the ruling — a file sitting where the
claim's declared test directory belongs, so the stage has a directory it cannot create rather than
one that is merely absent. It pins retention, not the cause; the cause is pinned at stage level in
`RuntimeStage.test.ts`.

## What the unit ruled and recorded

The refusal survives as the surrounding `attempt`, which turns any failure in that block into the
same `origin: 'instrument'` finding a failed write already produced. A blocked parent reports
`The runtime stage could not write the generated specification (EEXIST: file already exists, mkdir
'<path>')`, naming the operation, the path, and the host's reason. A second `ProbeError` beside it
would restate the path inside the wrapper's own parentheses, and its `code` and `context` never reach
a consumer: the catch reads `messageFromUnknown(outcome.error)` alone.

No other write path in `src/` has this gap. The population, from
`grep -rn "from 'node:fs'\|writeFile\|appendFile\|createWriteStream\|openSync\|renameSync\|cpSync\|copyFile\|mkdtemp" src/`:
`RuntimeStage.ts:348` is the one this change fixed; `Probe.ts:264,268` are preceded by
`mkdirSync(directory, { recursive: true })` at `:263` on the same fixed path, and `:281,297` rewrite
those same files inside the same `try`. `TypeStage.ts` and `helpers.ts` import read-only members of
`node:fs`; `src/core` touches the filesystem nowhere. There is no `cpSync` in `src/`.

The sweep is unaffected and was not extended. `#walk` yields a path only under `entry.isFile()`
(`RuntimeStage.ts:574`), so `#sweep` cannot reach a directory whatever this stage creates.

A claim now leaves one empty git-ignored `tmp/probe` directory behind. `Probe.#boot` removes only a
directory boot itself created, which this ruling did not change.

## Gates

An independent verifier ran the authoritative suite on the integrated tree. Every gate exited 0:
`format:check` over 149 files, `lint:check`, `check` across the root and the three scoped projects,
`build` across core, server, and bin, and `npm test` — `test:src` 11 files / 161 tests, `test:policy`
86, `test:config` 28, `test:guides` 12.
