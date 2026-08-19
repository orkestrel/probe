# Unit S3 — returned report

Both owned files changed; nothing else touched.

## 1. Defects repaired

| Defect | Was | Is |
| --- | --- | --- |
| **A — liveness** | `#destroy` and `#send` read `child.exitCode !== null`, which Node leaves `null` for a signal death, so a killed server read as alive: teardown deadlocked and a later `inspect` hung on a dead pipe | A `#ending` field, set by the `exit` handler for both a code and a signal, is the single liveness fact. `#destroy` returns on it; `#send` throws an error naming it. `#destroy` also races `exit` and `close`, and `#retire` signals a server that refuses or never answers `shutdown`. |
| **B — orphaned document** | `#document` called `#notify` before attaching `finally`, so a throwing open left the promise pending with no handler and three map entries behind; the next `#fail` rejected it into the host | Cleanup is attached before the open, the open is caught and refuses that document, and the same forget-then-refuse now guards `#request` |
| **C — stdin error** | `child.stdin` had no `error` listener, so an `EPIPE` from a write racing the server's death was an uncaught exception in the resident host | `child.stdin.on('error', ...)` reports it through `#fail` as a stage fault, and `#send` refuses a write to a server that closed its input |
| **D — cleanup** | `#close` notified before pruning, so an unreachable server made the notification throw, replacing the caller's real diagnosis and leaving the document registered forever | `#close` prunes first and skips the notification when the stage is destroyed or the server is unreachable (`#reachable`) |
| **C4 — synthesized path** | `#file` discarded the declared file name, so Oxlint's glob-keyed overrides selected a different rule set and a candidate the gate exempts got a false red | The synthesized name keeps the declared basename: `${directory}/probe-${uuid}.${basename(declared)}` |

## 2. Failing proofs

Command in every case, run from `/workspace/probe`:

```text
npx vitest run --config vite.config.ts --no-cache --reporter=verbose --project src:server tests/src/server/stages/LintStage.test.ts
```

**A** — `settles teardown after the language server dies by signal`, `rejects a later inspection with the signal that killed the language server`

- Before: `Tests 2 failed | 3 passed (5)`, exit 1, both `Error: Test timed out in 20000ms` — the deadlock, not an assertion.
- After: `Tests 5 passed (5)`. Exit was still 1 on that run because the A repair surfaced B as
  `Unhandled Rejection: Error: The lint stage has been destroyed`, exactly as the brief predicted.

**B** — `tears down a stage whose language server died without ending the host process`

- Before: `Tests 1 failed | 5 passed (6)`, `Errors 1 error`, exit 1. The spawned host's own stderr:

```text
file:///workspace/probe/src/server/stages/LintStage.ts:97
		this.#fail(new Error('The lint stage has been destroyed'))
Error: The lint stage has been destroyed
    at #destroy (file:///workspace/probe/src/server/stages/LintStage.ts:97:14)
    at async file:///tmp/orkestrel-test-xDW7IY/host.mjs:24:1
```

- After: `Tests 6 passed (6)`, exit 0. The host exits 0 with empty stderr.

**C** — `refuses an inspection through a stage fault when the language server closes its input`

- Before (test written against the repaired A, listener absent): `Tests 1 failed | 7 passed (8)`, exit 1,
  `Uncaught Exception: Error: write EPIPE ... LintStage.#send`.
- Re-proved on the final test shape by deleting the listener line: `-t 'refuses an inspection through a stage fault'`
  gives `Tests 1 failed | 8 skipped (9)`, exit 1, same uncaught `write EPIPE`.
- After: `Tests 9 passed (9)`, exit 0.

**D** — proved by restoring the notify-before-prune cleanup in `#close`:

- Before: `Tests 1 failed | 8 passed (9)`, exit 1,
  `expected [Function] to throw error including 'EPIPE' but got 'The Oxlint language server closed its input'`.
- After: `Tests 9 passed (9)`, exit 0.

**C4** — `applies the workspace lint overrides the declared path selects`

- Before: `Tests 1 failed | 8 skipped (9)`, exit 1:

```text
AssertionError: expected [ { origin: 'code', ...(3) } ] to strictly equal []
+   { "line": 1, "message": "Prefer named exports...", "origin": "code",
+     "path": "tmp/probe/lint-override.config.ts" }
```

- After: `Tests 1 passed | 8 skipped (9)`, exit 0.

## 3. The open question

**Oxlint's `--lsp` server exits with a code in practice — always `0` from anything the stage can send — and
it dies by signal on a candidate document the stage forwards verbatim. Defect B is reachable through
shipped code by both doors, so it was repaired rather than documented.**

Measured 2026-08-19 against the installed oxlint 1.79.0, driving the real protocol from a throwaway
instrument:

| Vector | Result |
| --- | --- |
| stdin EOF, with an unparseable `.oxlintrc.json` in the working directory | `code=0` |
| `exit` notification with no preceding `shutdown` | `code=0` |
| well-framed message with an unparseable JSON body | `code=0` |
| frame header with no `Content-Length` | `code=0` |
| request naming an unknown method | stays alive |
| `textDocument/didOpen` carrying 400,000 nested `(` | `code=null signal=SIGSEGV` |
| `--not-a-flag` on the command line | `code=1`, unreachable: the stage passes only `--lsp` |

The last row settles it: a candidate an agent supplies can kill the real server, which sets `#ending` and
makes every subsequent `#send` throw.

The `SIGSEGV` instrument was NOT adopted as a test. Its subject is Oxlint's parser stack depth on this
host rather than this stage's behavior, and `.claude/rules/tests.md` forbids pinning a host-varying
threshold. The two death shapes are guarded by behavior instead: a code exit through the fixture's
`process.exit(7)` and a signal death through a real `SIGKILL`.

## 4. Counts

| Run | Result |
| --- | --- |
| scoped `LintStage.test.ts` | 9 passed, exit 0 |
| `npm test` — `src:core`/`src:server`/`src:bin` | 66 passed (10 files) |
| `npm test` — `policy` | 86 passed |
| `npm test` — `config` | 28 passed |
| **Total** | **180 passed, 0 skipped, 0 todo, exit 0** (baseline 174 + 6 new) |

Gates: `npm run format:check` exit 0 (140 files), `npm run lint:check` exit 0, `npm run check` exit 0.

## 5. Deviations

None stopped the unit. Five decisions, recorded:

- **Helpers stayed in the owned test file.** `.claude/rules/tests.md` places shared test infrastructure in
  a setup file, but `tests/setupServer.ts` is off-limits and empty. `killFixtureServer`, `SERVER`,
  `FIXTURE`, `PASSING`, and `HOST` are module-scope in the owned test file, matching its existing
  pattern. The patch to move them is a straight lift of lines 13-112 plus an import.
- **Unknown 1 — A and C are two mechanisms, not one.** A is a wrong liveness field; C is an unobserved
  stream event. Holding `#ending` does not make the listener redundant, because a broken pipe on a server
  whose process is still alive never fires `exit`. The mutation probe shows removing the listener still
  reddens with `#ending` in place.
- **Unknown 2 — criterion 3 needs a child process.** An unhandled rejection inside a Vitest worker is
  caught by Vitest, so the proof spawns a plain Node host that loads the stage source and exits on its
  own. Node stops at the source's `.js` specifiers, so the host registers one `module.registerHooks`
  resolve rule mapping them onto the sibling `.ts` files. That replaces no project behavior.
- **One repair the brief did not name, inside the owned file.** Making `#send` refuse a write to an
  unreachable server exposed the same orphan shape in `#request`: the throw escaped, leaving
  `#responses`/`#failures` entries whose promise a later `#fail` would reject into the host. Repaired with
  the same forget-then-refuse. Exercised by the `closes its input` test, whose `destroy()` reaches it.
- **`#close`'s prune ordering has no observable of its own.** Once A names the death in `#send`'s message,
  the "generic not running" half of defect D is closed and the pruning half is reachable only as the
  diagnosis-replacement the mutation probe reddens. The `not running` message is unreachable in shipped
  code: `#child` is assigned synchronously in `#warm` before any `#send`, and the branch survives only
  for narrowing.

Nothing outside scope was found. `git status --porcelain` lists exactly the two owned files;
`tmp/scratch/` was removed and `tmp/probe/` is empty.

## 6. Diff

```text
 src/server/stages/LintStage.ts            | 108 +++++++++---
 tests/src/server/stages/LintStage.test.ts | 281 +++++++++++++++++++++++++++---
 2 files changed, 340 insertions(+), 49 deletions(-)
```

Load-bearing hunks:

```ts
	#exit(code: number | null, signal: NodeJS.Signals | null): void {
		this.#ending = code === null ? `signal ${signal ?? 'unknown'}` : `code ${code}`
		if (this.#destroyed && code === 0) return
		this.#fail(new Error(`The Oxlint language server exited with ${this.#ending}`))
	}
```

```ts
	get #reachable(): boolean {
		return this.#ending === undefined && this.#child?.stdin.writable === true
	}
```

```ts
		return resolveWorkspaceFile(
			this.#workspace,
			`${directory}/probe-${randomUUID()}.${basename(declared)}`,
		)
```
