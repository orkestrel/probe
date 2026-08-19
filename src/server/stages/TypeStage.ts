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
 * Construction starts loading the workspace's compiler and warming the root service. Candidate
 * source files use their scoped environment projects, while the test uses the root project. Disk
 * snapshots use their modification time as the service version so dependency edits cannot leave a
 * warm answer stale.
 *
 * @example
 * ```ts
 * const stage = new TypeStage('/srv/checkout')
 * const check = await stage.inspect(subject)
 * await stage.destroy()
 * ```
 */
export class TypeStage implements StageInterface {
	readonly #workspace: string
	readonly #typescript: Promise<typeof TypeScript>
	readonly #services = new Map<string, LanguageService>()
	readonly #options = new Map<string, CompilerOptions>()
	readonly #files = new Map<string, readonly string[]>()
	readonly #overlays = new Map<string, string>()
	readonly #versions = new Map<string, number>()
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
		for (const project of this.#projects()) this.#service(typescript, project)
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

	#service(typescript: typeof TypeScript, project: string): LanguageService {
		const existing = this.#services.get(project)
		if (existing !== undefined) return existing
		const path = resolveWorkspaceFile(this.#workspace, project)
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
		this.#options.set(project, parsed.options)
		this.#files.set(project, parsed.fileNames)
		const service = typescript.createLanguageService({
			getCompilationSettings: () => this.#options.get(project) ?? {},
			getScriptFileNames: () => [...(this.#files.get(project) ?? []), ...this.#overlays.keys()],
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
		this.#services.set(project, service)
		return service
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
