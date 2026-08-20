# PBRESTORE — restore the six error routings a verifier reverted

## Role and engine

`builder`, Sonnet. Fully specified mechanical restoration, no design judgment.

## Objective

Restore `src/server/helpers.ts` in `/workspace/probe` to the state the PBCANON unit left it in:
six `throw new Error(...)` expressions routed through `ProbeError`, and `ProbeError` imported
from `@src/core`.

## Context

A `verifier` ran `git checkout -- src/server/helpers.ts` inside the probe checkout to undo a
planted line. That file carried uncommitted PBCANON edits, so the checkout discarded them. Every
other PBCANON file is intact. The exact lost text is recoverable from `dist/src/server/index.js`,
which was built from the correct source before the revert; the restoration text is quoted in full
in this brief, so you do not need to read `dist/`.

Read before acting: `/workspace/probe/AGENTS.md`, `.claude/rules/typescript.md`,
`.claude/rules/architecture.md`. No skill applies. The governing guide is `guides/probe.md`; it
is already correct and off-limits.

`ProbeError` is declared in `src/core/errors.ts` with the signature
`new ProbeError(message: string, options: { readonly code: ProbeErrorCode; readonly context?: Readonly<Record<string, unknown>>; readonly cause?: unknown })`.
Sibling files import it as `import { ProbeError } from '@src/core'` (see `src/server/ProbeServer.ts:7`,
`src/server/stages/LintStage.ts:8`).

Host: Linux container, bash, network available, `/workspace/probe` is a git checkout with many
uncommitted files. Expect `git status` to be dirty; that is correct and not a deviation.

## Unknowns

None. Every replacement is quoted verbatim.

## Scope

Owned file, the only file you may write: `/workspace/probe/src/server/helpers.ts`.

Off-limits, do not read for guidance and do not write: every other file in the repository,
including `guides/probe.md`, `tests/`, and `dist/`.

Never run `git checkout`, `git restore`, `git stash`, `git reset`, or any other command that
discards a working-tree change. The tree carries uncommitted work that has no other copy.

Tools: Read, Edit, Bash for validation only.

## Execution

Perform this assignment yourself. Spawn nothing.

## The six replacements

Each block below gives the current text and its replacement. Match the current text exactly,
including its tab indentation, and preserve the surrounding lines.

### 1 — around line 53, in `resolveWorkspaceFile`

Current:

```ts
	if (path === '' || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
		throw new Error(`Path escapes the workspace: ${target}`)
	}
```

Replacement:

```ts
	if (path === '' || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
		throw new ProbeError(`Path escapes the workspace: ${target}`, {
			code: 'invalid',
			context: { path: target },
		})
	}
```

### 2 — around line 136

Current statement:

```ts
throw new Error(`${name} does not publish a readable manifest`)
```

Replacement:

```ts
throw new ProbeError(`${name} does not publish a readable manifest`, {
	code: 'workspace',
	context: { name, path },
})
```

### 3 — around line 161

Current statement:

```ts
throw new Error(`${name} does not publish a bin field`)
```

Replacement:

```ts
throw new ProbeError(`${name} does not publish a bin field`, {
	code: 'workspace',
	context: { name },
})
```

### 4 — around line 165

Current statement:

```ts
throw new Error(`${name} does not publish the ${name} binary`)
```

Replacement:

```ts
throw new ProbeError(`${name} does not publish the ${name} binary`, {
	code: 'workspace',
	context: { name },
})
```

### 5 — around line 169

Current statement:

```ts
throw new Error(`${name} publishes an invalid ${name} binary`)
```

Replacement:

```ts
throw new ProbeError(`${name} publishes an invalid ${name} binary`, {
	code: 'workspace',
	context: { name, value: entry },
})
```

### 6 — around line 191

Current statement:

```ts
throw new Error(`Cannot infer a scoped TypeScript project for ${path}`)
```

Replacement:

```ts
throw new ProbeError(`Cannot infer a scoped TypeScript project for ${path}`, {
	code: 'invalid',
	context: { path },
})
```

Every one of the six sits inside a braced `if (...) { ... }` block. Keep that block and replace
only the `throw` statement inside it. The statements quoted for replacements 2 through 6 are unique
in the file, so match them as written and keep their leading tabs.

## The import

Add `ProbeError` to a value import from `@src/core`. The file has no `@src/core` import today, so
add one line:

```ts
import { ProbeError } from '@src/core'
```

Place it with the other value imports and let `npm run format` settle the ordering.

## Deviation contract

Stop and report — expected, found, exact evidence, done or not done, one hypothesis at most — if
any of the six current statements is not present as quoted, or if `ProbeError` is not exported
from `@src/core`. Do not investigate, do not improvise a different code or context, and do not
touch another file.

Where the formatter rewraps your replacement differently than the brief shows, accept the
formatter's output and carry on; that is not a deviation.

## Acceptance criteria

Run these in order and report each bare exit code.

1. `grep -c "throw new Error(" src/server/helpers.ts` reports `0`.
2. `grep -c "new ProbeError(" src/server/helpers.ts` reports `6`.
3. `npm run format` then `npm run format:check` exits 0.
4. `npm run lint:check` exits 0.
5. `npm run check` exits 0.
6. `npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:server` exits 0.
   This project spawns real child processes and is timing-sensitive under load. Where it fails on a
   timeout or a deadline rather than an assertion, re-run that one file alone once, report both
   readings labelled, and treat it as an observation rather than a stop; the Orchestrator takes the
   deciding reading after you exit. Where it fails on an assertion, stop and report.
7. `npm run test:guides` exits 0.

Report criterion 6's and 7's test counts as the runner printed them. Do not run the whole suite
or the distribution project; the Orchestrator takes those readings.

## Output

A short report: each criterion with its bare exit code and evidence line, the final content of the
import line you added, and anything you could not close. No process diary.
