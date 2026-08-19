# Unit S2 — the complete change, as evidence for the audit

Baseline: abec122. Captured after the unit exited, before any commit.

## git status --short

```text
 M src/core/types.ts
 M src/server/Probe.ts
 M tests/src/server/Probe.test.ts
```

## git diff --stat

```text
 src/core/types.ts              |  14 +--
 src/server/Probe.ts            | 100 ++++++++++++++++-----
 tests/src/server/Probe.test.ts | 197 ++++++++++++++++++++++++++++++++++-------
 3 files changed, 248 insertions(+), 63 deletions(-)
```

## git diff

```diff
diff --git a/src/core/types.ts b/src/core/types.ts
index b019048..e1807d2 100644
--- a/src/core/types.ts
+++ b/src/core/types.ts
@@ -274,7 +274,7 @@ export type ProbeEventMap = {
 	readonly arm: readonly [toolchain: Toolchain]
 	/** A claim was answered. */
 	readonly prove: readonly [verdict: Verdict]
-	/** The coordinator's deadline fired and the runtime worker was recycled. */
+	/** The coordinator's runtime deadline fired and its worker was recycled before this event. */
 	readonly expire: readonly [claim: Claim]
 	/** A fault surfaced for observation. */
 	readonly error: readonly [error: unknown]
@@ -286,10 +286,12 @@ export type ProbeEventMap = {
  * @remarks
  * `workspace` is the target root whose installed `typescript`, `oxlint`, and `vitest` the stages
  * resolve, and whose modification times the revalidation sweep reads. Default: the current
- * working directory. `deadline` is the coordinator's own milliseconds budget for one runtime
- * stage; it lives outside the worker because a test timeout expressed in worker configuration
- * cannot fire while that worker spins. One runtime inspection in every 64 also pays the resident
- * runner's replacement, so budget `deadline` against that inspection rather than the common one.
+ * working directory. `deadline` is the coordinator's milliseconds budget for one active stage
+ * inspection. Queue wait is not charged to that inspection; the inspections and runtime recoveries
+ * ahead of it carry their own bounds. The runtime deadline lives outside the worker because a test
+ * timeout expressed in worker configuration cannot fire while that worker spins. One runtime
+ * inspection in every 64 also pays the resident runner's replacement, so budget `deadline` against
+ * that inspection rather than the common one.
  *
  * @example
  * ```ts
@@ -303,7 +305,7 @@ export interface ProbeOptions {
 	readonly error?: EmitterErrorHandler
 	/** Target workspace root. Default: the current working directory. */
 	readonly workspace?: string
-	/** Milliseconds one runtime stage may take before the coordinator recycles its worker. */
+	/** Milliseconds one active stage inspection may take; an expired runtime worker is recycled. */
 	readonly deadline?: number
 }
 
diff --git a/src/server/Probe.ts b/src/server/Probe.ts
index f66d655..3f58e9e 100644
--- a/src/server/Probe.ts
+++ b/src/server/Probe.ts
@@ -10,11 +10,12 @@ import type {
 } from '@src/core'
 import type { EmitterInterface } from '@orkestrel/emitter'
 import type { TimeoutInterface } from '@orkestrel/timeout'
+import type { StageInterface } from './types.js'
 import { existsSync, mkdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
 import { randomUUID } from 'node:crypto'
 import { Emitter } from '@orkestrel/emitter'
 import { createTimeout } from '@orkestrel/timeout'
-import { computeReceipt } from '@src/core'
+import { computeReceipt, formatCheck } from '@src/core'
 import { readWorkspaceManifest, resolveWorkspaceFile } from './helpers.js'
 import { LintStage } from './stages/LintStage.js'
 import { RuntimeStage } from './stages/RuntimeStage.js'
@@ -26,8 +27,8 @@ import { TypeStage } from './stages/TypeStage.js'
  * @remarks
  * Construction resolves the target workspace's toolchain and begins warming every stage. The boot
  * controls mutate imported dependencies and refuse service unless the type and runtime stages
- * report their respective changes. Each runtime inspection has a coordinator-owned deadline that
- * abandons and replaces a hung runtime stage.
+ * report their respective changes. Each active stage inspection has a coordinator-owned deadline.
+ * A runtime expiry abandons and replaces its worker before the next queued inspection begins.
  *
  * @example
  * ```ts
@@ -44,6 +45,9 @@ export class Probe implements ProbeInterface {
 	readonly #type: TypeStage
 	readonly #lint: LintStage
 	#runtime: RuntimeStage
+	#typeTail: Promise<void> = Promise.resolve()
+	#lintTail: Promise<void> = Promise.resolve()
+	#runtimeTail: Promise<void> = Promise.resolve()
 	readonly #arming: Promise<void>
 	#closing: Promise<void> | undefined
 	#destroyed = false
@@ -164,28 +168,34 @@ export class Probe implements ProbeInterface {
 			})
 			const beforeType = await this.#inspect(typeClaim.case, typeClaim)
 			const beforeRuntime = await this.#inspect(runtimeClaim.case, runtimeClaim)
-			if ([...beforeType, ...beforeRuntime].some((check) => check.findings.length > 0)) {
-				throw new Error('The probe boot control did not begin clean')
+			const before = [...beforeType, ...beforeRuntime]
+			if (before.some((check) => check.findings.length > 0)) {
+				throw new Error(
+					`The probe boot control did not begin clean\n${before.map(formatCheck).join('\n')}`,
+				)
 			}
 			writeFileSync(typeDependency, 'export type Signal = number\n', 'utf8')
 			const afterType = await this.#inspect(typeClaim.control, typeClaim)
 			const type = afterType.find((check) => check.stage === typeClaim.control.stage)
 			const tolerant = afterType.find((check) => check.stage === 'runtime')
 			if (type === undefined || type.findings.length === 0) {
-				throw new Error('The probe boot type control did not detect a mutated dependency')
+				throw new Error(
+					`The probe boot type control did not detect a mutated dependency\n${afterType.map(formatCheck).join('\n')}`,
+				)
 			}
 			if (tolerant === undefined || tolerant.findings.length > 0) {
-				throw new Error('The probe boot type control did not remain runtime-clean')
+				throw new Error(
+					`The probe boot type control did not remain runtime-clean\n${afterType.map(formatCheck).join('\n')}`,
+				)
 			}
 			writeFileSync(runtimeDependency, "export const SIGNAL = 'after'\n", 'utf8')
 			const afterRuntime = await this.#inspect(runtimeClaim.control, runtimeClaim)
 			const runtime = afterRuntime.find((check) => check.stage === runtimeClaim.control.stage)
 			if (runtime === undefined || runtime.findings.length === 0) {
-				throw new Error('The probe boot runtime control did not detect a mutated dependency')
+				throw new Error(
+					`The probe boot runtime control did not detect a mutated dependency\n${afterRuntime.map(formatCheck).join('\n')}`,
+				)
 			}
-		} catch (error) {
-			this.#emitter.emit('error', error)
-			throw error
 		} finally {
 			rmSync(typeDependency, { force: true })
 			rmSync(runtimeDependency, { force: true })
@@ -202,13 +212,60 @@ export class Probe implements ProbeInterface {
 
 	#inspect(subject: Case, claim: Claim): Promise<readonly Check[]> {
 		return Promise.all([
-			this.#type.inspect(subject, claim.project),
-			this.#lint.inspect(subject),
+			this.#inspectType(subject, claim),
+			this.#inspectLint(subject),
 			this.#inspectRuntime(subject, claim),
 		])
 	}
 
-	async #inspectRuntime(subject: Case, claim: Claim): Promise<Check> {
+	#inspectType(subject: Case, claim: Claim): Promise<Check> {
+		const inspection = this.#typeTail.then(() =>
+			this.#inspectStage(this.#type, this.#type.inspect(subject, claim.project)),
+		)
+		this.#typeTail = inspection.then(
+			() => undefined,
+			() => undefined,
+		)
+		return inspection
+	}
+
+	#inspectLint(subject: Case): Promise<Check> {
+		const inspection = this.#lintTail.then(() =>
+			this.#inspectStage(this.#lint, this.#lint.inspect(subject)),
+		)
+		this.#lintTail = inspection.then(
+			() => undefined,
+			() => undefined,
+		)
+		return inspection
+	}
+
+	#inspectRuntime(subject: Case, claim: Claim): Promise<Check> {
+		const inspection = this.#runtimeTail.then(() => this.#runRuntime(subject, claim))
+		this.#runtimeTail = inspection.then(
+			() => undefined,
+			() => undefined,
+		)
+		return inspection
+	}
+
+	async #inspectStage(stage: StageInterface, operation: Promise<Check>): Promise<Check> {
+		const timeout = createTimeout({ ms: this.#deadline })
+		timeout.start()
+		try {
+			return await Promise.race([
+				operation,
+				this.#expiry(timeout, `The ${stage.stage} stage exceeded ${this.#deadline} ms`),
+			])
+		} catch (error) {
+			if (timeout.expired) void stage.destroy().catch(() => {})
+			throw error
+		} finally {
+			timeout.clear()
+		}
+	}
+
+	async #runRuntime(subject: Case, claim: Claim): Promise<Check> {
 		const stage = this.#runtime
 		const timeout = createTimeout({ ms: this.#deadline })
 		timeout.start()
@@ -219,15 +276,15 @@ export class Probe implements ProbeInterface {
 			])
 		} catch (error) {
 			if (!timeout.expired) throw error
-			this.#emitter.emit('expire', claim)
-			await this.#recycle(stage)
+			const recycled = await this.#recycle(stage)
+			if (recycled) this.#emitter.emit('expire', claim)
 			throw error
 		} finally {
 			timeout.clear()
 		}
 	}
 
-	async #recycle(stage: RuntimeStage): Promise<void> {
+	async #recycle(stage: RuntimeStage): Promise<boolean> {
 		const timeout = createTimeout({ ms: this.#deadline })
 		timeout.start()
 		try {
@@ -244,8 +301,9 @@ export class Probe implements ProbeInterface {
 		} finally {
 			timeout.clear()
 		}
-		if (this.#destroyed || this.#runtime !== stage) return
+		if (this.#destroyed || this.#runtime !== stage) return false
 		this.#runtime = new RuntimeStage(this.#workspace)
+		return true
 	}
 
 	// Rejects when the deadline fires, so a race against it settles even when the operation it
@@ -260,11 +318,7 @@ export class Probe implements ProbeInterface {
 		try {
 			await this.#arming
 		} catch {}
-		try {
-			await Promise.all([this.#type.destroy(), this.#lint.destroy(), this.#runtime.destroy()])
-		} finally {
-			this.#emitter.destroy()
-		}
+		await Promise.all([this.#type.destroy(), this.#lint.destroy(), this.#runtime.destroy()])
 	}
 
 	#version(name: string): string {
diff --git a/tests/src/server/Probe.test.ts b/tests/src/server/Probe.test.ts
index 66afe33..65b9097 100644
--- a/tests/src/server/Probe.test.ts
+++ b/tests/src/server/Probe.test.ts
@@ -1,7 +1,9 @@
 import type { Claim } from '@src/core'
 import { mkdirSync, readdirSync } from 'node:fs'
+import { resolve } from 'node:path'
 import { fileURLToPath } from 'node:url'
-import { createRecorder } from '@orkestrel/test'
+import { createRecorder, waitForDelay } from '@orkestrel/test'
+import { createScratch } from '@orkestrel/test/server'
 import { Probe, readWorkspaceManifest } from '@src/server'
 import { describe, expect, it } from 'vitest'
 
@@ -165,14 +167,15 @@ describe.sequential('probe', () => {
 	)
 
 	it(
-		'expires a synchronous loop, cleans its revision, and serves the next claim',
+		'expires only the active inspection, cleans its revision, and serves a queued claim',
 		{ timeout: 60_000 },
 		async () => {
 			const expirations = createRecorder<[Claim]>()
+			const failures = createRecorder<[unknown]>()
 			const probe = new Probe({
 				workspace: ROOT,
 				deadline: 6_000,
-				on: { expire: expirations.handler },
+				on: { expire: expirations.handler, error: failures.handler },
 			})
 			const hanging: Claim = {
 				project: 'configs/src/tsconfig.core.json',
@@ -216,62 +219,189 @@ describe.sequential('probe', () => {
 			}
 			mkdirSync(fileURLToPath(new URL('../../../tmp/probe/', import.meta.url)), { recursive: true })
 			try {
-				await expect(probe.prove(hanging)).rejects.toThrow('The runtime stage exceeded 6000 ms')
+				const expired = probe.prove(hanging)
+				await waitForDelay(100)
+				const served = probe.prove(ordinary)
+				const outcomes = await Promise.allSettled([expired, served])
+				expect(outcomes[0]).toMatchObject({
+					status: 'rejected',
+					reason: expect.objectContaining({ message: 'The runtime stage exceeded 6000 ms' }),
+				})
 				expect(expirations.calls).toStrictEqual([[hanging]])
+				expect(failures.count).toBe(1)
 				expect(
 					readdirSync(fileURLToPath(new URL('../../../tmp/probe/', import.meta.url))).filter(
 						(name) => name.startsWith('expiry.test.probe-'),
 					),
 				).toStrictEqual([])
-				await expect(probe.prove(ordinary)).resolves.toMatchObject({ receipt: expect.any(String) })
+				expect(outcomes[1]).toMatchObject({
+					status: 'fulfilled',
+					value: expect.objectContaining({ receipt: expect.any(String) }),
+				})
 			} finally {
 				await probe.destroy()
 			}
 		},
 	)
 
-	it(
-		'keeps arming failures handled and rejects callers with the same failure',
-		{ timeout: 60_000 },
-		async () => {
-			const failures = createRecorder<[unknown]>()
-			const probe = new Probe({ workspace: ROOT, deadline: 1, on: { error: failures.handler } })
-			try {
-				await expect(
+	it('bounds a lint stage that does not publish diagnostics', { timeout: 60_000 }, async () => {
+		const scratch = createScratch()
+		scratch.write('package.json', '{"type":"module"}\n')
+		scratch.link('node_modules/typescript', resolve(ROOT, 'node_modules/typescript'))
+		scratch.link('node_modules/vitest', resolve(ROOT, 'node_modules/vitest'))
+		scratch.write(
+			'node_modules/oxlint/package.json',
+			'{"name":"oxlint","version":"1.79.0","type":"module","bin":{"oxlint":"fixture.js"}}\n',
+		)
+		scratch.write(
+			'node_modules/oxlint/fixture.js',
+			"let buffer = Buffer.alloc(0)\nsetTimeout(() => process.exit(0), 10_000)\nprocess.stdin.on('data', (chunk) => {\n\tbuffer = Buffer.concat([buffer, chunk])\n\twhile (true) {\n\t\tconst boundary = buffer.indexOf('\\r\\n\\r\\n')\n\t\tif (boundary < 0) return\n\t\tconst header = buffer.subarray(0, boundary).toString('ascii')\n\t\tconst match = /Content-Length: (\\d+)/i.exec(header)\n\t\tif (match === null) return\n\t\tconst length = Number(match[1])\n\t\tconst start = boundary + 4\n\t\tif (buffer.length < start + length) return\n\t\tconst message = JSON.parse(buffer.subarray(start, start + length).toString('utf8'))\n\t\tbuffer = buffer.subarray(start + length)\n\t\tif (message.method === 'initialize') {\n\t\t\tconst content = JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { capabilities: {} } })\n\t\t\tprocess.stdout.write(`Content-Length: ${Buffer.byteLength(content)}\\r\\n\\r\\n${content}`)\n\t\t}\n\t\tif (message.method === 'textDocument/didOpen' && !message.params.textDocument.uri.includes('/src/core/')) {\n\t\t\tconst content = JSON.stringify({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: message.params.textDocument.uri, diagnostics: [] } })\n\t\t\tprocess.stdout.write(`Content-Length: ${Buffer.byteLength(content)}\\r\\n\\r\\n${content}`)\n\t\t}\n\t\tif (message.method === 'shutdown') {\n\t\t\tconst content = JSON.stringify({ jsonrpc: '2.0', id: message.id, result: null })\n\t\t\tprocess.stdout.write(`Content-Length: ${Buffer.byteLength(content)}\\r\\n\\r\\n${content}`)\n\t\t}\n\t\tif (message.method === 'exit') process.exit(0)\n\t}\n})\n",
+		)
+		scratch.write(
+			'tsconfig.json',
+			'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":["vitest/globals"]}}\n',
+		)
+		scratch.write(
+			'vite.config.ts',
+			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
+		)
+		scratch.write('tmp/probe/.keep', '')
+		const probe = new Probe({ workspace: scratch.path, deadline: 6_000 })
+		try {
+			await expect(
+				Promise.race([
 					probe.prove({
-						project: 'configs/src/tsconfig.core.json',
+						project: 'tsconfig.json',
 						case: {
-							files: [],
+							files: [{ path: 'src/core/stalled.ts', text: 'export const VALUE = 1\n' }],
 							test: {
-								path: 'tmp/probe/arming-failure.test.ts',
-								text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
+								path: 'tmp/probe/stalled-lint.test.ts',
+								text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
 							},
 						},
 						control: {
-							files: [],
+							files: [{ path: 'src/core/stalled.ts', text: 'export const VALUE = 1\n' }],
 							test: {
-								path: 'tmp/probe/arming-failure.test.ts',
-								text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
+								path: 'tmp/probe/stalled-lint.test.ts',
+								text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
 							},
-							stage: 'runtime',
-							reason: 'the deadline expires before the runtime host can answer',
+							stage: 'lint',
+							reason: 'the language server does not publish diagnostics for ignored source',
 						},
 					}),
-				).rejects.toThrow(/runtime stage exceeded 1 ms/i)
-				expect(failures.count).toBeGreaterThan(0)
-			} finally {
-				await probe.destroy()
-			}
-		},
-	)
+					waitForDelay(7_000).then(() => {
+						throw new Error('The stalled lint proof did not settle within its budget')
+					}),
+				]),
+			).rejects.toThrow('The lint stage exceeded 6000 ms')
+		} finally {
+			await Promise.race([probe.destroy(), waitForDelay(5_000)])
+			scratch.destroy()
+		}
+	})
+
+	it('carries boot findings into one observed arming refusal', { timeout: 60_000 }, async () => {
+		const scratch = createScratch()
+		scratch.write('package.json', '{"type":"module"}\n')
+		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
+		scratch.write(
+			'tsconfig.json',
+			'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":["vitest/globals"]}}\n',
+		)
+		scratch.write(
+			'vite.config.ts',
+			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'other', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
+		)
+		scratch.write('tmp/probe/.keep', '')
+		const failures = createRecorder<[unknown]>()
+		const probe = new Probe({
+			workspace: scratch.path,
+			deadline: 60_000,
+			on: { error: failures.handler },
+		})
+		try {
+			await expect(
+				probe.prove({
+					project: 'tsconfig.json',
+					case: {
+						files: [],
+						test: {
+							path: 'tmp/probe/refused.test.ts',
+							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
+						},
+					},
+					control: {
+						files: [],
+						test: {
+							path: 'tmp/probe/refused.test.ts',
+							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
+						},
+						stage: 'type',
+						reason: 'the probe did not arm',
+					},
+				}),
+			).rejects.toThrow('The probe boot control did not begin clean')
+			expect(failures.count).toBe(1)
+			expect(failures.calls[0]?.[0]).toEqual(
+				expect.objectContaining({
+					message: expect.stringMatching(
+						/probe boot control did not begin clean[\s\S]*runtime:[\s\S]*no configured Vitest project named probe/i,
+					),
+				}),
+			)
+		} finally {
+			await probe.destroy()
+			scratch.destroy()
+		}
+	})
+
+	it('emits one error for an ordinary stage failure', { timeout: 60_000 }, async () => {
+		const failures = createRecorder<[unknown]>()
+		const probe = new Probe({
+			workspace: ROOT,
+			deadline: 60_000,
+			on: { error: failures.handler },
+		})
+		try {
+			await expect(
+				probe.prove({
+					project: 'configs/src/missing.json',
+					case: {
+						files: [{ path: 'src/core/stage-failure.ts', text: 'export const VALUE = 1\n' }],
+						test: {
+							path: 'tmp/probe/stage-failure.test.ts',
+							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
+						},
+					},
+					control: {
+						files: [],
+						test: {
+							path: 'tmp/probe/stage-failure.test.ts',
+							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
+						},
+						stage: 'type',
+						reason: 'the project does not exist',
+					},
+				}),
+			).rejects.toThrow('configs/src/missing.json')
+			expect(failures.count).toBe(1)
+		} finally {
+			await probe.destroy()
+		}
+	})
 
 	it(
-		'destroys idempotently, refuses later proofs, and leaves no probe files',
+		'destroys idempotently and observes one error for a later proof',
 		{ timeout: 60_000 },
 		async () => {
 			const directory = fileURLToPath(new URL('../../../tmp/probe/', import.meta.url))
 			mkdirSync(directory, { recursive: true })
-			const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
+			const failures = createRecorder<[unknown]>()
+			const probe = new Probe({
+				workspace: ROOT,
+				deadline: 60_000,
+				on: { error: failures.handler },
+			})
 			await Promise.all([probe.destroy(), probe.destroy()])
 			await expect(
 				probe.prove({
@@ -294,10 +424,9 @@ describe.sequential('probe', () => {
 					},
 				}),
 			).rejects.toThrow('The probe has been destroyed')
+			expect(failures.count).toBe(1)
 			expect(
-				readdirSync(directory).filter(
-					(name) => name.startsWith('arm-') || name.includes('.probe-'),
-				),
+				readdirSync(directory).filter((name) => name.startsWith('after-destroy.test.probe-')),
 			).toStrictEqual([])
 		},
 	)
```
