## Findings

Five documented claims that the code contradicts, none of them in M3–L4. All quotes are from `/tmp/claude-0/-home-user-scaffold/75034726-f81c-5f56-9643-b4a6748f097d/scratchpad/snap-938eb04`.

---

### 1. Five `@example` blocks carry a test the runtime stage refuses: `test` is not a runtime global in this workspace

**Claim.** `src/core/types.ts:49`, `:72`, `:96` and `src/core/validators.ts:66`, `:80` all use the same test source:

```
 * 	test: { path: 'tests/src/core/greeting.test.ts', text: 'test("greets", () => {})\n' },
```

and `src/core/types.ts:41-42` states the reason it is expected to work:

```
 * against the project its claim names, and `test` is checked against the root project, because a
 * test needs the Vitest and Node globals the scoped projects remove.
```

**Contradiction.** The root project supplies the Vitest globals *to the type checker only* — `tsconfig.json:8` reads `"types": ["node", "vite/client", "vitest/globals"]` — while no Vitest project in `vite.config.ts` sets `globals: true` (grep for `globals` across the tree returns only `src/core/types.ts:42`, `:90`, `:91`, `configs/policy.ts:144`, and `tsconfig.json:8`). Every one of the repository's own ten test files imports from `'vitest'`, and the probe's own boot control writes `import { expect, test } from 'vitest'` at `src/server/stages/../Probe.ts:129` and `:133`.

Run under this workspace's Vitest 4.1.11 with an `src:core` project mirroring `vite.config.ts:42-48`:

```
 FAIL  |src:core| tests/src/core/greeting.test.ts [ tests/src/core/greeting.test.ts ]
ReferenceError: test is not defined
 ❯ tests/src/core/greeting.test.ts:1:1
      1| test("greets", () => {})
```

The type stage passes this text and the runtime stage kills it, so the `Claim` `@example` at `src/core/types.ts:97-101` can never be clean and can never earn a receipt — a second, independent reason beyond the byte-identical control already known. This is the sibling defect you were looking for, and it is worse than the known one because it also poisons the `Case`, `Control`, `isCase`, and `isControl` examples, which the known defect does not reach.

**Repair.** Prefix every example test text with `import { expect, test } from 'vitest'\n`, matching `Probe.ts:129`.

---

### 2. `Finding` says `line` is absent for a runtime failure; the runtime stage sets it

**Claim.** `src/core/types.ts:118-119`:

```
 * stage, so a second copy could only drift from the first. `line` is absent when the tool
 * reported no line, which happens for a whole-file diagnostic and for a runtime failure.
```

**Contradiction.** `src/server/stages/RuntimeStage.ts:242-243`:

```
			if (!('line' in stack) || typeof stack.line !== 'number') return { path, message }
			return { path, message, line: stack.line }
```

A failed assertion carries a numeric line. Driving the same `createVitest` → `runTestSpecifications` path this stage uses (`RuntimeStage.ts:134-135`) against `expect(1).toBe(2)` on physical line 3 returns:

```
STACKS: [{"method":"","file":".../broken.test.ts","line":3,"column":12}]
```

so `#finding` produces `{ path, message, line: 3 }`. The ordinary runtime failure — a failing assertion — is the case the doc names as the one that never carries a line. No test asserts on `line` in `tests/src/server/stages/RuntimeStage.test.ts` (zero matches for `line`), so nothing guards this.

**Repair.** Replace "for a whole-file diagnostic and for a runtime failure" with "for a whole-file diagnostic and for a runtime failure whose error carries no stack frame".

---

### 3. `computeReceipt` issues a receipt for a control that also failed at stages it did not declare

**Claim.** `src/core/helpers.ts:80-82`:

```
 * A receipt is issued on two conditions together: every stage ran clean on the case, and the
 * control reported at least one finding at the stage it declared. A control that fails somewhere
 * else has falsified the instrument rather than the claim, so no receipt is issued for it.
```

and `src/core/types.ts:65-66`:

```
 * rather than optional. `stage` is the axis the control varies: a control that fails at a stage
 * other than the one it names has falsified the instrument, not the claim.
```

**Contradiction.** `src/core/helpers.ts:100-101` inspects only the declared stage and never rules on the control's other two:

```
	const broke = verdict.control.find((check) => check.stage === stage)
	if (!ran || !clean || broke === undefined || broke.findings.length === 0) return undefined
```

Running `computeReceipt` with the `Verdict` `@example` mutated so the control reports findings at `type` (declared), `lint`, and `runtime` returns `'probe:01J8Z0:type:typescript@6.0.3:oxlint@1.78.0:vitest@4.1.10'` — a receipt for a control that broke at two stages it did not name. The package itself enforces the stricter reading for its own boot control at `src/server/Probe.ts:177-179` (`'The probe boot type control did not remain runtime-clean'`) and applies nothing equivalent to a caller's claim. The doc sentence admits a narrow reading ("fails somewhere else *instead*"), under which the code is right; the `types.ts:65-66` wording does not, and `Probe.ts:177-179` shows which reading the authors act on.

**Repair.** Either add `verdict.control.every((check) => check.stage === stage || check.findings.length === 0)` to the receipt condition, or restate both sentences as "a control whose only failure is at a stage other than the one it names".

---

### 4. `Source.path` is not the path the lint stage resolves the text against, and the substitution changes which rules fire

**Claim.** `src/core/types.ts:30`:

```
	/** Workspace-relative path the stages resolve the text against. */
```

**Contradiction.** `src/server/stages/LintStage.ts:169-177` discards the declared filename and synthesizes a random one, keeping only the first two segments and only when they are `src` or `app`:

```
		const [axis, environment] = declared.split('/')
		const directory =
			(axis === 'src' || axis === 'app') && environment !== undefined && environment !== ''
				? `${axis}/${environment}`
				: 'tests'
		return resolveWorkspaceFile(
			this.#workspace,
			`${directory}/probe-${randomUUID()}${extname(declared)}`,
		)
```

Every candidate outside `src/**` and `app/**` — a root-level config, anything under `tests/` — is linted as `tests/probe-<uuid>.ts`. Running the workspace's own `.oxlintrc.json` over two files with byte-identical content proves the rule set diverges:

```
tests/probe-0d1f.ts:1:8: error import(no-default-export): Prefer named exports
```

`sample.config.ts` reports nothing, because `.oxlintrc.json` override 0 is `{"files":["*.config.ts","*.config.js"],"rules":{"import/no-default-export":"off"}}`. The probe therefore reports a lint finding the gate exempts, which is the exact failure mode `Toolchain`'s `@remarks` (`src/core/types.ts:164-166`) says the design exists to prevent.

**Repair.** Preserve the declared basename in `#file` (`${dirname(declared)}/probe-${randomUUID()}.${basename(declared)}` or equivalent) so the glob-keyed overrides the gate applies also apply here.

---

### 5. `Finding.path` is not what the tool reported, at all three stages

**Claim.** `src/core/types.ts:131`:

```
	/** Workspace-relative path the tool reported against. */
```

**Contradiction.** Every stage substitutes a different path than the one its tool reported.

- `src/server/stages/LintStage.ts:262` maps the URI back to the declared path, so the finding names a file oxlint never saw: `const path = this.#documents.get(uri)` — oxlint reported against `tests/probe-<uuid>.ts` (finding 4).
- `src/server/stages/TypeStage.ts:265-268` substitutes the tsconfig path when the diagnostic has no file: `diagnostic.file === undefined ? project : relativeWorkspaceFile(...)`, so `formatFinding` renders a project file as a source location.
- `src/server/stages/RuntimeStage.ts:240-241` substitutes the declared test path for the revision file Vitest actually reported: `reported === specification ? original : ...`.

The substitutions are the right behavior; the sentence describing them is false, and it is the only doc a consumer reading `Finding` has.

**Repair.** Restate as "Workspace-relative path of the claim's own source, mapped back from whatever path the tool reported".

---

**Checked and not defective** (so the next round does not re-walk them): every `@example` in `src/core/validators.ts` returns the documented boolean (16/16 verified by executing the guards against `@orkestrel/contract@0.0.12`); every `@example` in `src/core/helpers.ts` and `src/core/constants.ts` produces the documented string (`formatFinding`, `formatCheck`, `formatVerdict`, `computeReceipt`, `RECEIPT_SEPARATOR` split length 6); `isClaim`'s equivalence claim at `src/core/validators.ts:189-190` holds against `compileGuard(CLAIM_SHAPE)` on 15 probes including unknown keys, empty strings, inherited members, and `undefined`-valued extras; `compileSchema(CLAIM_SHAPE).type` is `'object'` as `src/core/shapers.ts:76` states; and `ProbeServerInterface` at `src/server/types.ts:71-84` matches `createStdioServer`'s declared `{ start(): void; stop(): void }` and its newline-delimited JSON framing.