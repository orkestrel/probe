import type { Case, Check, Finding, Stage } from '@src/core'
import type { StageInterface } from '../types.js'
import type { TestProject, TestRunResult, Vitest } from 'vitest/node'
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import {
	createRevisionFile,
	inferTestProject,
	messageFromUnknown,
	matchesWorkspaceModule,
	relativeWorkspaceFile,
	resolveWorkspaceFile,
	resolveWorkspaceModule,
} from '../helpers.js'

/**
 * Inspects tests through one resident Vitest service from the target workspace.
 *
 * @remarks
 * Construction starts Vitest with the threads pool. Every inspection writes one fresh sibling
 * specification, invalidates each workspace module whose content changed, runs that
 * specification, evicts its result, and deletes the file.
 *
 * Vite retains one unresolved URL for every specification path, so the stage replaces its whole
 * Vitest service after 64 specifications rather than deleting from each map that service owns. Any
 * bound holds the retention flat, because the replacement releases everything the instance held,
 * and 64 is the value chosen. The inspection that crosses the bound pays the replacement
 * synchronously: it closes the resident service and warms a new one before it runs. That inspection
 * cost 466 ms and 498 ms over this package's own workspace on two runs of 66 inspections whose
 * median inspection cost 206 ms and 215 ms, so budget one call in 64 at 260 ms to 285 ms above the
 * rest.
 *
 * Only a failure Vitest reported about the candidate carries `origin: 'code'`. Everything the
 * stage raises about its own machinery — a project it could not select, a specification it could
 * not delete or evict, a module that ran no test — carries `origin: 'instrument'` and says so in
 * the stage's own voice, because a control whose test never ran disproved nothing and must not
 * earn a receipt.
 *
 * @example
 * ```ts
 * const stage = new RuntimeStage('/srv/checkout')
 * const check = await stage.inspect(subject)
 * await stage.destroy()
 * ```
 */
export class RuntimeStage implements StageInterface {
	readonly #workspace: string
	#vitest: Promise<Vitest>
	readonly #modules = new Map<string, string>()
	readonly #revisions = new Set<string>()
	#specifications = 0
	#closing: Promise<void> | undefined
	#destroyed = false

	/**
	 * Starts warming the target workspace's Vitest service.
	 *
	 * @param workspace - The target workspace root. Default: the current working directory
	 */
	constructor(workspace: string = process.cwd()) {
		this.#workspace = workspace
		this.#vitest = this.#warm()
		// Observe the stored promise here. A stage the coordinator builds to replace a hung one may
		// never be inspected or destroyed, and an unobserved rejection ends the host process. The
		// stored promise keeps rejecting, so an inspection still reports the warming failure.
		void this.#vitest.catch(() => {})
	}

	get stage(): Stage {
		return 'runtime'
	}

	async inspect(subject: Case): Promise<Check> {
		if (this.#destroyed) throw new Error('The runtime stage has been destroyed')
		const started = performance.now()
		// Vitest reports a failed run by setting `process.exitCode` on this host, and a stage that
		// runs a claim's negative control fails a run deliberately. Restore whatever the host had,
		// rather than assigning zero over a code the host set for itself.
		const exitCode = process.exitCode
		const vitest = await this.#runner()
		if (this.#destroyed) throw new Error('The runtime stage has been destroyed')
		const project = this.#project(vitest, subject.test.path)
		if ('message' in project) {
			return {
				stage: this.stage,
				elapsed: Math.round(performance.now() - started),
				findings: [project],
			}
		}
		this.#revalidate(vitest)
		const file = createRevisionFile(this.#workspace, subject.test.path, randomUUID())
		if (!existsSync(dirname(file))) {
			throw new Error(`The runtime test directory does not exist: ${dirname(file)}`)
		}
		writeFileSync(file, subject.test.text, { encoding: 'utf8', flag: 'wx' })
		this.#specifications += 1
		this.#revisions.add(file)
		let findings: readonly Finding[] = []
		let cleanup: readonly Finding[] = []
		try {
			const specification = project.createSpecification(file, undefined, 'threads')
			const result = await vitest.runTestSpecifications([specification], false)
			findings = this.#findings(result, file, subject.test.path)
		} finally {
			process.exitCode = exitCode
			this.#revisions.delete(file)
			cleanup = await this.#evict(vitest, file)
			try {
				if (existsSync(file)) unlinkSync(file)
			} catch (error) {
				cleanup = [
					...cleanup,
					{
						origin: 'instrument',
						path: relativeWorkspaceFile(this.#workspace, file),
						message: `The runtime stage could not delete the generated specification (${messageFromUnknown(error)})`,
					},
				]
			}
		}
		return {
			stage: this.stage,
			elapsed: Math.round(performance.now() - started),
			findings: [...findings, ...cleanup],
		}
	}

	destroy(): Promise<void> {
		if (this.#closing !== undefined) return this.#closing
		this.#destroyed = true
		this.#closing = this.#destroy()
		return this.#closing
	}

	async #destroy(): Promise<void> {
		// Remove the abandoned specifications first. An inspection the coordinator gave up on keeps
		// its file until the run it started finally settles, and that file matches the workbench
		// project's glob, so a developer running the workbench meets a stranger's hung test.
		for (const file of this.#revisions) {
			if (existsSync(file)) unlinkSync(file)
		}
		this.#revisions.clear()
		// A stage whose warming failed holds nothing to release, so teardown settles rather than
		// re-reporting a failure its constructor already surfaced.
		const vitest = await this.#vitest.catch(() => undefined)
		if (vitest !== undefined) {
			void vitest.cancelCurrentRun('keyboard-input').catch(() => {})
			await vitest.close()
		}
		this.#modules.clear()
	}

	async #warm(): Promise<Vitest> {
		const workspaceEntry = resolveWorkspaceModule(this.#workspace, 'vitest/node')
		const packageEntry = fileURLToPath(import.meta.resolve('vitest/node'))
		if (workspaceEntry !== packageEntry) {
			throw new Error('The runtime stage does not share the workspace Vitest installation')
		}
		const { createVitest } = await import('vitest/node')
		const output = new PassThrough()
		output.resume()
		// Only standard output frames the Model Context Protocol transport. Preserve worker
		// diagnostics on standard error while draining standard output into a bounded stream.
		return createVitest(
			'test',
			{
				root: this.#workspace,
				config: resolveWorkspaceFile(this.#workspace, 'vite.config.ts'),
				watch: false,
				run: true,
				pool: 'threads',
				reporters: [
					{
						onInit() {},
						onTestRunEnd() {},
					},
				],
			},
			undefined,
			{ stdout: output, stderr: process.stderr },
		)
	}

	// Returns the project or the finding that replaces it, never both and never neither. A pair of
	// independent optionals would let a caller write the fourth combination, and that branch reports
	// a clean check for a case whose test never ran.
	#project(vitest: Vitest, path: string): TestProject | Finding {
		// `inferTestProject` reads a workspace-relative path, and a caller declares whatever path it
		// holds. An absolute one splits into leading segments that match no project, which silently
		// selected the root project before this resolved.
		const name = inferTestProject(relative(this.#workspace, resolve(this.#workspace, path)))
		if (name === undefined) {
			return {
				origin: 'instrument',
				path,
				message: 'The runtime stage found no configured Vitest project matching the test path',
			}
		}
		const project = vitest.projects.find((candidate) => candidate.name === name)
		if (project === undefined) {
			return {
				origin: 'instrument',
				path,
				message: `The runtime stage found no configured Vitest project named ${name}`,
			}
		}
		return project
	}

	async #evict(vitest: Vitest, file: string): Promise<readonly Finding[]> {
		try {
			const ids: string[] = []
			for (const [id, task] of vitest.state.idMap) {
				const path = 'filepath' in task ? task.filepath : task.file.filepath
				if (resolve(path) === resolve(file)) ids.push(id)
			}
			for (const id of ids) vitest.state.idMap.delete(id)
			vitest.state.pathsSet.delete(file)
			vitest.clearSpecificationsCache(file)
			vitest.invalidateFile(file)
			const graphs = vitest.projects.flatMap((project) =>
				Object.values(project.vite.environments).map((environment) => environment.moduleGraph),
			)
			for (const graph of graphs) {
				const modules = graph.getModulesByFile(file)
				graph.onFileDelete(file)
				if (modules === undefined) continue
				for (const module of modules) {
					for (const importer of module.importers) {
						importer.importedModules.delete(module)
						importer.acceptedHmrDeps.delete(module)
					}
					if (module.id !== null) graph.idToModuleMap.delete(module.id)
					graph.urlToModuleMap.delete(module.url)
				}
				graph.fileToModulesMap.delete(file)
			}
			vitest.watcher.onFileDelete(file)
			vitest.watcher.invalidates.delete(file)
			vitest.cache.results.removeFromCache(relative(this.#workspace, file).replaceAll('\\', '/'))
			await vitest.cache.results.writeToCache()
			return []
		} catch (error) {
			return [
				{
					origin: 'instrument',
					path: relativeWorkspaceFile(this.#workspace, file),
					message: `The runtime stage could not evict the generated specification (${messageFromUnknown(error)})`,
				},
			]
		}
	}

	// Reads the specification count rather than incrementing it. An inspection that writes no
	// specification retains no URL, so counting it would recycle a runner that never grew.
	#runner(): Promise<Vitest> {
		// Vite retains one unresolved URL for each fresh specification path. A 64-specification
		// lifetime bounds that internal map without giving up the resident runner on each call.
		if (this.#specifications < 64) return this.#vitest
		this.#specifications = 0
		this.#vitest = this.#replace(this.#vitest)
		void this.#vitest.catch(() => {})
		return this.#vitest
	}

	async #replace(current: Promise<Vitest>): Promise<Vitest> {
		const vitest = await current
		await vitest.close()
		if (this.#destroyed) throw new Error('The runtime stage has been destroyed')
		return this.#warm()
	}

	#revalidate(vitest: Vitest): void {
		const modules = this.#snapshot()
		for (const [path, digest] of modules) {
			if (this.#modules.get(path) === digest) continue
			vitest.invalidateFile(path)
			vitest.watcher.invalidates.add(path)
		}
		for (const path of this.#modules.keys()) {
			if (modules.has(path)) continue
			vitest.invalidateFile(path)
			vitest.watcher.invalidates.add(path)
		}
		this.#modules.clear()
		for (const [path, digest] of modules) this.#modules.set(path, digest)
	}

	#snapshot(): ReadonlyMap<string, string> {
		const directories = [resolve(this.#workspace)]
		const modules = new Map<string, string>()
		while (directories.length > 0) {
			const directory = directories.pop()
			if (directory === undefined) break
			for (const entry of readdirSync(directory, { withFileTypes: true })) {
				if (entry.name === '.git' || entry.name === 'dist' || entry.name === 'node_modules') {
					continue
				}
				const path = join(directory, entry.name)
				if (entry.isDirectory()) {
					directories.push(path)
					continue
				}
				if (!entry.isFile() || !matchesWorkspaceModule(path)) continue
				try {
					const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
					modules.set(path, digest)
				} catch {}
			}
		}
		return modules
	}

	#findings(result: TestRunResult, file: string, original: string): readonly Finding[] {
		const findings: Finding[] = []
		for (const module of result.testModules) {
			const before = findings.length
			for (const error of module.errors()) findings.push(this.#finding(error, file, original))
			for (const test of module.children.allTests('failed')) {
				const errors = test.result().errors ?? []
				for (const error of errors) findings.push(this.#finding(error, file, original))
			}
			const state: string = module.state()
			if (state === 'passed') {
				if (Array.from(module.children.allTests()).length === 0) {
					findings.push({
						origin: 'instrument',
						path: original,
						message: 'Vitest ran no tests in the module',
					})
				}
				for (const test of module.children.allTests('skipped')) {
					findings.push({
						origin: 'instrument',
						path: original,
						message: `Vitest did not run the test (${test.fullName})`,
					})
				}
				continue
			}
			if (state === 'skipped') {
				findings.push({
					origin: 'instrument',
					path: original,
					message: 'Vitest ran no tests in the module',
				})
				continue
			}
			if (state === 'failed') {
				if (findings.length === before) {
					findings.push({
						origin: 'code',
						path: original,
						message: 'Vitest reported a failed test module',
					})
				}
				continue
			}
			if (state === 'pending' || state === 'queued') {
				findings.push({
					origin: 'instrument',
					path: original,
					message: `Vitest did not finish the test module (${state})`,
				})
				continue
			}
			findings.push({
				origin: 'instrument',
				path: original,
				message: `Vitest reported an unrecognized test module state (${state})`,
			})
		}
		for (const error of result.unhandledErrors) {
			findings.push(this.#finding(error, file, original))
		}
		if (result.testModules.length === 0 && findings.length === 0) {
			findings.push({
				origin: 'instrument',
				path: original,
				message: 'Vitest returned no test module',
			})
		}
		return findings
	}

	// Every error reaching here came out of a run Vitest completed over the candidate's own test,
	// so each one is that code failing rather than this stage faulting.
	#finding(error: unknown, specification: string, original: string): Finding {
		const message = messageFromUnknown(error)
		if (typeof error !== 'object' || error === null || !('stacks' in error)) {
			return { origin: 'code', path: original, message }
		}
		const stacks = error.stacks
		if (!Array.isArray(stacks)) return { origin: 'code', path: original, message }
		for (const stack of stacks) {
			if (typeof stack !== 'object' || stack === null) continue
			if (!('file' in stack) || typeof stack.file !== 'string') continue
			const reported = stack.file.startsWith('file:')
				? fileURLToPath(stack.file)
				: isAbsolute(stack.file)
					? stack.file
					: resolve(this.#workspace, stack.file)
			const path =
				reported === specification ? original : relativeWorkspaceFile(this.#workspace, reported)
			if (!('line' in stack) || typeof stack.line !== 'number') {
				return { origin: 'code', path, message }
			}
			return { origin: 'code', path, message, line: stack.line }
		}
		return { origin: 'code', path: original, message }
	}
}
