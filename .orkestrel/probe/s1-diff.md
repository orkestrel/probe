# Unit S1 — the complete change, as evidence for the audit

Baseline: 938eb04. Captured after S1 exited, before any commit.

## git status --short

```text
 M src/server/stages/RuntimeStage.ts
 M tests/src/bin/main.test.ts
 M tests/src/server/Probe.test.ts
 M tests/src/server/stages/RuntimeStage.test.ts
```

## git diff --stat

```text
 src/server/stages/RuntimeStage.ts            | 127 +++++++++++++++++++++------
 tests/src/bin/main.test.ts                   | 106 ++++++++++++++++------
 tests/src/server/Probe.test.ts               |  40 ++++++++-
 tests/src/server/stages/RuntimeStage.test.ts |  85 +++++++++++++++---
 4 files changed, 292 insertions(+), 66 deletions(-)
```

## git diff

```diff
diff --git a/src/server/stages/RuntimeStage.ts b/src/server/stages/RuntimeStage.ts
index 3ebb1cf..e181c19 100644
--- a/src/server/stages/RuntimeStage.ts
+++ b/src/server/stages/RuntimeStage.ts
@@ -4,6 +4,7 @@ import type { TestProject, TestRunResult, Vitest } from 'vitest/node'
 import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
 import { createHash, randomUUID } from 'node:crypto'
 import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
+import { PassThrough } from 'node:stream'
 import { fileURLToPath } from 'node:url'
 import {
 	createRevisionFile,
@@ -99,19 +100,26 @@ export class RuntimeStage implements StageInterface {
 			throw new Error('The runtime stage does not share the workspace Vitest installation')
 		}
 		const { createVitest } = await import('vitest/node')
-		return createVitest('test', {
-			root: this.#workspace,
-			config: resolveWorkspaceFile(this.#workspace, 'vite.config.ts'),
-			watch: false,
-			run: true,
-			pool: 'threads',
-			reporters: [
-				{
-					onInit() {},
-					onTestRunEnd() {},
-				},
-			],
-		})
+		const output = new PassThrough()
+		output.resume()
+		return createVitest(
+			'test',
+			{
+				root: this.#workspace,
+				config: resolveWorkspaceFile(this.#workspace, 'vite.config.ts'),
+				watch: false,
+				run: true,
+				pool: 'threads',
+				reporters: [
+					{
+						onInit() {},
+						onTestRunEnd() {},
+					},
+				],
+			},
+			undefined,
+			{ stdout: output, stderr: output },
+		)
 	}
 
 	async #inspect(subject: Case): Promise<Check> {
@@ -122,12 +130,24 @@ export class RuntimeStage implements StageInterface {
 		const exitCode = process.exitCode
 		const vitest = await this.#vitest
 		if (this.#destroyed) throw new Error('The runtime stage has been destroyed')
+		const project = this.#project(vitest, subject.test.path)
+		if (project === undefined) {
+			return {
+				stage: this.stage,
+				elapsed: Math.round(performance.now() - started),
+				findings: [
+					{
+						path: subject.test.path,
+						message: 'Vitest ran no tests because no configured project matches the test path',
+					},
+				],
+			}
+		}
 		this.#revalidate(vitest)
 		const file = createRevisionFile(this.#workspace, subject.test.path, randomUUID())
 		if (!existsSync(dirname(file))) {
 			throw new Error(`The runtime test directory does not exist: ${dirname(file)}`)
 		}
-		const project = this.#project(vitest, subject.test.path)
 		writeFileSync(file, subject.test.text, { encoding: 'utf8', flag: 'wx' })
 		this.#revisions.add(file)
 		try {
@@ -141,23 +161,59 @@ export class RuntimeStage implements StageInterface {
 			}
 		} finally {
 			process.exitCode = exitCode
-			vitest.state.clearFiles(project, [file])
-			vitest.clearSpecificationsCache(file)
-			vitest.invalidateFile(file)
 			if (existsSync(file)) unlinkSync(file)
+			await this.#evict(vitest, file)
 			this.#revisions.delete(file)
 		}
 	}
 
-	#project(vitest: Vitest, path: string): TestProject {
+	#project(vitest: Vitest, path: string): TestProject | undefined {
 		// `inferTestProject` reads a workspace-relative path, and a caller declares whatever path it
 		// holds. An absolute one splits into leading segments that match no project, which silently
-		// selected the root project before this resolved — a project `invalidateFile` cannot reach.
+		// selected the root project before this resolved.
 		const name = inferTestProject(relative(this.#workspace, resolve(this.#workspace, path)))
-		if (name === undefined) throw new Error(`Cannot infer a Vitest project for ${path}`)
-		const project = vitest.projects.find((candidate) => candidate.name === name)
-		if (project === undefined) throw new Error(`The Vitest project ${name} does not exist`)
-		return project
+		if (name === undefined) return undefined
+		return vitest.projects.find((candidate) => candidate.name === name)
+	}
+
+	async #evict(vitest: Vitest, file: string): Promise<void> {
+		const ids: string[] = []
+		for (const [id, task] of vitest.state.idMap) {
+			const path = 'filepath' in task ? task.filepath : task.file.filepath
+			if (resolve(path) === resolve(file)) ids.push(id)
+		}
+		for (const id of ids) vitest.state.idMap.delete(id)
+		vitest.state.pathsSet.delete(file)
+		vitest.clearSpecificationsCache(file)
+		vitest.invalidateFile(file)
+		const graphs = vitest.projects.flatMap((project) =>
+			Object.values(project.vite.environments).map((environment) => environment.moduleGraph),
+		)
+		for (const graph of graphs) {
+			const modules = graph.getModulesByFile(file)
+			graph.onFileDelete(file)
+			if (modules === undefined) continue
+			for (const module of modules) {
+				for (const importer of module.importers) {
+					importer.importedModules.delete(module)
+					importer.acceptedHmrDeps.delete(module)
+				}
+				if (module.id !== null) graph.idToModuleMap.delete(module.id)
+				graph.urlToModuleMap.delete(module.url)
+			}
+			graph.fileToModulesMap.delete(file)
+		}
+		vitest.watcher.onFileDelete(file)
+		vitest.watcher.invalidates.delete(file)
+		vitest.cache.results.removeFromCache(relative(this.#workspace, file).replaceAll('\\', '/'))
+		await vitest.cache.results.writeToCache()
+		if (
+			vitest.state.filesMap.has(file) ||
+			ids.some((id) => vitest.state.idMap.has(id)) ||
+			graphs.some((graph) => graph.getModulesByFile(file) !== undefined)
+		) {
+			throw new Error(`Vitest retained the generated specification: ${file}`)
+		}
 	}
 
 	#revalidate(vitest: Vitest): void {
@@ -204,14 +260,35 @@ export class RuntimeStage implements StageInterface {
 	#findings(result: TestRunResult, file: string, original: string): readonly Finding[] {
 		const findings: Finding[] = []
 		for (const module of result.testModules) {
+			const before = findings.length
 			for (const error of module.errors()) findings.push(this.#finding(error, file, original))
 			for (const test of module.children.allTests('failed')) {
 				const errors = test.result().errors ?? []
 				for (const error of errors) findings.push(this.#finding(error, file, original))
 			}
-			if (module.state() === 'failed' && findings.length === 0) {
-				findings.push({ path: original, message: 'Vitest reported a failed test module' })
+			const state: string = module.state()
+			if (state === 'passed') continue
+			if (state === 'skipped') {
+				findings.push({ path: original, message: 'Vitest ran no tests in the module' })
+				continue
+			}
+			if (state === 'failed') {
+				if (findings.length === before) {
+					findings.push({ path: original, message: 'Vitest reported a failed test module' })
+				}
+				continue
+			}
+			if (state === 'pending' || state === 'queued') {
+				findings.push({
+					path: original,
+					message: `Vitest did not finish the test module (${state})`,
+				})
+				continue
 			}
+			findings.push({
+				path: original,
+				message: `Vitest reported an unrecognized test module state (${state})`,
+			})
 		}
 		for (const error of result.unhandledErrors) {
 			findings.push(this.#finding(error, file, original))
diff --git a/tests/src/bin/main.test.ts b/tests/src/bin/main.test.ts
index 166e1ce..357d97c 100644
--- a/tests/src/bin/main.test.ts
+++ b/tests/src/bin/main.test.ts
@@ -25,7 +25,7 @@ describe('bin entry', () => {
 	})
 
 	it(
-		'answers legacy and modern requests through the built stdio entry',
+		'answers both protocol eras without exposing worker output on stdout',
 		{ timeout: 60_000 },
 		async () => {
 			const modern = {
@@ -38,6 +38,59 @@ describe('bin entry', () => {
 				'io.modelcontextprotocol/clientInfo',
 				'io.modelcontextprotocol/protocolVersion',
 			])
+			const passing = {
+				project: 'configs/src/tsconfig.core.json',
+				case: {
+					files: [{ path: 'src/core/wire.ts', text: "export const VALUE = 'ok'\n" }],
+					test: {
+						path: 'tests/src/bin/wire-runtime.test.ts',
+						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
+					},
+				},
+				control: {
+					files: [{ path: 'src/core/wire.ts', text: "export const VALUE: number = 'bad'\n" }],
+					test: {
+						path: 'tests/src/bin/wire-runtime.test.ts',
+						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
+					},
+					stage: 'type',
+					reason: 'the source assigns a string to a number',
+				},
+			}
+			const withoutNewline = {
+				...passing,
+				case: {
+					...passing.case,
+					test: {
+						path: 'tests/src/bin/wire-without-newline-runtime.test.ts',
+						text: "import { expect, test } from 'vitest'\ntest('writes', () => { process.stdout.write('worker-without-newline'); expect(2 + 2).toBe(4) })\n",
+					},
+				},
+				control: {
+					...passing.control,
+					test: {
+						path: 'tests/src/bin/wire-without-newline-runtime.test.ts',
+						text: "import { expect, test } from 'vitest'\ntest('writes', () => { process.stdout.write('worker-without-newline'); expect(2 + 2).toBe(4) })\n",
+					},
+				},
+			}
+			const withNewline = {
+				...passing,
+				case: {
+					...passing.case,
+					test: {
+						path: 'tests/src/bin/wire-with-newline-runtime.test.ts',
+						text: "import { expect, test } from 'vitest'\ntest('writes', () => { process.stdout.write('worker-with-newline\\n'); expect(2 + 2).toBe(4) })\n",
+					},
+				},
+				control: {
+					...passing.control,
+					test: {
+						path: 'tests/src/bin/wire-with-newline-runtime.test.ts',
+						text: "import { expect, test } from 'vitest'\ntest('writes', () => { process.stdout.write('worker-with-newline\\n'); expect(2 + 2).toBe(4) })\n",
+					},
+				},
+			}
 			const requests = [
 				{
 					jsonrpc: '2.0',
@@ -57,33 +110,22 @@ describe('bin entry', () => {
 					method: 'tools/call',
 					params: {
 						name: 'prove',
-						arguments: {
-							project: 'configs/src/tsconfig.core.json',
-							case: {
-								files: [{ path: 'src/core/wire.ts', text: "export const VALUE = 'ok'\n" }],
-								test: {
-									path: 'tmp/probe/wire.test.ts',
-									text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
-								},
-							},
-							control: {
-								files: [
-									{
-										path: 'src/core/wire.ts',
-										text: "export const VALUE: number = 'bad'\n",
-									},
-								],
-								test: {
-									path: 'tmp/probe/wire.test.ts',
-									text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
-								},
-								stage: 'type',
-								reason: 'the source assigns a string to a number',
-							},
-						},
+						arguments: passing,
 						_meta: modern,
 					},
 				},
+				{
+					jsonrpc: '2.0',
+					id: 5,
+					method: 'tools/call',
+					params: { name: 'prove', arguments: withoutNewline, _meta: modern },
+				},
+				{
+					jsonrpc: '2.0',
+					id: 6,
+					method: 'tools/call',
+					params: { name: 'prove', arguments: withNewline, _meta: modern },
+				},
 			]
 			const child = spawn(
 				'/usr/bin/script',
@@ -106,11 +148,11 @@ describe('bin entry', () => {
 				await waitForDelay(250)
 				child.stdin.write(requests.map((request) => JSON.stringify(request)).join('\n') + '\n')
 				for await (const line of output) {
-					const start = line.indexOf('{')
-					if (start >= 0) lines.push(line.slice(start))
+					const frame = line.replaceAll('\u001b[?25l', '').replaceAll('\u001b[?25h', '')
+					if (frame.trim() !== '') lines.push(frame)
 					if (lines.length === requests.length) break
 				}
-				expect(lines).toHaveLength(4)
+				expect(lines).toHaveLength(6)
 				expect(Buffer.concat(errors).toString('utf8')).not.toContain('Error')
 				const responses: readonly unknown[] = lines.map((line) => JSON.parse(line))
 				expect(responses).toEqual(
@@ -145,6 +187,14 @@ describe('bin entry', () => {
 								],
 							}),
 						}),
+						expect.objectContaining({
+							id: 5,
+							result: expect.objectContaining({ content: expect.any(Array) }),
+						}),
+						expect.objectContaining({
+							id: 6,
+							result: expect.objectContaining({ content: expect.any(Array) }),
+						}),
 					]),
 				)
 				const call = lines.find((line) => line.includes('"id":4'))
diff --git a/tests/src/server/Probe.test.ts b/tests/src/server/Probe.test.ts
index dca4e1f..e061393 100644
--- a/tests/src/server/Probe.test.ts
+++ b/tests/src/server/Probe.test.ts
@@ -9,7 +9,7 @@ const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
 
 describe.sequential('probe', () => {
 	it(
-		'arms only after both resident hosts detect dependency changes and issues receipts selectively',
+		'issues receipts only when every stage executes cleanly and returns admitted path findings',
 		{ timeout: 60_000 },
 		async () => {
 			const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
@@ -22,6 +22,14 @@ describe.sequential('probe', () => {
 				path: 'src/core/probe-receipt.ts',
 				text: "export const VALUE: number = 'bad'\n",
 			}
+			const skipped = {
+				path: 'tmp/probe/probe-skipped.test.ts',
+				text: "import { describe, expect, test } from 'vitest'\ntest.skip('skips', () => expect(1).toBe(2))\ntest.todo('defers')\ndescribe.skip('group', () => { test('skips with its group', () => expect(1).toBe(2)) })\n",
+			}
+			const unmapped = {
+				path: 'tests/unmapped.test.ts',
+				text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
+			}
 			try {
 				const issued = await probe.prove({
 					project: 'configs/src/tsconfig.core.json',
@@ -43,8 +51,38 @@ describe.sequential('probe', () => {
 						reason: 'this control is deliberately clean',
 					},
 				})
+				const unexecuted = await probe.prove({
+					project: 'configs/src/tsconfig.core.json',
+					case: { files: [clean], test: skipped },
+					control: {
+						files: [broken],
+						test: skipped,
+						stage: 'type',
+						reason: 'the source assigns a string to a number',
+					},
+				})
+				const admitted = await probe.prove({
+					project: 'configs/src/tsconfig.core.json',
+					case: { files: [clean], test: unmapped },
+					control: {
+						files: [broken],
+						test: unmapped,
+						stage: 'type',
+						reason: 'the source assigns a string to a number',
+					},
+				})
 				expect(issued.receipt).toMatch(/^probe:/)
 				expect(refused.receipt).toBeUndefined()
+				expect(unexecuted.receipt).toBeUndefined()
+				expect(unexecuted.checks.find((check) => check.stage === 'runtime')?.findings).toEqual([
+					expect.objectContaining({ message: 'Vitest ran no tests in the module' }),
+				])
+				expect(admitted.receipt).toBeUndefined()
+				expect(admitted.checks.find((check) => check.stage === 'runtime')?.findings).toEqual([
+					expect.objectContaining({
+						message: 'Vitest ran no tests because no configured project matches the test path',
+					}),
+				])
 			} finally {
 				await probe.destroy()
 			}
diff --git a/tests/src/server/stages/RuntimeStage.test.ts b/tests/src/server/stages/RuntimeStage.test.ts
index 317c3e0..3cec8db 100644
--- a/tests/src/server/stages/RuntimeStage.test.ts
+++ b/tests/src/server/stages/RuntimeStage.test.ts
@@ -1,4 +1,4 @@
-import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
+import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
 import { randomUUID } from 'node:crypto'
 import { resolve } from 'node:path'
 import { fileURLToPath } from 'node:url'
@@ -37,6 +37,24 @@ describe('runtime stage', () => {
 		},
 	)
 
+	it('reports a finding when a test module executes nothing', { timeout: 60_000 }, async () => {
+		const stage = new RuntimeStage(ROOT)
+		try {
+			const check = await stage.inspect({
+				files: [],
+				test: {
+					path: 'tmp/probe/runtime-skipped.test.ts',
+					text: "import { describe, expect, test } from 'vitest'\ntest.skip('skips', () => expect(1).toBe(2))\ntest.todo('defers')\ndescribe.skip('group', () => { test('skips with its group', () => expect(1).toBe(2)) })\n",
+				},
+			})
+			expect(check.findings).toStrictEqual([
+				{ path: 'tmp/probe/runtime-skipped.test.ts', message: 'Vitest ran no tests in the module' },
+			])
+		} finally {
+			await stage.destroy()
+		}
+	})
+
 	it(
 		'changes its verdict after an imported dependency changes on disk',
 		{ timeout: 60_000 },
@@ -66,22 +84,65 @@ describe('runtime stage', () => {
 		},
 	)
 
-	it('refuses a test path outside every real Vitest project', { timeout: 60_000 }, async () => {
-		const stage = new RuntimeStage(ROOT)
-		try {
-			await expect(
-				stage.inspect({
+	it(
+		'reports a finding for a test path outside every real Vitest project',
+		{ timeout: 60_000 },
+		async () => {
+			const stage = new RuntimeStage(ROOT)
+			try {
+				const check = await stage.inspect({
 					files: [],
 					test: {
 						path: 'tests/unmapped.test.ts',
 						text: "import { test } from 'vitest'\ntest('unmapped', () => {})\n",
 					},
-				}),
-			).rejects.toThrow('Cannot infer a Vitest project for tests/unmapped.test.ts')
-		} finally {
-			await stage.destroy()
-		}
-	})
+				})
+				expect(check.findings).toStrictEqual([
+					{
+						path: 'tests/unmapped.test.ts',
+						message: 'Vitest ran no tests because no configured project matches the test path',
+					},
+				])
+			} finally {
+				await stage.destroy()
+			}
+		},
+	)
+
+	it(
+		'evicts every generated specification from resident and disk caches',
+		{ timeout: 60_000 },
+		async () => {
+			const id = randomUUID()
+			const path = `tmp/probe/runtime-retention-${id}.test.ts`
+			const marker = `runtime-retention-${id}`
+			const stage = new RuntimeStage(ROOT)
+			try {
+				for (let index = 1; index <= 15; index += 1) {
+					const text =
+						index === 15
+							? "import { describe, expect, test } from 'vitest'\ndescribe('first', () => { test('a', () => expect(1).toBe(1)); test('b', () => expect(2).toBe(2)) })\ndescribe('second', () => { test('c', () => expect(3).toBe(3)) })\n"
+							: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n"
+					await expect(stage.inspect({ files: [], test: { path, text } })).resolves.toMatchObject({
+						findings: [],
+					})
+				}
+				const caches = readdirSync(resolve(ROOT, 'node_modules/.vite'), {
+					recursive: true,
+					encoding: 'utf8',
+				}).filter((file) => file.endsWith('results.json'))
+				const retained = caches.filter((file) =>
+					readFileSync(resolve(ROOT, 'node_modules/.vite', file), 'utf8').includes(marker),
+				)
+				expect(retained).toStrictEqual([])
+				expect(
+					readdirSync(resolve(ROOT, 'tmp/probe')).filter((file) => file.includes(marker)),
+				).toStrictEqual([])
+			} finally {
+				await stage.destroy()
+			}
+		},
+	)
 
 	it('abandons an inspection and destroys idempotently', { timeout: 60_000 }, async () => {
 		const stage = new RuntimeStage(ROOT)
```
