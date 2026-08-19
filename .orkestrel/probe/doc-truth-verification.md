# Doc-truth findings — independent verification

Nine claims, one blind lane each, refutation posture, against a pristine snapshot of the committed
tree. One was refuted outright, two reproduced as written, and six reproduced with corrections.

| Claim | Verdict | Subject |
| ----- | ------- | ------- |
| M3 | **PARTLY-REPRODUCED** | `Control.reason` required, validated at three layers, read by nothing |
| M4 | **PARTLY-REPRODUCED** | `CLAIM_SHAPE` documents a derivation that does not exist |
| M5 | **PARTLY-REPRODUCED** | `inferTestProject` `@returns` says `undefined` selects the root project |
| M6 | **REFUTED** | TypeStage `@remarks` describes the wrong project selection |
| M7 | **REPRODUCED** | `ProbeInterface`/`ProbeOptions` describe an mtime-keyed revalidation |
| M8 | **PARTLY-REPRODUCED** | `StageInterface.destroy` states a guarantee the coordinator refuses to trust |
| L2 | **PARTLY-REPRODUCED** | `Verdict.id` documented as the revision identity |
| L3 | **REPRODUCED** | The `Verdict` `@example` reports an impossible `elapsed` |
| L4 | **PARTLY-REPRODUCED** | The `expire` event doc claims a recycle that has not happened |

## Verdicts in full

### M3 — PARTLY-REPRODUCED

**Correction.**

Every conjunct of M3 holds and I could not break any of them. Two corrections, one narrowing and one widening.

Narrowing — "validated at three layers" overstates layer 3. Three sites *declare* `reason` required, but only two bite in this process: the TypeScript declaration at compile time and `isControl`/`isClaim` at `src/server/factories.ts:65`. `CONTROL_SHAPE` is compiled to the tool's published `inputSchema` (`src/server/factories.ts:54`) and neither `@orkestrel/tool`'s `ToolManager` nor `@orkestrel/mcp`'s `tools/call` handler validates arguments against it. Layer 3 is a contract advertised to the client, enforced only by a client that chooses to.

Widening — the defect is worse than "read by nothing" conveys, in three checkable ways.

First, `reason` is the *only* dead member of the arriving `Claim`. Every other member has a consumer: `claim.project` at `src/server/Probe.ts:205`, `case.files`/`case.test` and `control.files`/`control.test` in all three stages, and `control.stage` at `src/server/Probe.ts:101`. The contract is otherwise fully consumed, so this is one dead member rather than a pattern of loose fields.

Second, all three layers only require length ≥ 1 (`isNonEmptyString`, `stringShape({ min: 1 })`), so `reason: 'x'` satisfies every one of them. The validation cannot check the thing the field exists for, which makes "validated at three layers" read as rigour where there is none.

Third, the package pays its own tax: `src/server/Probe.ts:142` and `:152` invent two reason strings for internal boot claims that never cross the wire and that nothing reads. The requirement therefore costs the package's own call sites, not only external callers.

The claim's design rationale is also unmet on its own terms. `src/core/types.ts:64-66` justifies the requirement as "A claim that cannot state what would falsify it cannot be proven, so the control is required rather than optional" — but that argument justifies requiring `stage`, which is read, and the falsification statement itself is discarded: it is absent from `Verdict`, from `formatVerdict`, and from the receipt, so the agent that supplied it never sees it again and no receipt records it.

**Repair.**

Delete `reason` from the three declaration sites — `src/core/types.ts:82`, `src/core/validators.ts:89`, `src/core/shapers.ts:58` — and from the two internal write sites at `src/server/Probe.ts:142` and `:152`, plus the fixtures and TSDoc examples that carry it; `stage` alone already supplies the falsifiable axis the control needs and is the member `computeReceipt` reads. If instead the falsification statement is meant to survive, that is a wider change and must give it a real consumer: carry it onto `Verdict` and render it on the control section of `formatVerdict` so the receipt's text states what the control claimed it would break.

<details><summary>Evidence</summary>

```text
REQUIRED — three declaration sites, none optional:

1. `src/core/types.ts:78-83`:
```
export interface Control extends Case {
	/** The stage this control must report findings at. */
	readonly stage: Stage
	/** Why the control fails there, in the claimant's own words. */
	readonly reason: string
}
```
No `?`, so required at compile time.

2. `src/core/validators.ts:85-90`:
```
export const isControl: Guard<Control> = recordOf({
	files: arrayOf(isSource),
	test: isSource,
	stage: isStage,
	reason: isNonEmptyString,
})
```
`recordOf` takes an optional-key list as its second argument (used at `src/core/validators.ts:128-131`: `recordOf({ path: isString, message: isString, line: isNumber }, ['line'])` and at `src/core/validators.ts:185-194` `[...], ['receipt']`). `isControl` passes none, so `reason` is required.

3. `src/core/shapers.ts:54-61`:
```
export const CONTROL_SHAPE = objectShape(
	{
		...CASE_SHAPE.properties,
		stage: literalShape(PROBE_STAGES, { description: 'The stage this control must fail at.' }),
		reason: stringShape({ min: 1, description: 'Why the control fails at that stage.' }),
	},
	{ description: 'A case that must fail, naming the stage where it must fail and why.' },
)
```

WHERE EACH LAYER BITES — layer 2 is enforced in-process, layer 3 is only advertised:

`src/server/factories.ts:54` compiles the shape to the published tool parameters, and `src/server/factories.ts:64-67` is the only runtime admission:
```
	const parameters = schemaToParameters(compileSchema(CLAIM_SHAPE))
```
```
			execute: async (input) => {
				if (!isClaim(input)) throw new Error('The prove tool requires a valid claim')
				return probe.prove(input)
			},
```
`isClaim` (`src/core/validators.ts:110-114`) reaches `isControl`. Nothing in the shipped path validates the arriving arguments against the compiled schema: `node_modules/@orkestrel/tool/dist/src/core/index.js:126-132` runs the handler with no schema check —
```
		const caller = call.caller;
		const value = await (caller === void 0 ? tool.execute(call.arguments) : tool.execute(call.arguments, caller));
```
and the MCP server's `tools/call` path (`node_modules/@orkestrel/mcp/dist/src/core/index.js:3962-3971`) only checks that `arguments` is an object —
```
		if (params !== void 0 && Object.hasOwn(params, "arguments") && !isRecord(rawArguments)) return buildJSONRPCError(id, JSONRPC_INVALID_PARAMS, "Invalid params: `arguments` must be an object when present");
```
`compileSchema` does emit the constraint for a remote client to enforce (`node_modules/@orkestrel/contract/dist/src/core/index.js:6957`, `...owned.min !== void 0 ? { minLength: owned.min } : {},`, and `:7006`, `if (child.type !== "optional") required[required.length] = key;`).

READ BY NOTHING — full enumeration, not a single grep:

Every occurrence of the token `reason` in `src/` (`grep -rn "reason" src/`, 12 hits total):
- `src/core/types.ts:61,74,82,100` — declaration and TSDoc prose/examples
- `src/core/validators.ts:43,73,81,89` — guard key and TSDoc
- `src/core/shapers.ts:51,58` — shape key and TSDoc
- `src/server/Probe.ts:142,152` — **writes**, in the package's own internal boot claims:
```
				reason: 'the imported type changed after the resident type host cached it',
```
```
				reason: 'the imported dependency changed after the resident runtime cached it',
```
Zero reads.

Every `control.<member>` read in `src/` (`grep -rn "control\." src/ tests/`), which covers destructuring and dotted access:
```
src/server/Probe.ts:101:			const receipt = computeReceipt(basis, claim.control.stage)
src/server/Probe.ts:172:			const type = afterType.find((check) => check.stage === typeClaim.control.stage)
src/server/Probe.ts:182:			const runtime = afterRuntime.find((check) => check.stage === runtimeClaim.control.stage)
```
`src/core/helpers.ts:71` and `:100` read `verdict.control`, which is `readonly Check[]` (`src/core/types.ts:220`), not a `Control`.

Spellings not covered by that grep — dynamic and whole-object access — enumerated separately. `grep -rn "JSON.stringify\|Object.entries\|Object.keys\|Object.values\|\.\.\.control\|\.\.\.claim\|\.\.\.subject\|structuredClone" src/` returns exactly two hits, neither on a `Control`:
```
src/server/stages/LintStage.ts:130:		for (const source of [...subject.files, subject.test]) {
src/server/stages/LintStage.ts:201:		const content = JSON.stringify(message)
```
The `Control` reaches the stages only as its `Case` supertype (`src/server/Probe.ts:93`, `const control = Object.freeze(await this.#inspect(claim.control, claim))`, into `#inspect(subject: Case, claim: Claim)` at `:203`), and `grep -rn "subject" src/server/stages/*.ts` shows every stage touching only `subject.files` and `subject.test` (`LintStage.ts:130`; `RuntimeStage.ts:126,130,131,136`; `TypeStage.ts:148,149,153,154,165,166`).

NEVER RETURNED, NEVER RENDERED, NEVER DOCUMENTED:
- `Verdict` (`src/core/types.ts:212-225`) carries `id`, `toolchain`, `checks`, `control`, `elapsed`, `receipt`. No reason.
- `formatVerdict` (`src/core/helpers.ts:63-74`) is the entire text an agent receives (`src/server/factories.ts:79`, `content: [{ type: 'text', text: formatVerdict(result.value) }]`) and renders none of it.
- `computeReceipt` (`src/core/helpers.ts:103-110`) builds the token from `RECEIPT_PREFIX`, `verdict.id`, `stage`, and the three versions.
- `guides/README.md` records the package guide as absent: "Spec: Not created. Create this file when the workspace has a public surface: `guides/probe.md`". `grep -n "Control\|reason\|stage" guides/guide.md` returns nothing (that file is the vendored `@orkestrel/guide` doc). `grep -rn "reason" configs/ scripts/ vite.config.ts tsconfig.json .oxlintrc.json` returns nothing.

BINDING EXISTS IN TESTS, BUT NO SEMANTIC READ: `grep -rn "reason" tests/` returns 17 hits, all fixture writes except `tests/src/core/validators.test.ts:94` and `:100`, which copy the value only to build a control missing its `stage`:
```
				control: { files: control.files, test: control.test,
```

</details>

### M4 — PARTLY-REPRODUCED

**Correction.**

The claim is right about the shipped code and wrong as written, in both conjuncts.

Wrong: "`compileGuard` is never called" is false. It is called at tests/src/core/validators.test.ts:74. The true statement is "`compileGuard` is never called in `src/`" — every one of the six occurrences in shipped source is TSDoc prose (shapers.ts:13, 30, 51, 69, 75; validators.ts:98).

Wrong: "nothing binds `CLAIM_SHAPE` to `isClaim`" is false. tests/src/core/validators.test.ts:64-122 binds them behaviorally, asserting `isClaim(x) === compileGuard(CLAIM_SHAPE)(x)` across 16 labelled inputs including 'extra key', 'null-prototype object', and 'throwing proxy'. That is a test-enforced equivalence over a finite named population, not a derivation: the two declarations remain independent, and drift outside those 16 inputs is unconstrained.

Right, and the part that survives: the documented derivation of the *guard* does not exist. shapers.ts:64-65 calls `CLAIM_SHAPE` "the sole source of both the published tool schema and the guard applied to an arriving claim", and shapers.ts:68-69 says the tool "admits a call with `compileGuard(CLAIM_SHAPE)`". The schema half is true (factories.ts:54). The guard half is false: factories.ts:65 admits with `isClaim`, a separate `recordOf` written by hand at validators.ts:110-114, and `Claim` itself is a hand-written interface at types.ts:104-111 rather than inferred from the shape. The wire contract is therefore declared three times in parallel — types.ts, validators.ts, shapers.ts — and "sole source" is false of all three.

Where the claim understates: it names only the missing binding. validators.ts:98-99 also asserts a distinction that does not exist — "the in-process guard and the guard the tool applies at the wire cannot disagree" describes two guards, but factories.ts:65 shows there is exactly one, `isClaim`, and it *is* the wire guard. Nothing in the package applies a second, compiled guard for it to agree with, so the sentence's premise is wrong independently of whether the two happen to accept the same values.

Where the claim overstates in effect, not just in wording: because `isClaim` does guard the wire (factories.ts:65), the wire is not unguarded. The live risk is drift between the advertised schema and the enforced guard, pinned only by the 16-case parity test — not an unvalidated tool input.

**Repair.**

Make the shipped code do what shapers.ts:64-69 says: in src/core/validators.ts, replace the hand-written `recordOf` at lines 110-114 with `export const isClaim: Guard<Claim> = compileGuard(CLAIM_SHAPE)`, importing `compileGuard` and `./shapers.js` there (shapers.ts imports only `./constants.js`, so no cycle forms), which makes factories.ts:65 the compiled wire guard with no call-site edit and turns validators.test.ts:64-122 from a drift alarm into a redundant check. If the hand-written guards must stay, then instead correct the prose: strike "sole source of … the guard applied to an arriving claim" and "admits a call with `compileGuard(CLAIM_SHAPE)`" from shapers.ts:64-69, and rewrite validators.ts:98-99 to say `isClaim` is written separately and pinned to the compiled shape only by the named-population parity test.

<details><summary>Evidence</summary>

```text
SNAP = /tmp/claude-0/-home-user-scaffold/75034726-f81c-5f56-9643-b4a6748f097d/scratchpad/snap-938eb04

1. The documentation the claim attacks, verbatim.

src/core/shapers.ts:63-70:
```
/**
 * Blueprint for one claim, and the sole source of both the published tool schema and the guard
 * applied to an arriving claim.
 *
 * @remarks
 * The Model Context Protocol tool publishes `compileSchema(CLAIM_SHAPE)` and admits a call with
 * `compileGuard(CLAIM_SHAPE)`. Deriving both from this one value is what stops the advertised
 * contract and the enforced contract from drifting apart across a release.
```

src/core/validators.ts:96-99:
```
 * Exact rather than open: a claim is this package's own record, so an unknown member is a caller
 * sending a contract this service does not implement rather than a wider caller it must tolerate.
 * Admits and refuses exactly what `compileGuard(CLAIM_SHAPE)` does, so the in-process guard and
 * the guard the tool applies at the wire cannot disagree about one claim.
```

2. The schema half of that derivation is real; the guard half is not.

src/server/factories.ts:3 `import { compileSchema, schemaToParameters } from '@orkestrel/contract'`
src/server/factories.ts:7 `import { CLAIM_SHAPE, formatVerdict, isClaim, isVerdict } from '@src/core'`
src/server/factories.ts:54 `	const parameters = schemaToParameters(compileSchema(CLAIM_SHAPE))`
src/server/factories.ts:64-66:
```
			execute: async (input) => {
				if (!isClaim(input)) throw new Error('The prove tool requires a valid claim')
				return probe.prove(input)
```
The advertised schema is compiled from `CLAIM_SHAPE`; the guard applied to the arriving value is `isClaim`. `compileGuard` is not imported by `src/server/factories.ts` (line 3 is the complete `@orkestrel/contract` import).

3. `isClaim` is an independent hand-written declaration, with no reference to `CLAIM_SHAPE`.

src/core/validators.ts:110-114:
```
export const isClaim: Guard<Claim> = recordOf({
	project: isNonEmptyString,
	case: isCase,
	control: isControl,
})
```
src/core/validators.ts:1-21 is the file's complete import list; it imports `Guard` as a type and `arrayOf, isNonEmptyString, isNumber, isString, literalOf, recordOf` from `@orkestrel/contract`, plus `PROBE_STAGES` from `./constants.js`. It does not import `./shapers.js` and does not import `compileGuard`.

4. No type-level binding either — `Claim` is hand-written, not inferred from the shape.

src/core/types.ts:104-111:
```
export interface Claim {
	/** Workspace-relative path of the TypeScript project the candidate sources are checked against. */
	readonly project: string
	/** The files and test the claim asserts about. */
	readonly case: Case
	/** The negative control that must break, and where. */
	readonly control: Control
}
```
There is no `Infer<typeof CLAIM_SHAPE>` anywhere: `grep -rn "Infer" src/` returns nothing.

5. Enumeration of every `compileGuard` spelling in shipped source. `grep -rn "compileGuard" src/` returns exactly six hits, all inside TSDoc comment bodies:
```
src/core/shapers.ts:13: * compileGuard(SOURCE_SHAPE)({ path: 'src/core/greeting.ts', text: '' }) // true
src/core/shapers.ts:30: * compileGuard(CASE_SHAPE)({ files: [], test }) // true
src/core/shapers.ts:51: * compileGuard(CONTROL_SHAPE)({ files: [], test, stage: 'type', reason: 'must not compile' }) // true
src/core/shapers.ts:69: * `compileGuard(CLAIM_SHAPE)`. Deriving both from this one value is what stops the advertised
src/core/shapers.ts:75: * const admits = compileGuard(CLAIM_SHAPE)
src/core/validators.ts:98: * Admits and refuses exactly what `compileGuard(CLAIM_SHAPE)` does, so the in-process guard and
```
Zero executable call sites in `src/`. I also checked the adjacent spellings the claim did not search: `createContract`, `compileParser`, `compileAuditor`, `ownShape`, `cloneShape`, `Infer` — `grep -rn "createContract\|compileParser\|compileAuditor\|compileReporter\|ownShape\|cloneShape\|Infer" src/` returns nothing. `compileSchema` is the only `compile*` entry point the shipped code calls (factories.ts:54).

6. Where the claim overstates — `compileGuard` IS called, and a binding DOES exist, in tests.

tests/src/core/validators.test.ts:2 `import { compileGuard } from '@orkestrel/contract'`
tests/src/core/validators.test.ts:64 `	it('agrees with the compiled claim shape for a named hostile population', () => {`
tests/src/core/validators.test.ts:74 `		const compiled = compileGuard(CLAIM_SHAPE)`
tests/src/core/validators.test.ts:78 `		expect(isClaim(claim), 'valid claim').toBe(compiled(claim))`
and fifteen further paired assertions through line 121, each labelled: 'empty project' (79), 'missing project' (82), 'empty control reason' (85), 'bad stage' (88), 'missing stage' (96), 'extra key' (103), 'empty test path' (108), 'files not an array' (110), 'file entry wrong' (113), 'null' (116), 'undefined' (117), 'array' (118), 'string' (119), 'null-prototype object' (120), 'throwing proxy' (121):
```
		expect(isClaim(throwingProxy), 'throwing proxy').toBe(compiled(throwingProxy))
```

7. Which question each answer settles. On "what does the shipped code do": `compileGuard` is never called and nothing binds `CLAIM_SHAPE` to `isClaim` — reproduced, from spans 2-5. On "does a binding exist anywhere in the repository": it does — a differential parity test over 16 named inputs, span 6 — so the claim as written is false.

8. Structural context, not part of the ruling. `objectShape` and `recordOf` are both closed by default, so the two declarations are written in parallel and are not shown to diverge: guides/contract.md:396 `| `objectShape`        | function | an object shape from a property map — closed to unknown keys by default…` and guides/contract.md:125 `| `recordOf`       | function | accepts an **exact** record matching a readable `{ key: guard }` shape … no extra keys.` They are, however, different engines — guides/contract.md:479: `An object shape compiles to a walk over the `enumerableKeys` view rather than t
```

</details>

### M5 — PARTLY-REPRODUCED

**Correction.**

The core is right: helpers.ts:116 documents a return contract no code implements, and RuntimeStage.ts:157 — the only consumer in shipped code — converts undefined into a throw. Three corrections.

(a) "no root project exists" is overstated. Vitest 4.1.11 always has a root project (`getRootProject()`, reporters.d.DtoKVV2s.d.ts:1328), and in any target workspace that configures no `test.projects` the root project IS `vitest.projects[0]` (cli-api.CnMVyzaz.js:11410-11413, 13363-13371). What is true is narrower and sufficient: this repository configures six named projects (vite.config.ts:195), so no root project sits in `vitest.projects` here; and `find((candidate) => candidate.name === name)` at RuntimeStage.ts:158 could never select a root project by an undefined name in any workspace, because the name lookup is reached only after line 157 has already thrown.

(b) "the only consumer" is precise only for src/. Six further call sites exist in tests/src/server/helpers.test.ts:31-36, three of which (34-36) exercise the undefined branch and assert it without throwing. The helper is also public API through src/server/index.ts:2 and pinned in the export inventory at tests/src/server/index.test.ts:15, so the wrong `@returns` is shipped to external consumers, not merely read internally.

(c) The claim understates the defect by framing it as documentation drift. The undefined branch is also reached for test paths whose Vitest project genuinely exists: `tests/policy.test.ts` and `tests/config.test.ts` fail the `environment === undefined` guard at helpers.ts:121 while vite.config.ts:148 and :163 register projects named `policy` and `config`. More broadly, any target workspace using the common flat `tests/*.test.ts` layout, or project names not spelled `src:<env>`/`app:<env>`, gets `undefined` and therefore a hard throw at RuntimeStage.ts:157 — the runtime stage cannot run such a claim at all. That is a reachability defect in the shipped service, not only a stale comment.

**Repair.**

Rewrite src/server/helpers.ts:116 to state the implemented contract — `@returns The project name, or `undefined` when the path maps to no configured project` — and add `@remarks` naming the two mapped shapes (`tmp/probe/**` and `tests/{src,app}/<environment>/**`). Separately, and as its own unit, decide whether the `tests/{src,app}/<environment>` mapping is the intended limit: if not, replace the path-shape inference with a lookup against the target workspace's actual `vitest.projects` so flat and custom project layouts are reachable rather than rejected at RuntimeStage.ts:157.

<details><summary>Evidence</summary>

```text
1. The stale doc line is real, verbatim (src/server/helpers.ts:112-124):

```
112: /**
113:  * Selects the Vitest project whose environment matches one test path.
114:  *
115:  * @param path - The workspace-relative test path
116:  * @returns The project name, or `undefined` for the root project
117:  */
118: export function inferTestProject(path: string): string | undefined {
119: 	const [root, axis, environment] = path.replaceAll('\\', '/').split('/')
120: 	if (root === 'tmp' && axis === 'probe') return 'probe'
121: 	if (root !== 'tests' || axis === undefined || environment === undefined) return undefined
122: 	if (axis !== 'src' && axis !== 'app') return undefined
123: 	return `${axis}:${environment}`
124: }
```

2. The sole shipped consumer throws on undefined and never consults a root project (src/server/stages/RuntimeStage.ts:152-161):

```
152: 	#project(vitest: Vitest, path: string): TestProject {
153: 		// `inferTestProject` reads a workspace-relative path, and a caller declares whatever path it
154: 		// holds. An absolute one splits into leading segments that match no project, which silently
155: 		// selected the root project before this resolved — a project `invalidateFile` cannot reach.
156: 		const name = inferTestProject(relative(this.#workspace, resolve(this.#workspace, path)))
157: 		if (name === undefined) throw new Error(`Cannot infer a Vitest project for ${path}`)
158: 		const project = vitest.projects.find((candidate) => candidate.name === name)
159: 		if (project === undefined) throw new Error(`The Vitest project ${name} does not exist`)
160: 		return project
161: 	}
```
The comment at 154-155 is the record that the root-project selection the `@returns` still promises was deliberately removed.

3. Call-site enumeration (whole snapshot, all spellings). `grep -rn "inferTestProject" <snapshot>` returns exactly: src/server/helpers.ts:118 (declaration); src/server/stages/RuntimeStage.ts:10 (import), :153 (comment), :156 (the only src call); tests/src/server/helpers.test.ts:6, :31-36; tests/src/server/index.test.ts:15. No namespace-indirect or dynamic route exists: `grep -rn "import \* as" src tests` yields only tests/src/server/index.test.ts:1, tests/src/core/index.test.ts:1, tests/setupPolicy.ts:12, tests/config.test.ts:20, and `grep -rn "helpers\[" src tests` returns nothing. So: one call site in shipped code, six in tests.

4. Test call sites take the undefined branch and do not throw (tests/src/server/helpers.test.ts:30-37):

```
30: 	it('infers every mapped Vitest project and returns undefined for every unmapped shape', () => {
34: 		expect(inferTestProject('source/src/core/value.test.ts')).toBeUndefined()
35: 		expect(inferTestProject('tests/policy/value.test.ts')).toBeUndefined()
36: 		expect(inferTestProject('tests/src')).toBeUndefined()
```
The test's own name states the intended contract as "every unmapped shape", not "the root project".

5. The helper is public API, so the wrong `@returns` ships to external consumers. src/server/index.ts:2 `export * from './helpers.js'`, and tests/src/server/index.test.ts:15 pins `'inferTestProject',` in the published export list.

6. A Vitest root project does exist — the third clause is overstated. Read through the snapshot's `node_modules` symlink (vitest 4.1.11, node_modules/vitest/package.json:4):
- node_modules/vitest/dist/chunks/reporters.d.DtoKVV2s.d.ts:1325-1328: `/** * Return project that has the root (or "global") config. */` / `getRootProject(): TestProject;`
- node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js:13332-13335: `getRootProject() { if (!this.coreWorkspaceProject) throw new Error(...); return this.coreWorkspaceProject; }`
- cli-api.CnMVyzaz.js:11410-11413: `function getDefaultTestProject(vitest) { const filter = vitest.config.project; const project = vitest._ensureRootProject(); if (!filter.length) return project;` — and :13363-13371 `if (this.config.projects) return resolveProjects(...)` ... `const project = getDefaultTestProject(this);` So in any target workspace with no `test.projects`, `vitest.projects` is exactly `[rootProject]`.
- cli-api.CnMVyzaz.js:803 and :13256 spread `[this.vitest.getRootProject(), ...this.vitest.projects]`, proving the root project is separate from `projects` when projects are configured.

7. In this repository's own configuration the root project is not among `vitest.projects` (vite.config.ts:192-197): `export default defineConfig({ resolve, test: { projects: [srcCore, srcServer, srcBin, policy, config, probe] } })`, with labels at :43 `'src:core'`, :92 `'src:server'`, :129 `'src:bin'`, :148 `'policy'`, :163 `'config'`, :182 `'probe'`.

8. Understatement evidence — undefined is returned for projects that do exist. `'tests/policy.test.ts'.split('/')` is `['tests','policy.test.ts']`, so `environment === undefined` and helpers.ts:121 returns undefined, yet vite.config.ts:148 registers a project named `'policy'`; the same holds for `tests/config.test.ts` against vite.config.ts:163. RuntimeStage.ts:157 converts that into a hard throw, proven live at tests/src/server/stages/RuntimeStage.test.ts:69-80 (`'tests/unmapped.test.ts'` → `.rejects.toThrow('Cannot infer a Vitest project for tests/unmapped.test.ts')`).

Question answered: both. Clause 2 is answered for shipped code (src/) and separately for all call sites including tests; clause 3 is answered for this repository's configuration and for Vitest's general model.
```

</details>

### M6 — REFUTED

**Correction.**

The claim misquotes the document it indicts. It reports the @remarks as saying candidate files use their scoped environment projects, and then reports the coordinator using the claim's project "instead", as if the two contradicted. They do not. The @remarks at src/server/stages/TypeStage.ts:20-22 states the caller-named project as the primary branch and conditions the scoped project on "when a call names none", which is a verbatim description of `project ?? inferTypeProject(source.path)` at src/server/stages/TypeStage.ts:155.

The claim's second half is factually accurate in isolation: every coordinator-driven call does use the claim's project, because src/server/Probe.ts:205 passes `claim.project`, `Claim.project` is a required `string` (src/core/types.ts:106), the guard requires a non-empty string (src/core/validators.ts:111), and the wire shape sets `min: 1` (src/core/shapers.ts:82-83). That accurate half is the doc's own first branch being taken, not a departure from it, so there is no documentation-behavior drift to repair.

Two secondary points the claim would need in order to stand, and neither holds. First, "on every coordinator-driven call" is right but does not make the alternative branch dead or misdocumented: `TypeStage` is exported from the server barrel (src/server/index.ts:7), so a direct API consumer reaches the inference branch, and tests/src/server/stages/TypeStage.test.ts:70-92 pins both branches with the same wording the doc uses. Second, the `??` operator would let an empty-string project through to `#service` rather than falling back, but the guard and the wire shape both refuse an empty project, so no reachable input turns the coordinator path into the inferred path.

The one adjustment a reader could fairly ask for is emphasis, not accuracy: the class @remarks reads as symmetric between the two branches, while in the shipped MCP flow the named branch is the only one the coordinator ever takes. That is a stylistic preference about a correct sentence, not the misstatement the claim alleges.

**Repair.**

None required. Leave src/server/stages/TypeStage.ts:20-22 as written; it already conditions the scoped-project branch on "when a call names none", which is exactly what src/server/stages/TypeStage.ts:155 implements and what src/server/Probe.ts:205 bypasses by always supplying `claim.project`. If the sweep wants the coordinator's behavior called out explicitly, the smallest change is one clause added to the existing sentence — noting that the coordinator always names a project and that the inferred branch serves direct `TypeStage` callers — and nothing in the code changes.

<details><summary>Evidence</summary>

```text
All paths relative to /tmp/claude-0/-home-user-scaffold/75034726-f81c-5f56-9643-b4a6748f097d/scratchpad/snap-938eb04.

1. What the class @remarks actually says — it is conditional, and it names the caller-supplied project FIRST. src/server/stages/TypeStage.ts:19-22:
```
 * Construction starts loading the workspace's compiler and warming one service per project the
 * workspace declares. A candidate source file is checked against the project a call names, or
 * against its own scoped environment project when a call names none, while the test uses the root
 * project.
```
The scoped-project sentence is governed by the clause "when a call names none". The @remarks does not assert that candidate files use their scoped environment projects.

2. The member doc is conditional the same way. src/server/stages/TypeStage.ts:67 and :75-76:
```
	 * Inspects one case, against a caller-named project where the caller names one.
```
```
	 * @param project - The workspace-relative TypeScript project the candidate sources are checked
	 * against. Default: the scoped project each candidate path infers
```

3. The implementation matches that conditional exactly. src/server/stages/TypeStage.ts:80, :152-158:
```
	async inspect(subject: Case, project?: string): Promise<Check> {
```
```
			const root = this.#service(typescript, 'tsconfig.json')
			findings.push(...this.#findings(typescript, root, subject.test, 'tsconfig.json'))
			for (const source of subject.files) {
				const selected = project ?? inferTypeProject(source.path)
				const service = this.#service(typescript, selected)
				findings.push(...this.#findings(typescript, service, source, selected))
			}
```
`project ?? inferTypeProject(...)` is precisely "the project a call names, or ... when a call names none". `'tsconfig.json'` at :152-153 is precisely "the test uses the root project".

4. The coordinator's sole call into the type stage passes the claim's project. src/server/Probe.ts:203-209:
```
	#inspect(subject: Case, claim: Claim): Promise<readonly Check[]> {
		return Promise.all([
			this.#type.inspect(subject, claim.project),
			this.#lint.inspect(subject),
			this.#inspectRuntime(subject, claim),
		])
	}
```
Enumeration of every `#type` reference in the coordinator (grep over src/server/Probe.ts) returns four lines, of which exactly one is an inspection call:
```
44:	readonly #type: TypeStage
68:		this.#type = new TypeStage(this.#workspace)
205:			this.#type.inspect(subject, claim.project),
264:			await Promise.all([this.#type.destroy(), this.#lint.destroy(), this.#runtime.destroy()])
```

5. `claim.project` is required, non-empty, and enforced at the wire, so the `??` fallback is unreachable from the coordinator. src/core/types.ts:105-106:
```
	/** Workspace-relative path of the TypeScript project the candidate sources are checked against. */
	readonly project: string
```
src/core/validators.ts:110-114:
```
export const isClaim: Guard<Claim> = recordOf({
	project: isNonEmptyString,
	case: isCase,
	control: isControl,
})
```
src/core/shapers.ts:80-90:
```
export const CLAIM_SHAPE = objectShape(
	{
		project: stringShape({
			min: 1,
```
src/server/factories.ts:64-67:
```
			execute: async (input) => {
				if (!isClaim(input)) throw new Error('The prove tool requires a valid claim')
				return probe.prove(input)
			},
```
The coordinator's own internal boot claims also name a project. src/server/Probe.ts:135-136 and :145-146:
```
		const typeClaim: Claim = {
			project: 'tsconfig.json',
```
```
		const runtimeClaim: Claim = {
			project: 'tsconfig.json',
```

6. Which question I answered on call sites: I enumerated call sites in src/ (shipped code) and separately in tests/. In src/, the only `TypeStage.inspect` call site is Probe.ts:205, and it always supplies a project. The no-project overload is nonetheless a live public binding: src/server/index.ts:7 exports the class (`export * from './stages/TypeStage.js'`), and tests/src/server/stages/TypeStage.test.ts:70-92 exercises both branches against the documented contract:
```
		'uses a named project and otherwise infers one from the candidate path',
```
```
				const named = await stage.inspect(subject, 'tsconfig.json')
				const inferred = await stage.inspect(subject)
				expect(named.findings).toStrictEqual([])
				expect(inferred.findings.length).toBeGreaterThan(0)
```
Other no-project calls exist at tests/src/server/stages/TypeStage.test.ts:21, :25, :57, :60, :194.

7. The inference helper the fallback names is real and matches "scoped environment project". src/server/helpers.ts:104-110:
```
export function inferTypeProject(path: string): string {
	const [axis, environment] = path.replaceAll('\\', '/').split('/')
	if ((axis !== 'src' && axis !== 'app') || environment === undefined || environment === '') {
		throw new Error(`Cannot infer a scoped TypeScript project for ${path}`)
	}
	return `configs/${axis}/tsconfig.${environment}.json`
}
```
```

</details>

### M7 — REPRODUCED

**Correction.**

The claim is correct on both halves and understates the divergence in three ways.

1. The mtime wording is wrong in both directions, so it cannot be rescued as a loose synonym for "changed". A file whose mtime moved with content unchanged is NOT revalidated (RuntimeStage.ts:166, `if (this.#modules.get(path) === digest) continue`), and a file whose content changed with mtime preserved IS revalidated.

2. "Every workspace file" fails for a reason beyond the extension filter: the sweep also skips three directory trees whole — src/server/stages/RuntimeStage.ts:186-188, `if (entry.name === '.git' || entry.name === 'dist' || entry.name === 'node_modules') { continue }` — and skips any entry that is not `isFile()` (line 194), which excludes symlinked modules.

3. Attribution is imprecise on one point: "every workspace file" appears only in the `ProbeInterface` remark (src/core/types.ts:283-284). The `ProbeOptions` remark (src/core/types.ts:257) supplies only the mtime key, not the "every file" scope. Both remarks are wrong about the key; only `ProbeInterface` is also wrong about the scope.

One nuance the claim does not raise and which does not weaken it: `prove` does reach the sweep transitively, but only through the runtime stage, so the sweep governs Vitest's module graph alone. The type stage handles staleness by its own mtime script versioning and the lint stage caches nothing — the sentence in `ProbeInterface` reads as a probe-wide guarantee that no single mechanism provides.

**Repair.**

Rewrite both remarks to the mechanism that exists: `ProbeOptions` says the workspace root is the tree the runtime stage's revalidation sweep hashes, and `ProbeInterface` says `prove` re-hashes the workspace's module files — `[cm]?[jt]sx?`, `.vue`, `.json`, excluding `.git`, `dist`, and `node_modules` — and invalidates each one whose contents changed. Reserve "modification time" for `TypeStage`, where src/server/stages/TypeStage.ts:239 actually reads `mtimeMs`.

<details><summary>Evidence</summary>

```text
Question answered: what the shipped declarations say versus what the shipped sweep does. I enumerated every call site of the sweep and its filter across src/ and tests/, and searched the whole snapshot for other spellings of an mtime mechanism (`mtime`, `statSync`, `birthtime`, `utimes`, `hash`, `digest`, `sha`, `createHash`, `revalidat`, `sweep`).

WHAT THE DECLARATIONS SAY

src/core/types.ts:255-257 (`ProbeOptions` remark):
```
 * @remarks
 * `workspace` is the target root whose installed `typescript`, `oxlint`, and `vitest` the stages
 * resolve, and whose modification times the revalidation sweep reads. Default: the current
```

src/core/types.ts:282-285 (`ProbeInterface` remark):
```
 * Warming begins at construction and `prove` awaits it, so there is no `start`: the harness owns
 * the process and a restart is a new process rather than a second lifecycle. `prove` revalidates
 * every workspace file whose modification time moved before it answers, because a warm service
 * otherwise returns a confident wrong answer about freshly edited source.
```

WHAT THE SWEEP DOES

There is exactly one revalidation sweep. src/server/stages/RuntimeStage.ts:163-177:
```
	#revalidate(vitest: Vitest): void {
		const modules = this.#snapshot()
		for (const [path, digest] of modules) {
			if (this.#modules.get(path) === digest) continue
			vitest.invalidateFile(path)
```
Its key is a content hash, not a modification time — src/server/stages/RuntimeStage.ts:195-198:
```
				try {
					const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
					modules.set(path, digest)
				} catch {}
```
`createHash` is imported at src/server/stages/RuntimeStage.ts:5: `import { createHash, randomUUID } from 'node:crypto'`. The sweep's only filesystem reads are `readdirSync` (line 185) and `readFileSync` (line 196); it never calls `statSync` and never reads `mtimeMs`.

Coverage is gated to module extensions — src/server/stages/RuntimeStage.ts:194:
```
				if (!entry.isFile() || !matchesWorkspaceModule(path)) continue
```
src/server/helpers.ts:158-163:
```
 * @returns True for script, TypeScript, Vue, and JSON modules; false otherwise
 */
export function matchesWorkspaceModule(path: string): boolean {
	return /\.(?:[cm]?[jt]sx?|vue|json)$/.test(path)
}
```
tests/src/server/helpers.test.ts:111 pins the exclusion: `expect(matchesWorkspaceModule('value.css')).toBe(false)`.

CALL-SITE ENUMERATION
`matchesWorkspaceModule`: declared src/server/helpers.ts:161; called once in shipped code, src/server/stages/RuntimeStage.ts:194; barrel row tests/src/server/index.test.ts:17; test call sites tests/src/server/helpers.test.ts:109,111. `#revalidate`: declared src/server/stages/RuntimeStage.ts:163, called once, src/server/stages/RuntimeStage.ts:125 (inside `#inspect`, reached from `Probe.prove` through Probe.ts:92-93 → `#inspect` → `#inspectRuntime` → `stage.inspect`).

THE ONLY mtime READ IN src/ IS SOMEWHERE ELSE
src/server/stages/TypeStage.ts:235-243:
```
	#version(file: string): string {
		const overlay = this.#versions.get(file)
		if (this.#overlays.has(file) && overlay !== undefined) return `virtual:${overlay}`
		try {
			return `disk:${statSync(file).mtimeMs}`
```
That is the TypeScript language service's `getScriptVersion` (wired at src/server/stages/TypeStage.ts:205), a pull-based per-file version over the files the service asks about — not a sweep, and correctly documented on its own class at src/server/stages/TypeStage.ts:23: "Disk snapshots use their modification time as the service version so dependency edits cannot leave a warm answer stale." `LintStage` holds no cache and no revalidation (grep for `cache|invalidat|revalidat` in src/server/stages/LintStage.ts returns nothing).
```

</details>

### M8 — PARTLY-REPRODUCED

**Correction.**

The claim's proposition is substantiated, but it names the wrong sentence and misses the site where the defect bites.

1. Wrong sentence. The coordinator does not disclaim the abandonment guarantee at `src/server/types.ts:33-34` ("teardown never waits for an inspection to return"). `src/server/Probe.ts:234` disclaims a different property — settlement within `this.#deadline` — which the doc never promises; `src/server/types.ts:38` promises only that the returned promise "settles", with no bound, and closing an external Vitest pool or Oxlint child can exceed a deadline without waiting behind any inspection. The sentence the coordinator's code actually falsifies is `src/server/types.ts:35-36`, "The coordinator depends on that guarantee to replace a stage whose worker no longer returns". `#recycle` is that replacement path and is written not to depend on `stage.destroy()` at all.

2. Overstated as to scope, understated as to damage. "The coordinator's own code refuses to trust" holds at one of the two stage-teardown call sites in `src/`. The other, `src/server/Probe.ts:264`, trusts the teardown completely — no deadline, no race — so `Probe.destroy()` is unbounded on exactly the hung stage `#recycle` budgets for, and on a mute Oxlint child besides. The coordinator therefore holds two incompatible positions on the same contract, and the more serious one is the trusting site the claim does not mention. A repair that only softens the interface prose leaves that hang in place.

3. Consequence the claim does not reach: `ProbeInterface.destroy` at `src/core/types.ts:308-313` republishes the same unbounded settlement promise to package consumers, so the mismatch is on the published surface, not only on the internal `StageInterface`.

**Repair.**

Delete the false dependency sentence at `src/server/types.ts:35-36` and state the real contract in its place: teardown abandons every inspection it holds but is not time-bounded, so a caller that cannot wait must bound it. Then give `src/server/Probe.ts:264` the same deadline race `#recycle` already uses at `src/server/Probe.ts:237-240`, so both of the coordinator's teardown call sites hold one position and `Probe.destroy()` cannot wedge on a hung stage.

<details><summary>Evidence</summary>

```text
Question answered: what the shipped code in `src/` does. I enumerated every `.destroy(` occurrence in `src/` (`grep -rn "\.destroy(" src/`): the only stage-teardown call sites are `src/server/Probe.ts:238` and `src/server/Probe.ts:264`; `src/server/Probe.ts:266` is `this.#emitter.destroy()`, and the remaining seven hits are TSDoc `@example` lines (`src/server/stages/TypeStage.ts:30`, `LintStage.ts:29`, `RuntimeStage.ts:30`, `factories.ts:31`, `factories.ts:50`, `Probe.ts:36`, `server/types.ts:15`, `core/types.ts:291`). I also swept the spellings I did not search for — `grep -rnE "\.(close|dispose|stop|end|kill|unref|shutdown|terminate)\(|Symbol\.(async)?[Dd]ispose" src/` returns only `TypeStage.ts:102` `service.dispose()`, `TypeStage.ts:229` `this.#services.get(previous)?.dispose()`, `RuntimeStage.ts:90` `await vitest.close()`, and two `server.stop()` doc lines; none is a coordinator call site. Tests call `stage.destroy()` and `probe.destroy()`, which settles that the binding exists but not what shipped code does.

THE DECLARED GUARANTEE — src/server/types.ts:29-40:
```
29		/**
30		 * Tears down the resident tool and releases its resources.
31		 *
32		 * @remarks
33		 * A stage abandons every inspection it holds rather than waiting behind one, so teardown never
34		 * waits for an inspection to return. An abandoned inspection rejects, either at the stage's own
35		 * guard or as the owned tool closes. The coordinator depends on that guarantee to replace a
36		 * stage whose worker no longer returns.
37		 *
38		 * @returns A promise that settles after the resident tool releases its resources
39		 */
40		destroy(): Promise<void>
```

THE SITE THAT REFUSES — src/server/Probe.ts:230-248:
```
230		async #recycle(stage: RuntimeStage): Promise<void> {
231			const timeout = createTimeout({ ms: this.#deadline })
232			timeout.start()
233			try {
234				// Teardown of a hung stage can reject or outlive its own deadline, and the replacement
235				// must be installed either way: `#runtime` otherwise stays destroyed for the life of
236				// the process and every later claim reports that instead of its own evidence.
237				await Promise.race([
238					stage.destroy(),
239					this.#expiry(timeout, `The runtime stage recovery exceeded ${this.#deadline} ms`),
240				])
241			} catch {
242				// The failure belongs to the stage being replaced, and the replacement below is the
243				// recovery the caller is owed.
244			} finally {
245				timeout.clear()
246			}
247			if (this.#destroyed || this.#runtime !== stage) return
248			this.#runtime = new RuntimeStage(this.#workspace)
```
`#recycle` is the replacement path `src/server/types.ts:35-36` names, and it is written so the replacement lands whether or not `stage.destroy()` settles.

THE SITE THAT TRUSTS — src/server/Probe.ts:259-268:
```
259		async #destroy(): Promise<void> {
260			try {
261				await this.#arming
262			} catch {}
263			try {
264				await Promise.all([this.#type.destroy(), this.#lint.destroy(), this.#runtime.destroy()])
265			} finally {
266				this.#emitter.destroy()
267			}
268		}
```
No timeout, no race, no catch on the teardown itself. `Probe.destroy()` (src/server/Probe.ts:111-116) reaches this and nothing else.

WHY THE UNGUARDED SITE IS THE EXPOSED ONE. `RuntimeStage.#destroy` ends in an unbounded `await vitest.close()` (src/server/stages/RuntimeStage.ts:90), and the only `#destroyed` guard an in-flight inspection meets sits before the run starts (`RuntimeStage.ts:124` `if (this.#destroyed) throw new Error('The runtime stage has been destroyed')`), so a run already inside `await vitest.runTestSpecifications([specification], false)` (`RuntimeStage.ts:135`) can only reject through the doc's second branch, "as the owned tool closes". `LintStage.#destroy` has the same shape: `src/server/stages/LintStage.ts:90` `await this.#request('shutdown', undefined)` is an unbounded wait on a child-process reply, and `#fail` cleared the pending maps one line earlier (`LintStage.ts:88`), so a live-but-mute Oxlint child leaves that promise pending until `#exit` fires (`LintStage.ts:300-304`).

THE PUBLIC CONTRACT REPEATS THE UNBOUNDED PROMISE — src/core/types.ts:308-313:
```
308		/**
309		 * Tears down the resident engines and releases the processes they hold.
310		 *
311		 * @returns A promise that settles when every engine has released its resources
312		 */
313		destroy(): Promise<void>
```
```

</details>

### L2 — PARTLY-REPRODUCED

**Correction.**

Nothing in L2 as written is wrong, imprecise, or overstated — both conjuncts reproduce verbatim. L2 understates the defect in three ways.

First, it stops at "no stage ever sees it", which frames this as a naming or doc-hygiene problem. The material harm is downstream: `src/core/helpers.ts:103-110` embeds this same random UUID in the receipt, and it is the only claim-specific token there. A receipt is explicitly designed to travel away from its verdict (`src/core/constants.ts:20-21`), so the proof token binds to no revision, no candidate source, no test text, and no workspace state. Two receipts for two different claims proven at the same stage on the same toolchain differ only by a random value.

Second, the package already computes a genuine revision digest — a sha256 over every workspace module at `src/server/stages/RuntimeStage.ts:196` — and discards it after cache invalidation. The honest identity the doc describes exists and is thrown away.

Third, "revision identity" is not a loose word here; it is a taken term. `src/server/helpers.ts:145` documents `revision` as "The fresh revision identity" for `createRevisionFile`, whose caller at `src/server/stages/RuntimeStage.ts:126` mints its own separate `randomUUID()`. So the package has two unrelated random UUIDs, and the one on the verdict is the one that identifies nothing.

One detail L2 does not claim but that strengthens it: the id is minted at `src/server/Probe.ts:91`, before the inspections at lines 92-93, so it is fixed before a single byte of the subject is read.

**Repair.**

Smallest correct repair: make the field's name and doc match what it is. Rename `Verdict.id` to a term that claims no revision binding, and change `src/core/types.ts:213` to state plainly that it is a fresh per-call identifier for this verdict, with no relation to the code inspected. Fix the example at `src/core/types.ts:195` and `:208` to show a real `randomUUID()` value so the documented shape matches `src/server/Probe.ts:91`.

That repair alone leaves the receipt unverifiable, which is outside L2's text. Record the receipt-binding gap as a successor finding against the receipt capability: carry the `RuntimeStage` module digest (`src/server/stages/RuntimeStage.ts:196`) onto the verdict and into `computeReceipt`, so a pasted receipt names the tree state it was issued for.

<details><summary>Evidence</summary>

```text
Both conjuncts of L2 verify verbatim. The label reflects understatement of consequence, not a failed element.

CONJUNCT 1 — the documentation. `/tmp/claude-0/-home-user-scaffold/75034726-f81c-5f56-9643-b4a6748f097d/scratchpad/snap-938eb04/src/core/types.ts:212-214`:

```
212	export interface Verdict {
213		/** The revision identity this verdict was produced for, fresh per call. */
214		readonly id: string
```

The doc line is internally contradictory on its own terms: an identity that is "fresh per call" cannot identify a revision, because two `prove` calls over a byte-identical tree get different values.

CONJUNCT 2 — it is an independent UUID. `src/server/Probe.ts:14` imports it and `src/server/Probe.ts:86-100` mints it:

```
 14	import { randomUUID } from 'node:crypto'
...
 86		async prove(claim: Claim): Promise<Verdict> {
 87			try {
 88				await this.#arming
 89				if (this.#destroyed) throw new Error('The probe has been destroyed')
 90				const started = performance.now()
 91				const id = randomUUID()
 92				const checks = Object.freeze(await this.#inspect(claim.case, claim))
 93				const control = Object.freeze(await this.#inspect(claim.control, claim))
 94				const basis: Verdict = {
 95					id,
```

Line 91 precedes lines 92-93, so the value is fixed before any candidate source, test text, or workspace file is read. It cannot be a post-hoc identity of anything.

CONJUNCT 2 — no stage ever sees it. `src/server/Probe.ts:203-209` is the only fan-out to the stages, and `id` is not among the arguments:

```
203		#inspect(subject: Case, claim: Claim): Promise<readonly Check[]> {
204			return Promise.all([
205				this.#type.inspect(subject, claim.project),
206				this.#lint.inspect(subject),
207				this.#inspectRuntime(subject, claim),
208			])
209		}
```

Enumerated every `inspect` signature in the package — no spelling of an identity parameter exists on any of them:

- `src/server/types.ts:28` — `	inspect(subject: Case): Promise<Check>`
- `src/server/stages/TypeStage.ts:80` — `	async inspect(subject: Case, project?: string): Promise<Check> {`
- `src/server/stages/LintStage.ts:65` — `	async inspect(subject: Case): Promise<Check> {`
- `src/server/stages/RuntimeStage.ts:60` — `	async inspect(subject: Case): Promise<Check> {`

Enumerated every reader of `Verdict.id` across the whole snapshot (shipped code and tests both):

- `src/core/helpers.ts:68` — `		`probe ${verdict.id} (${verdict.elapsed} ms)`,`
- `src/core/helpers.ts:105` — `		verdict.id,`
- `src/core/validators.ts:187` — `		id: isString,`
- `tests/src/core/helpers.test.ts:118` — `			verdict.id,`

Enumerated every writer: `src/server/Probe.ts:95` is the only one. `src/server/factories.ts` never constructs a `Verdict` — it only guards and renders one (`src/server/factories.ts:76`, `:79`). Answering the shipped-code question and the binding-exists question together: no stage sees the id in `src/`, and no test threads it into a stage either.

THE PACKAGE'S OWN "REVISION IDENTITY" IS A DIFFERENT VALUE. `src/server/helpers.ts:141-152`:

```
141	 * Creates a fresh sibling identity while preserving a test's resolution directory.
...
145	 * @param revision - The fresh revision identity
...
148	export function createRevisionFile(workspace: string, path: string, revision: string): string {
```

Its sole caller mints a second, unrelated UUID rather than receiving the verdict's — `src/server/stages/RuntimeStage.ts:126`:

```
126		const file = createRevisionFile(this.#workspace, subject.test.path, randomUUID())
```

So "revision identity" is already a taken term in this package, and `Verdict.id` is not it.

UNDERSTATEMENT 1 — the same value is the only claim-specific token in the receipt. `src/core/helpers.ts:97-110`:

```
 97	export function computeReceipt(verdict: Verdict, stage: Stage): string | undefined {
...
103		return [
104			RECEIPT_PREFIX,
105			verdict.id,
106			stage,
107			`typescript@${typescript}`,
108			`oxlint@${oxlint}`,
109			`vitest@${vitest}`,
110		].join(RECEIPT_SEPARATOR)
```

`src/server/Probe.ts:101-102` feeds it straight through:

```
101			const receipt = computeReceipt(basis, claim.control.stage)
102			const verdict: Verdict = receipt === undefined ? basis : { ...basis, receipt }
```

Every other token in a receipt is a constant or a toolchain version, so the random UUID is the entire per-claim content of the proof token. `src/core/constants.ts:20-22` states what that token is for:

```
 20	 * A receipt travels away from the verdict that issued it — an agent pastes it into the promotion
 21	 * action — so it names itself rather than relying on where it was found.
```

A receipt that travels away from its verdict therefore carries nothing a reader can check against any code state.

UNDERSTATEMENT 2 — a real revision digest already exists and is discarded. `src/server/stages/RuntimeStage.ts:196-197` computes a sha256 over every workspace module:

```
196					const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
197					modules.set(path, digest)
```

That map is consumed only for cache invalidation (`src/server/stages/RuntimeStage.ts:165-176`) and never reaches the verdict.

UNDERSTATEMENT 3 — the TSDoc example is not even the shape the implementation emits. `src/core/types.ts:195` and `:208`:

```
195	 * 	id: '01J8Z0',
...
208	 * 	receipt: 'probe:01J8Z0:type:typescript@6.0.3:oxlint@1.78.0:vitest@4.1.10',
```

`'01J8Z0'` is a six-character sortable-looking token; `randomUUID()` returns a 36-character v4 UUID. No test pins the real shape: grepping the whole `tests/` tree for `.id` returns exactly one hit, `tests/src/core/helpers.test.ts:118`, which builds its own literal verdict and asserts only that `computeReceipt` echoes whatever id it was handed.

SCOPE OF SEARCHES. All greps ran over the snapshot root excluding `node_modules`, across `src/`, `tests/`, `guides/`, `configs/`, and `README.md`. There is no probe guide: `guides/` holds `README.md`, `contract.md`, `emitter.md`, `guide.md`, `mcp.md
```

</details>

### L3 — REPRODUCED

**Correction.**

The claim is right and understates the defect in two ways.

First, the strength. "Cannot produce from its own per-stage numbers" reads as a derivation mismatch — no formula over 61, 17, 259, 58, 16, 254 yields 337. The real fault is stronger and does not depend on any formula: because the case and control phases are sequential (`src/server/Probe.ts:92-93`) and the stages inside a phase are concurrent (`src/server/Probe.ts:204-208`), the code's verdict `elapsed` has a hard floor of `max(case) + max(control) = 513`. 337 sits 176 ms under that floor. No scheduling, contention, or rounding produces it. Note the asymmetry the claim does not state: an `elapsed` above the stage sum is perfectly legal (overhead), so only an undershoot is refutable, and this example undershoots.

Second, the diagnosis and the blast radius. 337 is exactly `61 + 17 + 259`, the case column summed with the control dropped, which independently contradicts the field's own doc at `src/core/types.ts:221` ("including both the case and the control") without any concurrency argument. The same wrong number was propagated to two further published doc comments, `src/core/helpers.ts:60` and `src/core/validators.ts:181`, so a fix confined to `src/core/types.ts:207` leaves two copies behind. The `validators.ts` copy is not arithmetically contradicted on its own (its `checks` and `control` are empty), but it is the same figure and drifts if only one is changed.

**Repair.**

In `src/core/types.ts:207`, raise the example's `elapsed` above the `max(case) + max(control) = 513` floor to a value that reads as two sequential phases of concurrent stages plus coordination — for example `elapsed: 528` — and update the echoed figure at `src/core/helpers.ts:60` to `'probe 01J8Z0 (528 ms)'` and at `src/core/validators.ts:181` to the same number in the same commit.

<details><summary>Evidence</summary>

```text
The `Verdict` @example, `src/core/types.ts:194-209`:

```
   194	 * const verdict: Verdict = {
   197	 * 	checks: [
   198	 * 		{ stage: 'type', elapsed: 61, findings: [] },
   199	 * 		{ stage: 'lint', elapsed: 17, findings: [] },
   200	 * 		{ stage: 'runtime', elapsed: 259, findings: [] },
   201	 * 	],
   202	 * 	control: [
   203	 * 		{ stage: 'type', elapsed: 58, findings: [broke] },
   204	 * 		{ stage: 'lint', elapsed: 16, findings: [] },
   205	 * 		{ stage: 'runtime', elapsed: 254, findings: [] },
   206	 * 	],
   207	 * 	elapsed: 337,
```

The field's own doc, `src/core/types.ts:221-222`:

```
   221		/** Milliseconds the whole call took, including both the case and the control. */
   222		readonly elapsed: number
```

The only construction site of a `Verdict` in `src/` is `src/server/Probe.ts:94-100` (grep for `Verdict` across `src/` returns constructions only at `Probe.ts:94` and the spread at `Probe.ts:102`):

```
    90			const started = performance.now()
    91			const id = randomUUID()
    92			const checks = Object.freeze(await this.#inspect(claim.case, claim))
    93			const control = Object.freeze(await this.#inspect(claim.control, claim))
    94			const basis: Verdict = {
    99				elapsed: Math.round(performance.now() - started),
```

`started` is taken before the case phase (line 90 precedes line 92), and the control phase is `await`ed strictly after the case phase (line 93 after line 92), so the two phases are disjoint sequential intervals inside the measured window.

Within one phase the three stages run concurrently, `src/server/Probe.ts:203-209`:

```
   203		#inspect(subject: Case, claim: Claim): Promise<readonly Check[]> {
   204			return Promise.all([
   205				this.#type.inspect(subject, claim.project),
   206				this.#lint.inspect(subject),
   207				this.#inspectRuntime(subject, claim),
   208			])
   209		}
```

They are three distinct objects with three separate serialization queues, so nothing serializes them against each other — `src/server/stages/TypeStage.ts:44` `#tail: Promise<void> = Promise.resolve()`, `src/server/stages/LintStage.ts:43` `#tail: Promise<void> = Promise.resolve()`, `src/server/stages/RuntimeStage.ts:38` `#tail: Promise<void> = Promise.resolve()`.

Each per-stage `elapsed` is measured inside the phase, after the queue wait, never including it — `src/server/stages/TypeStage.ts:82` `const inspection = this.#tail.then(() => this.#inspect(subject, project))`, then `src/server/stages/TypeStage.ts:143-161`:

```
   143		async #inspect(subject: Case, project?: string): Promise<Check> {
   144		const started = performance.now()
   161				elapsed: Math.round(performance.now() - started),
```

Same shape at `src/server/stages/LintStage.ts:125-135` (`const started = performance.now()` at 126, `elapsed: Math.round(performance.now() - started)` at 135) and `src/server/stages/RuntimeStage.ts:117-139` (`started` at 118, `elapsed` at 139).

So every check's measured interval is contained in its phase's interval, and the verdict's window contains both phases end to end. The floor is therefore `max(case) + max(control)`:

`max(61, 17, 259) + max(58, 16, 254) = 259 + 254 = 513`

The example reports `337`. 337 < 513, by 176 ms — three orders of magnitude past the ±1 ms that `Math.round` at four sites can move. The example is not merely underived; it is below the arithmetic floor the code guarantees.

Where 337 comes from: `61 + 17 + 259 = 337`, the case column summed, control omitted.

The same figure is echoed at `src/core/helpers.ts:60`:

```
    60	 * formatVerdict(verdict).split('\n')[0] // 'probe 01J8Z0 (337 ms)'
```

and at `src/core/validators.ts:181`:

```
   181	 * isVerdict({ id: '01J8Z0', toolchain, checks: [], control: [], elapsed: 337 }) // true
```

The repository's own test fixture uses the other convention and is not impossible — `tests/src/core/helpers.test.ts:57-75` pairs checks `11, 12, 13` and control `14, 15, 16` with `elapsed: 81`, and `11+12+13+14+15+16 = 81`. That one clears the floor (`13 + 16 = 29 <= 81`), because a wall-clock total may freely exceed the stage sum through overhead; it may never fall below `max(case) + max(control)`.
```

</details>

### L4 — PARTLY-REPRODUCED

**Correction.**

L4 is correct but imprecise in one place and understated in three.

Imprecise: "recycling is conditional" reads as if the `#recycle` call were guarded. It is not — line 223 runs unconditionally once `expire` is emitted. What is conditional is the replacement install at line 248, gated by line 247 on `this.#destroyed || this.#runtime !== stage`.

Understated, first: the defect is not confined to the event-map line. The `@remarks` at src/core/types.ts:233 says the deadline "killed a worker" — same false past tense, same emit instant, and a repair that touches only line 246 leaves it standing.

Understated, second: src/server/Probe.ts:29-30 promises the deadline "abandons and replaces a hung runtime stage" with no qualification, which line 247 contradicts. Three sites, not one.

Understated, third: even on the branch where the guard passes, "was recycled" overstates. `stage.destroy()` is raced against a second deadline and every failure is swallowed (237-243), so the hung worker may still be alive when `#recycle` resolves. All that is guaranteed is that a fresh `RuntimeStage` was constructed. So the doc is wrong on tense at emit time, wrong on certainty of the replacement, and wrong on certainty that the old worker died.

Nothing in L4 is refuted: emit strictly precedes recycling (222 before 223, same-tick dispatch), and the replacement is genuinely conditional with both disjuncts reachable from the shipped MCP handler.

**Repair.**

Restate the event doc in the present, over what is true at emit time — src/core/types.ts:246: `/** The coordinator's deadline fired; the runtime worker is being replaced. */` — and fix the two matching sites in the same change: drop "killed a worker" at src/core/types.ts:233 for "the coordinator's own deadline fired", and qualify src/server/Probe.ts:29-30 to say the deadline abandons the hung stage and replaces it unless the probe is destroyed or the stage was already replaced. If a listener must know the outcome rather than the intent, that is a separate `recycle` event emitted after line 248, not a rewording of `expire`.

<details><summary>Evidence</summary>

```text
Both halves of L4 hold against the source; nothing in it is refuted. The correction is one of precision and scope.

THE DOC (shipped source, src/core/types.ts):
- 246: `	/** The coordinator's deadline fired and the runtime worker was recycled. */`
- 247: `	readonly expire: readonly [claim: Claim]`

Second doc site with the same past tense, which L4 does not name — src/core/types.ts:
- 231: ` * `arm` fires when the boot control has reported red and the service will answer calls; a probe`
- 232: ` * arriving before it awaits that step rather than starting a second one. `expire` fires when the`
- 233: ` * coordinator's own deadline killed a worker, which is the only way a synchronous infinite loop is`
- 234: ` * ever reported.`

THE EMIT SITE, src/server/Probe.ts `#inspectRuntime`:
- 211: `	async #inspectRuntime(subject: Case, claim: Claim): Promise<Check> {`
- 212: `		const stage = this.#runtime`
- 216-219: `			return await Promise.race([` / `				stage.inspect(subject),` / `				this.#expiry(timeout, `The runtime stage exceeded ${this.#deadline} ms`),` / `			])`
- 220: `		} catch (error) {`
- 221: `			if (!timeout.expired) throw error`
- 222: `			this.#emitter.emit('expire', claim)`
- 223: `			await this.#recycle(stage)`
- 224: `			throw error`

Line 222 precedes line 223, and it is the only `emit('expire', …)` in the tree (grep over src and tests returns exactly `src/server/Probe.ts:222`). Nothing has been destroyed or replaced when it runs. Dispatch is same-tick, so listeners observe the event strictly before recycling begins — node_modules/@orkestrel/emitter/dist/src/core/index.js:41-42: `* - **Synchronous.** `emit` invokes listeners in registration order, in the` / `*   current tick.`, and the body at 108-117 calls `handler(...args)` inline with no queue. First half of L4 confirmed.

THE RECYCLE, src/server/Probe.ts:
- 230: `	async #recycle(stage: RuntimeStage): Promise<void> {`
- 237-240: `		await Promise.race([` / `			stage.destroy(),` / `			this.#expiry(timeout, `The runtime stage recovery exceeded ${this.#deadline} ms`),` / `		])`
- 241-243: `		} catch {` / `			// The failure belongs to the stage being replaced, and the replacement below is the` / `			// recovery the caller is owed.`
- 247: `		if (this.#destroyed || this.#runtime !== stage) return`
- 248: `		this.#runtime = new RuntimeStage(this.#workspace)`

Line 247 is the conditional. Both of its disjuncts are reachable in shipped code:
- `this.#destroyed` is set synchronously in `destroy()` before teardown — src/server/Probe.ts:113: `		this.#destroyed = true` — so a `destroy()` overlapping an in-flight expiry short-circuits the replacement.
- `this.#runtime !== stage` needs two concurrent runtime inspections. `Probe` has no queue or lock: `prove` (86-109) awaits `#arming` and proceeds, and the shipped MCP tool handler calls it with no serialization — src/server/factories.ts:64-67: `				execute: async (input) => {` / `					if (!isClaim(input)) throw new Error('The prove tool requires a valid claim')` / `					return probe.prove(input)` / `				},`. Two `tools/call` requests in flight both capture the same `stage` at line 212; the first to reach 248 installs the replacement, and the second emits `expire` at 222 and then returns at 247 having installed nothing.

Third site making the same unconditional promise, src/server/Probe.ts:
- 29-30: ` * report their respective changes. Each runtime inspection has a coordinator-owned deadline that` / ` * abandons and replaces a hung runtime stage.`

COVERAGE: the only test that observes the event drives one claim at a time — tests/src/server/Probe.test.ts:177-178: `			await expect(probe.prove(hanging)).rejects.toThrow('The runtime stage exceeded 6000 ms')` / `			expect(expirations.calls).toStrictEqual([[hanging]])`. It exercises only the path where the guard passes, so no test pins either conditional branch.

Question answered: what the shipped code does. `src/server/Probe.ts` and `src/server/factories.ts` are shipped; the test is cited only for coverage.
```

</details>
