import type { Case, Check, Finding, Source, Stage } from '@src/core'
import type { StageInterface } from '../types.js'
import type * as TypeScript from 'typescript'
import type { CompilerOptions, Diagnostic, IScriptSnapshot, LanguageService } from 'typescript'
import { readdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	inferTypeProject,
	relativeWorkspaceFile,
	resolveWorkspaceFile,
	resolveWorkspaceModule,
} from '../helpers.js'

/**
 * Inspects TypeScript source through resident language services from the target workspace.
 *
 * @remarks
 * Construction starts loading the workspace's compiler and warming one service per project the
 * workspace declares. A candidate source file is checked against the project a call names, or
 * against its own scoped environment project when a call names none, while the test uses the root
 * project. Disk snapshots use their modification time as the service version so dependency edits
 * cannot leave a warm answer stale. A project outside the declared set holds one recycled slot,
 * so a caller varying the project cannot grow the resident set.
 *
 * @example
 * ```ts
 * const stage = new TypeStage('/srv/checkout')
 * const check = await stage.inspect(subject, 'configs/src/tsconfig.core.json')
 * await stage.destroy()
 * ```
 */
export class TypeStage implements StageInterface {
	readonly #workspace: string
	readonly #typescript: Promise<typeof TypeScript>
	readonly #services = new Map<string, LanguageService>()
	readonly #resident = new Set<string>()
	readonly #options = new Map<string, CompilerOptions>()
	readonly #files = new Map<string, readonly string[]>()
	readonly #overlays = new Map<string, string>()
	readonly #versions = new Map<string, number>()
	#recycled: string | undefined
	#revision = 0
	#tail: Promise<void> = Promise.resolve()
	#closing: Promise<void> | undefined
	#destroyed = false

	/**
	 * Starts warming the target workspace's TypeScript service.
	 *
	 * @param workspace - The target workspace root. Default: the current working directory
	 */
	constructor(workspace: string = process.cwd()) {
		this.#workspace = workspace
		this.#typescript = this.#warm()
		// Observe the stored promise here. Nothing reads it until an inspection or a teardown
		// arrives, and an unobserved rejection ends the host process. The stored promise keeps
		// rejecting, so an inspection still reports the warming failure.
		void this.#typescript.catch(() => {})
	}

	get stage(): Stage {
		return 'type'
	}

	/**
	 * Inspects one case, against a caller-named project where the caller names one.
	 *
	 * @remarks
	 * The second parameter is this stage's own, not the stage contract's: the lint and runtime
	 * stages read no project, so `StageInterface` declares one parameter and every caller that
	 * needs this one holds a `TypeStage`.
	 *
	 * @param subject - The candidate sources and test to inspect
	 * @param project - The workspace-relative TypeScript project the candidate sources are checked
	 * against. Default: the scoped project each candidate path infers
	 * @returns One outcome for this stage
	 * @throws When the resident compiler cannot start or the stage has already been destroyed
	 */
	async inspect(subject: Case, project?: string): Promise<Check> {
		if (this.#destroyed) throw new Error('The type stage has been destroyed')
		const inspection = this.#tail.then(() => this.#inspect(subject, project))
		this.#tail = inspection.then(
			() => undefined,
			() => undefined,
		)
		return inspection
	}

	destroy(): Promise<void> {
		if (this.#closing !== undefined) return this.#closing
		this.#destroyed = true
		this.#closing = this.#destroy()
		return this.#closing
	}

	async #destroy(): Promise<void> {
		// Abandon what `#tail` holds rather than waiting behind it: the coordinator tears a stage
		// down exactly when it cannot wait for an inspection. Warming is awaited because the
		// services it creates are the resources this releases.
		await this.#typescript.catch(() => undefined)
		for (const service of this.#services.values()) service.dispose()
		this.#services.clear()
		this.#resident.clear()
		this.#recycled = undefined
		this.#options.clear()
		this.#files.clear()
		this.#overlays.clear()
		this.#versions.clear()
	}

	async #warm(): Promise<typeof TypeScript> {
		const workspaceEntry = resolveWorkspaceModule(this.#workspace, 'typescript')
		const packageEntry = fileURLToPath(import.meta.resolve('typescript'))
		if (workspaceEntry !== packageEntry) {
			throw new Error('The type stage does not share the workspace TypeScript installation')
		}
		const typescript = await import('typescript')
		for (const project of this.#projects()) {
			this.#resident.add(resolveWorkspaceFile(this.#workspace, project))
			this.#service(typescript, project)
		}
		return typescript
	}

	#projects(): readonly string[] {
		const projects = ['tsconfig.json']
		for (const axis of ['src', 'app']) {
			const directory = resolveWorkspaceFile(this.#workspace, `configs/${axis}`)
			let names: readonly string[]
			try {
				names = readdirSync(directory)
			} catch {
				continue
			}
			for (const name of names.filter((entry) => /^tsconfig\.[^.]+\.json$/.test(entry)).sort()) {
				projects.push(`configs/${axis}/${name}`)
			}
		}
		return projects
	}

	async #inspect(subject: Case, project?: string): Promise<Check> {
		const started = performance.now()
		const typescript = await this.#typescript
		if (this.#destroyed) throw new Error('The type stage has been destroyed')
		this.#revision += 1
		this.#overlay(subject.test)
		for (const source of subject.files) this.#overlay(source)
		try {
			const findings: Finding[] = []
			const root = this.#service(typescript, 'tsconfig.json')
			findings.push(...this.#findings(typescript, root, subject.test, 'tsconfig.json'))
			for (const source of subject.files) {
				const selected = project ?? inferTypeProject(source.path)
				const service = this.#service(typescript, selected)
				findings.push(...this.#findings(typescript, service, source, selected))
			}
			return {
				stage: this.stage,
				elapsed: Math.round(performance.now() - started),
				findings,
			}
		} finally {
			this.#overlays.delete(resolveWorkspaceFile(this.#workspace, subject.test.path))
			for (const source of subject.files) {
				this.#overlays.delete(resolveWorkspaceFile(this.#workspace, source.path))
			}
		}
	}

	#overlay(source: Source): void {
		const path = resolveWorkspaceFile(this.#workspace, source.path)
		this.#overlays.set(path, source.text)
		this.#versions.set(path, this.#revision)
	}

	// Keyed by the resolved project file rather than by the caller's spelling of it, so
	// `tsconfig.json` and `./tsconfig.json` reach one resident service instead of two.
	#service(typescript: typeof TypeScript, project: string): LanguageService {
		const path = resolveWorkspaceFile(this.#workspace, project)
		const existing = this.#services.get(path)
		if (existing !== undefined) return existing
		const config = typescript.readConfigFile(path, typescript.sys.readFile)
		if (config.error !== undefined) {
			throw new Error(typescript.flattenDiagnosticMessageText(config.error.messageText, '\n'))
		}
		const parsed = typescript.parseJsonConfigFileContent(
			config.config,
			typescript.sys,
			dirname(path),
			undefined,
			path,
		)
		if (parsed.errors.length > 0) {
			throw new Error(
				typescript.flattenDiagnosticMessageText(parsed.errors[0]?.messageText ?? '', '\n'),
			)
		}
		this.#options.set(path, parsed.options)
		this.#files.set(path, parsed.fileNames)
		const service = typescript.createLanguageService({
			getCompilationSettings: () => this.#options.get(path) ?? {},
			getScriptFileNames: () => [...(this.#files.get(path) ?? []), ...this.#overlays.keys()],
			getScriptVersion: (file) => this.#version(file),
			getScriptSnapshot: (file) => this.#snapshot(typescript, file),
			getCurrentDirectory: () => this.#workspace,
			getDefaultLibFileName: (options) => typescript.getDefaultLibFilePath(options),
			fileExists: typescript.sys.fileExists,
			readFile: (file) => this.#overlays.get(file) ?? typescript.sys.readFile(file),
			readDirectory: typescript.sys.readDirectory,
			directoryExists: typescript.sys.directoryExists,
			getDirectories: typescript.sys.getDirectories,
			useCaseSensitiveFileNames: () => typescript.sys.useCaseSensitiveFileNames,
			getNewLine: () => typescript.sys.newLine,
		})
		this.#services.set(path, service)
		if (!this.#resident.has(path)) this.#recycle(path)
		return service
	}

	// Holds one caller-named project beside the resident set warming created. `project` arrives
	// from the wire validated only as a non-empty string, so keeping a language service per
	// distinct string would let a caller grow this stage without bound for the life of the process.
	#recycle(path: string): void {
		const previous = this.#recycled
		this.#recycled = path
		if (previous === undefined || previous === path) return
		this.#services.get(previous)?.dispose()
		this.#services.delete(previous)
		this.#options.delete(previous)
		this.#files.delete(previous)
	}

	#version(file: string): string {
		const overlay = this.#versions.get(file)
		if (this.#overlays.has(file) && overlay !== undefined) return `virtual:${overlay}`
		try {
			return `disk:${statSync(file).mtimeMs}`
		} catch {
			return 'missing'
		}
	}

	#snapshot(typescript: typeof TypeScript, file: string): IScriptSnapshot | undefined {
		const text = this.#overlays.get(file) ?? typescript.sys.readFile(file)
		return text === undefined ? undefined : typescript.ScriptSnapshot.fromString(text)
	}

	#findings(
		typescript: typeof TypeScript,
		service: LanguageService,
		source: Source,
		project: string,
	): readonly Finding[] {
		const path = resolveWorkspaceFile(this.#workspace, source.path)
		const diagnostics = [
			...service.getSyntacticDiagnostics(path),
			...service.getSemanticDiagnostics(path),
		]
		return diagnostics.map((diagnostic) => this.#finding(typescript, diagnostic, project))
	}

	#finding(typescript: typeof TypeScript, diagnostic: Diagnostic, project: string): Finding {
		const path =
			diagnostic.file === undefined
				? project
				: relativeWorkspaceFile(this.#workspace, diagnostic.file.fileName)
		const message = typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
		if (diagnostic.file === undefined || diagnostic.start === undefined) return { path, message }
		const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
		return { path, message, line: position.line + 1 }
	}
}
