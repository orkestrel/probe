# PB-E1 report

The core ownership axis is implemented. `Origin` now names who must act, while `ProbeErrorCode`
names the condition that ended an operation. The scoped core contract, implementation, and tests
pass. The off-limits guide-parity assertion prevents the repository-wide legacy-name and lint
criteria from closing in this unit.

## Files touched

- `src/core/constants.ts` — replaced `FINDING_ORIGINS` with the derived `ORIGINS` tuple and replaced
  the ownership-shaped error values with `refused`, `missing`, `malformed`, `destroyed`, and
  `deadline`.
- `src/core/types.ts` — replaced `FindingOrigin` with `Origin`, applied it to `Finding`, required
  `origin` and `code` on `ProbeErrorOptions`, and documented the claimant-finding invariant.
- `src/core/errors.ts` — added `ProbeError.origin`, assigned both axes at construction, validated
  both axes in `isProbeError`, and made `createDestroyedError` return claimant-owned destruction.
- `src/core/validators.ts` — derived `isOrigin` from `ORIGINS` and aligned finding examples with the
  claimant vocabulary.
- `src/core/helpers.ts` — made claimant findings decide the case and control receipt predicates,
  preserved explicit instrument rejection in both phases, and left workspace messages outside the
  claimant-failure decision.
- `tests/src/core/errors.test.ts` — migrated error construction and added undeclared-origin guard
  coverage.
- `tests/src/core/helpers.test.ts` — migrated finding fixtures, added workspace-origin receipt
  coverage, and pinned instrument rejection in both phases.
- `tests/src/core/validators.test.ts` — migrated finding fixtures and pinned every declared origin.
- `tmp/codex/pbe1-report.md` — records this unit's evidence and documentation handoff.

`src/core/shapers.ts` required no change because no claim wire shape carries a finding or a probe
error.

## Permanent tests

- `refuses a branded error carrying an undeclared origin` mutates a genuine branded `ProbeError`
  to an undeclared origin and proves that `isProbeError` refuses it.
- `permits workspace messages outside the claimant failure` places workspace findings in the case
  and an undeclared control stage and proves that the claimant predicates still mint the receipt.
- `refuses a receipt when either phase reports an instrument fault` places an instrument finding in
  the case and in the control and proves that neither verdict mints a receipt.
- Existing formatter, validator, error-code, and receipt tests use `claimant`, `workspace`, and
  `instrument`, so the renamed public vocabulary remains exercised through the core barrel.

The scoped core project produced this red proof before the behavioral fix:

```text
npx vitest run --config vite.config.ts --project src:core
exit 1
Test Files  2 failed | 1 passed (3)
Tests       8 failed | 21 passed (29)
```

The same command is green in the final evidence under the acceptance criteria.

## Acceptance criteria

### Legacy ownership names

```text
rg -n 'FINDING_ORIGINS|FindingOrigin' src/ tests/
exit 0
tests/guides.test.ts:332: expect(core.FINDING_ORIGINS).toStrictEqual(['code', 'instrument'])
matches 1
```

Not closed. `tests/guides.test.ts` is off-limits to this unit. No owned source or core test retains
either legacy name.

### Error conditions

```text
rg -n "'invalid'|'workspace'|'instrument'" src/core/constants.ts
exit 0
26: * ORIGINS // ['claimant', 'workspace', 'instrument']
29:export const ORIGINS = Object.freeze(['claimant', 'workspace', 'instrument'] as const)
matches 2
PROBE_ERROR_CODES matches 0
```

Closed. Both matches belong to `ORIGINS`; none belongs to `PROBE_ERROR_CODES`.

### Error ownership and guard

```text
npm run check:src:core
exit 0
TypeScript errors 0

npx vitest run --config vite.config.ts --project src:core
exit 0
Test Files  3 passed (3)
Tests       29 passed (29)
```

Closed. `ProbeErrorOptions` requires `origin` and `code`. The permanent branded-error test proves
that an undeclared origin remains outside `isProbeError`.

### Receipt ownership predicates

```text
rg -n "origin === 'claimant'|origin !== 'claimant'|origin === 'instrument'" src/core/helpers.ts
exit 0
147: finding.origin !== 'claimant'
150: finding.origin === 'claimant'
153: finding.origin === 'instrument'
156: finding.origin === 'instrument'
160: finding.origin !== 'claimant'
matches 5

npx vitest run --config vite.config.ts --project src:core
exit 0
Test Files  3 passed (3)
Tests       29 passed (29)
```

Closed. Workspace messages do not count as claimant failures. Instrument messages still refuse a
receipt in either phase.

### Repository lint

```text
npm run lint:check
exit 1
errors 1
tests/guides.test.ts:332:15: error import(namespace): "FINDING_ORIGINS" not found in imported namespace "@src/core".
```

Not closed. The only reported lint error is the off-limits guide-parity assertion.

The owned-file lint proof passes:

```text
npx oxlint --config .oxlintrc.json --deny-warnings src/core/constants.ts src/core/types.ts src/core/errors.ts src/core/validators.ts src/core/helpers.ts tests/src/core/errors.test.ts tests/src/core/helpers.test.ts tests/src/core/validators.test.ts
exit 0
errors 0
warnings 0
```

### Core typecheck

```text
npm run check:src:core
exit 0
TypeScript errors 0
```

Closed.

### Core tests

```text
npx vitest run --config vite.config.ts --project src:core
exit 0
Test Files  3 passed (3)
Tests       29 passed (29)
```

Closed.

## Observations

The expected tree-wide typecheck remains red for the server migration and guide parity:

```text
npm run check
exit 2
```

The following failure paths pass to the next unit:

- `src/server/Probe.ts`
- `src/server/ProbeServer.ts`
- `src/server/helpers.ts`
- `src/server/stages/LintStage.ts`
- `src/server/stages/RuntimeStage.ts`
- `src/server/stages/TypeStage.ts`
- `tests/guides.test.ts`
- `tests/src/server/stages/LintStage.test.ts`
- `tests/src/server/stages/TypeStage.test.ts`

The server failures use old error conditions, omit required origins, or still produce `code`
findings. The guide-parity failure still reads the removed constant.

## Guide replacement text

Replace the affected rows under `### Contracts` with this text:

```md
| `Origin`            | type      | `'claimant' \| 'workspace' \| 'instrument'` — the party that must act on a finding or probe failure.                                           |
| `Finding`           | interface | `{ origin, path, message, line? }` — one message a stage reported and the party that must act on it. `line` is absent when the tool reported none. |
| `ProbeErrorCode`    | type      | `'refused' \| 'missing' \| 'malformed' \| 'destroyed' \| 'deadline'` — the condition that ended an operation.                                |
| `ProbeErrorOptions` | interface | `{ origin, code, context?, cause? }` — the construction input for a `ProbeError`; both classification axes are required.                        |
```

Replace the affected rows under `### Constants` with this text:

```md
| `ORIGINS`           | const | `['claimant', 'workspace', 'instrument']` — the parties that can own action on a finding or failure.                    |
| `PROBE_ERROR_CODES` | const | `['refused', 'missing', 'malformed', 'destroyed', 'deadline']` — the operation-ending conditions the guard admits.     |
```

Replace the affected rows under `### Errors` with this text:

```md
| `ProbeError`           | class    | `new (message: string, options: ProbeErrorOptions)` | Reports one failure under an `origin` and `code` a caller can branch on, with optional `context` and `cause`. |
| `isProbeError`         | function | `(value: unknown) => value is ProbeError`           | Admits this package's own failure, across duplicate installations and both module formats, only when both axes carry declared values. |
| `createDestroyedError` | function | `(subject: string) => ProbeError`                   | Creates a claimant-owned `destroyed` failure for a torn-down subject. |
```

Replace the `isOrigin` row under `### Validators` with this text:

```md
| `isOrigin` | function | `(value: unknown) => value is Origin` | Admits `'claimant'`, `'workspace'`, or `'instrument'`. |
```

Replace the receipt-condition block under `## What a probe proves` with this text:

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

Replace `## Failures` through the paragraph before its example with this text:

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

Replace the failure example with this text:

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

Replace the load-bearing control sentence under `## The claim that earns a receipt` with this text:

```md
- **The control's candidate text differs from the case's.** A control byte-identical to its case
  cannot break, so it never produces the `origin: 'claimant'` finding a receipt requires.
```

## README replacement text

No replacement text is required in `README.md`. It does not name the finding-origin type, origin
tuple, error conditions, or `ProbeErrorOptions` shape.

## Unclosed work

- The broad legacy-name search remains non-empty at `tests/guides.test.ts:332`, which this unit may
  not edit.
- `npm run lint:check` remains red only at that off-limits assertion.
- The server and server-test type errors remain for the next unit, as required by the brief.