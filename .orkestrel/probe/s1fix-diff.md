# Unit S1 fix round — the complete change, as evidence for the audit

Baseline: f9810f9 (S1 as first landed). Captured after the fix round exited, before any commit.

## git status --short

```text
 M src/server/stages/RuntimeStage.ts
 M tests/src/bin/main.test.ts
 M tests/src/server/stages/RuntimeStage.test.ts
```

## git diff --stat

```text
 src/server/stages/RuntimeStage.ts            | 173 +++++++++++++-------
 tests/src/bin/main.test.ts                   | 127 +++++++++++++--
 tests/src/server/stages/RuntimeStage.test.ts | 230 +++++++++++++++++++++++++--
 3 files changed, 453 insertions(+), 77 deletions(-)
```

## git diff

```diff
diff --git a/src/server/stages/RuntimeStage.ts b/src/server/stages/RuntimeStage.ts
index e181c19..6447c4f 100644
--- a/src/server/stages/RuntimeStage.ts
+++ b/src/server/stages/RuntimeStage.ts
@@ -33,9 +33,10 @@ import {
  */
 export class RuntimeStage implements StageInterface {
 	readonly #workspace: string
-	readonly #vitest: Promise<Vitest>
+	#vitest: Promise<Vitest>
 	readonly #modules = new Map<string, string>()
 	readonly #revisions = new Set<string>()
+	#inspections = 0
 	#tail: Promise<void> = Promise.resolve()
 	#closing: Promise<void> | undefined
 	#destroyed = false
@@ -102,6 +103,8 @@ export class RuntimeStage implements StageInterface {
 		const { createVitest } = await import('vitest/node')
 		const output = new PassThrough()
 		output.resume()
+		// Only standard output frames the Model Context Protocol transport. Preserve worker
+		// diagnostics on standard error while draining standard output into a bounded stream.
 		return createVitest(
 			'test',
 			{
@@ -118,7 +121,7 @@ export class RuntimeStage implements StageInterface {
 				],
 			},
 			undefined,
-			{ stdout: output, stderr: output },
+			{ stdout: output, stderr: process.stderr },
 		)
 	}
 
@@ -128,19 +131,14 @@ export class RuntimeStage implements StageInterface {
 		// runs a claim's negative control fails a run deliberately. Restore whatever the host had,
 		// rather than assigning zero over a code the host set for itself.
 		const exitCode = process.exitCode
-		const vitest = await this.#vitest
+		const vitest = await this.#runner()
 		if (this.#destroyed) throw new Error('The runtime stage has been destroyed')
-		const project = this.#project(vitest, subject.test.path)
-		if (project === undefined) {
+		const [project, projectFinding] = this.#project(vitest, subject.test.path)
+		if (projectFinding !== undefined || project === undefined) {
 			return {
 				stage: this.stage,
 				elapsed: Math.round(performance.now() - started),
-				findings: [
-					{
-						path: subject.test.path,
-						message: 'Vitest ran no tests because no configured project matches the test path',
-					},
-				],
+				findings: projectFinding === undefined ? [] : [projectFinding],
 			}
 		}
 		this.#revalidate(vitest)
@@ -150,72 +148,120 @@ export class RuntimeStage implements StageInterface {
 		}
 		writeFileSync(file, subject.test.text, { encoding: 'utf8', flag: 'wx' })
 		this.#revisions.add(file)
+		let findings: readonly Finding[] = []
+		let cleanup: readonly Finding[] = []
 		try {
 			const specification = project.createSpecification(file, undefined, 'threads')
 			const result = await vitest.runTestSpecifications([specification], false)
-			const findings = this.#findings(result, file, subject.test.path)
-			return {
-				stage: this.stage,
-				elapsed: Math.round(performance.now() - started),
-				findings,
-			}
+			findings = this.#findings(result, file, subject.test.path)
 		} finally {
 			process.exitCode = exitCode
-			if (existsSync(file)) unlinkSync(file)
-			await this.#evict(vitest, file)
 			this.#revisions.delete(file)
+			cleanup = await this.#evict(vitest, file, subject.test.path)
+			try {
+				if (existsSync(file)) unlinkSync(file)
+			} catch (error) {
+				cleanup = [
+					...cleanup,
+					{
+						path: subject.test.path,
+						message: `Vitest could not delete the generated specification (${messageFromUnknown(error)})`,
+					},
+				]
+			}
+		}
+		return {
+			stage: this.stage,
+			elapsed: Math.round(performance.now() - started),
+			findings: [...findings, ...cleanup],
 		}
 	}
 
-	#project(vitest: Vitest, path: string): TestProject | undefined {
+	#project(
+		vitest: Vitest,
+		path: string,
+	): readonly [project: TestProject | undefined, finding: Finding | undefined] {
 		// `inferTestProject` reads a workspace-relative path, and a caller declares whatever path it
 		// holds. An absolute one splits into leading segments that match no project, which silently
 		// selected the root project before this resolved.
 		const name = inferTestProject(relative(this.#workspace, resolve(this.#workspace, path)))
-		if (name === undefined) return undefined
-		return vitest.projects.find((candidate) => candidate.name === name)
+		if (name === undefined) {
+			return [
+				undefined,
+				{
+					path,
+					message: 'Vitest ran no tests because no configured project matches the test path',
+				},
+			]
+		}
+		const project = vitest.projects.find((candidate) => candidate.name === name)
+		if (project === undefined) {
+			return [undefined, { path, message: `Vitest has no configured project named ${name}` }]
+		}
+		return [project, undefined]
 	}
 
-	async #evict(vitest: Vitest, file: string): Promise<void> {
-		const ids: string[] = []
-		for (const [id, task] of vitest.state.idMap) {
-			const path = 'filepath' in task ? task.filepath : task.file.filepath
-			if (resolve(path) === resolve(file)) ids.push(id)
-		}
-		for (const id of ids) vitest.state.idMap.delete(id)
-		vitest.state.pathsSet.delete(file)
-		vitest.clearSpecificationsCache(file)
-		vitest.invalidateFile(file)
-		const graphs = vitest.projects.flatMap((project) =>
-			Object.values(project.vite.environments).map((environment) => environment.moduleGraph),
-		)
-		for (const graph of graphs) {
-			const modules = graph.getModulesByFile(file)
-			graph.onFileDelete(file)
-			if (modules === undefined) continue
-			for (const module of modules) {
-				for (const importer of module.importers) {
-					importer.importedModules.delete(module)
-					importer.acceptedHmrDeps.delete(module)
+	async #evict(vitest: Vitest, file: string, original: string): Promise<readonly Finding[]> {
+		try {
+			const ids: string[] = []
+			for (const [id, task] of vitest.state.idMap) {
+				const path = 'filepath' in task ? task.filepath : task.file.filepath
+				if (resolve(path) === resolve(file)) ids.push(id)
+			}
+			for (const id of ids) vitest.state.idMap.delete(id)
+			vitest.state.pathsSet.delete(file)
+			vitest.clearSpecificationsCache(file)
+			vitest.invalidateFile(file)
+			const graphs = vitest.projects.flatMap((project) =>
+				Object.values(project.vite.environments).map((environment) => environment.moduleGraph),
+			)
+			for (const graph of graphs) {
+				const modules = graph.getModulesByFile(file)
+				graph.onFileDelete(file)
+				if (modules === undefined) continue
+				for (const module of modules) {
+					for (const importer of module.importers) {
+						importer.importedModules.delete(module)
+						importer.acceptedHmrDeps.delete(module)
+					}
+					if (module.id !== null) graph.idToModuleMap.delete(module.id)
+					graph.urlToModuleMap.delete(module.url)
 				}
-				if (module.id !== null) graph.idToModuleMap.delete(module.id)
-				graph.urlToModuleMap.delete(module.url)
+				graph.fileToModulesMap.delete(file)
 			}
-			graph.fileToModulesMap.delete(file)
-		}
-		vitest.watcher.onFileDelete(file)
-		vitest.watcher.invalidates.delete(file)
-		vitest.cache.results.removeFromCache(relative(this.#workspace, file).replaceAll('\\', '/'))
-		await vitest.cache.results.writeToCache()
-		if (
-			vitest.state.filesMap.has(file) ||
-			ids.some((id) => vitest.state.idMap.has(id)) ||
-			graphs.some((graph) => graph.getModulesByFile(file) !== undefined)
-		) {
-			throw new Error(`Vitest retained the generated specification: ${file}`)
+			vitest.watcher.onFileDelete(file)
+			vitest.watcher.invalidates.delete(file)
+			vitest.cache.results.removeFromCache(relative(this.#workspace, file).replaceAll('\\', '/'))
+			await vitest.cache.results.writeToCache()
+			return []
+		} catch (error) {
+			return [
+				{
+					path: original,
+					message: `Vitest could not evict the generated specification (${messageFromUnknown(error)})`,
+				},
+			]
 		}
 	}
 
+	#runner(): Promise<Vitest> {
+		this.#inspections += 1
+		// Vite retains one unresolved URL for each fresh specification path. A 64-inspection
+		// lifetime bounds that internal map without giving up the resident runner on each call.
+		if (this.#inspections <= 64) return this.#vitest
+		this.#inspections = 1
+		this.#vitest = this.#replace(this.#vitest)
+		void this.#vitest.catch(() => {})
+		return this.#vitest
+	}
+
+	async #replace(current: Promise<Vitest>): Promise<Vitest> {
+		const vitest = await current
+		await vitest.close()
+		if (this.#destroyed) throw new Error('The runtime stage has been destroyed')
+		return this.#warm()
+	}
+
 	#revalidate(vitest: Vitest): void {
 		const modules = this.#snapshot()
 		for (const [path, digest] of modules) {
@@ -267,7 +313,18 @@ export class RuntimeStage implements StageInterface {
 				for (const error of errors) findings.push(this.#finding(error, file, original))
 			}
 			const state: string = module.state()
-			if (state === 'passed') continue
+			if (state === 'passed') {
+				if (Array.from(module.children.allTests()).length === 0) {
+					findings.push({ path: original, message: 'Vitest ran no tests in the module' })
+				}
+				for (const test of module.children.allTests('skipped')) {
+					findings.push({
+						path: original,
+						message: `Vitest did not run the test (${test.fullName})`,
+					})
+				}
+				continue
+			}
 			if (state === 'skipped') {
 				findings.push({ path: original, message: 'Vitest ran no tests in the module' })
 				continue
diff --git a/tests/src/bin/main.test.ts b/tests/src/bin/main.test.ts
index 357d97c..bb0ec81 100644
--- a/tests/src/bin/main.test.ts
+++ b/tests/src/bin/main.test.ts
@@ -1,4 +1,4 @@
-import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
+import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync } from 'node:fs'
 import { spawn } from 'node:child_process'
 import { createInterface } from 'node:readline'
 import { fileURLToPath } from 'node:url'
@@ -43,14 +43,14 @@ describe('bin entry', () => {
 				case: {
 					files: [{ path: 'src/core/wire.ts', text: "export const VALUE = 'ok'\n" }],
 					test: {
-						path: 'tests/src/bin/wire-runtime.test.ts',
+						path: 'tmp/probe/bin/wire-runtime.test.ts',
 						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
 					},
 				},
 				control: {
 					files: [{ path: 'src/core/wire.ts', text: "export const VALUE: number = 'bad'\n" }],
 					test: {
-						path: 'tests/src/bin/wire-runtime.test.ts',
+						path: 'tmp/probe/bin/wire-runtime.test.ts',
 						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
 					},
 					stage: 'type',
@@ -62,14 +62,14 @@ describe('bin entry', () => {
 				case: {
 					...passing.case,
 					test: {
-						path: 'tests/src/bin/wire-without-newline-runtime.test.ts',
+						path: 'tmp/probe/bin/wire-without-newline-runtime.test.ts',
 						text: "import { expect, test } from 'vitest'\ntest('writes', () => { process.stdout.write('worker-without-newline'); expect(2 + 2).toBe(4) })\n",
 					},
 				},
 				control: {
 					...passing.control,
 					test: {
-						path: 'tests/src/bin/wire-without-newline-runtime.test.ts',
+						path: 'tmp/probe/bin/wire-without-newline-runtime.test.ts',
 						text: "import { expect, test } from 'vitest'\ntest('writes', () => { process.stdout.write('worker-without-newline'); expect(2 + 2).toBe(4) })\n",
 					},
 				},
@@ -79,14 +79,14 @@ describe('bin entry', () => {
 				case: {
 					...passing.case,
 					test: {
-						path: 'tests/src/bin/wire-with-newline-runtime.test.ts',
+						path: 'tmp/probe/bin/wire-with-newline-runtime.test.ts',
 						text: "import { expect, test } from 'vitest'\ntest('writes', () => { process.stdout.write('worker-with-newline\\n'); expect(2 + 2).toBe(4) })\n",
 					},
 				},
 				control: {
 					...passing.control,
 					test: {
-						path: 'tests/src/bin/wire-with-newline-runtime.test.ts',
+						path: 'tmp/probe/bin/wire-with-newline-runtime.test.ts',
 						text: "import { expect, test } from 'vitest'\ntest('writes', () => { process.stdout.write('worker-with-newline\\n'); expect(2 + 2).toBe(4) })\n",
 					},
 				},
@@ -127,6 +127,8 @@ describe('bin entry', () => {
 					params: { name: 'prove', arguments: withNewline, _meta: modern },
 				},
 			]
+			const directory = resolve(ROOT, 'tmp/probe/bin')
+			mkdirSync(directory, { recursive: true })
 			const child = spawn(
 				'/usr/bin/script',
 				['-qfec', 'stty -echo; exec "$PROBE_NODE" "$PROBE_ENTRY"', '/dev/null'],
@@ -189,11 +191,25 @@ describe('bin entry', () => {
 						}),
 						expect.objectContaining({
 							id: 5,
-							result: expect.objectContaining({ content: expect.any(Array) }),
+							result: expect.objectContaining({
+								content: [
+									expect.objectContaining({
+										type: 'text',
+										text: expect.stringMatching(/^probe .+receipt probe:/s),
+									}),
+								],
+							}),
 						}),
 						expect.objectContaining({
 							id: 6,
-							result: expect.objectContaining({ content: expect.any(Array) }),
+							result: expect.objectContaining({
+								content: [
+									expect.objectContaining({
+										type: 'text',
+										text: expect.stringMatching(/^probe .+receipt probe:/s),
+									}),
+								],
+							}),
 						}),
 					]),
 				)
@@ -209,10 +225,103 @@ describe('bin entry', () => {
 					child.kill('SIGTERM')
 					await exited
 				}
+				try {
+					rmdirSync(directory)
+				} catch {}
 			}
 		},
 	)
 
+	it('preserves worker diagnostics on stderr', { timeout: 60_000 }, async () => {
+		const modern = {
+			'io.modelcontextprotocol/protocolVersion': '2026-07-28',
+			'io.modelcontextprotocol/clientCapabilities': {},
+			'io.modelcontextprotocol/clientInfo': { name: 'probe-test', version: '1.0.0' },
+		}
+		const request = {
+			jsonrpc: '2.0',
+			id: 1,
+			method: 'tools/call',
+			params: {
+				name: 'prove',
+				arguments: {
+					project: 'configs/src/tsconfig.core.json',
+					case: {
+						files: [{ path: 'src/core/stderr.ts', text: "export const VALUE = 'ok'\n" }],
+						test: {
+							path: 'tmp/probe/bin/stderr-runtime.test.ts',
+							text: "import { expect, test } from 'vitest'\ntest('warns', () => { process.emitWarning('worker-stderr-marker'); expect(2 + 2).toBe(4) })\n",
+						},
+					},
+					control: {
+						files: [{ path: 'src/core/stderr.ts', text: "export const VALUE: number = 'bad'\n" }],
+						test: {
+							path: 'tmp/probe/bin/stderr-runtime.test.ts',
+							text: "import { expect, test } from 'vitest'\ntest('warns', () => { process.emitWarning('worker-stderr-marker'); expect(2 + 2).toBe(4) })\n",
+						},
+						stage: 'type',
+						reason: 'the source assigns a string to a number',
+					},
+				},
+				_meta: modern,
+			},
+		}
+		const directory = resolve(ROOT, 'tmp/probe/bin')
+		mkdirSync(directory, { recursive: true })
+		const diagnostic = resolve(directory, 'worker-stderr.txt')
+		const child = spawn(
+			'/usr/bin/script',
+			['-qfec', 'stty -echo; exec "$PROBE_NODE" "$PROBE_ENTRY" 2>"$PROBE_STDERR"', '/dev/null'],
+			{
+				cwd: ROOT,
+				stdio: ['pipe', 'pipe', 'pipe'],
+				env: {
+					...process.env,
+					PROBE_ENTRY: BUILT_ENTRY,
+					PROBE_NODE: process.execPath,
+					PROBE_STDERR: diagnostic,
+				},
+			},
+		)
+		const output = createInterface({ input: child.stdout })
+		try {
+			await waitForDelay(250)
+			child.stdin.write(JSON.stringify(request) + '\n')
+			let response: unknown
+			for await (const line of output) {
+				const frame = line.replaceAll('\u001b[?25l', '').replaceAll('\u001b[?25h', '')
+				if (frame.trim() === '') continue
+				response = JSON.parse(frame)
+				break
+			}
+			expect(response).toMatchObject({
+				id: 1,
+				result: {
+					content: [
+						expect.objectContaining({
+							type: 'text',
+							text: expect.stringMatching(/^probe .+receipt probe:/s),
+						}),
+					],
+				},
+			})
+			expect(readFileSync(diagnostic, 'utf8')).toContain('worker-stderr-marker')
+		} finally {
+			output.close()
+			if (child.exitCode === null) {
+				const exited = new Promise<void>((resolveExit) => {
+					child.once('exit', () => resolveExit())
+				})
+				child.kill('SIGTERM')
+				await exited
+			}
+			rmSync(diagnostic, { force: true })
+			try {
+				rmdirSync(directory)
+			} catch {}
+		}
+	})
+
 	it(
 		'records the arming dependency leak when the entry is killed during boot',
 		{ timeout: 60_000 },
diff --git a/tests/src/server/stages/RuntimeStage.test.ts b/tests/src/server/stages/RuntimeStage.test.ts
index 3cec8db..3f3f326 100644
--- a/tests/src/server/stages/RuntimeStage.test.ts
+++ b/tests/src/server/stages/RuntimeStage.test.ts
@@ -1,9 +1,13 @@
 import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
 import { randomUUID } from 'node:crypto'
 import { resolve } from 'node:path'
+import { PassThrough } from 'node:stream'
 import { fileURLToPath } from 'node:url'
+import { createScratch } from '@orkestrel/test/server'
+import { computeReceipt } from '@src/core'
 import { RuntimeStage } from '@src/server'
 import { describe, expect, it } from 'vitest'
+import { createVitest } from 'vitest/node'
 
 const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
 
@@ -55,6 +59,70 @@ describe('runtime stage', () => {
 		}
 	})
 
+	it('reports a test that skips itself during execution', { timeout: 60_000 }, async () => {
+		const stage = new RuntimeStage(ROOT)
+		try {
+			const check = await stage.inspect({
+				files: [],
+				test: {
+					path: 'tmp/probe/runtime-context-skip.test.ts',
+					text: "import { test } from 'vitest'\ntest('skips', (context) => { context.skip(); throw new Error('never reached') })\n",
+				},
+			})
+			const control = await stage.inspect({
+				files: [],
+				test: {
+					path: 'tmp/probe/runtime-context-skip-control.test.ts',
+					text: "import { expect, test } from 'vitest'\ntest('fails', () => expect(1).toBe(2))\n",
+				},
+			})
+			expect(check.findings).toStrictEqual([
+				{
+					path: 'tmp/probe/runtime-context-skip.test.ts',
+					message: 'Vitest did not run the test (skips)',
+				},
+			])
+			expect(
+				computeReceipt(
+					{
+						id: 'context-skip',
+						toolchain: { typescript: 'test', oxlint: 'test', vitest: 'test' },
+						checks: [check],
+						control: [control],
+						elapsed: 0,
+					},
+					'runtime',
+				),
+			).toBeUndefined()
+		} finally {
+			await stage.destroy()
+		}
+	})
+
+	it('reports an empty module when its project permits no tests', { timeout: 60_000 }, async () => {
+		const scratch = createScratch()
+		scratch.write('package.json', '{"type":"module"}\n')
+		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
+		scratch.write(
+			'vite.config.ts',
+			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'], passWithNoTests: true } }] } })\n",
+		)
+		scratch.write('tmp/probe/.keep', '')
+		const stage = new RuntimeStage(scratch.path)
+		try {
+			const check = await stage.inspect({
+				files: [],
+				test: { path: 'tmp/probe/empty.test.ts', text: '' },
+			})
+			expect(check.findings).toStrictEqual([
+				{ path: 'tmp/probe/empty.test.ts', message: 'Vitest ran no tests in the module' },
+			])
+		} finally {
+			await stage.destroy()
+			scratch.destroy()
+		}
+	})
+
 	it(
 		'changes its verdict after an imported dependency changes on disk',
 		{ timeout: 60_000 },
@@ -109,37 +177,179 @@ describe('runtime stage', () => {
 		},
 	)
 
+	it('distinguishes a missing configured project', { timeout: 60_000 }, async () => {
+		const scratch = createScratch()
+		scratch.write('package.json', '{"type":"module"}\n')
+		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
+		scratch.write(
+			'vite.config.ts',
+			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'other', include: ['tests/**/*.test.ts'] } }] } })\n",
+		)
+		scratch.write('tmp/probe/.keep', '')
+		const stage = new RuntimeStage(scratch.path)
+		try {
+			const check = await stage.inspect({
+				files: [],
+				test: {
+					path: 'tmp/probe/missing-project.test.ts',
+					text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
+				},
+			})
+			expect(check.findings).toStrictEqual([
+				{
+					path: 'tmp/probe/missing-project.test.ts',
+					message: 'Vitest has no configured project named probe',
+				},
+			])
+		} finally {
+			await stage.destroy()
+			scratch.destroy()
+		}
+	})
+
+	it('resets Vite resident maps when the runner is replaced', { timeout: 60_000 }, async () => {
+		const scratch = createScratch()
+		scratch.write('package.json', '{"type":"module"}\n')
+		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
+		scratch.write(
+			'vite.config.ts',
+			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
+		)
+		scratch.write('tmp/probe/.keep', '')
+		const samples: Array<{ readonly unresolved: number; readonly files: number }> = []
+		try {
+			for (let generation = 1; generation <= 2; generation += 1) {
+				const output = new PassThrough()
+				output.resume()
+				const vitest = await createVitest(
+					'test',
+					{
+						root: scratch.path,
+						config: resolve(scratch.path, 'vite.config.ts'),
+						watch: false,
+						run: true,
+						pool: 'threads',
+						reporters: [
+							{
+								onInit() {},
+								onTestRunEnd() {},
+							},
+						],
+					},
+					undefined,
+					{ stdout: output, stderr: output },
+				)
+				const project = vitest.projects.find((candidate) => candidate.name === 'probe')
+				if (project === undefined) throw new Error('The probe project did not load')
+				const file = resolve(scratch.path, `tmp/probe/map-${generation}.test.ts`)
+				writeFileSync(
+					file,
+					"import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
+					'utf8',
+				)
+				try {
+					const specification = project.createSpecification(file, undefined, 'threads')
+					const result = await vitest.runTestSpecifications([specification], false)
+					expect(result.testModules[0]?.state()).toBe('passed')
+					let unresolved = 0
+					let files = 0
+					for (const candidate of vitest.projects) {
+						for (const environment of Object.values(candidate.vite.environments)) {
+							const graph = environment.moduleGraph
+							const retained: unknown = Reflect.get(graph, '_unresolvedUrlToModuleMap')
+							if (!(retained instanceof Map)) {
+								throw new Error('Vite exposes no unresolved-url map')
+							}
+							unresolved += retained.size
+							graph.onFileDelete(file)
+							graph.fileToModulesMap.delete(file)
+							files += graph.fileToModulesMap.size
+						}
+					}
+					samples.push({ unresolved, files })
+				} finally {
+					rmSync(file, { force: true })
+					await vitest.close()
+				}
+			}
+			expect(samples[1]?.unresolved).toBe(samples[0]?.unresolved)
+			expect(samples[1]?.files).toBe(samples[0]?.files)
+		} finally {
+			scratch.destroy()
+		}
+	})
+
 	it(
-		'evicts every generated specification from resident and disk caches',
+		'recycles the resident runner at its retention bound and evicts disk caches',
 		{ timeout: 60_000 },
 		async () => {
+			const scratch = createScratch()
+			scratch.write('package.json', '{"type":"module"}\n')
+			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
+			scratch.write(
+				'vite.config.ts',
+				"import { appendFileSync } from 'node:fs'\nimport { fileURLToPath } from 'node:url'\nimport { defineConfig } from 'vitest/config'\nappendFileSync(fileURLToPath(new URL('runtime-warms.txt', import.meta.url)), 'warm\\n')\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
+			)
+			scratch.write('tmp/probe/.keep', '')
 			const id = randomUUID()
 			const path = `tmp/probe/runtime-retention-${id}.test.ts`
 			const marker = `runtime-retention-${id}`
-			const stage = new RuntimeStage(ROOT)
+			const stage = new RuntimeStage(scratch.path)
 			try {
-				for (let index = 1; index <= 15; index += 1) {
-					const text =
-						index === 15
-							? "import { describe, expect, test } from 'vitest'\ndescribe('first', () => { test('a', () => expect(1).toBe(1)); test('b', () => expect(2).toBe(2)) })\ndescribe('second', () => { test('c', () => expect(3).toBe(3)) })\n"
-							: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n"
+				for (let index = 1; index <= 65; index += 1) {
+					const text = `import { expect, test } from 'vitest'\ntest('passes ${marker}-${index}', () => expect(1).toBe(1))\n`
 					await expect(stage.inspect({ files: [], test: { path, text } })).resolves.toMatchObject({
 						findings: [],
 					})
 				}
-				const caches = readdirSync(resolve(ROOT, 'node_modules/.vite'), {
+				expect(scratch.read('runtime-warms.txt')?.trim().split('\n')).toStrictEqual([
+					'warm',
+					'warm',
+				])
+				const caches = readdirSync(resolve(scratch.path, 'node_modules/.vite'), {
 					recursive: true,
 					encoding: 'utf8',
 				}).filter((file) => file.endsWith('results.json'))
 				const retained = caches.filter((file) =>
-					readFileSync(resolve(ROOT, 'node_modules/.vite', file), 'utf8').includes(marker),
+					readFileSync(resolve(scratch.path, 'node_modules/.vite', file), 'utf8').includes(marker),
 				)
 				expect(retained).toStrictEqual([])
 				expect(
-					readdirSync(resolve(ROOT, 'tmp/probe')).filter((file) => file.includes(marker)),
+					readdirSync(resolve(scratch.path, 'tmp/probe')).filter((file) => file.includes(marker)),
 				).toStrictEqual([])
 			} finally {
 				await stage.destroy()
+				scratch.destroy()
+			}
+		},
+	)
+
+	it(
+		'reports a cleanup failure without rejecting the inspection',
+		{ timeout: 60_000 },
+		async () => {
+			const id = randomUUID()
+			const marker = `runtime-cleanup-${id}`
+			const stage = new RuntimeStage(ROOT)
+			try {
+				const check = await stage.inspect({
+					files: [],
+					test: {
+						path: `tmp/probe/${marker}.test.ts`,
+						text: "import { mkdirSync, rmSync } from 'node:fs'\nimport { fileURLToPath } from 'node:url'\nimport { test } from 'vitest'\ntest('blocks deletion', () => { const file = fileURLToPath(import.meta.url); rmSync(file); mkdirSync(file) })\n",
+					},
+				})
+				expect(check.findings).toHaveLength(1)
+				expect(check.findings[0]).toMatchObject({ path: `tmp/probe/${marker}.test.ts` })
+				expect(check.findings[0]?.message).toContain(
+					'Vitest could not delete the generated specification',
+				)
+			} finally {
+				await stage.destroy()
+				for (const file of readdirSync(resolve(ROOT, 'tmp/probe'))) {
+					if (file.includes(marker))
+						rmSync(resolve(ROOT, 'tmp/probe', file), { force: true, recursive: true })
+				}
 			}
 		},
 	)
```
