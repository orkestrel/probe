# PBFIX3 — the stdin ownership rule, measured

## Role and engine

`implementer`, Opus 5. One rule, two edits, one test. The subject is a Node stream-state subtlety
that has now produced the same defect in two packages.

## Objective

Replace `ProbeServer`'s stdin ownership rule with the one the Orchestrator measured, so
`ProbeServer.destroy()` stops the flow it started and the process exits.

## The defect, and how it is already failing

PBFIX2's row R6 made the stdin pause conditional. The condition is false in the normal case, so the
pause never runs, the `PipeWrap` handle stays ref'd, and the process does not exit.

`src/server/ProbeServer.ts` today:

- `:68` — `this.#flowing = !process.stdin.isPaused()` in `start`
- `:102` — `if (this.#flowing === false) process.stdin.pause()` in `#destroy`

**`readable.isPaused()` is `readableFlowing === false`.** A stream nobody has read has
`readableFlowing === null`, so `isPaused()` returns `false` — not `true`. Measured on the real object
with a real piped stdin:

```
untouched process.stdin: readableFlowing=null isPaused()=false
after on(data):          readableFlowing=true isPaused()=false
after removeListener:    readableFlowing=true isPaused()=false
STILL ALIVE after 800ms -- the handle is still ref'd
```

So on a fresh `process.stdin` — every real launch of this server — `#flowing` records `true` and
`#destroy` does not pause.

**This is already red.** An independent verifier ran the gates over the current tree:

```
FAIL |src:bin| tests/src/bin/main.test.ts > bin entry > leaves the target clean when SIGTERM reaches the entry during boot
FAIL |src:bin| tests/src/bin/main.test.ts > bin entry > leaves the target clean when SIGINT reaches the entry during boot
FAIL |src:bin| tests/src/bin/main.test.ts > bin entry > leaves the target clean when SIGTERM reaches the entry during service
FAIL |src:bin| tests/src/bin/main.test.ts > bin entry > leaves the target clean when SIGINT reaches the entry during service
Error: Test timed out in 120000ms.
```

Isolated re-run, second reading: `Test Files 1 failed (1)`, `Tests 4 failed | 4 passed (8)`. Two
consistent readings, not a flake. **That is your failing proof — it already exists and it already
binds.** Do not write a new one to establish the defect; write one to cover the case the existing
suite cannot see.

## The rule to implement

Measured over four cases, correct in all four:

```
owns  = input.readableFlowing !== true              // recorded in start, before attaching anything
pause = owns && input.listenerCount('data') === 0   // tested in destroy, after removing our own
```

| Case at `start` | `readableFlowing` | owns | listeners left at destroy | pause | why |
| --- | --- | --- | --- | --- | --- |
| fresh stdin | `null` | yes | 0 | yes | this server started the flow and stops it |
| already paused | `false` | yes | 0 | yes | restores the state the caller had |
| already flowing | `true` | no | — | no | the caller's flow survives |
| a second reader attached after `start` | `null` | yes | 1 | no | someone else is still reading |

Both halves are load-bearing and answer different questions at the two moments where each is
answerable. `readableFlowing !== true` asks "was this already flowing before I touched it", which is
only answerable before attaching. `listenerCount('data') === 0` asks "is anyone still reading", which
is only answerable after removing your own. A rule with one half fails: `isPaused()` collapses `null`
and `true` into one answer, and a listener count alone pauses a stream the caller had resumed.

The instruments are `.orkestrel/probe/flow-probe.mjs` and `.orkestrel/probe/flow-fix-probe.mjs`. Run
them if you want the readings first-hand; you do not need to.

## Context

Read before acting: `/workspace/probe/AGENTS.md`, `.claude/rules/typescript.md`,
`.claude/rules/tests.md`, and `guides/probe.md`'s account of `ProbeServer.destroy`.

The tree carries PBFIX2 uncommitted — fifteen modified files closing eight audit rows. Everything in
it except R6 is verified: `format:check`, `lint:check`, `check`, `build`, `test:distribution`, and
`scaffold audit` all exit 0, and `test:policy`, `test:config`, and `test:guides` pass. Only
`tests/src/bin/main.test.ts` is red. Do not touch any other part of that work.

Host: Linux container, bash. `src:bin` takes roughly 500 seconds and `src:server` is comparable.

## Unknowns

One. **Whether `ProbeServer` should also drop the recorded flag entirely.** With the release-time
listener check in place, the start-time reading is still needed for the "already flowing" case, so a
field is still required. Whether it holds a boolean or the raw `readableFlowing` value is yours.
Report the choice.

## Scope

Owned files, the only files you may write:

- `src/server/ProbeServer.ts`
- `src/server/types.ts` — only the `destroy` sentence R6 touched, and only if the rule changes what
  it should say
- `tests/src/server/ProbeServer.test.ts`
- `guides/probe.md` — only the sentence describing what `destroy` does to standard input

Off-limits, do not write: every other file, and in particular `src/server/index.ts`,
`src/core/index.ts`, `tests/src/bin/main.test.ts`, `src/bin/`, and everything else PBFIX2 touched.

Tools: Read, Grep, Glob, Edit, Write, Bash. No commits, no pushes, no dependency installs, no
destructive command. Never run `git checkout`, `git restore`, `git stash`, `git reset`, or
`git clean` — the tree holds a large uncommitted unit with no other copy.

## Execution

Perform this assignment yourself. Spawn nothing.

## What the test must add

R6's existing test asserts two directions and sets each state explicitly, so it never reaches the
fresh state where `readableFlowing` is `null` and neither branch's premise holds. That is why a
green `src:server` shipped a defect the `src:bin` suite then caught 500 seconds later.

Add the case the suite cannot see: a stream that has never been read, where the server attaches, then
destroys, and the stream ends paused. Add the second-reader case too: a reader attached after `start`
still receives data after `destroy`.

Name each test for the behaviour it proves.

## Deviation contract

Stop and report — expected, found, exact evidence, done or not done, at most one hypothesis — when:

- the quoted lines are not where this brief says they are;
- `tests/src/bin/main.test.ts` is still red after your change, which would mean the diagnosis is
  wrong rather than the fix incomplete;
- closing this needs a file this brief marks off-limits.

Decide and carry on, recording the choice in your report: the field's name and type, the exact
wording of any sentence you rewrite, and where each new test sits.

## Acceptance criteria

Run these in order and report each bare exit code.

1. `grep -n "isPaused\|readableFlowing\|listenerCount" src/server/ProbeServer.ts` — report every line
   verbatim. The start-time reading must test `readableFlowing`, and the destroy-time decision must
   also test `listenerCount('data')`.
2. `npm run format` then `npm run format:check` exits 0.
3. `npm run lint:check` exits 0.
4. `npm run check` exits 0.
5. `npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:server tests/src/server/ProbeServer.test.ts` exits 0.
6. `npm run test:guides` exits 0.
7. `npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:bin` exits 0, and
   the four signal tests that time out today pass. Report the counts before and after your change:
   the before reading is already recorded above, so take the after reading and quote both.
   This project spawns real child processes and takes roughly 500 seconds. Where it fails on a
   deadline rather than an assertion after your fix, re-run it alone once, report both readings
   labelled, and treat it as an observation rather than a stop.

Do not run `npm test`, `npm run build`, or `npm run test:distribution`. An independent verifier takes
those readings.

## Output

A report with:

- the rule as it now reads in the source, verbatim;
- the four cases and which line of code decides each;
- criterion 7's before and after counts;
- one row per acceptance criterion with its bare exit code;
- the unknown answered;
- anything you could not close, named.

No process diary.
