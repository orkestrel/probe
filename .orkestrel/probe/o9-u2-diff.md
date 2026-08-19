diff --git a/src/server/stages/RuntimeStage.ts b/src/server/stages/RuntimeStage.ts
index 68fbd1c..f6fbea0 100644
--- a/src/server/stages/RuntimeStage.ts
+++ b/src/server/stages/RuntimeStage.ts
@@ -1,5 +1,12 @@
 import type { Case, Check, Finding, Stage } from '@src/core'
-import type { StageInterface } from '../types.js'
+import type { OverlayInterface, StageInterface } from '../types.js'
+import type {
+	Plugin,
+	TestProjectConfiguration,
+	UserProjectConfigFn,
+	UserWorkspaceConfig,
+	ViteUserConfig,
+} from 'vitest/config'
 import type { TestProject, TestRunResult, Vitest } from 'vitest/node'
 import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
 import { createHash, randomUUID } from 'node:crypto'
@@ -15,14 +22,18 @@ import {
 	resolveWorkspaceFile,
 	resolveWorkspaceModule,
 } from '../helpers.js'
+import { Overlay } from '../Overlay.js'
 
 /**
  * Inspects tests through one resident Vitest service from the target workspace.
  *
  * @remarks
- * Construction starts Vitest with the threads pool. Every inspection writes one fresh sibling
- * specification, invalidates each workspace module whose content changed, runs that
- * specification, evicts its result, and deletes the file.
+ * Construction starts Vitest with the threads pool and augments each configured project with a
+ * Vite plugin that reads the active inspection's candidate overlay. Every inspection writes one
+ * fresh sibling specification, invalidates each workspace module whose disk content or candidate
+ * revision changed, runs that specification, evicts its result, and deletes the file. Clearing the
+ * overlay makes the next snapshot differ from the candidate revision, so the next inspection
+ * invalidates that module and reads disk again.
  *
  * Vite retains one unresolved URL for every specification path, so the stage replaces its whole
  * Vitest service after 64 specifications rather than deleting from each map that service owns. Any
@@ -49,6 +60,7 @@ import {
 export class RuntimeStage implements StageInterface {
 	readonly #workspace: string
 	#vitest: Promise<Vitest>
+	#overlay: OverlayInterface = new Overlay()
 	readonly #modules = new Map<string, string>()
 	readonly #revisions = new Set<string>()
 	#specifications = 0
@@ -90,41 +102,50 @@ export class RuntimeStage implements StageInterface {
 				findings: [project],
 			}
 		}
-		this.#revalidate(vitest)
-		const file = createRevisionFile(this.#workspace, subject.test.path, randomUUID())
-		if (!existsSync(dirname(file))) {
-			throw new Error(`The runtime test directory does not exist: ${dirname(file)}`)
-		}
-		writeFileSync(file, subject.test.text, { encoding: 'utf8', flag: 'wx' })
-		this.#specifications += 1
-		this.#revisions.add(file)
-		let findings: readonly Finding[] = []
-		let cleanup: readonly Finding[] = []
+		const overlay = new Overlay()
+		this.#overlay = overlay
 		try {
-			const specification = project.createSpecification(file, undefined, 'threads')
-			const result = await vitest.runTestSpecifications([specification], false)
-			findings = this.#findings(result, file, subject.test.path)
-		} finally {
-			process.exitCode = exitCode
-			this.#revisions.delete(file)
-			cleanup = await this.#evict(vitest, file)
+			for (const source of subject.files) {
+				overlay.set(resolveWorkspaceFile(this.#workspace, source.path), source.text)
+			}
+			this.#revalidate(vitest)
+			const file = createRevisionFile(this.#workspace, subject.test.path, randomUUID())
+			if (!existsSync(dirname(file))) {
+				throw new Error(`The runtime test directory does not exist: ${dirname(file)}`)
+			}
+			writeFileSync(file, subject.test.text, { encoding: 'utf8', flag: 'wx' })
+			this.#specifications += 1
+			this.#revisions.add(file)
+			let findings: readonly Finding[] = []
+			let cleanup: readonly Finding[] = []
 			try {
-				if (existsSync(file)) unlinkSync(file)
-			} catch (error) {
-				cleanup = [
-					...cleanup,
-					{
-						origin: 'instrument',
-						path: relativeWorkspaceFile(this.#workspace, file),
-						message: `The runtime stage could not delete the generated specification (${messageFromUnknown(error)})`,
-					},
-				]
+				const specification = project.createSpecification(file, undefined, 'threads')
+				const result = await vitest.runTestSpecifications([specification], false)
+				findings = this.#findings(result, file, subject.test.path)
+			} finally {
+				process.exitCode = exitCode
+				this.#revisions.delete(file)
+				cleanup = await this.#evict(vitest, file)
+				try {
+					if (existsSync(file)) unlinkSync(file)
+				} catch (error) {
+					cleanup = [
+						...cleanup,
+						{
+							origin: 'instrument',
+							path: relativeWorkspaceFile(this.#workspace, file),
+							message: `The runtime stage could not delete the generated specification (${messageFromUnknown(error)})`,
+						},
+					]
+				}
 			}
-		}
-		return {
-			stage: this.stage,
-			elapsed: Math.round(performance.now() - started),
-			findings: [...findings, ...cleanup],
+			return {
+				stage: this.stage,
+				elapsed: Math.round(performance.now() - started),
+				findings: [...findings, ...cleanup],
+			}
+		} finally {
+			overlay.clear()
 		}
 	}
 
@@ -151,6 +172,7 @@ export class RuntimeStage implements StageInterface {
 			await vitest.close()
 		}
 		this.#modules.clear()
+		this.#overlay.clear()
 	}
 
 	async #warm(): Promise<Vitest> {
@@ -179,11 +201,63 @@ export class RuntimeStage implements StageInterface {
 					},
 				],
 			},
-			undefined,
+			{
+				plugins: [
+					{
+						name: 'orkestrel:probe-runtime-overlay-projects',
+						enforce: 'post',
+						config: this.#configure.bind(this),
+					},
+				],
+			},
 			{ stdout: output, stderr: process.stderr },
 		)
 	}
 
+	#configure(config: ViteUserConfig): void {
+		const test = config.test
+		if (test?.projects === undefined) return
+		// Vite concatenates project arrays returned from config hooks. Replace the hook-owned slot so
+		// each configured project keeps one identity while gaining the runtime adapter.
+		test.projects = test.projects.map((project) => this.#augment(project))
+	}
+
+	#augment(project: TestProjectConfiguration): TestProjectConfiguration {
+		if (typeof project === 'string') return project
+		if (typeof project === 'function') return this.#wrap(project)
+		return Promise.resolve(project).then(this.#configuration.bind(this))
+	}
+
+	#wrap(project: UserProjectConfigFn): UserProjectConfigFn {
+		return async (environment) => this.#configuration(await project(environment))
+	}
+
+	#configuration(config: UserWorkspaceConfig): UserWorkspaceConfig {
+		return {
+			...config,
+			plugins: [...(config.plugins ?? []), this.#plugin()],
+		}
+	}
+
+	#plugin(): Plugin {
+		return {
+			name: 'orkestrel:probe-runtime-overlay',
+			enforce: 'pre',
+			load: this.#load.bind(this),
+		}
+	}
+
+	#load(id: string): string | undefined {
+		const [path] = id.split(/[?#]/, 1)
+		if (path === undefined) return undefined
+		const normalized = path.replaceAll('\\', '/')
+		for (const candidate of this.#overlay.paths) {
+			if (candidate.replaceAll('\\', '/') !== normalized) continue
+			return this.#overlay.text(candidate)
+		}
+		return undefined
+	}
+
 	// Returns the project or the finding that replaces it, never both and never neither. A pair of
 	// independent optionals would let a caller write the fourth combination, and that branch reports
 	// a clean check for a case whose test never ran.
@@ -277,18 +351,23 @@ export class RuntimeStage implements StageInterface {
 		const modules = this.#snapshot()
 		for (const [path, digest] of modules) {
 			if (this.#modules.get(path) === digest) continue
-			vitest.invalidateFile(path)
-			vitest.watcher.invalidates.add(path)
+			this.#invalidate(vitest, [path])
 		}
 		for (const path of this.#modules.keys()) {
 			if (modules.has(path)) continue
-			vitest.invalidateFile(path)
-			vitest.watcher.invalidates.add(path)
+			this.#invalidate(vitest, [path])
 		}
 		this.#modules.clear()
 		for (const [path, digest] of modules) this.#modules.set(path, digest)
 	}
 
+	#invalidate(vitest: Vitest, paths: readonly string[]): void {
+		for (const path of paths) {
+			vitest.invalidateFile(path)
+			vitest.watcher.invalidates.add(path)
+		}
+	}
+
 	#snapshot(): ReadonlyMap<string, string> {
 		const directories = [resolve(this.#workspace)]
 		const modules = new Map<string, string>()
@@ -311,6 +390,9 @@ export class RuntimeStage implements StageInterface {
 				} catch {}
 			}
 		}
+		for (const path of this.#overlay.paths) {
+			modules.set(path, `overlay:${this.#overlay.revision}`)
+		}
 		return modules
 	}
 
diff --git a/tests/src/server/stages/RuntimeStage.test.ts b/tests/src/server/stages/RuntimeStage.test.ts
index 987325a..b6b99b6 100644
--- a/tests/src/server/stages/RuntimeStage.test.ts
+++ b/tests/src/server/stages/RuntimeStage.test.ts
@@ -233,6 +233,114 @@ describe('runtime stage', () => {
 		},
 	)
 
+	it(
+		'runs a directly imported candidate without changing its disk file',
+		{ timeout: 60_000 },
+		async () => {
+			const scratch = createScratch()
+			const disk = "export const VALUE = 'disk'\n"
+			scratch.write('package.json', '{"type":"module"}\n')
+			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
+			scratch.write(
+				'vite.config.ts',
+				"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
+			)
+			scratch.write('src/value.ts', disk)
+			scratch.write('tmp/probe/.keep', '')
+			expect(scratch.read('src/value.ts')).toBe(disk)
+			const stage = new RuntimeStage(scratch.path)
+			try {
+				const candidate = await stage.inspect({
+					files: [{ path: 'src/value.ts', text: "export const VALUE = 'candidate'\n" }],
+					test: {
+						path: 'tmp/probe/direct.test.ts',
+						text: "import { VALUE } from '../../src/value.js'\nimport { expect, test } from 'vitest'\ntest('reads the candidate', () => expect(VALUE).toBe('candidate'))\n",
+					},
+				})
+				const restored = await stage.inspect({
+					files: [],
+					test: {
+						path: 'tmp/probe/restored.test.ts',
+						text: "import { VALUE } from '../../src/value.js'\nimport { expect, test } from 'vitest'\ntest('reads disk', () => expect(VALUE).toBe('disk'))\n",
+					},
+				})
+				expect(candidate.findings).toStrictEqual([])
+				expect(restored.findings).toStrictEqual([])
+				expect(scratch.read('src/value.ts')).toBe(disk)
+			} finally {
+				await stage.destroy()
+				scratch.destroy()
+			}
+		},
+	)
+
+	it('runs a candidate imported through a barrel', { timeout: 60_000 }, async () => {
+		const scratch = createScratch()
+		const disk = "export const VALUE = 'disk'\n"
+		scratch.write('package.json', '{"type":"module"}\n')
+		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
+		scratch.write(
+			'vite.config.ts',
+			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
+		)
+		scratch.write('src/value.ts', disk)
+		scratch.write('src/index.ts', "export { VALUE } from './value.js'\n")
+		scratch.write('tmp/probe/.keep', '')
+		expect(scratch.read('src/value.ts')).toBe(disk)
+		const stage = new RuntimeStage(scratch.path)
+		try {
+			const check = await stage.inspect({
+				files: [{ path: 'src/value.ts', text: "export const VALUE = 'candidate'\n" }],
+				test: {
+					path: 'tmp/probe/barrel.test.ts',
+					text: "import { VALUE } from '../../src/index.js'\nimport { expect, test } from 'vitest'\ntest('reads the candidate through the barrel', () => expect(VALUE).toBe('candidate'))\n",
+				},
+			})
+			expect(check.findings).toStrictEqual([])
+			expect(scratch.read('src/value.ts')).toBe(disk)
+		} finally {
+			await stage.destroy()
+			scratch.destroy()
+		}
+	})
+
+	it('runs each candidate revision for one resident path', { timeout: 60_000 }, async () => {
+		const scratch = createScratch()
+		const disk = "export const VALUE = 'disk'\n"
+		scratch.write('package.json', '{"type":"module"}\n')
+		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
+		scratch.write(
+			'vite.config.ts',
+			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
+		)
+		scratch.write('src/value.ts', disk)
+		scratch.write('tmp/probe/.keep', '')
+		expect(scratch.read('src/value.ts')).toBe(disk)
+		const stage = new RuntimeStage(scratch.path)
+		try {
+			const first = await stage.inspect({
+				files: [{ path: 'src/value.ts', text: "export const VALUE = 'first'\n" }],
+				test: {
+					path: 'tmp/probe/revision.test.ts',
+					text: "import { VALUE } from '../../src/value.js'\nimport { expect, test } from 'vitest'\ntest('reads the first revision', () => expect(VALUE).toBe('first'))\n",
+				},
+			})
+			const second = await stage.inspect({
+				files: [{ path: 'src/value.ts', text: "export const VALUE = 'second'\n" }],
+				test: {
+					path: 'tmp/probe/revision.test.ts',
+					text: "import { VALUE } from '../../src/value.js'\nimport { expect, test } from 'vitest'\ntest('reads the second revision', () => expect(VALUE).toBe('second'))\n",
+				},
+			})
+			expect(first.findings).toStrictEqual([])
+			expect(second.findings).toStrictEqual([])
+			expect(scratch.read('src/value.ts')).toBe(disk)
+		} finally {
+			await stage.destroy()
+			scratch.destroy()
+		}
+	})
+
 	it(
 		'reports a finding for a test path outside every real Vitest project',
 		{ timeout: 60_000 },
