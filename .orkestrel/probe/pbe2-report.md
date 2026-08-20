# PB-E2 report

The server ownership migration is complete. The tree typechecks, the focused migration proofs pass,
the core suite still passes, and the only broad server failures are the documented host-dependent
sandbox readings.

## Files touched

- `src/server/types.ts` — added the readonly stage `progress` evidence used for deadline ownership.
- `src/server/Probe.ts` — migrated coordinator failures to the ownership and condition axes, wrapped
  boot faults, classified workspace-version failures, and attributed active-stage deadlines from a
  pre-inspection progress snapshot.
- `src/server/ProbeServer.ts` — classified claim refusal as claimant-owned and server schema or
  verdict faults as instrument-owned malformed failures.
- `src/server/helpers.ts` — migrated containment and project-inference failures, translated module
  resolution, module loading, manifest reads, and manifest parsing into `ProbeError`, retained native
  causes, and classified manifest and binary failures.
- `src/server/stages/TypeStage.ts` — migrated diagnostics and project parsing, exposed progress at
  cooperative boundaries, and split fileless project diagnostics by caller-selected versus inferred
  project ownership.
- `src/server/stages/LintStage.ts` — migrated diagnostics and stage faults, classified teardown
  expiry, and exposed progress when the active document receives diagnostics.
- `src/server/stages/RuntimeStage.ts` — migrated runtime findings, made unmapped or absent project
  selection throw claimant-owned missing failures, retained string-declared project faults as
  workspace findings, and exposed progress after a runner result.
- `tests/src/server/helpers.test.ts` — pinned translated module and manifest failures, their ownership,
  condition, branding, context, and native cause.
- `tests/src/server/stages/TypeStage.test.ts` — migrated ownership assertions, pinned translated tool
  loading, and added caller-selected versus inferred fileless-diagnostic coverage.
- `tests/src/server/stages/LintStage.test.ts` — migrated candidate diagnostics and stage-fault
  assertions.
- `tests/src/server/stages/RuntimeStage.test.ts` — migrated findings, pinned translated tool loading,
  changed unmapped and absent project selection to thrown failures, and pinned the workspace finding
  for a string-declared project.
- `tests/src/server/Probe.test.ts` — migrated coordinator expectations and drove instrument-owned and
  claimant-owned deadline paths through the real probe.
- `tests/guides.test.ts` — changed only the legacy constant assertion to `ORIGINS` and its current
  values.
- `tmp/codex/pbe2-report.md` — records this implementation evidence and documentation handoff.

No file under `src/core/`, `src/bin/`, `tests/src/core/`, or `tests/src/bin/` changed.

## Native-call-site sweep

The sweep command was:

```text
rg -n "readFileSync|writeFileSync|mkdirSync|JSON\\.parse|createRequire|require\\(" src/server
exit 0
```

- `src/server/helpers.ts:resolveWorkspaceModule` places `createRequire` and `require.resolve` inside
  `attempt`. `MODULE_NOT_FOUND` becomes `workspace/missing`; another native fault becomes
  `workspace/malformed`; the native value is `cause`.
- `src/server/helpers.ts:loadWorkspaceModule` places `createRequire` and `require` inside `attempt`.
  It applies the same missing-versus-malformed rule and retains the native value as `cause`.
- `src/server/helpers.ts:readWorkspaceManifest` places `readFileSync` inside `attempt`. `ENOENT` and
  `ENOTDIR` become `workspace/missing`; another read fault becomes `workspace/malformed`; the native
  value is `cause`.
- `src/server/helpers.ts:readWorkspaceManifest` places `JSON.parse` inside `attempt`. A parse fault
  becomes `workspace/malformed` and remains available as `cause`.
- `src/server/Probe.ts:#boot` runs `mkdirSync` and each `writeFileSync` inside its boot `try`. The
  public arming boundary translates an escaping native fault to `instrument/malformed` and retains
  it as `cause`; cleanup remains in the boot `finally`.
- `src/server/stages/LintStage.ts:#frame` runs `JSON.parse` inside a `try`. Its catch routes the native
  fault through the resident-stage failure channel as `instrument/malformed` with `cause`.
- `src/server/stages/RuntimeStage.ts:#specification` runs `mkdirSync` and `writeFileSync` inside
  `attempt`. Failure becomes an instrument finding because the stage returns a `Check` at that
  boundary and raises no native value.
- `src/server/stages/RuntimeStage.ts:#snapshot` runs `readFileSync` inside a deliberate `try`. An
  unreadable workspace module is omitted from the invalidation snapshot; it is not represented as a
  successful read.
- `src/server/stages/RuntimeStage.ts:#owned` runs `readFileSync` inside `attempt`. Failure returns
  `false`, preventing cleanup from claiming ownership of unreadable content.

No listed native call remains outside a translated boundary or a deliberate `try`.

## Deadline attribution

`StageInterface.progress` is monotonic for the life of a resident stage. `Probe` snapshots it before
starting the active inspection. A deadline reads `claimant` when the value advanced under that
inspection and `instrument` when it did not.

`TypeStage` advances at its cooperative event-loop boundary after diagnostic work. `LintStage`
advances when the active document receives a diagnostic publication. `RuntimeStage` advances after
Vitest returns a run result. The synchronous-loop runtime path therefore stays instrument-owned,
while the heavy type path advances before expiry and becomes claimant-owned.

No exercised deadline path lacks honest attribution under this rule.

## Red-then-green readings

### Translated manifest failure

Before implementation:

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/helpers.test.ts -t 'reads installed manifests and refuses absent packages'
exit 1
Test Files  1 failed (1)
Tests       1 failed | 25 skipped (26)
isProbeError(absent): expected true, received false
```

After implementation:

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/helpers.test.ts -t 'reads installed manifests and refuses absent packages'
exit 0
Test Files  1 passed (1)
Tests       1 passed | 25 skipped (26)
```

### Unmapped runtime project

Before implementation:

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/RuntimeStage.test.ts -t 'reports a finding for a test path outside every real Vitest project'
exit 1
Test Files  1 failed (1)
Tests       1 failed | 32 skipped (33)
Expected rejection; the inspection resolved with an instrument finding.
```

After implementation:

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/RuntimeStage.test.ts -t 'refuses a test path outside every configured Vitest project'
exit 0
Test Files  1 passed (1)
Tests       1 passed | 32 skipped (33)
```

### Fileless TypeScript diagnostic

Before implementation:

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/TypeStage.test.ts -t 'splits a fileless project diagnostic by who selected the project'
exit 1
Test Files  1 failed (1)
Tests       1 failed | 17 skipped (18)
The caller-selected project resolved without the required claimant refusal.
```

After implementation:

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/TypeStage.test.ts -t 'splits a fileless project diagnostic by who selected the project'
exit 0
Test Files  1 passed (1)
Tests       1 passed | 17 skipped (18)
```

### Instrument-owned deadline

Before implementation:

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/Probe.test.ts -t 'expires only the active inspection, cleans its revision, and serves a queued claim'
exit 1
Test Files  1 failed (1)
Tests       1 failed | 19 skipped (20)
Expected origin instrument; received no origin.
```

After implementation:

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/Probe.test.ts -t 'expires only the active inspection, cleans its revision, and serves a queued claim'
exit 0
Test Files  1 passed (1)
Tests       1 passed | 19 skipped (20)
```

### Claimant-owned deadline

Before implementation:

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/Probe.test.ts -t 'replaces a type stage its deadline destroyed'
exit 1
Test Files  1 failed (1)
Tests       1 failed | 19 skipped (20)
Expected origin claimant; received no origin.
```

After implementation:

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/Probe.test.ts -t 'replaces a type stage its deadline destroyed'
exit 0
Test Files  1 passed (1)
Tests       1 passed | 19 skipped (20)
```

## Acceptance criteria

### Legacy ownership names

```text
rg -n 'FINDING_ORIGINS|FindingOrigin' src/ tests/
exit 1
matches 0
```

Closed. The command's nonzero status is ripgrep's no-match result.

### Repository lint

```text
npm run lint:check
exit 0
errors 0
warnings 0
```

Closed.

### Repository typecheck

```text
npm run check
exit 0
TypeScript errors 0
```

Closed.

### Manifest failure contract

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/helpers.test.ts -t 'reads installed manifests and refuses absent packages'
exit 0
Test Files  1 passed (1)
Tests       1 passed | 25 skipped (26)
```

Closed. The permanent test requires `isProbeError`, `workspace/missing`, the package context, and a
native `Error` on `cause`.

### Runtime project refusal

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/RuntimeStage.test.ts -t 'refuses a test path outside every configured Vitest project'
exit 0
Test Files  1 passed (1)
Tests       1 passed | 32 skipped (33)
```

Closed. The permanent test requires a thrown `claimant/missing` failure carrying the runtime stage
and caller path.

### Deadline ownership

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/Probe.test.ts -t 'expires only the active inspection, cleans its revision, and serves a queued claim'
exit 0
Test Files  1 passed (1)
Tests       1 passed | 19 skipped (20)

npx vitest run --config vite.config.ts --project src:server tests/src/server/Probe.test.ts -t 'replaces a type stage its deadline destroyed'
exit 0
Test Files  1 passed (1)
Tests       1 passed | 19 skipped (20)
```

Closed. The real runtime path requires `instrument/deadline`; the real type path requires
`claimant/deadline`.

### Fileless diagnostic ownership

```text
npx vitest run --config vite.config.ts --project src:server tests/src/server/stages/TypeStage.test.ts -t 'splits a fileless project diagnostic by who selected the project'
exit 0
Test Files  1 passed (1)
Tests       1 passed | 17 skipped (18)
```

Closed. The caller-named project throws `claimant/refused`; inference reports an instrument finding
at the project path.

### Core regression

```text
npx vitest run --config vite.config.ts --project src:core
exit 0
Test Files  3 passed (3)
Tests       29 passed (29)
```

Closed. No core file changed.

### Formatting

```text
npm run format:check
exit 0
files checked 148
format errors 0
```

Closed.

## Observations

The broad server project is not an acceptance criterion in this sandbox. Run this exact command on
the host:

```text
npx vitest run --config vite.config.ts --project src:server
exit 1
Test Files  3 failed | 4 passed (7)
Tests       16 failed | 113 passed (129)
```

The failed files were `tests/src/server/stages/LintStage.test.ts`,
`tests/src/server/Probe.test.ts`, and `tests/src/server/ProbeServer.test.ts`. Their readings were
Oxlint child lifecycle timeouts, coordinator paths that depend on that child, the denied nested
process receipt, and standard-input delivery under the harness. The remaining server files passed.
No workaround was attempted.

## Guide replacement text

Apply these exact replacements to `guides/probe.md`.

Replace the affected rows under `### Contracts` with:

```md
| `Origin`            | type      | `'claimant' \| 'workspace' \| 'instrument'` — the party that must act on a finding or probe failure.                                           |
| `Finding`           | interface | `{ origin, path, message, line? }` — one message a stage reported and the party that must act on it. `line` is absent when the tool reported none. |
| `ProbeErrorCode`    | type      | `'refused' \| 'missing' \| 'malformed' \| 'destroyed' \| 'deadline'` — the condition that ended an operation.                                |
| `ProbeErrorOptions` | interface | `{ origin, code, context?, cause? }` — the construction input for a `ProbeError`; both classification axes are required.                        |
```

Replace the affected rows under `### Constants` with:

```md
| `ORIGINS`           | const | `['claimant', 'workspace', 'instrument']` — the parties that can own action on a finding or failure.                    |
| `PROBE_ERROR_CODES` | const | `['refused', 'missing', 'malformed', 'destroyed', 'deadline']` — the operation-ending conditions the guard admits.     |
```

Replace the affected rows under `### Errors` with:

```md
| `ProbeError`           | class    | `new (message: string, options: ProbeErrorOptions)` | Reports one failure under an `origin` and `code` a caller can branch on, with optional `context` and `cause`. |
| `isProbeError`         | function | `(value: unknown) => value is ProbeError`           | Admits this package's own failure, across duplicate installations and both module formats, only when both axes carry declared values. |
| `createDestroyedError` | function | `(subject: string) => ProbeError`                   | Creates a claimant-owned `destroyed` failure for a torn-down subject. |
```

Replace the `isOrigin` row under `### Validators` with:

```md
| `isOrigin` | function | `(value: unknown) => value is Origin` | Admits `'claimant'`, `'workspace'`, or `'instrument'`. |
```

Replace the `StageInterface` row under `### Server contracts` with:

```md
| `StageInterface` | interface | The resident-stage contract; its readonly `stage` names the inspection and its readonly `progress` advances when active work reports progress. See [`## Methods`](#methods). |
```

Replace the affected helper rows under `### Server helpers` with:

```md
| `resolveWorkspaceModule` | function | `(workspace: string, specifier: string) => string`                                          | Resolves one installed module's entry path, or throws a workspace-owned `missing` or `malformed` `ProbeError` with the native fault as `cause`. |
| `loadWorkspaceModule`    | function | `(workspace: string, specifier: 'typescript' \| 'vitest/node') => typeof import(specifier)` | Loads one installed tool module, or throws a workspace-owned `missing` or `malformed` `ProbeError` with the native fault as `cause`.            |
| `readWorkspaceManifest`  | function | `(workspace: string, name: string) => WorkspaceManifest`                                    | Reads one installed package manifest and path, translating native read and parse faults to workspace-owned `ProbeError` values with `cause`.   |
```

Replace the `TypeStageInterface.inspect` row under `## Methods` with:

```md
| `inspect` | `Promise<Check>` | Inspects one case against a caller-named project, or against the project each candidate path infers. A fileless project diagnostic refuses a caller-named selection and reports an instrument finding for an inferred selection. |
```

Replace the receipt-condition block under `## What a probe proves` with:

```md
The receipt is issued on these conditions together:

- both phases report one check per stage; and
- the case reports no `origin: 'claimant'` finding; and
- the control reports at least one `origin: 'claimant'` finding at the stage it declared; and
- every other control stage reports no `origin: 'claimant'` finding; and
- neither phase reports an `origin: 'instrument'` finding.

A `workspace` finding does not decide whether the claimant's candidate broke. An `instrument`
finding means the inspection did not complete, so no receipt is issued in either phase. A control
that also reports a claimant finding at another stage has falsified the instrument rather than the
claim.

`Finding.origin` names the party that must act. A `claimant` finding is a tool's diagnostic about a
candidate source, and nothing else. Every other claimant fault is a throw. `workspace` names the
target tree probe borrows. `instrument` names this package. `formatFinding` renders the value first
as `[claimant]`, `[workspace]`, or `[instrument]`, so the ownership survives `formatVerdict`.
```

Replace `## Failures` through the paragraph before its example with:

```md
## Failures

Every failure this package raises is a `ProbeError`. Narrow a caught value with `isProbeError`,
then branch on `origin` and `code`; read `message` to print it and `context` for the detail behind
it. The axes are independent: `origin` names who must act, while `code` names the condition that
ended the operation.

| Origin       | Who acts                         |
| ------------ | -------------------------------- |
| `claimant`   | The caller who wrote the claim.  |
| `workspace`  | The target tree probe borrows.   |
| `instrument` | This package.                    |

| Code        | Repair                                                                                  |
| ----------- | --------------------------------------------------------------------------------------- |
| `refused`   | Change the value that a guard or containment rule rejected before work started.       |
| `missing`   | Create or install the named thing.                                                     |
| `malformed` | Repair the value that exists but does not match the contract it is read against.       |
| `destroyed` | Build a replacement for the torn-down subject.                                        |
| `deadline`  | Use `origin` to decide whether to raise the budget, shrink the claim, or file a bug.   |
```

Replace the failure example with:

```ts
import { isProbeError } from '@orkestrel/probe'

try {
	await probe.prove(claim)
} catch (error) {
	if (
		isProbeError(error) &&
		error.origin === 'claimant' &&
		error.code === 'deadline'
	) {
		console.log(error.context?.stage, error.context?.deadline)
	}
}
```

Replace the first Vitest prerequisite paragraph with:

```md
**A Vitest project whose name the test's path infers.** A test under `tmp/probe/` names the `probe`
project, and a test under `tests/src/<environment>/` names `src:<environment>`. Any other path is
refused with `origin: 'claimant'`, `code: 'missing'`, and the caller's path in context. A path that
infers a name absent from the configuration is refused the same way.
```

Replace the string-declared project prerequisite paragraph with:

```md
**That project is composed in the root configuration, not declared as a path string.** The runtime
stage installs its overlay plugin into each composed project so candidate sources resolve from
memory. A project named by a path carries no plugin, and its check reports an `origin: 'workspace'`
finding: `The runtime stage cannot instrument the string-declared Vitest project <name> because its
configuration carries no runtime overlay plugin`.
```

Replace the `Expiry` lifecycle item with:

```md
- **Expiry.** `ProbeOptions.deadline` is the coordinator's budget for active stage work. The probe
  snapshots the stage's monotonic progress before inspection. A stage that advances progress under
  that inspection raises `origin: 'claimant', code: 'deadline'`; a stage that reports no progress
  raises `origin: 'instrument', code: 'deadline'`. Either expiry abandons and replaces that stage
  before queued work begins, and emits `expire` with the claim. A failed boot is replaced the same
  way, so the next claim runs the controls again.
```

Replace the load-bearing control sentence under `## The claim that earns a receipt` with:

```md
- **The control's candidate text differs from the case's.** A control byte-identical to its case
  cannot break, so it never produces the `origin: 'claimant'` finding a receipt requires.
```

## README replacement text

No replacement text is required in `README.md`. It does not name the ownership type, origin tuple,
error conditions, `ProbeErrorOptions` shape, stage progress, or the repaired server failure paths.

## Unclosed work

The host must run the exact broad server command recorded under **Observations**. No implementation,
typecheck, lint, formatting, focused proof, core regression, native-call ruling, or documentation
handoff remains open in this unit.