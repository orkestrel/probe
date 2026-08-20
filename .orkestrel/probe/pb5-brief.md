# PB5 — a resident server that survives its own failures

## Role and engine

`sol` (GPT-5.6 Sol), direct `codex exec`. Perform the assignment directly and spawn nothing.

## Why these rows are one unit

Four rows of `.orkestrel/probe/readiness-grade.md` — P6 and P7 are release blockers, P15 and P16
degrade consumers — and they share one subject: **what happens to a long-lived MCP server when
something goes wrong.** Read the grade first.

Today a single slow claim can end the server permanently, teardown can hang forever, a boot failure is
irreversible and misreported, and a killed host litters the consumer's own gates.

## The repairs

### P6 — a type or lint expiry destroys the stage and never replaces it

A deadline expiry destroys the stage and nothing replaces it, so every later proof rejects with
`The lint stage has been destroyed`. A resident server that dies on one slow claim and answers every
later call with a stale message is not a server.

The runtime stage already has the shape: `#recycle` replaces it. Give the type and lint stages the
same treatment.

**Prove it at all three stages**: a clean claim served after an expiry at type, at lint, and at
runtime.

### P7 — `LintStage.destroy()` never settles

Against a language server that answers `shutdown` and ignores `exit`, `#destroy` waits forever.
`Probe.destroy()` inherits the hang and the child leaks for the host's lifetime.

Bound the wait and send `SIGKILL` on expiry. The proving fixture is a server that ignores `exit`; the
test asserts `destroy()` settles **and** the child is gone.

**Delete the hedge in the same change.** `tests/src/server/Probe.test.ts:356` currently reads
`Promise.race([probe.destroy(), waitForDelay(5_000)])` — a test written to pass despite this hang. It
goes with the defect. Leaving it would hide the next one.

### P15 — arming failure is permanent and misreported

A boot failure reports a stage-timeout message and never recovers. Make a boot-origin failure **name
arming**, and either have `prove` re-arm or state in the message that the failure is terminal. Choose,
and say why. A test asserts the second `prove` after a boot expiry carries the boot-origin message.

### P16 — the shipped entry has no shutdown, and orphans break the consumer's gates

`src/bin/main.ts` installs `SIGINT` and `SIGTERM` handlers that await `probe.destroy()`, and
`RuntimeStage` deletes stale `*.probe-*` siblings at warm.

**This closes the leak `tests/src/bin/main.test.ts` currently records.** That test asserts the files
leak — it pins the defect deliberately, so the repair has something to turn green. When your change
lands, rewrite it to assert the files are gone, and say so in your report.

Beware the trap this cost the Orchestrator an hour: measure the leak in a workspace the entry **can
arm against**. A workspace missing its Vitest configuration aborts boot before it can leak, and reads
as a fix. The test now writes a `tsconfig.json` and a `vite.config.ts` into its scratch for exactly
this reason — keep that.

A test also asserts a pre-existing orphan is removed at construction.

## Standing conditions

- Units PB3 and PB4 land before you. PB4 changes `Verdict`, `computeReceipt`, and `TypeStage`. Take
  their state as given and do not revert it.
- The sandbox denies **nested** child creation with `EPERM`, and every row here drives a child.
  Expect to be unable to prove most of this in your exec. Record each as an observation naming the
  exact settling command; the Orchestrator re-runs them on the host. **Never substitute a weaker
  instrument.**
- `tests/src/server/Probe.test.ts` and `tests/src/server/stages/LintStage.test.ts` contend over
  `tmp/probe` and time out under load. A timing failure inside your exec is a question, not an answer.

## Scope

Owned: `src/server/Probe.ts`, `src/server/stages/LintStage.ts`, `src/server/stages/TypeStage.ts`,
`src/server/stages/RuntimeStage.ts`, `src/bin/main.ts`, and every matching file under `tests/src/`,
including `tests/src/bin/main.test.ts`.

Off-limits: `src/core/**`, `package.json`, `vite.config.ts`, `guides/`, `.orkestrel/`,
`tests/distribution.test.ts`.

## Execution

Perform this assignment directly. Spawn nothing.

## Acceptance criteria

1. `npm run format:check`, `npm run lint:check`, and `npm run check` each exit 0.
2. A clean claim is served after a deadline expiry at **each** of the three stages, proven
   red-then-green.
3. `destroy()` settles against a server that ignores `exit`, and the child is gone. The
   `Promise.race` hedge is deleted.
4. A second `prove` after a boot expiry carries a boot-origin message naming arming.
5. A signalled host leaves no arming files, and a pre-existing orphan is removed at construction —
   measured in a workspace the entry can arm against.
6. `tests/src/bin/main.test.ts` asserts the repaired behaviour rather than the defect.

**`npm run build` and the test projects are observations, not criteria.** Report every command's
**bare** exit code.

## Deviation contract

Stop and report if a repair needs a file you do not own, if bounding the lint teardown cannot
guarantee the child dies, or if re-arming after a boot failure has consequences you cannot bound.
The recycle mechanism's shape, the bound's value, and test structure are yours.

## Output

**Per numbered row: what changed and why**, **The P15 ruling and why**, **Files written**,
**Red-then-green proofs** with exact commands and both counts, **Validation** (each gate, bare exit
code), **What you could not run and the settling command for each**, **Deviation**, **Decisions**.
No process diary.
