import type { Case, Check, Draft, Issue, Project, Stage } from '@src/core'
import type { OverlayInterface, TypeStageInterface } from '../types.js'
import type * as TypeScript from 'typescript'
import type {
	CompilerOptions,
	Diagnostic,
	DiagnosticMessageChain,
	IScriptSnapshot,
	LanguageService,
	LanguageServiceHost,
} from 'typescript'
import { readdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { ProbeError, createDestroyedError } from '@src/core'
import {
	computeDigest,
	guardStage,
	inferTypeProject,
	loadWorkspaceModule,
	normalizePath,
	relativeWorkspaceFile,
	resolveWorkspaceFile,
} from '../helpers.js'
import { Overlay } from '../Overlay.js'

/**
 * Inspects TypeScript source through resident language services from the target workspace.
 *
 * @remarks
 * Construction starts loading the workspace's compiler and warming one service per project the
 * workspace declares. A candidate draft is checked against the project a call names, or
 * against its own scoped environment project when a call names none, while the test uses the root
 * project. Disk snapshots use their modification time as the service version so dependency edits
 * cannot leave a warm answer stale. Candidate text lives in an overlay the inspection owns, and
 * the language-service host answers existence, reads, and versions from it, so a candidate that
 * exists only as text is importable and a candidate that shadows a disk file is checked as the
 * text the case supplied. A project outside the declared set holds one recycled slot, so a caller
 * varying the project cannot grow the resident set. A language service checks one candidate
 * synchronously, so the stage hands the host's event loop back at each candidate boundary: a
 * caller's deadline is answered within one candidate's check rather than after the whole
 * inspection, and an inspection abandoned at that deadline stops at the next boundary.
 *
 * @example
 * ```ts
 * const stage = new TypeStage('/srv/checkout')
 * const check = await stage.inspect(subject, 'configs/src/tsconfig.core.json')
 * await stage.destroy()
 * ```
 */
export class TypeStage implements TypeStageInterface {
	readonly #workspace: string
	readonly #typescript: Promise<typeof TypeScript>
	readonly #services = new Map<string, LanguageService>()
	readonly #resident = new Set<string>()
	readonly #options = new Map<string, CompilerOptions>()
	readonly #files = new Map<string, readonly string[]>()
	readonly #diagnostics = new Map<string, readonly Diagnostic[]>()
	#overlay: OverlayInterface = new Overlay()
	#recycled: string | undefined
	#closing: Promise<void> | undefined
	#progress = 0
	#destroyed = false

	/**
	 * Starts warming the target workspace's TypeScript service.
	 *
	 * @param workspace - The target workspace root. Default: the current working directory
	 */
	constructor(workspace: string = process.cwd()) {
		this.#workspace = workspace
		const typescript = loadWorkspaceModule(this.#workspace, 'typescript')
		this.#typescript = this.#warm(typescript)
		// Observe the stored promise here. Nothing reads it until an inspection or a teardown
		// arrives, and an unobserved rejection ends the host process. The stored promise keeps
		// rejecting, so an inspection still reports the warming failure.
		void this.#typescript.catch(() => {})
	}

	get stage(): Stage {
		return 'type'
	}

	get progress(): number {
		return this.#progress
	}

	/**
	 * Inspects one case, against a caller-named project where the caller names one.
	 *
	 * @remarks
	 * The `project` parameter is this stage's own, not the stage contract's: the lint and runtime
	 * stages read no project, so `StageInterface` declares one parameter and every caller that
	 * needs this one holds a `TypeStage`.
	 *
	 * @param subject - The candidate drafts and test to inspect
	 * @param project - The workspace-relative TypeScript project the candidate drafts are checked
	 * against. Default: the scoped project each candidate path infers
	 * @returns One outcome for this stage
	 * @throws When the resident compiler cannot start or the stage has already been destroyed
	 */
	inspect(subject: Case, project?: string): Promise<Check> {
		return guardStage(this.stage, this.#inspect(subject, project))
	}

	/**
	 * Resolves one project to the path and digest this stage applies for it.
	 *
	 * @remarks
	 * Reads the parse this stage itself applies, filling its cache when the project is not already
	 * resident, so the reported digest is the configuration the inspection is judged under rather
	 * than a second parse a caller ran. The returned record is a value copy, so a later eviction
	 * does not move it.
	 *
	 * @param project - The workspace-relative TypeScript project to resolve
	 * @returns The resolved workspace-relative path and the digest of its compiler options
	 * @throws When the project escapes the workspace, cannot be parsed, or the stage has already
	 * been destroyed
	 */
	resolve(project: string): Promise<Project> {
		return guardStage(this.stage, this.#resolve(project))
	}

	destroy(): Promise<void> {
		if (this.#closing !== undefined) return this.#closing
		this.#destroyed = true
		this.#closing = guardStage(this.stage, this.#destroy())
		return this.#closing
	}

	async #inspect(subject: Case, project?: string): Promise<Check> {
		if (this.#destroyed) throw createDestroyedError('type stage')
		const started = performance.now()
		const typescript = await this.#typescript
		if (this.#destroyed) throw createDestroyedError('type stage')
		const resolved = subject.files.map((draft) => ({
			draft,
			path: resolveWorkspaceFile(this.#workspace, draft.path),
		}))
		const selections = resolved.map((candidate) => ({
			draft: candidate.draft,
			project: project ?? inferTypeProject(relativeWorkspaceFile(this.#workspace, candidate.path)),
		}))
		const root = this.#service(typescript, 'tsconfig.json')
		this.#configure(root, 'tsconfig.json')
		await this.#unblock()
		for (const selection of selections) {
			this.#configure(this.#service(typescript, selection.project), selection.project)
			await this.#unblock()
		}
		// Each inspection owns its candidate set and reads it through its own reference, so the
		// clear that follows releases what this inspection recorded and nothing else. The resident
		// services read whichever overlay is installed, so a caller admits one inspection at a
		// time the way `Probe` does.
		const overlay = new Overlay()
		this.#overlay = overlay
		try {
			this.#record(subject.test, overlay)
			for (const draft of subject.files) this.#record(draft, overlay)
			this.#progress += 1
			const issues: Issue[] = []
			const projects = new Set<string>()
			issues.push(...this.#issues(typescript, root, subject.test, 'tsconfig.json', false, true))
			projects.add('tsconfig.json')
			await this.#unblock()
			for (const selection of selections) {
				const draft = selection.draft
				const selected = selection.project
				const service = this.#service(typescript, selected)
				issues.push(
					...this.#issues(
						typescript,
						service,
						draft,
						selected,
						project !== undefined,
						!projects.has(selected),
					),
				)
				projects.add(selected)
				await this.#unblock()
			}
			return {
				stage: this.stage,
				elapsed: Math.round(performance.now() - started),
				issues,
			}
		} finally {
			overlay.clear()
		}
	}

	async #resolve(project: string): Promise<Project> {
		if (this.#destroyed) throw createDestroyedError('type stage')
		const typescript = await this.#typescript
		if (this.#destroyed) throw createDestroyedError('type stage')
		const resolved = resolveWorkspaceFile(this.#workspace, project)
		this.#progress += 1
		this.#service(typescript, project)
		await this.#unblock()
		return {
			path: relativeWorkspaceFile(this.#workspace, resolved),
			digest: computeDigest(this.#workspace, this.#options.get(resolved) ?? {}),
		}
	}

	async #destroy(): Promise<void> {
		// Abandon every inspection in flight rather than waiting for one: the coordinator tears a
		// stage down exactly when it cannot wait. Warming is awaited because the services it
		// creates are the resources this releases.
		await this.#typescript.catch(() => undefined)
		for (const service of this.#services.values()) service.dispose()
		this.#services.clear()
		this.#resident.clear()
		this.#recycled = undefined
		this.#options.clear()
		this.#files.clear()
		this.#diagnostics.clear()
	}

	async #warm(typescript: typeof TypeScript): Promise<typeof TypeScript> {
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

	// Hands the host's event loop back after one candidate's check, and refuses an inspection this
	// stage was torn down during. A language service checks a candidate synchronously, so an
	// inspection that never yielded held the loop for its whole duration: the coordinator's
	// deadline could not fire against this stage, and the lint child's frames and the runtime
	// worker's messages queued behind it until the last candidate finished, which reported one
	// stage's overrun against another. Yielding bounds that hold to one candidate. The refusal is
	// what stops an abandoned inspection reaching a disposed service and building a replacement
	// this stage would then own past its own teardown.
	async #unblock(): Promise<void> {
		await setTimeout(0)
		if (this.#destroyed) throw createDestroyedError('type stage')
	}

	// Resolution happens here rather than in the overlay, because the workspace a candidate's
	// declared path is relative to is the stage's knowledge. A path that escapes the workspace
	// throws before the overlay records it, and the inspection's clear releases the rest.
	#record(draft: Draft, overlay: OverlayInterface): void {
		overlay.set(resolveWorkspaceFile(this.#workspace, draft.path), draft.text)
	}

	// Keyed by the resolved project file rather than by the caller's spelling of it, so
	// `tsconfig.json` and `./tsconfig.json` reach one resident service instead of two.
	#service(typescript: typeof TypeScript, project: string): LanguageService {
		const path = resolveWorkspaceFile(this.#workspace, project)
		const existing = this.#services.get(path)
		if (existing !== undefined) return existing
		// The compiler builds a project diagnostic's own file name in the forward-slash spelling and
		// then asserts it equals the path the caller handed in. So a native path reaches this seam,
		// a malformed project makes the compiler construct that diagnostic, and the assertion fails
		// as a raw `Debug Failure` naming this host's directory layout, outside this package's
		// failure contract. Hand the compiler the forward-slash spelling, which it accepts on every
		// host, and it returns the diagnostic instead. Every cache here stays keyed by the native
		// `path`, so nothing this stage stores or reports moves with it.
		const spelling = normalizePath(path)
		const config = typescript.readConfigFile(spelling, typescript.sys.readFile)
		if (config.error !== undefined) {
			throw new ProbeError(this.#translate(typescript, config.error.messageText, path), {
				origin: 'workspace',
				code: 'malformed',
				context: { stage: this.stage, project },
			})
		}
		const parsed = typescript.parseJsonConfigFileContent(
			config.config,
			typescript.sys,
			dirname(spelling),
			undefined,
			spelling,
		)
		if (parsed.errors.length > 0) {
			throw new ProbeError(this.#translate(typescript, parsed.errors[0]?.messageText, path), {
				origin: 'workspace',
				code: 'malformed',
				context: { stage: this.stage, project },
			})
		}
		this.#options.set(path, parsed.options)
		this.#files.set(path, parsed.fileNames)
		const host: LanguageServiceHost = {
			getCompilationSettings: this.#compilationSettings.bind(this, path),
			getScriptFileNames: this.#scriptFiles.bind(this, path),
			getScriptVersion: this.#version.bind(this),
			getScriptSnapshot: this.#snapshot.bind(this, typescript),
			getCurrentDirectory: this.#directory.bind(this),
			getDefaultLibFileName: this.#defaultLibrary.bind(this, typescript),
			fileExists: this.#fileExists.bind(this, typescript),
			readFile: this.#readFile.bind(this, typescript),
			// Listings stay on disk. A candidate that entered one would reach the file set this
			// stage caches per project at service creation, and outlive the inspection that
			// declared it, so glob and directory-discovery imports fail closed.
			readDirectory: typescript.sys.readDirectory,
			directoryExists: this.#directoryExists.bind(this, typescript),
			getDirectories: typescript.sys.getDirectories,
			useCaseSensitiveFileNames: this.#caseSensitive.bind(this, typescript),
			getNewLine: this.#newline.bind(this, typescript),
		}
		const service = typescript.createLanguageService(host)
		this.#services.set(path, service)
		if (!this.#resident.has(path)) this.#recycle(path)
		return service
	}

	#compilationSettings(path: string): CompilerOptions {
		return this.#options.get(path) ?? {}
	}

	#scriptFiles(path: string): string[] {
		return [...(this.#files.get(path) ?? []), ...this.#overlay.paths]
	}

	#directory(): string {
		return this.#workspace
	}

	#defaultLibrary(typescript: typeof TypeScript, options: CompilerOptions): string {
		return typescript.getDefaultLibFilePath(options)
	}

	#fileExists(typescript: typeof TypeScript, file: string): boolean {
		return this.#overlay.text(file) !== undefined || typescript.sys.fileExists(file)
	}

	#readFile(typescript: typeof TypeScript, file: string): string | undefined {
		return this.#overlay.text(file) ?? typescript.sys.readFile(file)
	}

	#directoryExists(typescript: typeof TypeScript, directory: string): boolean {
		return typescript.sys.directoryExists(directory) || this.#overlay.covers(directory)
	}

	#caseSensitive(typescript: typeof TypeScript): boolean {
		return typescript.sys.useCaseSensitiveFileNames
	}

	#newline(typescript: typeof TypeScript): string {
		return typescript.sys.newLine
	}

	// Renders one project diagnostic in the terms this package reports a path in. The compiler names
	// the project by the absolute path this stage handed it, and it spells that path either way: the
	// native spelling where it echoes what it was given, the forward-slash spelling where it derived
	// the path itself. So a caller reads whichever spelling the diagnostic happened to take, and on a
	// host whose separator is a backslash that is this host's own directory layout rather than the
	// project the caller named. Normalizing the message first makes one replacement cover both
	// spellings, and the caller reads the workspace-relative project it asked for.
	#translate(
		typescript: typeof TypeScript,
		message: string | DiagnosticMessageChain | undefined,
		path: string,
	): string {
		return normalizePath(typescript.flattenDiagnosticMessageText(message, '\n')).replaceAll(
			normalizePath(path),
			relativeWorkspaceFile(this.#workspace, path),
		)
	}

	#configure(service: LanguageService, project: string): void {
		const path = resolveWorkspaceFile(this.#workspace, project)
		if (this.#diagnostics.has(path)) return
		this.#diagnostics.set(path, service.getCompilerOptionsDiagnostics())
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
		this.#diagnostics.delete(previous)
	}

	#version(file: string): string {
		if (this.#overlay.text(file) !== undefined) return `virtual:${this.#overlay.revision}`
		try {
			return `disk:${statSync(file).mtimeMs}`
		} catch {
			return 'missing'
		}
	}

	#snapshot(typescript: typeof TypeScript, file: string): IScriptSnapshot | undefined {
		const text = this.#overlay.text(file) ?? typescript.sys.readFile(file)
		return text === undefined ? undefined : typescript.ScriptSnapshot.fromString(text)
	}

	#issues(
		typescript: typeof TypeScript,
		service: LanguageService,
		draft: Draft,
		project: string,
		selected: boolean,
		configure: boolean,
	): readonly Issue[] {
		const path = resolveWorkspaceFile(this.#workspace, draft.path)
		const configuration = resolveWorkspaceFile(this.#workspace, project)
		const diagnostics = [
			...(configure ? (this.#diagnostics.get(configuration) ?? []) : []),
			...service.getSyntacticDiagnostics(path),
			...service.getSemanticDiagnostics(path),
		]
		return diagnostics.map((diagnostic) => this.#issue(typescript, diagnostic, project, selected))
	}

	#issue(
		typescript: typeof TypeScript,
		diagnostic: Diagnostic,
		project: string,
		selected: boolean,
	): Issue {
		const message = typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
		if (diagnostic.file === undefined) {
			if (selected) {
				throw new ProbeError(message, {
					origin: 'claimant',
					code: 'refused',
					context: { stage: this.stage, project },
				})
			}
			return { origin: 'instrument', path: project, message }
		}
		const path = relativeWorkspaceFile(this.#workspace, diagnostic.file.fileName)
		if (diagnostic.start === undefined) return { origin: 'claimant', path, message }
		const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
		return { origin: 'claimant', path, message, line: position.line + 1 }
	}
}
