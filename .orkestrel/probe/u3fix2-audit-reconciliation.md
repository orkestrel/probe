# Repair round 2 audit — reconciliation

One lane ran, on Opus 5, against a read-only worktree pinned at `32cfa1b`. GPT-5.6 Sol wrote the
round, so the engines cross. `VERDICT: FAIL`.

Eleven claims confirmed, one refuted, two unproven. The Orchestrator closes both unproven claims on
its own evidence and upholds the refutation.

## The refutation, upheld

**Claim 11 — a public contract widened with no consumer.** The round changed
`StageInterface.inspect` to `inspect(subject: Case, project?: string)` and documented the parameter as
one only the type stage reads. Nothing reads it through the interface:

```text
$ grep -rn "StageInterface" src/ | grep -v "types.ts:"
src/server/stages/TypeStage.ts:2:import type { StageInterface } from '../types.js'
src/server/stages/TypeStage.ts:31:export class TypeStage implements StageInterface {
src/server/stages/LintStage.ts:2:import type { StageInterface } from '../types.js'
src/server/stages/LintStage.ts:32:export class LintStage implements StageInterface {
src/server/stages/RuntimeStage.ts:2:import type { StageInterface } from '../types.js'
src/server/stages/RuntimeStage.ts:33:export class RuntimeStage implements StageInterface {
```

Three `implements` clauses and no typed reference. `Probe` holds its stages concretely, so the only
two-argument call binds to `TypeStage.inspect`, not to the interface. `src/server/index.ts`
star-exports `types.js`, so this is published surface added without the first real consumer
`AGENTS.md` requires. It also damages the concept the interface names: a reader implementing a fourth
stage is told to accept a parameter and then told to ignore it.

## The referral, confirmed as a defect

The lane referred one question to an objective lane rather than ruling on it. The Orchestrator settled
it and it is real.

**`TypeStage.#services` grows without bound on caller-supplied input.** The cache is keyed by the
project string and cleared only at teardown:

```text
$ grep -n "#services" src/server/stages/TypeStage.ts
34:	readonly #services = new Map<string, LanguageService>()
84:		for (const service of this.#services.values()) service.dispose()
85:		this.#services.clear()
156:		const existing = this.#services.get(project)
192:		this.#services.set(project, service)
```

Before this round the key came from `inferTypeProject`, which returns one of a small fixed set. The
round made it `claim.project`, which arrives from the wire and is validated only as a non-empty
string. A caller varying it — `tsconfig.json` against `./tsconfig.json`, or anything else — adds a
full TypeScript `LanguageService` per distinct spelling, for the life of the resident probe.

The round closed a defect and opened a smaller one in the same edit. That is worth naming plainly:
routing caller input into a cache key is a resource decision, and E1 did not put it as one.

## The unproven claims, closed by the Orchestrator

The lane refused to rule on two conjuncts because the worktree carries no `dist/`, and refused to
accept the unit's own greps as evidence. Both refusals are correct. The Orchestrator ran them:

```text
createStdioServer value-import in .d.ts: 0
devDependencies/prepublishOnly in bundle: 0
177:var version = "0.0.1";
```

Claims 4 and 6 are `CONFIRMED`.

## Also upheld, as smaller items

- **`src/core/types.ts:302` contradicts `:89`.** One says the project checks "the case", the other
  correctly says "both cases". The round corrected one sentence and left its neighbour.
- **`WorkspaceManifest.contents: object` forces `Reflect.get` at both call sites.**
  `@orkestrel/contract` exports `isRecord`, the same primitive `schemaToParameters` uses internally.
  Typing `contents` as `Readonly<Record<string, unknown>>` behind that guard removes both reaches.
  The round applied exactly this rule to one defect and left it unapplied one file over.

## Routed to the design round rather than to a repair

- **`inferTypeProject` is now unreachable through `prove`**, because `project` is required non-empty,
  so its `??` fallback cannot be taken from a claim. Two mechanisms decide one fact.
- **A scalar `Claim.project` collapses per-file project selection.** A claim carrying `src/core/a.ts`
  beside `src/server/b.ts` now checks both against one project, where inference gave each its own.
  Whether the contract wants a scalar or a project per `Source` is a shape question E1 did not put,
  and the design round already running is where it belongs.

## Not a regression

The lane confirmed claim 14 against the six supplied measurements and the diff. It noted that arming
now writes two dependency files where it wrote one, so the known killed-mid-arming window leaves two
inert files instead of one. Already ruled low severity and non-blocking, and boot did not lengthen
materially.
