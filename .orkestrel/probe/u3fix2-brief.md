# Unit 3 fix round 2 — contract and publication

## Role and engine

`sol` on GPT-5.6 Sol. Opus 5 wrote fix round 1 and Sol wrote the original unit, so this round is
audited afterwards by a lane on the engine that did not write it. You are the sole serial writer in
`/workspace/probe`.

## Objective

Close seven contract and publication defects. A previous round already closed the lifecycle and
safety defects; do not revisit those.

## Context

Read before acting:

1. `/workspace/probe/AGENTS.md` and every rule under `/workspace/probe/.claude/rules/` that governs
   the files you touch. `.claude/rules/patterns.md` § Declared ecosystem capabilities decides two of
   these defects.
2. `/workspace/probe/src/core/types.ts` and `/workspace/probe/src/server/types.ts`.
3. `/home/user/scaffold/.orkestrel/probe/u3-orchestrator-findings.md`, the measured record.
4. `/home/user/scaffold/PROBE.md`, the design ruling, for what arming is required to prove.

**Three commits have landed since the line numbers in this brief were taken.** Fix round 1 rewrote
`Probe.ts`, the three stage files, `src/server/types.ts`, and the bin test. A re-pin moved
`@orkestrel/mcp` to `^0.0.18`, `@orkestrel/scaffold` to `^0.0.42`, and `@orkestrel/test` to `^0.0.7`,
and a re-vendor replaced `tests/config.test.ts` and added five dependency guides. The MCP surface this
package composes is unchanged across its bump.

The tree is green at `b912b19`: all five gates exit 0, and the built entry answers the handshake era,
the current revision with all three reserved metadata keys, and a `tools/call` returning a six-check
verdict with a receipt.
Every line number in this brief refers to the pre-round-1 commit `f7104c7` and has moved. Locate every
subject by symbol name, never by line number, and read the current file before editing it.

The Model Context Protocol stdio transport speaks newline-delimited JSON, not `Content-Length`
framing. An instrument that frames with headers hangs.

## Defects

### E1 — `Claim.project` is required of every caller and nothing reads it

`Claim.project` is declared in `src/core/types.ts`, required non-empty by `CLAIM_SHAPE` and by
`isClaim`, advertised to every Model Context Protocol client through the `prove` tool's parameters,
and documented as the TypeScript project the candidate sources are checked against.

No code reads it. The only server-side occurrence is `Probe` writing `project: 'tsconfig.json'` into
its own arming claim. `TypeStage` hard-codes `'tsconfig.json'` for the test file and derives the rest
through `inferTypeProject`. `Probe` is the only component holding the whole claim, so it is the only
place that could route the field, and it drops it.

Route it, or remove it from the contract. Routing is the better answer, because the field is already
published to every client and a caller working in a workspace whose root project is not
`tsconfig.json` has no other way to say so. If you remove it instead, say why in your report.

### E2 — arming proves only half the failure it exists for

`PROBE.md` requires the resident type host to be revalidated for the same reason the runtime is, and
requires arming to refuse service unless the mutation is detected. Arming declares `stage: 'runtime'`
and mutates only a value — `'before'` to `'after'` — which the type stage cannot report by
construction, then requires a finding from the runtime check alone.

So a probe whose type host has gone stale arms successfully and then serves confident wrong answers
for the rest of the session. That is precisely the failure arming exists to refuse.

Add a control whose mutation changes a **type** the candidate depends on, and require the type stage
to report it. Arming fails unless both controls are detected.

### E3 — the server factory's return type has no name, and leaks a value import

`createProbeServer` returns `ReturnType<typeof createStdioServer>`. `@orkestrel/mcp` declares that
return as an anonymous object type, so there is no upstream name to import. The consequence reaches
the published artifact:

```text
$ head -8 dist/src/server/index.d.ts
import { createStdioServer } from '@orkestrel/mcp/server';
$ grep -n "createProbeServer" dist/src/server/index.d.ts
30:export declare function createProbeServer(probe: ProbeInterface): ReturnType<typeof createStdioServer>;
```

A value import sits in the public declaration purely to spell a type, so every consumer's typechecker
must resolve `@orkestrel/mcp/server` to type this one function.

The factory is named `create{Entity}` for an entity this package declares nowhere. Declare the
interface in `src/server/types.ts`, name it for that entity, return it, and drop the `ReturnType`
query.

### E4 — a runtime round-trip stands in for a declared primitive

`factories.ts` writes `parameters: Object.fromEntries(Object.entries(compileSchema(CLAIM_SHAPE)))`.
Its only effect is to launder `JSONSchema` into the open record `createTool` declares.

`@orkestrel/contract` already exports the sanctioned narrowing, from the same specifier the file
already imports:

```text
$ grep -n "export declare function schemaToParameters" node_modules/@orkestrel/contract/dist/src/core/index.d.ts
5587:export declare function schemaToParameters(schema: JSONSchema): Readonly<Record<string, unknown>> | undefined;
```

Its own documentation states it is the single sanctioned narrowing from a compiled contract schema to
the open tool-parameters record, and that it crosses through a boundary guard rather than an
assertion. Use it, and handle its `undefined` case explicitly.

### E5 — the published bundle carries the whole development manifest

`factories.ts` default-imports `../../package.json` to read one string, and the bundler inlines the
entire file:

```text
$ grep -n "devDependencies\|prepublishOnly" dist/src/server/index.js
224:		"prepublishOnly": "npm run format:check && npm run lint:check && npm run check && npm run build && npm test"
233:	devDependencies: {
234:			"@microsoft/api-extractor": "^7.58.12",
```

The build configuration is a scaffold content-owned artifact, so it is off-limits and the fix is in
source. A **named** import tree-shakes; a default import does not. The Orchestrator measured both
against this workspace's own bundler:

```text
=== named:  import { version } from '../package.json' with { type: 'json' } ===
var identity = { name: "probe", version: "9.9.9" };
MARKER_SCRIPTS=0 marker-dev-dependency=0

=== default: import manifest from '../package.json' with { type: 'json' } ===
var identity = { name: "probe", version: { name: "jsontest", version: "9.9.9", type: "module",
  scripts: { "prepublishOnly": "MARKER_SCRIPTS" },
  devDependencies: { "marker-dev-dependency": "1.0.0" } }.version };
MARKER_SCRIPTS=1 marker-dev-dependency=1
```

### E6 — one manifest-reading leaf is written twice

`Probe.#version` and `resolveWorkspaceBinary` in `src/server/helpers.ts` both resolve
`<name>/package.json` through `resolveWorkspaceModule`, parse it, and narrow one string field.
`.claude/rules/architecture.md` requires centralizing a pattern repeated twice.

Extract it as one exported helper in `src/server/helpers.ts` and route both call sites through it.
An exported helper reaches the server barrel, so the barrel population test must move with it.

### E7 — the two functions a consumer calls carry the least documentation

Neither `createProbe` nor `createProbeServer` carries an `@example`, though the class they wrap has
one and `.claude/rules/typescript.md` requires one where applicable. Both describe their options as
"Workspace, deadline, and initial observation hooks" and never name `error`, the listener-throw
handler declared on `ProbeOptions`.

Add a worked `@example` to each and document every option field.

## Scope

- **Owned**: `src/server/factories.ts`, `src/server/types.ts`, `src/server/helpers.ts`,
  `src/server/Probe.ts`, `src/server/stages/TypeStage.ts`, `src/core/types.ts`,
  and `tests/src/server/index.test.ts` **only** to keep its barrel population assertion true.
- **Off-limits**: everything else. Specifically `src/core/helpers.ts`, `src/core/validators.ts`,
  `src/core/shapers.ts`, `src/core/constants.ts`, `src/server/index.ts`,
  `src/server/stages/LintStage.ts`, `src/server/stages/RuntimeStage.ts`,
  `tests/src/core/**`, `tests/src/bin/**`, `guides/**`, `package.json`, `vite.config.ts`,
  `configs/**`, and every dotfile.
- **Tools**: read, write, and `Bash` for validation only.
- **Permissions**: do not commit, push, tag, publish, install a dependency, or run a destructive
  command. Do not add an npm package. Do not read, print, or copy any secret.

## Unknowns

- Whether routing `Claim.project` changes what `TypeStage` needs from its caller. `TypeStage` is
  yours, so settle it there rather than reporting it.
- What a type-changing mutation looks like that both the type stage reports and the runtime stage
  tolerates. Choose one, prove it reddens the type stage, and state it in your report.

## Criteria

1. E1: `Claim.project` reaches the type stage and changes what it checks against, or is gone from the
   contract. Prove the routing with a claim naming a non-default project.
2. E2: arming refuses service when the type host serves stale source. Prove it: make the type stage
   fail to revalidate, show arming refusing, then restore and show it arming.
3. E2 does not regress the runtime half: arming still refuses when the runtime serves stale source.
4. E3: `src/server/types.ts` declares the server interface, `createProbeServer` returns it, and
   `dist/src/server/index.d.ts` contains no `import { createStdioServer }`.
5. E4: `factories.ts` uses `schemaToParameters` and carries no `Object.fromEntries`. The `prove` tool
   still advertises the claim schema over the wire — drive the built entry and paste `tools/list`.
6. E5: `dist/src/server/index.js` contains no `devDependencies` and no `prepublishOnly`, and the
   server still reports its version — paste the `initialize` response.
7. E6: one exported helper carries the manifest read, both call sites use it, and the barrel
   population test names it.
8. E7: both factories carry an `@example` and document every `ProbeOptions` field.
9. `npm run format:check`, `npm run lint:check`, `npm run check`, `npm run build`, and `npm test`
   each exit 0, run in that order.
10. `git diff --stat` touches only the seven owned files.

## Execution

Perform this assignment directly. Spawn no subagent.

## Deviation contract

Stop and report when reality conflicts with the primary objective: a defect whose fix needs an
off-limits file, two criteria that contradict each other, or a gate that reddens for a reason your
change does not explain. Report expected, found, the exact command and its output, whether the work is
done, and at most one short hypothesis.

Decide an ancillary question yourself and record it: the interface's exact name, the helper's name,
the shape of the type-changing control, and comment wording are yours. Delete every throwaway script
before you finish.

## Output

Return exactly these five sections, and no process diary.

1. **Files written** — each path with a one-line statement of what changed.
2. **Validation** — each of the five gates with its exit code.
3. **Acceptance evidence** — criteria 1 through 10, each with the command and output that closes it.
4. **Deviation** — the contract above, or `None`.
5. **Decisions** — ancillary decisions you made, or `None`.
