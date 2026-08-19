import type { Case, Check, Finding, Stage } from '@src/core'
import type { StageInterface } from '../types.js'
import type { TestProject, TestRunResult, Vitest } from 'vitest/node'
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
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
 * @example
 * ```ts
 * const stage = new RuntimeStage('/srv/checkout')
 * const check = await stage.inspect(subject)
 * await stage.destroy()
 * ```
 */
export class RuntimeStage implements StageInterface {
	readonly #workspace: string
	readonly #vitest: Promise<Vitest>
	readonly #modules = new Map<string, string>()
	#tail: Promise<void> = Promise.resolve()
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
	}

	get stage(): Stage {
		return 'runtime'
	}

	async inspect(subject: Case): Promise<Check> {
		if (this.#destroyed) throw new Error('The runtime stage has been destroyed')
		const inspection = this.#tail.then(() => this.#inspect(subject))
		this.#tail = inspection.then(
			() => undefined,
			() => undefined,
		)
		return inspection
	}

	destroy(): Promise<void> {
		if (this.#closing !== undefined) return this.#closing
		this.#destroyed = true
		this.#closing = this.#vitest.then(async (vitest) => {
			void vitest.cancelCurrentRun('keyboard-input').catch(() => {})
			await vitest.close()
			this.#modules.clear()
		})
		return this.#closing
	}

	async #warm(): Promise<Vitest> {
		const workspaceEntry = resolveWorkspaceModule(this.#workspace, 'vitest/node')
		const packageEntry = fileURLToPath(import.meta.resolve('vitest/node'))
		if (workspaceEntry !== packageEntry) {
			throw new Error('The runtime stage does not share the workspace Vitest installation')
		}
		const { createVitest } = await import('vitest/node')
		return createVitest('test', {
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
		})
	}

	async #inspect(subject: Case): Promise<Check> {
		const started = performance.now()
		const vitest = await this.#vitest
		this.#revalidate(vitest)
		const file = createRevisionFile(this.#workspace, subject.test.path, randomUUID())
		if (!existsSync(dirname(file))) {
			throw new Error(`The runtime test directory does not exist: ${dirname(file)}`)
		}
		const project = this.#project(vitest, subject.test.path)
		writeFileSync(file, subject.test.text, { encoding: 'utf8', flag: 'wx' })
		try {
			const specification = project.createSpecification(file, undefined, 'threads')
			const result = await vitest.runTestSpecifications([specification], false)
			const findings = this.#findings(result, file, subject.test.path)
			return {
				stage: this.stage,
				elapsed: performance.now() - started,
				findings,
			}
		} finally {
			vitest.state.clearFiles(project, [file])
			vitest.clearSpecificationsCache(file)
			vitest.invalidateFile(file)
			if (existsSync(file)) unlinkSync(file)
		}
	}

	#project(vitest: Vitest, path: string): TestProject {
		// `inferTestProject` reads a workspace-relative path, and a caller declares whatever path it
		// holds. An absolute one splits into leading segments that match no project, which silently
		// selected the root project before this resolved — a project `invalidateFile` cannot reach.
		const name = inferTestProject(relative(this.#workspace, resolve(this.#workspace, path)))
		if (name === undefined) throw new Error(`Cannot infer a Vitest project for ${path}`)
		const project = vitest.projects.find((candidate) => candidate.name === name)
		if (project === undefined) throw new Error(`The Vitest project ${name} does not exist`)
		return project
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
			for (const error of module.errors()) findings.push(this.#finding(error, file, original))
			for (const test of module.children.allTests('failed')) {
				const errors = test.result().errors ?? []
				for (const error of errors) findings.push(this.#finding(error, file, original))
			}
			if (module.state() === 'failed' && findings.length === 0) {
				findings.push({ path: original, message: 'Vitest reported a failed test module' })
			}
		}
		for (const error of result.unhandledErrors) {
			findings.push(this.#finding(error, file, original))
		}
		if (result.testModules.length === 0 && findings.length === 0) {
			findings.push({ path: original, message: 'Vitest returned no test module' })
		}
		return findings
	}

	#finding(error: unknown, specification: string, original: string): Finding {
		const message = messageFromUnknown(error)
		if (typeof error !== 'object' || error === null || !('stacks' in error)) {
			return { path: original, message }
		}
		const stacks = error.stacks
		if (!Array.isArray(stacks)) return { path: original, message }
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
			if (!('line' in stack) || typeof stack.line !== 'number') return { path, message }
			return { path, message, line: stack.line }
		}
		return { path: original, message }
	}
}
