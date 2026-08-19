# Unit 3 fix round 3 — four items the audit found

## Role and engine

`implementer` on Claude Opus 5. GPT-5.6 Sol wrote the round being repaired, so this runs on a
different engine, and Sol audits the result. You are the sole serial writer in `/workspace/probe`.

## Objective

Close four items. Two came from an audit lane, one from its referral that the Orchestrator confirmed,
and one is a documentation contradiction. Change nothing else.

## Context

Read before acting:

1. `/workspace/probe/AGENTS.md` and every rule under `/workspace/probe/.claude/rules/`.
   `.claude/rules/patterns.md` § Declared ecosystem capabilities decides item C.
2. `/workspace/probe/src/core/types.ts` and `/workspace/probe/src/server/types.ts`.
3. `/home/user/scaffold/.orkestrel/probe/u3fix2-audit-reconciliation.md`, which carries the evidence
   behind each item.

The tree is green at its current commit: all five gates exit 0 outside a bench sandbox. Inside a bench
sandbox `npm test` fails on the vendored `tests/config.test.ts`, which cannot spawn a nested process
there. That file is off-limits and its failure is environmental — report it and do not chase it.

## Items

### A — a published contract was widened with no consumer

`StageInterface.inspect` reads `inspect(subject: Case, project?: string): Promise<Check>`, and its own
TSDoc says only the type stage reads the parameter. Nothing reads it through the interface:

```text
$ grep -rn "StageInterface" src/ | grep -v "types.ts:"
src/server/stages/TypeStage.ts:2:import type { StageInterface } from '../types.js'
src/server/stages/TypeStage.ts:31:export class TypeStage implements StageInterface {
src/server/stages/LintStage.ts:2:import type { StageInterface } from '../types.js'
src/server/stages/LintStage.ts:32:export class LintStage implements StageInterface {
src/server/stages/RuntimeStage.ts:2:import type { StageInterface } from '../types.js'
src/server/stages/RuntimeStage.ts:33:export class RuntimeStage implements StageInterface {
```

`Probe` holds its stages as concrete classes, so `this.#type.inspect(subject, claim.project)` binds to
`TypeStage.inspect`. `src/server/index.ts` star-exports `types.js`, so the widening is published
surface added without the first real consumer `AGENTS.md` requires, and it tells anyone implementing a
fourth stage to accept an argument and then ignore it.

Narrow `StageInterface.inspect` back to one parameter and delete its `@param project`. Declare the
second parameter on `TypeStage.inspect` alone, where it is real, and document it there. TypeScript
accepts a class method with an extra **optional** parameter as an implementation of a one-parameter
interface method, and `Probe` calls the concrete class, so no call site changes and no assertion is
introduced.

### B — the type stage's service cache grows on caller-supplied input

```text
$ grep -n "#services" src/server/stages/TypeStage.ts
34:	readonly #services = new Map<string, LanguageService>()
84:		for (const service of this.#services.values()) service.dispose()
85:		this.#services.clear()
156:		const existing = this.#services.get(project)
192:		this.#services.set(project, service)
```

The cache is cleared only at teardown. Its key used to come from `inferTypeProject`, which returns one
of a small fixed set. It now arrives as `claim.project`, from the wire, validated only as a non-empty
string. A caller varying the spelling — `tsconfig.json` against `./tsconfig.json`, or anything else —
adds a full TypeScript `LanguageService` per distinct string for the life of the resident probe.

Close it. The property to reach is that a resident probe's service cache cannot grow without bound on
caller input. How you reach it is yours: resolving the project to a canonical absolute path before it
becomes a key is the obvious move and collapses the spelling variants, and it is not sufficient on its
own against a caller naming genuinely different projects, so say what you chose and why. State the
cost of any bound you impose.

### C — a manifest field typed loosely, forcing a reach at both call sites

`WorkspaceManifest.contents` is typed `object`, so both consumers read through `Reflect.get`
(`src/server/helpers.ts:81`, `src/server/Probe.ts:272`). `readWorkspaceManifest` already proves the
value is a non-null, non-array object before returning it.

`@orkestrel/contract` exports the total guard that carries exactly this across a boundary:

```text
$ grep -n "export declare function isRecord" node_modules/@orkestrel/contract/dist/src/core/index.d.ts
3316:export declare function isRecord(value: unknown): value is Record<string, unknown>;
```

It is the same primitive `schemaToParameters` uses internally, and the previous round adopted that
rule for the tool parameters and left it unapplied one file over. Type `contents` as
`Readonly<Record<string, unknown>>` behind `isRecord` and delete both `Reflect.get` reaches.

### D — one field, two descriptions that disagree

`src/core/types.ts` documents `ProbeInterface.prove`'s parameter as "The case, its control, and the
project to check **the case** against". The same file, at the `Claim.project` declaration, correctly
says the project checks the candidate sources **in both cases**. The previous round corrected one
sentence and left its neighbour.

Correct the `@param` to say both.

## Scope

- **Owned**: `src/server/types.ts`, `src/server/stages/TypeStage.ts`, `src/server/helpers.ts`,
  `src/server/Probe.ts`, `src/core/types.ts`.
- **Off-limits**: everything else. Specifically `src/core/helpers.ts`, `validators.ts`, `shapers.ts`,
  `constants.ts`, `src/server/factories.ts`, `src/server/index.ts`, `src/server/stages/LintStage.ts`,
  `src/server/stages/RuntimeStage.ts`, `src/bin/main.ts`, `tests/**`, `guides/**`, `package.json`,
  `vite.config.ts`, `configs/**`, and every dotfile.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: do not commit, push, tag, publish, install a dependency, or run a destructive
  command. Do not add an npm package. Do not read, print, or copy any secret.

## Criteria

1. A: `StageInterface.inspect` takes one parameter and carries no `@param project`. `TypeStage.inspect`
   takes the optional second parameter and documents it. `npm run check` exits 0, proving the class
   still satisfies the interface.
2. A: the type stage still checks a candidate against a caller-named project. Prove it with a claim
   naming a non-default project and paste the output.
3. B: a resident probe's type-stage service cache does not grow without bound on caller-supplied
   project strings. Prove it: drive several claims whose `project` differs only in spelling and show
   the cache size, before and after.
4. B does not break project selection: a claim naming a genuinely different project still reaches that
   project.
5. C: `WorkspaceManifest.contents` carries a record type, both `Reflect.get` reaches are gone, and the
   crossing goes through the declared guard rather than an assertion.
6. D: the two sentences agree.
7. No new `any`, `as`, non-null assertion, `@ts-` directive, or lint suppression.
8. `npm run format:check`, `npm run lint:check`, `npm run check`, `npm run build`, and `npm test` each
   exit 0, run in that order. Report the `npm test` result separately if a sandbox blocks the vendored
   config proof.
9. `git diff --stat` touches only the five owned files.

## Execution

Perform this assignment directly. Spawn no subagent.

## Deviation contract

Stop and report when reality conflicts with the primary objective: an item whose fix needs an
off-limits file, two criteria that contradict, or a gate that reddens for a reason your change does not
explain. Report expected, found, the exact command and its output, whether the work is done, and at
most one short hypothesis.

Decide an ancillary question yourself and record it: the bound you choose for item B, identifier
names, and comment wording are yours. Delete every throwaway script before you finish, and leave
`tmp/probe/` empty.

## Output

Return exactly these five sections, and no process diary.

1. **Files written** — each path with a one-line statement of what changed.
2. **Validation** — each of the five gates with its exit code.
3. **Acceptance evidence** — criteria 1 through 9, each with the command and output that closes it.
4. **Deviation** — the contract above, or `None`.
5. **Decisions** — ancillary decisions you made, or `None`.
