CLAIM 1: PLAUSIBLE
Evidence: `src/server/stages/LintStage.ts:98` returns when `#ending` records an earlier signal death. Lines 99-104 observe a signal arriving during teardown, while lines 347-350 record the signal and reject the pending shutdown request. The stage test could not be executed safely on this host.

CLAIM 2: PLAUSIBLE
Evidence: `src/server/stages/LintStage.ts:238-240` throws `The Oxlint language server exited with ${this.#ending}`. Lines 347-350 record `signal SIGKILL`, and lines 169-172 convert the failed document open into the inspection’s rejection. The stage test could not be executed safely on this host.

CLAIM 3: PLAUSIBLE
Evidence: `src/server/stages/LintStage.ts:157-172` attaches cleanup before opening the document and converts a failed send into the returned promise’s rejection. Lines 184-188 delete the document registrations before returning. The spawned-host proof could not be executed safely on this host.

CLAIM 4: CONFIRMED
Evidence: `src/server/stages/LintStage.ts:131` contains `child.stdin.on('error', (error) => this.#fail(error))`. Lines 338-345 reject pending stage work and clear its registrations.

CLAIM 5: CONFIRMED
Evidence: `src/server/stages/LintStage.ts:159` installs `diagnostics.finally(() => this.#close(uri))`. Lines 184-189 delete `#documents`, `#publishes`, and `#refusals` before any possible `didClose` notification and skip that notification when the server is unreachable.

CLAIM 6: REFUTED
Evidence: `.oxlintrc.json:76-80` exempts exactly `configs/policy.ts`, but `src/server/stages/LintStage.ts:197-208` rewrites that path to `tests/probe-<uuid>.policy.ts`:

```ts
const directory =
	(axis === 'src' || axis === 'app') && environment !== undefined && environment !== ''
		? `${axis}/${environment}`
		: 'tests'
return resolveWorkspaceFile(
	this.#workspace,
	`${directory}/probe-${randomUUID()}.${basename(declared)}`,
)
```

Direct framed LSP runs with identical `export default {}` text returned no diagnostics for `configs/policy.ts` and `import(no-default-export): Prefer named exports` for `tests/probe-a.policy.ts`. Exact-path overrides still select the wrong rule set.

CLAIM 7: PLAUSIBLE
Evidence: These commands returned code `0` for two malformed protocol inputs:

```text
printf 'Content-Length: 1\r\n\r\n{' | timeout 5s node node_modules/oxlint/bin/oxlint --lsp >/dev/null
malformed_json_status=0

printf 'X-Test: 1\r\n\r\n{}' | timeout 5s node node_modules/oxlint/bin/oxlint --lsp >/dev/null
missing_length_status=0
```

A framed `textDocument/didOpen` containing 400,000 `(` characters returned:

```text
generator_status=0 oxlint_status=139
Segmentation fault
```

The candidate signal death reproduced. These samples do not establish the universal “every malformed input” assertion.

CLAIM 8: REFUTED
Evidence: `src/server/stages/LintStage.ts:132` routes the child’s `error` event only to `#fail`; only the `exit` handler at lines 347-350 sets `#ending`. This command demonstrates a child-process failure that emits `error` and `close`, but no `exit`:

```text
node -e 'const child = require("node:child_process").spawn("/definitely/missing/orkestrel-oxlint", [], { stdio: "pipe" }); child.on("error", (error) => console.log("error=" + error.code)); child.on("exit", (code, signal) => console.log("exit=" + code + "," + signal)); child.on("close", (code, signal) => console.log("close=" + code + "," + signal)); setTimeout(() => {}, 100)'
```

Output:

```text
error=ENOENT
close=-2,null
```

That ending path never sets the claimed complete liveness fact.

CLAIM 9: REFUTED
Evidence: `src/server/stages/LintStage.ts:214-217` registers the maps before the cleanup `try` begins:

```ts
const response = new Promise<unknown>((resolve, reject) => {
	this.#responses.set(id, resolve)
	this.#failures.set(id, reject)
})
try {
	this.#send({ jsonrpc: '2.0', id, method, params })
```

If the first `Map.set` succeeds and the second throws, the Promise constructor converts the throw into a rejection, execution continues, and a successful `#send` leaves the `#responses` entry behind. The catch at lines 220-227 only runs when `#send` throws.

CLAIM 10: REFUTED
Evidence: `tests/src/server/stages/LintStage.test.ts:140-168` tests only the suffix override `*.config.ts`, which survives the generated basename. The test is named `applies the workspace lint overrides the declared path selects`, but it passes while the exact-path `configs/policy.ts` override demonstrated under claim 6 remains broken. The test therefore passes without proving the claim it names.

CLAIM 11: REFUTED
Evidence: `src/core/types.ts:30` documents `Source.path` as the “Workspace-relative path the stages resolve the text against.” Lines 192-208 of `LintStage.ts` instead resolve `configs/policy.ts` as a generated path under `tests`, and the claim 6 run shows that this changes the lint result.

The destroy contract also remains vulnerable. `src/core/types.ts:343-346` promises settlement, but `LintStage.ts:110-116` awaits the shutdown response. If the child exits with code `0` before replying, lines 347-349 suppress `#fail`, leaving the shutdown request and `destroy()` pending.

CLAIM 12: REFUTED
Evidence: `/home/user/scaffold/.claude/rules/tests.md:151-164` requires reusable fixtures and helpers in setup infrastructure and requires test files to import them. `tests/src/server/stages/LintStage.test.ts:18-112` instead declares `SERVER`, `FIXTURE`, `PASSING`, `HOST`, and `killFixtureServer` locally. Several tests reuse those declarations. The returned report acknowledges this placement deviation; the rule provides no exemption.

CLAIM 13: PLAUSIBLE
Evidence: `git diff --name-status e11c389..dcd50a3` returned exactly:

```text
M	src/server/stages/LintStage.ts
M	tests/src/server/stages/LintStage.test.ts
```

`git ls-tree -r --name-only dcd50a3 -- tmp/scratch tmp/probe` returned nothing, so no instrument was committed. The ignored scratch state at author return is not recoverable: the live directory was concurrently mutated after the commit and evidence capture.

CLAIM 14: CONFIRMED
Evidence: `src/server/stages/LintStage.ts:71` awaits `#warmth` before line 75 can call `#document`. The sole `#reachable` use is in `#close` at line 188, after the document promise has completed. A false value during warming cannot affect the first inspection.

CLAIM 15: REFUTED
Evidence: `src/server/stages/LintStage.ts:110-116` waits for a shutdown response before sending `exit`. If the child exits cleanly before returning that response, lines 347-350 execute:

```ts
this.#ending = code === null ? `signal ${signal ?? 'unknown'}` : `code ${code}`
if (this.#destroyed && code === 0) return
```

The suppression skips `#fail`, leaving the shutdown request unresolved and deadlocking teardown. It cannot distinguish the expected post-notification exit from a premature clean exit.

Out-of-scope findings

None.

What you could not execute

The stage’s Vitest suite, spawned-host proof, and mutation/revert runs were not executed. This host’s Node-spawned-Node stdio behavior can produce the false greens prohibited by the brief. The exhaustive malformed-input half of claim 7 and the ignored `tmp/scratch` state at commit time also could not be established.

VERDICT: FAIL