# Test-helper adoption audit — returned group results

Three disjoint groups over the 18 helpers `@orkestrel/test` publishes. `@orkestrel/test` is already a
declared devDependency at `^0.0.7`, so every adoption is deletion of a local re-implementation rather
than a new package. Captured as each group returned.

## Group 1 — fixtures-lifecycle

### `createHostileValues` — ADOPT WITH A DIFFERENCE

**Evidence.**

Probe hand-rolls a two-member hostile population at tests/src/core/validators.test.ts:104-105, asserted at :149-150 inside the test named 'agrees with the compiled claim shape for a named hostile population' (:93):

  const nullPrototype = Object.assign(Object.create(null), claim)
  const throwingProxy = new Proxy({}, Object.create(WeakMap.prototype))
  ...
  expect(isClaim(nullPrototype), 'null-prototype object').toBe(compiled(nullPrototype))
  expect(isClaim(throwingProxy), 'throwing proxy').toBe(compiled(throwingProxy))

The package publishes `createHostileValues(): readonly unknown[]` (node_modules/@orkestrel/test/dist/src/core/index.d.ts), a frozen six-member set whose TSDoc directs exactly this use: 'test the whole returned set in a loop and include the index in each failure', and warns 'Membership may grow in a release'.

I ran both populations through probe's real `isClaim` and `compileGuard(CLAIM_SHAPE)` (dist/src/core/index.js + @orkestrel/contract). Axis coverage per hostile value, measured:

  probe throwingProxy       get=THROWS  ownKeys=ok      getPrototypeOf=ok      has=THROWS
  published[2] get-throw    get=THROWS  ownKeys=ok      getPrototypeOf=ok      has=ok
  published[3] ownKeys      get=ok      ownKeys=THROWS  getPrototypeOf=ok      has=ok
  published[4] proto        get=ok      ownKeys=ok      getPrototypeOf=THROWS  has=ok
  published[1] revoked      get=THROWS  ownKeys=THROWS  getPrototypeOf=THROWS  has=THROWS

probe's `throwingProxy` is fully subsumed: published members 1 and 2 together cover both axes it exercises. Probe tests no `ownKeys` trap failure, no `getPrototypeOf` trap failure, and no cyclic self-reference.

The swap lands green today. All six published members already agree across both guards:

  AGREE 0: cyclic                        isClaim=false compiled=false
  AGREE 1: revoked proxy                 isClaim=false compiled=false
  AGREE 2: get-throwing proxy            isClaim=false compiled=false
  AGREE 3: ownKeys-throwing proxy        isClaim=false compiled=false
  AGREE 4: getPrototypeOf-throwing proxy isClaim=false compiled=false
  AGREE 5: Object.create(null)           isClaim=false compiled=false

The difference: keep `nullPrototype` (:104). It is seeded with a valid claim and both guards return **true** for it, so it is probe's only null-prototype *accept* case; the package's bare `Object.create(null)` is refused. The package publishes no equivalent, so that one value stays hand-rolled under the rule's 'only where the package exports none for the job' clause. Delete `throwingProxy` (:105) and its assertion (:150).

**Benefit.**

Deletes the hand-rolled proxy at validators.test.ts:105 and its one-off assertion at :150, replacing them with one indexed loop over the published six. Closes three hostile axes the differential test never exercised — a throwing `ownKeys` trap, a throwing `getPrototypeOf` trap, and a cyclic self-reference — which matters because `isClaim` is `recordOf(...)` and the test's own 'extra key' case (:130) proves the compiled guard enumerates keys, so the `ownKeys` axis is live code that no test drives. Probe also inherits future members: the TSDoc states membership may grow in a release, so a looped adoption picks up new hostiles at the next re-pin instead of staying frozen at two.

### `createTeardown` — ADOPT WITH A DIFFERENCE

**Evidence.**

Counted, not recalled: 32 `finally {` blocks across probe's suite at abad0f6, of which 18 hold a single teardown statement and **14** hold two or more. The multi-statement set, with measured statement counts:

  tests/src/server/Probe.test.ts:162 (2), :304 (2), :359 (2)
  tests/src/server/stages/TypeStage.test.ts:68 (2), :188 (5)
  tests/src/server/stages/RuntimeStage.test.ts:201 (2), :229 (2), :287 (2), :356 (2), :433 (2), :465 (11)
  tests/src/bin/main.test.ts:219 (11), :309 (12), :353 (6)

The worst is tests/src/server/stages/TypeStage.test.ts:188:

  } finally {
    session.disconnect()
    Reflect.deleteProperty(globalThis, '__probeTypeStage')
    await stage.destroy()
    rmSync(resolve(ROOT, firstProject), { force: true })
    rmSync(resolve(ROOT, secondProject), { force: true })
  }

The package publishes `createTeardown(): TeardownInterface` with `add(handler)` and `destroy()`, whose contract is 'Every handler runs, including after an earlier one throws or rejects' and which throws the single failure by identity or an `AggregateError` when several fail.

I ran the TypeStage:188 shape both ways with the first cleanup throwing:

  inline finally  -> ['disconnect failed', ['disconnect']]
  createTeardown  -> ['disconnect failed', ['disconnect','deleteGlobal','stage.destroy','rmSync first','rmSync second']]

A throwing `session.disconnect()` today strands four of five cleanups: `globalThis.__probeTypeStage` survives into every later test in the file, the TypeStage language service and its watchers leak, and two files under `tmp/probe/` are left behind. The helper runs all five and still surfaces the failure. Registration in acquisition order gives newest-first teardown that matches the order probe already wrote, so no block reorders.

Two differences, stated plainly:

1. This is NOT pure deletion. `teardown.add(() => stage.destroy())` plus `try { } finally { await teardown.destroy() }` is roughly line-for-line what the block already costs. The payoff is failure isolation, not line count. A brief that promises deletion here is wrong.
2. REJECT for the 18 single-statement blocks — tests/src/server/Probe.test.ts:92, :125, :241, :395; tests/src/server/stages/LintStage.test.ts:27; TypeStage.test.ts:39, :95; RuntimeStage.test.ts:42, :65, :111, :173, :256, :363; tests/config.test.ts:664, :723, :761, :791, :862. One resource has no ordering hazard, and the helper is strictly more code there.

Probe hand-rolls no teardown *list*: a grep for cleanup arrays, `afterEach` registration, and `onTestFinished` across every committed test file returns nothing but the string 'runtime-cleanup' in a test name. So there is no reimplemented helper to delete — what is duplicated 14 times is the ordered-cleanup semantic, inline, each copy carrying the same defect.

One site needs care on adoption: tests/src/server/Probe.test.ts:305 wraps its first cleanup as `await Promise.race([probe.destroy(), waitForDelay(5_000)])`. `createTeardown` supplies no timeout, so that stays a bounded handler inside `add`.

**Benefit.**

Closes a real leak class at 14 sites: a rejecting first cleanup currently strands every later one. Proven at TypeStage.test.ts:188, where 4 of 5 cleanups are skipped — leaving a `globalThis` property that contaminates subsequent tests in the same file, an undestroyed TypeScript language service, and two orphaned files under `tmp/probe/`. The same pattern strands `scratch.destroy()` behind `await probe.destroy()` at Probe.test.ts:304 and :359, and behind `await stage.destroy()` at RuntimeStage.test.ts:201, :287, and :433 — each one an orphaned temporary directory on the host whenever a stage teardown rejects. Adoption also replaces silent loss with an `AggregateError` naming every failed handler, so a teardown defect reports itself instead of surfacing later as an unrelated flake.

### `resolveRoot` — ADOPT WITH A DIFFERENCE

**Evidence.**

Probe computes the workspace root by hand at seven sites, in three different forms and at three different depths:

  tests/config.test.ts:27                          const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  tests/src/bin/main.test.ts:10                    const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
  tests/src/server/Probe.test.ts:10                const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
  tests/src/server/helpers.test.ts:19              const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
  tests/src/server/stages/LintStage.test.ts:5      const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
  tests/src/server/stages/RuntimeStage.test.ts:13  const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
  tests/src/server/stages/TypeStage.test.ts:11     const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

(server line numbers read from `git show abad0f6:` per the torn-read instruction; LintStage sits at :5 committed, :6 in the working tree.)

tests/src/server/Probe.test.ts recomputes the same URL inline three more times at :263, :276, and :447 as `new URL('../../../tmp/probe/', import.meta.url)`.

The package publishes `resolveRoot(meta: ImportMeta): URL`, implemented as `new URL('../', meta.url)`, whose TSDoc says it 'Resolves the parent directory of a calling module, which is the workspace root when called from the conventional `tests/setup.ts` location.'

I ran resolveRoot against each call site's real module URL:

  tests/config.test.ts                       -> /workspace/probe/
  tests/setup.ts                             -> /workspace/probe/
  tests/src/server/stages/TypeStage.test.ts  -> /workspace/probe/tests/src/server/   (wrong)

So `resolveRoot` is depth-1 only. It substitutes directly at exactly one of the seven sites — tests/config.test.ts:27, whose hand-rolled `resolve(dirname(fileURLToPath(import.meta.url)), '..')` yields `/workspace/probe`, identical modulo a trailing separator that every consumer absorbs (`resolve(root, path)` at :39, :57, :67 and 15 more; `{ cwd: root }` at :271). Probe already tolerates the trailing separator: the six `ROOT` constants all carry one.

The difference: do not swap per file. Put the single call in `tests/setup.ts` and export the result. That file is 0 bytes today and is already registered as a setup file for all six vitest projects (vite.config.ts:45, 95, 131, 150, 165, 184), so every test can reach it, and probe already imports shared test support from a sibling — tests/config.test.ts:24 imports `createPolicyScratch` from './setupPolicy.js'. Adding `export const ROOT = fileURLToPath(resolveRoot(import.meta))` there lets all seven files import one root, which is the usage the helper's own TSDoc names.

**Benefit.**

Deletes seven hand-rolled root computations and the two `node:url` / `node:path` import lines that exist only to serve them, replacing them with one import each. Closes the depth-drift fragility the varying `../../../` versus `../../../../` already encodes: moving a test file between `tests/src/server/` and `tests/src/server/stages/` today silently retargets ROOT one directory off, and nothing fails loudly — `resolve(ROOT, 'tmp/probe')` just points at a path that does not exist, so the test reads as a stage defect rather than a moved file. A single exported ROOT is depth-independent and cannot drift. It also collapses the three inline recomputations at tests/src/server/Probe.test.ts:263, :276, and :447, which are three more copies of the same brittle count.

## Group 2 — core-values

### `requireValue` — ADOPT

**Evidence.**

Two hand-rolled absence guards in probe-owned tests, both read from the committed tree at abad0f6 (both files are unmodified in the working tree, so the line numbers hold in both).

1. /workspace/probe/tests/src/server/stages/TypeStage.test.ts:137-138
```ts
const stageId = evaluated.result.objectId
if (stageId === undefined) throw new Error('The debugger did not expose the type stage')
```

2. /workspace/probe/tests/src/server/stages/RuntimeStage.test.ts:328-329
```ts
const project = vitest.projects.find((candidate) => candidate.name === 'probe')
if (project === undefined) throw new Error('The probe project did not load')
```

Package signature (node_modules/@orkestrel/test/dist/src/core/index.d.ts): `export declare function requireValue<T>(value: T | null | undefined, message?: string): T` — "Requires a value to be present… @returns The present value." That is the same guard, generalized.

Ran the narrowing rather than reasoning about it. Typecheck probe against probe's own installed compiler and package (TypeScript 6.0.3, strict, moduleResolution Bundler, node_modules symlinked to /workspace/probe/node_modules): `requireValue(projects.find(…), 'The probe project did not load').name` and `const stageId: string = requireValue(objectId, '…')` both compile. EXIT=0.

SCOPE EXCLUSION, stated so it is not re-derived: /workspace/probe/tests/config.test.ts carries eleven more guards of exactly this shape (lines 52, 54, 236, 295, 297, 821, and others). It is NOT a probe adoption site. `diff -q node_modules/@orkestrel/scaffold/dist/host/tests/config.test.ts tests/config.test.ts` reports IDENTICAL — it is a vendored scaffold file — and .claude/rules/tests.md:155-157 states: "For the vendored test set (`tests/setupPolicy.ts`, `tests/policy.test.ts`, and `tests/config.test.ts`), keep shared helpers within that set instead of importing them from `@orkestrel/test`." Same for tests/policy.test.ts and tests/setupPolicy.ts, both also byte-identical to the vendored copies.

One further site is adjacent but is a different defect: TypeStage.test.ts:160-162 guards `servicesId === undefined || residentId === undefined`, and lines 163-165 then guard `typeof servicesId !== 'string' || typeof residentId !== 'string'`. Both values are `unknown` (read off an `isRecord`-narrowed record), so `requireValue` returns `unknown` and buys no narrowing, and the string check already subsumes the undefined check. That guard should be deleted outright, not converted.

**Benefit.**

Deletes two local re-implementations of a declared package helper, closing the `.claude/rules/tests.md:165` violation ("Never reimplement a framework helper in tests or fixtures"). Honest on size: this is roughly line-neutral, not a line win — site 1 collapses 2 lines to 1, site 2 grows to a wrapped 4-line call under the formatter. The real gains are that absence-checking has one form across the suite instead of two ad-hoc ones, and that `requireValue` also refuses `null`, which `=== undefined` does not.

### `captureError` — REJECT

**Evidence.**

Probe never binds a thrown value, so there is no hand-rolled equivalent to delete. `grep -rn "catch" tests/ --include=*.ts` over probe-owned files returns exactly two catch clauses, both bare and value-free: /workspace/probe/tests/src/bin/main.test.ts:230 and :321, each `} catch {}` swallowing a failed `rmdirSync(directory)` in a `finally`. There is no `catch (error)`, no `let caught`, no `error.message` or `.code` assertion anywhere under tests/src/ (`grep -rn "catch (\|let error\|let caught\|const caught\|thrown"` → zero hits; `grep -rn "\.code\b\|instanceof Error\|error\.message" tests/src/` → zero hits).

Every throw assertion already routes through the Vitest matcher, which is the framework helper for this job: sync at /workspace/probe/tests/src/server/helpers.test.ts:25, 63, 70, 79, 84 (`expect(() => inferTypeProject('tests/src/core/value.test.ts')).toThrow(…)`), async at tests/src/server/stages/LintStage.test.ts:75, TypeStage.test.ts:208, RuntimeStage.test.ts:492, and Probe.test.ts:346, 393, 436, 476 (`await expect(inspection).rejects.toThrow('The lint stage has been destroyed')`).

The package signature is `captureError(thunk: () => unknown): unknown` — synchronous, and it returns the value rather than asserting on it. It cannot serve any `.rejects` site because it does not await, and at the sync sites it would replace a matcher that already produces a better failure report with a manual `expect(captureError(…)).toMatchObject({ message: … })`. The one place probe does inspect an error object, tests/src/server/Probe.test.ts:352 `expect(failures.calls[0]?.[0]).toEqual(expect.objectContaining({ message: … }))`, reads an error handed to an `on: { error }` callback rather than thrown, and already uses `createRecorder`.

**Benefit.**

None. Adopting it would replace Vitest matchers with weaker manual assertions and would not reach the async sites at all.

### `roundTripJSON` — REJECT

**Evidence.**

Probe never round-trips a local value through JSON. `grep -rn "JSON.parse\|JSON.stringify\|structuredClone" tests/` over probe-owned files yields three kinds of use, none of them a copy:

1. Parsing real wire frames off a spawned child's stdout — /workspace/probe/tests/src/bin/main.test.ts:159 `const responses: readonly unknown[] = lines.map((line) => JSON.parse(line))` and :294 `response = JSON.parse(frame)`. The serializing side is the process under test, not the test.
2. Reading a real file — tests/src/bin/main.test.ts:16 `JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))`.
3. LSP Content-Length framing inside fixture-script string literals that a child process executes — tests/src/server/Probe.test.ts:258 and tests/src/server/stages/LintStage.test.ts:15, 29. Those are protocol-faithful fixture servers, not test-process code.

No `JSON.parse(JSON.stringify(value))` exists anywhere in probe. The single deep copy in the repository is /workspace/probe/tests/config.test.ts:466 `const controlled = structuredClone(parsed)`, and it fails twice over: config.test.ts is a vendored scaffold file (`diff -q` against node_modules/@orkestrel/scaffold/dist/host/tests/config.test.ts reports IDENTICAL) that .claude/rules/tests.md:155-157 bars from importing `@orkestrel/test`; and its purpose is to clone an `unknown` Oxlint config record so the test can mutate it into a control, not to prove a value survives serialization. `roundTripJSON<T>(value: T & JSONSafe<T>): T` is a JSON-safety instrument that throws on non-finite numbers — a semantic mismatch for a mutation clone, where native `structuredClone` is correct.

**Benefit.**

None. There is no hand-rolled round trip to delete, and the one deep copy is a vendored file the rule forbids from importing this package.

### `collect` — REJECT

**Evidence.**

`collect<T>(source: AsyncIterable<T>): Promise<readonly T[]>` drains to completion. Every async read in probe's tests exits early or is read concurrently with a live child, so a full drain deadlocks.

1. /workspace/probe/tests/src/bin/main.test.ts:148-156 —
```ts
const output = createInterface({ input: child.stdout })
try {
	await waitForDelay(250)
	child.stdin.write(requests.map((request) => JSON.stringify(request)).join('\n') + '\n')
	for await (const line of output) {
		const frame = line.replaceAll('[?25l', '').replaceAll('[?25h', '')
		if (frame.trim() !== '') lines.push(frame)
		if (lines.length === requests.length) break
	}
```
The readline interface is an `AsyncIterable<string>`, so `collect(output)` typechecks — and never resolves. The MCP server child is long-lived and is killed only in the `finally` at :219-224. The loop must break at a frame count and must strip terminal escape sequences per frame; `collect` gives neither.
2. tests/src/bin/main.test.ts:291-296 — same shape, `break` after the first non-empty frame.
3. tests/src/bin/main.test.ts:146-147 `const errors: Buffer[] = []` / `child.stderr.on('data', (chunk: Buffer) => errors.push(chunk))`, asserted at :158 `expect(Buffer.concat(errors).toString('utf8')).not.toContain('Error')`. That assertion runs while the child is still alive; `collect(child.stderr)` resolves only at stream end, which is after the kill at :219. Incremental accumulation is required, not a drain. (This array-and-push IS a near-duplicate of `createRecorder`, a different group's helper — recorded here so it is not lost.)
4. tests/src/server/stages/RuntimeStage.test.ts:308-309 `const output = new PassThrough()` / `output.resume()` — a discard sink handed to `createVitest` as `{ stdout: output, stderr: output }` at :326. Nothing is collected.

Probe has no drain-to-completion site.

**Benefit.**

None. Substituting `collect` at any of these sites converts a bounded read into a hang, because the producing child process outlives the assertion in every case.

### `collectStream` — REJECT

**Evidence.**

`collectStream<T>(stream: ReadableStream<T>): Promise<readonly T[]>` takes a Web `ReadableStream`. Probe has none. `grep -rn "ReadableStream\|toWeb\|Readable.from\|getReader()" tests/ src/ --include=*.ts` across the whole repository (both directories, all TypeScript) returns zero hits.

Every stream probe touches is a Node `stream.Readable`: `child.stdout` and `child.stderr` from `node:child_process` `spawn` at /workspace/probe/tests/src/bin/main.test.ts:145-148, and `PassThrough` from `node:stream` at /workspace/probe/tests/src/server/stages/RuntimeStage.test.ts:5 and :308. Adopting `collectStream` would require inserting `Readable.toWeb(child.stderr)` at each site — adding a conversion probe does not have today rather than deleting probe code, which is the opposite of an adoption.

The framing objection stands independently. Probe's stream work is LSP Content-Length reframing (tests/src/server/Probe.test.ts:258 and tests/src/server/stages/LintStage.test.ts:15, 29, where a child reassembles `\r\n\r\n`-delimited headers off `process.stdin` chunk by chunk) and newline-delimited JSON-RPC frames read with early exit. Neither is "drain a stream into an array"; both need incremental boundary detection over a producer that has not ended.

**Benefit.**

None. Probe has no Web ReadableStream to collect, and reaching one would mean adding a `Readable.toWeb` wrapper rather than removing probe code.

## Group 3 — server-filesystem

### `resolveContained` — REJECT

**Evidence.**

Zero probe-owned TEST file contains containment logic. `git grep -n "startsWith('\.\.')\|isAbsolute\|relative(" abad0f6 -- tests` (excluding the vendored `tests/setupPolicy.ts`) returns no hits; the suite only exercises containment through the public API at /workspace/probe/tests/src/server/helpers.test.ts:59-66. The hand-rolled equivalent the brief points at is /workspace/probe/src/server/helpers.ts:15-23 (commit abad0f6): `export function resolveWorkspaceFile(workspace: string, target: string): string { const root = resolve(workspace); const file = resolve(root, target); const path = relative(root, file); if (path.startsWith('..') || isAbsolute(path)) { throw new Error(`Path escapes the workspace: ${target}`) } return file }`. That file is PUBLISHED RUNTIME SOURCE — it is re-exported by /workspace/probe/src/server/index.ts:2 and built into `dist/src/server`. `@orkestrel/test` is a devDependency (package.json devDependencies, ^0.0.7); probe's runtime `dependencies` are @orkestrel/contract, emitter, mcp, queue, timeout, tool only. Importing `@orkestrel/test/server` there would promote a test-only package to a runtime dependency — a dependency addition, which the brief excludes and AGENTS.md forbids without an explicit user request. The signatures also disagree: `resolveContained(root, target): string | undefined` returns `undefined` on escape, while `resolveWorkspaceFile` throws a message three tests and every stage error path depend on. Three further hand-rolled copies live in /workspace/probe/configs/helpers.ts — `workspacePath` at :58 (guard at :59-60), `isBoundaryExemptModule` at :66 (guard at :115-121), and `containedPath` at :130 (guard at :131-134) — but that file is Vite build configuration imported by vite.config.ts:5, not a test or fixture, and its helpers return different shapes (a forward-slash relative string, and a boolean) rather than the absolute path `resolveContained` returns.

**Benefit.**

None available as a deletion; the symbol cannot legally reach either site. The audit did surface one real defect worth a successor unit. I ran both implementations side by side (node script comparing /workspace/probe/src/server/helpers.ts:15 against the package export, root=/workspace/probe): probe's `path.startsWith('..')` is a bare prefix test, so it REFUSES two contained paths the package accepts — `..hidden.ts` and `..config/value.ts` both THROW `Path escapes the workspace`, while `resolveContained` returns them as contained. The package guards `contained === '..' || contained.startsWith('..' + sep)` instead. No escape passes either implementation (`../outside.ts`, `..`, `/etc/passwd`, `./a/../../escape.ts` are refused by both), so the containment itself is sound — probe is strictly over-strict, refusing a legitimate dot-prefixed workspace file. The corrected form is already written correctly in probe's own tree at /workspace/probe/configs/helpers.ts:131-134; the fix is to align src/server/helpers.ts:19 with it, not to import the package. Separately, configs/helpers.ts:130 `containedPath` is an exact predicate duplicate of `resolveContained` (I confirmed the root edge matches: `containedPath(root, root)` is true and `resolveContained(root, root)` returns the root path), which is a near-duplicate defect under `.claude/rules/tests.md` only if that file were a test — it is not.

### `createLoopback` — REJECT

**Evidence.**

Probe binds no socket anywhere. `grep -rn "node:net\|node:http\|node:https\|createServer\|Socket\|WebSocket\|\.listen(" tests/ src/` over the working tree returns nothing outside the vendored `tests/setupPolicy.ts`, and the same grep against every committed server test at abad0f6 returns nothing. `createLoopback(server: Server)` calls `server.listen(0, '127.0.0.1')` and returns an `http://127.0.0.1:<port>` origin (node_modules/@orkestrel/test/dist/src/server/index.js:283-304); probe has no `node:net` server to hand it. Probe's own MCP transport is stdio: /workspace/probe/src/server/factories.ts:5 imports `createStdioServer` from `@orkestrel/mcp/server`, and src/server/types.ts:62 documents it as "the probe's Model Context Protocol stdio transport". The protocol-faithful fixture server the brief mentions is likewise stdio, not TCP — /workspace/probe/tests/src/server/Probe.test.ts:257-258 (abad0f6) writes `node_modules/oxlint/fixture.js`, an LSP server that reads `Content-Length` frames off `process.stdin` and writes replies to `process.stdout`, launched as a spawned child rather than bound to a port.

**Benefit.**

None. There is no port to allocate and no server to tear down, so adopting would add an import with no call site.

### `removeTree` — REJECT

**Evidence.**

Probe hand-rolls no removal retry. `git grep -n "rmSync\|rmdirSync\|maxRetries\|retryDelay\|EPERM\|EBUSY\|ENOTEMPTY" abad0f6 -- src tests` (excluding vendored files) shows every probe-owned removal is a single unretried call: /workspace/probe/tests/src/bin/main.test.ts:318 and :358, tests/src/server/stages/RuntimeStage.test.ts:231, :357, :473, and tests/src/server/stages/TypeStage.test.ts:70, :192, :193 all call `rmSync(<file>, { force: true })` on one file; main.test.ts:229 and :320 call `rmdirSync(directory)` on an empty directory inside `try {} catch {}`. `removeTree(path: string): void` takes an absolute DIRECTORY and loops up to REMOVE_TREE_MAX_ATTEMPTS past EPERM/EBUSY/ENOTEMPTY — probe has written no such loop to delete. The one probe test that hits the exact race `removeTree` documents already routes through it: tests/src/bin/main.test.ts:329-359 spawns a child with `cwd: scratch.path` (line 334), SIGTERMs it, then calls `scratch.destroy()` at line 359, and `createScratch`'s `destroy()` calls `removeTree(path)` after a `matchesIdentity` guard (node_modules/@orkestrel/test/dist/src/server/index.js, destroy body ending `removeTree(path)`). The only recursive removal in a probe-owned test, RuntimeStage.test.ts:473 `rmSync(resolve(directory, file), { force: true, recursive: true })`, deletes marker-matched entries under the shared `tmp/probe`, which is not the scratch allocation `removeTree` is contracted for.

**Benefit.**

None as a deletion. Probe already consumes removeTree transitively through the one createScratch call it makes, so the Windows EPERM retry is covered without an import. Swapping the single-file rmSync calls for removeTree would widen them from a file removal to a tree removal, which is a behavior change rather than a consolidation.

### `matchesIdentity` — REJECT

**Evidence.**

Probe reads no directory identity. `git grep -n "statSync\|lstatSync\|\.ino\b\|\.dev\b\|birthtime\|\.birth\b" abad0f6 -- tests src` (excluding vendored files) returns exactly two hits, both in production source and neither an identity comparison: /workspace/probe/src/server/stages/TypeStage.ts:5 imports `statSync` and :239 uses it for a cache key, `return `disk:${statSync(file).mtimeMs}``. No probe file constructs a `{ device, inode, birth }` triple or compares one. The helper exists to prove an allocated scratch directory is still the same allocation before removal, and probe never re-identifies a directory it allocated — it hands that to `createScratch`, whose `destroy()` already calls `matchesIdentity` internally (node_modules/@orkestrel/test/dist/src/server/index.js, destroy guard) before `removeTree`.

**Benefit.**

None. Probe already gets the identity guard for free on every `scratch.destroy()` call (tests/src/bin/main.test.ts:359 and the createScratch sites in tests/src/server/Probe.test.ts and RuntimeStage.test.ts). A direct import would have no argument to pass it.

### `readInventory` — REJECT

**Evidence.**

Probe has no source-inventory reader and no test project that would need one. Its Vitest projects are `src:core`, `src:server`, `src:bin`, `policy`, `config`, and `probe` (/workspace/probe/vite.config.ts:195, labels at :43, :92, :129, :148, :163, :182) — there is no `guides` project, and package.json's `test` script runs only `test:src && test:policy && test:config`. `readInventory(root, targets, options)` returns file contents keyed by sorted root-relative paths, which is the shape a guide-parity or docs-parity test consumes; probe writes no such test even though it ships a `guides/` directory. The only directory reads in probe-owned tests are targeted `readdirSync` filters over one known directory, not keyed walks: tests/src/bin/main.test.ts:343-351 filters `tmp/probe` for names starting `arm-type-`/`arm-runtime-`, tests/src/server/Probe.test.ts:233 and :436 filter the same directory by a revision prefix, and RuntimeStage.test.ts:422-431 lists `node_modules/.vite` and `tmp/probe`. None reads file CONTENTS keyed by path, and none walks recursively. The one `globSync` in the tree is at tests/config.test.ts:264, which is vendored — `diff -q node_modules/@orkestrel/scaffold/dist/host/tests/config.test.ts tests/config.test.ts` reports identical, so probe does not own it.

**Benefit.**

None. There is no walk to delete. If probe later adds a guides-parity test, readInventory is the helper for it — that is a future creation gate, not a consolidation available today.

### `isExcluded` — REJECT

**Evidence.**

No probe-owned test matches a root-relative key against an exclusion set. `isExcluded(key, exclusions)` is the segment-wise ancestor matcher that `readInventory` applies to its `InventoryOptions.exclude` list (node_modules/@orkestrel/test/dist/src/server/index.js:58-60, `exclusions.some((rule) => rule === '' || key === rule || key.startsWith(`${rule}/`))`). Probe rules out readInventory entirely (see that finding), so its dependent matcher has no subject either. The word `exclude` appears in probe's tests only at tests/config.test.ts:199 and :215, where it reads a Vitest project's own `exclude` array to check config shape — and that file is vendored and unmodified (`diff -q` against node_modules/@orkestrel/scaffold/dist/host/tests/config.test.ts reports identical). The filters probe does write test a name PREFIX on a flat directory listing, not a path-segment ancestor rule: tests/src/bin/main.test.ts:344 `name.startsWith('arm-type-')`, tests/src/server/Probe.test.ts:234 `name.startsWith('expiry.test.probe-')`, :436 `name.startsWith('after-destroy.test.probe-')`. Those are inclusion filters over sibling filenames with no directory component; `isExcluded` would invert the sense and add a `/` boundary rule that has nothing to bound.

**Benefit.**

None. Substituting it into the prefix filters would change what they match, so this is not a deletion.

### `REMOVE_TREE_MAX_ATTEMPTS, REMOVE_TREE_RETRY_DELAY_MS, REMOVE_TREE_RETRYABLE_CODES` — REJECT

**Evidence.**

These three constants are the published parameters of `removeTree`'s retry loop (node_modules/@orkestrel/test/dist/src/server/index.js:10, :14, :18-21 — 10 attempts, 100ms, `['EBUSY','ENOTEMPTY','EPERM']`), exported so a test can assert the retry policy rather than hard-code it. Probe declares no competing constant: `git grep -n "maxRetries\|retryDelay\|EPERM\|EBUSY\|ENOTEMPTY" abad0f6 -- src tests` returns one hit outside vendored files, and it is an assertion on a message string, not a retry parameter — /workspace/probe/tests/src/core/helpers.test.ts:248 expects `'The runtime stage could not delete the generated specification (EPERM: operation not permitted)'`, which formats an error probe's runtime stage surfaces to the caller and never retries. Probe also declares no removal retry loop at all (see the removeTree finding), so there is no attempt count, delay, or code list of its own to replace. A consumer only imports these to test removeTree's own policy, which belongs to @orkestrel/test's suite.

**Benefit.**

None. There is no magic number or inline code list in probe to delete, and importing the constants would add three unused symbols.

### `resolveRoot` — ADOPT WITH A DIFFERENCE

**Evidence.**

Probe computes the workspace root by hand at seven sites, in three different forms and at three different depths:

  tests/config.test.ts:27                          const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  tests/src/bin/main.test.ts:10                    const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
  tests/src/server/Probe.test.ts:10                const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
  tests/src/server/helpers.test.ts:19              const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
  tests/src/server/stages/LintStage.test.ts:5      const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
  tests/src/server/stages/RuntimeStage.test.ts:13  const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
  tests/src/server/stages/TypeStage.test.ts:11     const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

(server line numbers read from `git show abad0f6:` per the torn-read instruction; LintStage sits at :5 committed, :6 in the working tree.)

tests/src/server/Probe.test.ts recomputes the same URL inline three more times at :263, :276, and :447 as `new URL('../../../tmp/probe/', import.meta.url)`.

The package publishes `resolveRoot(meta: ImportMeta): URL`, implemented as `new URL('../', meta.url)`, whose TSDoc says it 'Resolves the parent directory of a calling module, which is the workspace root when called from the conventional `tests/setup.ts` location.'

I ran resolveRoot against each call site's real module URL:

  tests/config.test.ts                       -> /workspace/probe/
  tests/setup.ts                             -> /workspace/probe/
  tests/src/server/stages/TypeStage.test.ts  -> /workspace/probe/tests/src/server/   (wrong)

So `resolveRoot` is depth-1 only. It substitutes directly at exactly one of the seven sites — tests/config.test.ts:27, whose hand-rolled `resolve(dirname(fileURLToPath(import.meta.url)), '..')` yields `/workspace/probe`, identical modulo a trailing separator that every consumer absorbs (`resolve(root, path)` at :39, :57, :67 and 15 more; `{ cwd: root }` at :271). Probe already tolerates the trailing separator: the six `ROOT` constants all carry one.

The difference: do not swap per file. Put the single call in `tests/setup.ts` and export the result. That file is 0 bytes today and is already registered as a setup file for all six vitest projects (vite.config.ts:45, 95, 131, 150, 165, 184), so every test can reach it, and probe already imports shared test support from a sibling — tests/config.test.ts:24 imports `createPolicyScratch` from './setupPolicy.js'. Adding `export const ROOT = fileURLToPath(resolveRoot(import.meta))` there lets all seven files import one root, which is the usage the helper's own TSDoc names.

**Benefit.**

Deletes seven hand-rolled root computations and the two `node:url` / `node:path` import lines that exist only to serve them, replacing them with one import each. Closes the depth-drift fragility the varying `../../../` versus `../../../../` already encodes: moving a test file between `tests/src/server/` and `tests/src/server/stages/` today silently retargets ROOT one directory off, and nothing fails loudly — `resolve(ROOT, 'tmp/probe')` just points at a path that does not exist, so the test reads as a stage defect rather than a moved file. A single exported ROOT is depth-independent and cannot drift. It also collapses the three inline recomputations at tests/src/server/Probe.test.ts:263, :276, and :447, which are three more copies of the same brittle count.
