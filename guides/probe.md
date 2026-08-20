# Probe

> **The claim prover for the `@orkestrel` line.** `@orkestrel/probe` answers this question about a
> proposed edit: does it compile, lint, and pass its test in this workspace? It holds resident
> TypeScript, Oxlint, and Vitest engines, runs a claim's case and its negative control through all
> of them, and returns a `Verdict` carrying every finding — and, when the case ran clean and the
> control broke where it said it would, a `receipt`. Source: [`src/core`](../src/core),
> [`src/server`](../src/server), [`src/bin`](../src/bin). Published through `@orkestrel/probe` and
> `@orkestrel/probe/server`.
>
> **An agent is the caller this exists for.** Deciding whether an edit compiles by reasoning about
> it costs more than asking, and the answer is a guess. A `Claim` states the edit and what would
> falsify it; a `Verdict` answers with the tools the workspace's own gate runs.
>
> **Mechanism, not policy.** probe reports evidence and issues a receipt under stated conditions. It
> holds no key, signs nothing, and compels nothing. It also **executes caller-supplied test code
> with the privileges of the process that hosts it**, so give a probe a workspace and a caller you
> already trust with a shell.

A `Claim`, a `Verdict`, and a `receipt` carry the package. A `Claim` is the question: a case, a
control that must break, and the TypeScript project both are judged under. A `Verdict` is the
answer: one `Check` per stage for the case and one per stage for the control. A `receipt` is the
verdict's one-line summary of the conditions it was reached under, and it exists only when the claim
proved itself.

## Surface

### Contracts

The data shapes, from [`types.ts`](../src/core/types.ts). Every property is readonly, and an absent
optional field is absent rather than empty.

| Name                | Kind      | Shape / Purpose                                                                                                                                       |
| ------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Stage`             | type      | `'type' \| 'lint' \| 'runtime'` — the inspections every claim passes through.                                                                         |
| `Source`            | interface | `{ path, text }` — one file's contained workspace-relative path and its full contents. The path need not exist on disk.                               |
| `Case`              | interface | `{ files, test }` — the candidate sources a claim asserts about and the test that exercises them.                                                     |
| `Control`           | interface | `Case` plus `{ stage, reason }` — the negative control, naming the stage it must fail at and why.                                                     |
| `Claim`             | interface | `{ project, case, control }` — everything one `prove` call needs.                                                                                     |
| `FindingOrigin`     | type      | `'code' \| 'instrument'` — whether a message names a fault in the candidate's code or in the stage that ran.                                          |
| `Finding`           | interface | `{ origin, path, message, line? }` — one message a stage reported. `line` is absent when the tool reported none.                                      |
| `Check`             | interface | `{ stage, elapsed, findings }` — one stage's outcome. An empty `findings` list is the clean result; there is no separate pass flag.                   |
| `Toolchain`         | interface | `{ typescript, oxlint, vitest }` — the resolved versions the verdict was produced with.                                                               |
| `Project`           | interface | `{ path, digest }` — the resolved TypeScript project that judged the candidates, and the digest of its compiler options.                              |
| `Verdict`           | interface | `{ id, digest, toolchain, project, reason?, checks, control, elapsed, receipt? }` — the full result. `Probe.prove` always carries the control reason. |
| `ProbeEventMap`     | type      | The observation surface: `arm`, `prove`, `expire`, and `error`.                                                                                       |
| `ProbeOptions`      | interface | `{ on?, error?, workspace?, deadline? }` — the construction input. `workspace` defaults to the working directory and `deadline` to 30,000 ms.         |
| `ProbeInterface`    | interface | The coordinator contract; its readonly `emitter` and `toolchain` are data. See [`## Methods`](#methods).                                              |
| `ProbeErrorCode`    | type      | `'invalid' \| 'destroyed' \| 'deadline' \| 'workspace' \| 'instrument'` — the category one failure belongs to.                                        |
| `ProbeErrorContext` | interface | `{ stage?, path?, project?, name?, deadline?, value? }` — the structured detail a failure reports. Every member is absent unless the failure has it.  |
| `ProbeErrorOptions` | interface | `{ code, context?, cause? }` — the construction input for a `ProbeError`.                                                                             |

### Constants

From [`constants.ts`](../src/core/constants.ts). Each is frozen.

| Name                | Kind  | Value / Purpose                                                                                       |
| ------------------- | ----- | ----------------------------------------------------------------------------------------------------- |
| `PROBE_STAGES`      | const | `['type', 'lint', 'runtime']` — the stage order a verdict reports, shared by the guard and the token. |
| `FINDING_ORIGINS`   | const | `['code', 'instrument']` — the origins a finding carries.                                             |
| `RECEIPT_PREFIX`    | const | `'probe'` — the leading token of every receipt.                                                       |
| `RECEIPT_SEPARATOR` | const | `':'` — the character joining a receipt's fields.                                                     |
| `PROBE_ERROR_CODES` | const | `['invalid', 'destroyed', 'deadline', 'workspace', 'instrument']` — the categories the guard admits.  |

### Errors

Every failure this package raises, from [`errors.ts`](../src/core/errors.ts).

| Name                   | Kind     | Signature                                           | Behavior                                                                                      |
| ---------------------- | -------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `ProbeError`           | class    | `new (message: string, options: ProbeErrorOptions)` | Reports one failure under a `code` a caller branches on, with optional `context` and `cause`. |
| `isProbeError`         | function | `(value: unknown) => value is ProbeError`           | Admits this package's own failure, across duplicate installations and both module formats.    |
| `createDestroyedError` | function | `(subject: string) => ProbeError`                   | Creates the `destroyed` failure every torn-down instrument in this package refuses with.      |

### Shapes

The blueprints behind both the published tool schema and the guard applied to an arriving call, from
[`shapers.ts`](../src/core/shapers.ts). `CLAIM_SHAPE` compiles to the `prove` tool's JSON Schema. The
schema is the wire contract's shape and `isClaim` is the admission rule, and the rule is narrower on
`Source.path`: see [The advertised schema is wider than the admission rule](#registering-the-server).

| Name            | Kind  | Describes                                                                      |
| --------------- | ----- | ------------------------------------------------------------------------------ |
| `SOURCE_SHAPE`  | const | One file a claim carries; its schema requires `path` to be a non-empty string. |
| `CASE_SHAPE`    | const | The files a claim asserts about and the test that exercises them.              |
| `CONTROL_SHAPE` | const | A case plus the stage it must fail at and the reason it fails there.           |
| `CLAIM_SHAPE`   | const | One whole claim: the project, the case, and the control.                       |

### Validators

Total guards, from [`validators.ts`](../src/core/validators.ts). Each returns a boolean for any input
and never throws.

| Name          | Kind     | Signature                                    | Behavior                                                                                                                                                        |
| ------------- | -------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isStage`     | function | `(value: unknown) => value is Stage`         | Admits a name the `Stage` type carries.                                                                                                                         |
| `isOrigin`    | function | `(value: unknown) => value is FindingOrigin` | Admits `'code'` or `'instrument'`.                                                                                                                              |
| `isSource`    | function | `(value: unknown) => value is Source`        | Admits a record with a contained relative `path` and string `text`; refuses absolute and escaping paths.                                                        |
| `isCase`      | function | `(value: unknown) => value is Case`          | Admits a record whose `files` are sources and whose `test` is one source.                                                                                       |
| `isControl`   | function | `(value: unknown) => value is Control`       | Admits a case that also carries a `stage` and a non-empty `reason`.                                                                                             |
| `isClaim`     | function | `(value: unknown) => value is Claim`         | Admits a record carrying a non-empty `project`, a case, and a control. Exact: an unknown member is refused. Narrower than `CLAIM_SHAPE` on `Source.path` alone. |
| `isFinding`   | function | `(value: unknown) => value is Finding`       | Admits a record carrying an origin, a path, a message, and an optional line.                                                                                    |
| `isCheck`     | function | `(value: unknown) => value is Check`         | Admits a record carrying a stage, an elapsed number, and findings.                                                                                              |
| `isToolchain` | function | `(value: unknown) => value is Toolchain`     | Admits a record carrying every resolved tool version.                                                                                                           |
| `isProject`   | function | `(value: unknown) => value is Project`       | Admits a record carrying a non-empty path and a non-empty digest.                                                                                               |
| `isVerdict`   | function | `(value: unknown) => value is Verdict`       | Admits a whole verdict, including the required `digest` and `project` members.                                                                                  |

### Formatters and the token

Pure leaves, from [`helpers.ts`](../src/core/helpers.ts).

| Name                   | Kind     | Signature                                                 | Behavior                                                                                                                                       |
| ---------------------- | -------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatFinding`        | function | `(finding: Finding) => string`                            | Renders one message as `[origin] path:line message`, dropping `:line` when the tool reported none.                                             |
| `formatCheck`          | function | `(check: Check) => string`                                | Renders one stage's summary line, then one indented line per finding.                                                                          |
| `formatVerdict`        | function | `(verdict: Verdict) => string`                            | Renders identity, claim, toolchain, project, and reason, then both phases with each finding's origin and the receipt line.                     |
| `computeReceipt`       | function | `(verdict: Verdict, stage: Stage) => string \| undefined` | Returns the token when both phases name every stage, the case ran clean, and the control broke only at `stage`; returns `undefined` otherwise. |
| `formatSpecification`  | function | `(text: string, revision: string) => string`              | Renders the bytes the runtime stage writes: the caller's test text, then the marker naming the revision that wrote it.                         |
| `matchesSpecification` | function | `(text: string, revision: string) => boolean`             | Reports whether one file's text is the generated specification written for that revision.                                                      |
| `findRefusedPaths`     | function | `(value: unknown) => readonly string[]`                   | Names every source member of a rejected claim whose `path` the guard refuses and the advertised schema admits.                                 |

### Server contracts

From [`types.ts`](../src/server/types.ts).

| Name                   | Kind      | Shape / Purpose                                                                                                                             |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Inspection`           | interface | `{ subject, claim }` — one queued inspection: the case a stage reads and the claim it belongs to.                                           |
| `OverlayInterface`     | interface | The candidate set one inspection substitutes for files on disk; its readonly `revision` and `paths` are data. See [`## Methods`](#methods). |
| `StageInterface`       | interface | The resident-stage contract; its readonly `stage` names which inspection it performs. See [`## Methods`](#methods).                         |
| `TypeStageInterface`   | interface | `StageInterface` plus a project-aware `inspect`. See [`## Methods`](#methods).                                                              |
| `WorkspaceManifest`    | interface | `{ path, contents }` — one installed package manifest and the absolute path it was read from.                                               |
| `ProbeServerInterface` | interface | The stdio server that owns this process. See [`## Methods`](#methods).                                                                      |
| `ListenerCapture`      | type      | `ReadonlyMap<string, readonly Function[]>` — the listeners one emitter carried for a set of events.                                         |

### The engine

The classes, each exported from its own file.

| Name           | Kind  | Implements             | Purpose                                                                                                                                                                                                                                                                     |
| -------------- | ----- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Probe`        | class | `ProbeInterface`       | The coordinator: per-stage queues, active-inspection deadlines, and the receipt decision. Construction begins warming, installs initial listeners, selects the target workspace, and applies the inspection deadline from its options. [`Probe.ts`](../src/server/Probe.ts) |
| `ProbeServer`  | class | `ProbeServerInterface` | The process owner: construction creates the probe it serves, passes every option to that probe, and binds this process's stdio and termination signals. [`ProbeServer.ts`](../src/server/ProbeServer.ts)                                                                    |
| `TypeStage`    | class | `TypeStageInterface`   | A resident TypeScript language service per project, reading candidates from memory. [`TypeStage.ts`](../src/server/stages/TypeStage.ts)                                                                                                                                     |
| `LintStage`    | class | `StageInterface`       | A resident Oxlint language server, driven over the Language Server Protocol. [`LintStage.ts`](../src/server/stages/LintStage.ts)                                                                                                                                            |
| `RuntimeStage` | class | `StageInterface`       | A resident Vitest service that writes one fresh specification per inspection. [`RuntimeStage.ts`](../src/server/stages/RuntimeStage.ts)                                                                                                                                     |
| `Overlay`      | class | `OverlayInterface`     | The candidate set one inspection holds in memory, under an identity minted fresh per instance. [`Overlay.ts`](../src/server/Overlay.ts)                                                                                                                                     |

Each stage takes one optional `workspace` argument and defaults to the working directory. A stage
serves one inspection at a time and admits none itself, so drive stages through `Probe` unless you
are building your own coordinator.

`new Overlay()` takes no arguments, so a coordinator of your own can mint one. Mint it per
inspection and release it when that inspection ends. An overlay shared across inspections keeps the
identity a resident tool caches its answers against, so the second inspection reads the first one's
answer as a fresh one. Each stage in this package mints its own for that reason.

### Server helpers

Pure leaves and workspace readers, from [`helpers.ts`](../src/server/helpers.ts).

| Name                     | Kind     | Signature                                                                                   | Behavior                                                                                                     |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `normalizePath`          | function | `(path: string) => string`                                                                  | Rewrites a path into the forward-slash spelling this package compares and reports paths in.                  |
| `resolveWorkspaceFile`   | function | `(workspace: string, target: string) => string`                                             | Resolves a workspace-relative path to an absolute one and throws when it escapes the workspace.              |
| `relativeWorkspaceFile`  | function | `(workspace: string, file: string) => string`                                               | Projects an absolute path into the forward-slash workspace-relative form findings expose.                    |
| `resolveWorkspaceModule` | function | `(workspace: string, specifier: string) => string`                                          | Resolves one installed module's entry path from the target workspace.                                        |
| `loadWorkspaceModule`    | function | `(workspace: string, specifier: 'typescript' \| 'vitest/node') => typeof import(specifier)` | Loads one installed tool module from the target workspace.                                                   |
| `readWorkspaceManifest`  | function | `(workspace: string, name: string) => WorkspaceManifest`                                    | Reads one installed package manifest and its absolute path.                                                  |
| `resolveWorkspaceBinary` | function | `(workspace: string, name: string) => string`                                               | Resolves a package's portable JavaScript entry from its `bin` field, never a `node_modules/.bin` shim.       |
| `inferTypeProject`       | function | `(path: string) => string`                                                                  | Selects the scoped TypeScript project for one candidate path, and throws for a path outside `src` and `app`. |
| `inferTestProject`       | function | `(path: string) => string \| undefined`                                                     | Selects the Vitest project whose environment matches one test path, or `undefined` when none collects it.    |
| `inferDocumentLanguage`  | function | `(path: string) => string`                                                                  | Selects the Language Server Protocol language identifier a path's extension names.                           |
| `createRevisionFile`     | function | `(workspace: string, path: string, revision: string) => string`                             | Builds the fresh sibling path one runtime inspection writes its specification to.                            |
| `matchesWorkspaceModule` | function | `(path: string) => boolean`                                                                 | Reports whether a path is a script, TypeScript, Vue, or JSON module Vitest can cache.                        |
| `parseContentLength`     | function | `(header: string) => number \| undefined`                                                   | Reads a Language Server Protocol frame's declared byte length, or `undefined` for an invalid header.         |
| `messageFromUnknown`     | function | `(value: unknown) => string`                                                                | Normalizes a caught or foreign error into readable text.                                                     |
| `normalizeValue`         | function | `(workspace: string, value: unknown) => unknown`                                            | Rewrites every workspace-contained absolute path to its relative form and sorts every record's keys.         |
| `computeDigest`          | function | `(workspace: string, value: unknown) => string`                                             | Digests the normalized value and returns 32 lowercase hex characters.                                        |
| `captureListeners`       | function | `(emitter: EventEmitter, events: readonly string[]) => ListenerCapture`                     | Records the listeners one emitter carries for a set of events.                                               |
| `releaseListeners`       | function | `(emitter: EventEmitter, capture: ListenerCapture) => void`                                 | Removes every listener one emitter gained since its capture, across a window nothing else attaches in.       |

## Methods

The public call-signature members of each behavioral interface, one table per interface.

#### `ProbeInterface`

| Method    | Returns            | Behavior                                                                                                      |
| --------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `prove`   | `Promise<Verdict>` | Answers one claim with every stage's evidence for the case and the control. Throws when a stage cannot start. |
| `destroy` | `Promise<void>`    | Tears down the resident engines and releases the processes they hold. Settling is idempotent.                 |

#### `StageInterface`

| Method    | Returns          | Behavior                                                                                                                       |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `inspect` | `Promise<Check>` | Inspects one case and returns this stage's outcome. Throws when the resident tool cannot start.                                |
| `destroy` | `Promise<void>`  | Tears down the resident tool under the stage's own bound, abandoning every inspection it holds rather than waiting behind one. |

#### `TypeStageInterface`

| Method    | Returns            | Behavior                                                                                             |
| --------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `inspect` | `Promise<Check>`   | Inspects one case against a caller-named project, or against the project each candidate path infers. |
| `resolve` | `Promise<Project>` | Resolves one project to the resolved path and options digest the stage applies for it.               |

#### `OverlayInterface`

| Method   | Returns               | Behavior                                                                                          |
| -------- | --------------------- | ------------------------------------------------------------------------------------------------- |
| `set`    | `void`                | Records one candidate's text against the absolute path it stands in for.                          |
| `text`   | `string \| undefined` | Reads the candidate text recorded for one absolute path, or `undefined` when it holds none there. |
| `covers` | `boolean`             | Reports whether a candidate sits beneath one absolute directory. Directory listings stay on disk. |
| `clear`  | `void`                | Releases every candidate, so the paths this overlay held read from disk again.                    |

#### `ProbeServerInterface`

| Method    | Returns         | Behavior                                                                                                     |
| --------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| `start`   | `void`          | Reads newline-delimited JSON requests from standard input, and answers `SIGINT` and `SIGTERM` by destroying. |
| `destroy` | `Promise<void>` | Releases the transport, the process listeners, and the probe behind them. Settling is idempotent.            |

## What a probe proves

A `Claim` is a question with a falsifier attached. Its `case` is the edit you believe is correct.
Its `control` is the same edit deliberately broken, plus the `stage` you say the breakage lands at
and the `reason` in your own words. Both are judged under the TypeScript project the claim's
`project` member names.

Every verdict returned by `prove` carries that explanation unchanged as `Verdict.reason`. The
member reports why the claimant chose the control. No receipt condition reads it, and it still
reaches the token: the reason is part of the control, so it enters `verdict.digest`, and the digest
is a field of the token. Two claims that differ only in the reason's prose are two claims, and they
digest differently.

`verdict.digest` covers these things and nothing else: the case bytes, the control bytes including
the reason, and the workspace those bytes were read against. The workspace enters because probe
rewrites every absolute string in a claim relative to the workspace before hashing, which is what
keeps one commit checked out at two paths reading as one claim. A claim carrying no absolute string
therefore digests the same in every workspace; a claim that carries one digests per workspace, so
compare two such tokens only when both were minted against the same tree.

`prove` runs every stage over the case, then every stage over the control, and returns one `Check`
per stage for each. A stage that cannot start throws rather than returning an empty check, so no
verdict ever reports a stage that did not run.

The receipt is issued on these conditions together:

- both phases report one check per stage; and
- every stage ran clean on the case — no findings of either origin; and
- the control produced at least one `origin: 'code'` finding at the stage it declared; and
- every other control stage stayed clean.

A control that also breaks somewhere else has falsified the instrument rather than the claim, so no
receipt is issued for it. A case the stage could not inspect end to end is not a clean case, which
is why the case's condition counts `origin: 'instrument'` findings too. The check-per-stage
condition binds both phases, because the clean-elsewhere condition reads the control entries a
verdict carries: a control that omits a stage would otherwise read as a stage that stayed clean.
`prove` records every stage for both phases, so that condition refuses only a verdict you assembled
by hand and passed to `computeReceipt` yourself.

`Finding.origin` is the member that separates `code` from `instrument`. A `code` finding carries the
tool's own message about the candidate's source. An `instrument` finding carries the stage's own
message about an inspection that did not complete — a specification it could not write, a project it
could not select, a module that ran no test. `formatFinding` renders the value first as `[code]` or
`[instrument]`, so the distinction survives `formatVerdict`. A clean runtime check means every
collected test passed, not that the module reported itself passed.

## Failures

Every failure this package raises is a `ProbeError`. Narrow a caught value with `isProbeError` and
branch on `code`; read `message` to print it and `context` for the detail behind it. Each category
names the party that must act:

| Code         | Who acts     | Raised when                                                                                                                               |
| ------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid`    | The caller   | An input is refused: a path escaping the workspace, a claim the guard rejects, a test path naming no scoped TypeScript project.           |
| `destroyed`  | The caller   | A probe, a server, or a stage is used after its `destroy`. Build a replacement; teardown is permanent.                                    |
| `deadline`   | The caller   | `ProbeOptions.deadline` expired at one stage. That stage was replaced before the next inspection began.                                   |
| `workspace`  | The target   | The target tree cannot serve: a tool it does not install, a manifest or version it does not publish, a project its compiler cannot parse. |
| `instrument` | This package | The probe's own tooling could not serve — a boot control that did not report red, a language server that ended.                           |

`instrument` carries the same meaning here as it does on `Finding.origin`: the inspection did not
complete, so nothing was learned about the code. Do not read it as evidence about a candidate.

```ts
import { isProbeError } from '@orkestrel/probe'

try {
	await probe.prove(claim)
} catch (error) {
	if (isProbeError(error) && error.code === 'deadline') {
		console.log(error.context?.stage, error.context?.deadline)
	}
}
```

`isProbeError` reads a global brand rather than the constructor, so it admits a failure raised by a
second copy of this package — a duplicate installation, or the ESM and CommonJS builds loaded
together — where `instanceof` refuses a failure the other copy raised.

## Prerequisites

probe borrows the target workspace's own toolchain and configuration, so a workspace missing any of
these returns a failure the caller cannot diagnose from the verdict alone. Check them before
the first claim; the boot controls run through the same stages a claim does, so a workspace missing
one fails at construction rather than at the first `prove`.

1. **A Vitest project whose name the test's path infers.** A test under `tmp/probe/` names the
   `probe` project, and a test under `tests/src/<environment>/` names `src:<environment>`. Any other
   path infers no project and the runtime check reports
   `The runtime stage found no configured Vitest project matching the test path`; a path that infers
   a name the configuration does not define reports
   `The runtime stage found no configured Vitest project named <name>`.
2. **That project is composed in the root configuration, not declared as a path string.** The
   runtime stage installs its own overlay plugin into each project's configuration so the candidate
   sources resolve from memory. A project the root configuration names by path carries no such
   plugin, and the check reports
   `The runtime stage cannot instrument the string-declared Vitest project <name> because its configuration carries no runtime overlay plugin`.
   The project's `include` pattern is not the mechanism: the stage builds an explicit specification
   for the file it wrote, so a project whose glob matches nothing still serves a claim.
3. **The directory the declared test path names can be created.** The runtime stage writes a real
   file beside the declared test and creates that file's directory first, recursively, so a claim
   naming a directory the workspace does not hold still runs. A fresh clone holds no `tmp/probe/`,
   because `tmp` is ignored by version control, and the first claim declaring a test there creates
   it. A directory the host refuses to create — a file already occupies the path, or its parent
   denies writing — reports
   `The runtime stage could not write the generated specification (<reason>)`, where `<reason>` is
   the host's own `mkdir` failure.
4. **A root `tsconfig.json` that resolves at least one input.** The type stage checks the claim's
   test file against the root project, because a test needs the Vitest and Node globals the scoped
   projects remove.
5. **The workspace's `typescript`, `oxlint`, and `vitest` are the same resolved files probe
   resolves.** probe reads each of them from the target workspace's `package.json`, never from its
   own dependencies, and reports the resolved versions on `Verdict.toolchain`. A verdict predicts
   the gate only while probe and the gate read one installed copy of each tool.

Declare `@orkestrel/probe` as a development dependency of the workspace it inspects. Its tools are
optional peers, resolved from that workspace at construction.

## Registering the server

The package installs a `probe` binary and publishes the `prove` Model Context Protocol tool over a
stdio transport. Register the resolved JavaScript entry and run it with the harness's own Node:

```json
{
	"mcpServers": {
		"probe": {
			"command": "node",
			"args": ["node_modules/@orkestrel/probe/dist/bin/main.js"],
			"cwd": "/srv/checkout"
		}
	}
}
```

Register that entry rather than a global install, an `npx` invocation, or the `node_modules/.bin`
shim. The shim is a shell script on POSIX hosts and a batch file on Windows, and spawning the
JavaScript entry with the current executable is the form that survives both.

These facts decide whether a hand-written client works, and each fails silently when it is wrong:

- **The transport is newline-delimited JSON.** One JSON-RPC message per line, terminated by `\n`. A
  client that frames requests with `Content-Length` headers — the way a Language Server Protocol
  client does — gets no reply and no error. That framing is correct for this package's _lint stage_,
  which speaks the Language Server Protocol to Oxlint, and wrong for its _server_. Both live in this
  one package, which is how the mistake gets made.
- **A current-revision request carries reserved `_meta` keys.**
  `io.modelcontextprotocol/protocolVersion` and `io.modelcontextprotocol/clientCapabilities` are
  both required; `io.modelcontextprotocol/clientInfo` is optional and must be a valid identity when
  present. A request carrying the version alone is refused with
  `-32602 Invalid params: malformed modern request metadata`, which reads like a server defect and
  is not. A version the server does not implement is refused differently, with
  `-32022 Unsupported protocol version` and a `data.supported` list; measured on 2026-08-20 that
  list is `2026-07-28`, `2025-11-25`, and `2025-06-18`.

The server answers the handshake era and the current revision together, so a client that sends
`initialize` without `_meta` is served too. `ProbeServer` creates the probe it serves and takes
every `ProbeOptions` member for it, because `start()` seizes this process's standard input and
output: a host that starts one has given the process to it. `destroy()` gives the process back and
tears the probe down with it.

**The advertised schema is wider than the admission rule, at `Source.path`.** The `prove` tool
publishes `compileSchema(CLAIM_SHAPE)` and admits a call with `isClaim`, and the two agree on every
member but `Source.path`: the schema constrains it to a non-empty string, while the guard also
refuses an absolute path and one that traverses out of the workspace. No JSON Schema keyword
expresses that rule, so a claim naming `../../etc/hosts` satisfies the advertised parameters and is
refused. The refusal names the members it read — `The prove tool refuses case.files.0.path: a source
path must stay inside the workspace, which the advertised schema does not constrain` — so a client
that satisfied the schema is told which path to change rather than that its claim was invalid.

## The claim that earns a receipt

This claim earns a receipt in this workspace. Run it verbatim.

```ts
import type { Claim } from '@orkestrel/probe'
import { Probe } from '@orkestrel/probe/server'

const claim: Claim = {
	project: 'configs/src/tsconfig.core.json',
	case: {
		files: [{ path: 'src/core/greeting.ts', text: "export const GREETING = 'hi'\n" }],
		test: {
			path: 'tmp/probe/greeting.test.ts',
			text: "import { expect, test } from 'vitest'\nimport { GREETING } from '../../src/core/greeting.js'\ntest('greets', () => expect(GREETING).toBe('hi'))\n",
		},
	},
	control: {
		files: [{ path: 'src/core/greeting.ts', text: "export const GREETING: number = 'hi'\n" }],
		test: {
			path: 'tmp/probe/greeting.test.ts',
			text: "import { expect, test } from 'vitest'\nimport { GREETING } from '../../src/core/greeting.js'\ntest('greets', () => expect(GREETING).toBe('hi'))\n",
		},
		stage: 'type',
		reason: 'a string literal assigned to a number must not compile',
	},
}

const probe = new Probe({ workspace: process.cwd() })
const verdict = await probe.prove(claim)
verdict.digest // '0806fb30f428edb8ea85adfb4b355441'
verdict.receipt // 'probe:0806fb30f428edb8ea85adfb4b355441:type:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8'
await probe.destroy()
```

These things in it are load-bearing:

- **The candidate file lives under `src/`.** It is checked against `configs/src/tsconfig.core.json`,
  the same scoped project the workspace's own `check:src:core` script runs.
- **The control's candidate text differs from the case's.** A control byte-identical to its case
  cannot break, so it never produces the `origin: 'code'` finding a receipt requires.
- **The test imports the candidate through a relative specifier.** The runtime stage serves the
  candidate's text at the path the claim declared, so `../../src/core/greeting.js` resolves to the
  supplied text rather than to a file on disk.
- **The test imports `test` and `expect` from `vitest`, and asserts.** A bare `test(...)` fails at
  runtime with `test is not defined`, and at a version-controlled path a body that asserts nothing
  adds the lint finding `Test has no assertions`. Both are charged to the claim.

This claim carries no absolute string, so `verdict.digest` is the same in any workspace that runs
it. Change the control's `reason` and the digest changes with it, because the reason is part of the
control the digest covers. The tool versions and the project digest in the receipt are this
workspace's, taken on 2026-08-20.

## Reading a receipt

A receipt is a `:`-separated token whose fields are, in order:

1. `probe`, the value of `RECEIPT_PREFIX`;
2. the claim digest — the case and control the verdict answered, read against this workspace;
3. the stage the control declared and broke at;
4. `typescript@<version>`;
5. `oxlint@<version>`;
6. `vitest@<version>`;
7. `<project path>@<project digest>`.

**Parse the project field as a remainder, not as another split.** A workspace-relative project path
may contain `:` and `@`. Split on `RECEIPT_SEPARATOR`, take fields 0 through 5, rejoin everything
from index 6 with that separator, and read the project digest as everything after that remainder's
final `@`. That rule stays total for a path containing either character.

The call's identity is deliberately absent from the token. It carries no integrity, and it is the
only value that would stop two honest runs of one claim from producing one comparable string.

**Verify a receipt by recomputation, or by re-running the claim.** Recompute it, holding the claim
and the workspace, by reading the digests the verdict carries. Or re-run `prove` over the same claim
and compare the two strings byte for byte: two runs of one claim in one workspace produce one token.

**probe holds no key.** The token is a function of public inputs, so anyone can type a well-formed
receipt. It is a statement of the conditions a verdict was reached under, not an authenticator, and
it is worth exactly what the reader's own recomputation is worth.

**probe executes caller-supplied test code with the host's privileges.** The runtime stage writes
the claim's test to a real file in the target workspace and runs it through the workspace's Vitest.
That code can read and write the checkout, open sockets, and reach the network. A receipt says
nothing about what the test did while earning it. Each specification runs in its own Vitest worker,
so one claim's module state, globals, and environment do not reach the next; nothing about that
worker contains a filesystem write, a loopback bind, or an outbound request.

## What a receipt does not vouch for

`Claim.project` is the one configuration input the caller chooses, which is why the receipt records
its resolved path and the digest of its compiler options. A receipt minted under a permissive
project names that project, so a reader comparing it against the gate's own project refuses it on
sight.

These configurations remain outside the token, and no receipt vouches for them:

- `.oxlintrc.json`, which the lint stage reads;
- `vite.config.ts`, which the runtime stage reads;
- the root `tsconfig.json`, against which the claim's test file is checked.

These are the same files the workspace's own `lint:check`, `test`, and `check` scripts read. A
caller that weakens one has defeated the gate itself, and no receipt vouches for a workspace against
itself.

The project digest also **moves with the TypeScript version**, because the resolved compiler options
carry enum-valued members whose numbering the compiler owns. A compiler upgrade therefore changes
the digest for an unchanged project file. That is contained rather than surprising: the token
already names `typescript@<version>`, so any policy pinning a digest already pins the version.

A further limit belongs beside those:

- **A control need not be a mutation of its case.** `Control` carries its own `files` and `test`, so
  a caller can pair a clean case with unrelated broken code and satisfy every receipt condition. The
  claim digest binds the case and the control together, so a reader who reads the control sees it.

## What the lint stage does not see

**A path the workspace's version-control ignore excludes is a path the lint stage reports nothing
for.** Oxlint's language server honours `.gitignore`, and it does so for text supplied from memory
exactly as it does for a file on disk. The stage reports a clean check, not a skipped one.

This reaches the flagship claim stated earlier: its test lives at `tmp/probe/greeting.test.ts`, and `tmp` is
ignored in this workspace, so the lint stage inspects the candidate `src/core/greeting.ts` and
reports nothing about the test. Measured on 2026-08-20: the same three-line text carrying an unused
binding and a `debugger` statement returns 0 findings at `tmp/probe/lint-ignored.test.ts` and 2
findings at `tests/src/core/lint-tracked.test.ts`.

`.gitignore` alone causes this: `tmp` appears there and in no other ignore file this workspace
carries. Put every candidate source you want linted at a path version control tracks.

## Lifecycle

A probe has no `start`. Warming begins at construction and `prove` awaits it, because the harness
owns the process: a restart is a new process rather than a second lifecycle, and a second client is
a second process with its own resident engines. `ProbeServer.start` is the transport's verb rather
than the probe's — it decides which process reads the stdio, not when the engines warm.

- **Arming.** Construction runs boot controls that mutate an imported dependency and refuse
  service unless the type and runtime stages report the change. The `arm` event fires once those
  controls have reported red and the boot's own files are gone. The controls run at
  `tmp/probe/arm-*.test.ts` against the root `tsconfig.json`, which is why the Vitest project, its
  composition in the root configuration, and a `tmp/probe/` the host lets it create gate the boot
  rather than the first claim.
- **Freshness.** Every `prove` revalidates before it answers. The runtime stage re-reads each
  workspace module and invalidates the ones whose contents moved; the type stage re-reads a file
  whose modification time moved. A warm service that skipped this would return a confident wrong
  answer about freshly edited source.
- **Admission.** One queue per stage admits inspections in arrival order, one at a time. The
  `deadline` covers active work rather than queue wait.
- **Expiry.** `ProbeOptions.deadline` is the coordinator's budget for one active stage inspection,
  and it lives outside the worker because a Vitest `testTimeout` cannot fire while a synchronous
  loop blocks that worker. An expiry at any stage abandons that stage, replaces it before the next
  queued inspection begins, and emits `expire` with the claim that expired. A failed boot is
  replaced the same way: the next claim runs the controls again rather than inheriting a refusal.
- **Revisions.** Each runtime inspection writes its specification at a fresh path and never reuses
  one, because a resident runner asked to re-run a path it has already seen reports a false pass.
  One inspection in every 64 also replaces the resident runner, and that inspection costs more than
  the other 63 — budget `deadline` against that one rather than the common one.
- **Teardown.** `destroy()` releases every resident process and is idempotent. `ProbeServer.destroy`
  adds the process itself: it removes the five listeners `start` attached — three on standard input
  and one on each signal — and pauses the stream unless `start` found it already flowing, so the
  event loop drains and the process exits 0 with no explicit exit call. A stream nobody has read yet
  is neither flowing nor paused, and this server is what sets it flowing, so it is paused. A host
  already reading its own standard input keeps reading it after the server it embedded is destroyed.
- **The server removes only what it added.** Every listener `ProbeServer` attaches is held as a
  field and removed by reference, so a listener a host registers while the server is serving is
  still attached and still fires afterwards. Nothing is chosen by being absent from a capture,
  because a capture cannot tell a listener the server added from one the host added later. The
  transport is what makes that reachable: it reads a stream the server owns rather than this
  process's standard input, so its own listeners never land on `process.stdin` and the only
  listeners the server puts there are the three that forward into that stream. The release-time
  reader count is load-bearing for the same reason — a host that starts reading standard input
  while the server is serving keeps its reader and keeps the flow, even though `start` found the
  stream stopped and would otherwise pause it.
- **Stage teardown is bounded.** A resident stage abandons every inspection it holds rather than
  waiting behind one, and it waits no longer for the tool's own answers. The lint stage bounds both
  exchanges the Language Server Protocol leaves to the server — the `initialize` reply that warming
  waits for and the `shutdown` reply that ending waits for — at 2 s each, then signals the child.
  A server that accepts the connection and answers nothing is therefore released rather than
  deadlocking `destroy()`.
- **Termination.** `ProbeServer.start` answers `SIGINT` and `SIGTERM` by destroying the server, and
  they are the whole set: no evidence names a harness that ends a stdio child any other way, and
  a configurable set would be a supported way to spell the leak this closes. A second signal during
  a teardown already running reaches the default disposition and ends the process at once, because
  teardown releases its handlers before the probe. Measured on 2026-08-20 on the host § Cost names,
  signal to child exit is 2.2 s to 2.3 s during boot and 50 ms to 59 ms against an armed probe, over
  3 runs each. The boot-time figure is the long one because teardown awaits the boot in flight;
  budget a harness's grace window against it rather than against the warm case.
- **The listener race.** Every `createVitest` call installs `SIGINT` and `SIGTERM` handlers that end
  this process about a millisecond after the signal, which is three orders of magnitude inside the
  teardown the preceding **Termination** entry measures. The runtime stage removes the handlers its
  own warm installed, as the call
  returns and before anything is awaited, so no window exists for a signal to arrive in. Without
  that, a graceful teardown reads as fixed, passes a manual test, and still leaves its files in the
  consumer's tree.
- **What a killed host leaves.** A host killed without `destroy` — `SIGKILL`, a power loss, a
  harness that never signals — can leave a generated specification or a boot dependency behind.
  Every file this package writes into a target carries `probe-<pid>-<uuid>` between its stem and its
  extension, and the runtime stage deletes such a file at its next warm when the process id leads a
  process that is gone **and** the file is one this package can attribute. Attribution is what stops
  the sweep reaching your tree: a generated specification carries your own test text, so probe
  appends `// @orkestrel/probe generated specification <pid>-<uuid>` as its last line and the sweep
  requires that marker to name the same revision the file name does; the boot dependencies carry
  text probe authored, at the fixed paths `tmp/probe/arm-type.ts` and `tmp/probe/arm-runtime.ts`, so
  their own path attributes them. A file of yours that happens to carry the same name shape is left
  where it is, wherever it sits, and so is a live neighbour's specification.

## Cost

The measurements below decide whether a harness's timeout is right. Each was taken on 2026-08-20,
over this repository as the target workspace, on Linux 6.18.5 x64 with 4 processors, Node 22.22.2,
TypeScript 6.0.3, Oxlint 1.79.0, and Vitest 4.1.11. Read them as the shape of the cost on comparable
hardware rather than as a figure another host reproduces.

| What                                                                 | Measured                     |
| -------------------------------------------------------------------- | ---------------------------- |
| Boot: spawning `dist/bin/main.js` to the first answered `tools/call` | 4.1 s to 4.4 s over 4 runs   |
| One warm `prove` over the flagship claim, client round trip          | 437 ms to 495 ms over 4 runs |

Boot is dominated by arming, which runs its real controls through every stage before the service
answers. A client whose timeout is tighter than boot reports a hang that is a wait.
Handshake requests answer immediately; only `tools/call` waits on arming.

`prove` runs the case through every stage and then the control through every stage, in sequence, so
one call pays the runtime stage's floor twice. One runtime inspection in every 64 also replaces
the resident Vitest runner and costs more than the other 63, so budget a client timeout against that
inspection rather than the common one.

## Tests

- [`guides.test.ts`](../tests/guides.test.ts) — this guide's parity directions, the claim
  literal shared with the `Claim` contract, what `verdict.digest` covers, and the flagship claim run
  for its receipt.
- [`helpers.test.ts`](../tests/src/core/helpers.test.ts) — the formatters, the receipt token's
  conditions, the generated specification's marker, and the members a refused claim names.
- [`validators.test.ts`](../tests/src/core/validators.test.ts) — every guard against hostile shapes,
  including the source path the advertised schema admits and the guard refuses.
- [`errors.test.ts`](../tests/src/core/errors.test.ts) — the failure guard against lookalikes and a
  second copy of the package, and the sweep that keeps every failure path categorized.
- [`Probe.test.ts`](../tests/src/server/Probe.test.ts) — arming, admission, deadline expiry and
  stage replacement, and the receipt decision end to end.
- [`helpers.test.ts`](../tests/src/server/helpers.test.ts) — the server leaves, including every
  documented example on this page's helper table.
- [`TypeStage.test.ts`](../tests/src/server/stages/TypeStage.test.ts),
  [`LintStage.test.ts`](../tests/src/server/stages/LintStage.test.ts), and
  [`RuntimeStage.test.ts`](../tests/src/server/stages/RuntimeStage.test.ts) — the resident stages
  against their real tools.
- [`ProbeServer.test.ts`](../tests/src/server/ProbeServer.test.ts) — what `start` seizes and what
  `destroy` gives back, standard input's flow included, and what a host attaches while the server is
  serving.
- [`Overlay.test.ts`](../tests/src/server/Overlay.test.ts) — the candidate set's identity,
  containment, and release.
- [`main.test.ts`](../tests/src/bin/main.test.ts) — the shipped entry driven by a foreign client,
  and the signals delivered to it during boot and in service.
- [`distribution.test.ts`](../tests/distribution.test.ts) — the packed package installed outside the
  repository and driven through its public exports.

## See also

- [`README.md`](README.md) — the guides index.
- [`mcp.md`](mcp.md) — the dependency mirror for `@orkestrel/mcp`, whose server and stdio transport
  carry the `prove` tool.
- [`tool.md`](tool.md) — the dependency mirror for `@orkestrel/tool`, whose registry holds it.
- [`contract.md`](contract.md) — the dependency mirror for `@orkestrel/contract`, whose shapes
  compile both the published tool schema and the guards.
- [`AGENTS.md`](../AGENTS.md) — the repository's coding and documentation contract.
