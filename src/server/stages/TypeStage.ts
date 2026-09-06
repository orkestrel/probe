import type { Case, Check, Draft, Issue, Project, Stage } from '@src/core'
import type { Diagnostic, Execution, ProjectConfig, TypeStageInterface } from '../types.js'
import type { ChildProcess } from 'node:child_process'
import type { Dirent } from 'node:fs'
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { attempt } from '@orkestrel/contract'
import {
	ProbeError,
	TYPE_MIRROR,
	createDestroyedError,
	formatSpecification,
	matchesSpecification,
} from '@src/core'
import {
	collectWorkspaceFiles,
	computeDigest,
	escapesRoot,
	filterUniqueIssues,
	guardStage,
	inferTypeProject,
	matchesLiveProcess,
	normalizePath,
	relativeWorkspaceFile,
	relativeWorkspaceMessage,
	resolveWorkspaceBinary,
	resolveWorkspaceFile,
	scanDiagnostics,
} from '../helpers.js'
import { parseProjectConfig, parseRevisionOwner } from '../parsers.js'

/**
 * Inspects TypeScript source by running the target workspace's own compiler over a mirror of it.
 *
 * @remarks
 * The compiler is a process this stage spawns rather than a module it loads, so nothing here holds
 * a resident program and the host's event loop is free for the whole check. Construction sweeps a
 * mirror an earlier host left behind, copies the workspace into a fresh one under
 * {@link TYPE_MIRROR}, and builds each declared project's incremental state there, so the first
 * inspection is warm.
 *
 * Every inspection refreshes the mirror by content digest, writes each candidate draft and the test
 * at its mirrored declared path, and runs `tsc --noEmit --pretty false` once per distinct selected
 * project. A draft therefore shadows the file it replaces: a consumer of that path is checked
 * against the draft's text, and a draft importing a sibling draft resolves to the sibling draft.
 * Nothing is written outside `tmp/`, and the workspace's own copy of a drafted file never moves.
 *
 * Each run reads a scratch project this stage writes beside the mirrored project it extends, so
 * every relative path the project declares — its own `rootDir`, `include`, `paths`, and the
 * projects it extends — resolves inside the mirror without being rewritten. The scratch adds the
 * drafts as `files`, which the project's own `exclude` does not reach, and its incremental state
 * lives in the mirror so reuse survives the refresh.
 *
 * The diagnostics decide the outcome, never the exit code, which the supported compiler majors
 * disagree on. A diagnostic naming a project file, and one naming no file at all, is the target
 * tree's own configuration fault and raises rather than reporting, unless the `.json` file is one
 * the claim itself drafted; every other diagnostic is a claimant issue at the point the compiler
 * reported, which is the extent the plain-text output carries.
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
	readonly #compiler: string
	readonly #revision = `${process.pid}-${randomUUID()}`
	readonly #mirror: string
	readonly #configs = new Map<string, ProjectConfig>()
	readonly #mirrored = new Map<string, string>()
	readonly #drafts = new Set<string>()
	readonly #children = new Set<ChildProcess>()
	readonly #warming: Promise<void>
	// The teardown latch and the destroyed reading are one field: `destroy` assigns it before the
	// teardown it starts can suspend, so every later read of `#closing !== undefined` answers the
	// question a second flag would have answered, and no second write can drift from this one.
	#closing: Promise<void> | undefined
	#progress = 0

	/**
	 * Resolves the target workspace's compiler and starts warming its mirror.
	 *
	 * @param workspace - The target workspace root. Default: the current working directory
	 */
	constructor(workspace: string = process.cwd()) {
		this.#workspace = workspace
		this.#compiler = resolveWorkspaceBinary(workspace, 'typescript', 'tsc')
		this.#mirror = resolveWorkspaceFile(workspace, `${TYPE_MIRROR}/${this.#revision}`)
		this.#warming = this.#warm()
		// Observe the stored promise here. Nothing reads it until an inspection or a teardown
		// arrives, and an unobserved rejection ends the host process. The stored promise keeps
		// rejecting, so an inspection still reports the warming failure.
		void this.#warming.catch(() => {})
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
	 * @throws When the workspace refuses the mirror, when a project the run reads is malformed, or
	 * when the stage has already been destroyed
	 */
	inspect(subject: Case, project?: string): Promise<Check> {
		return guardStage(this.stage, this.#inspect(subject, project))
	}

	/**
	 * Resolves one project to the path and digest this stage applies for it.
	 *
	 * @remarks
	 * Reads the configuration the compiler itself prints for the project as the mirror holds it,
	 * refreshed from the workspace first on a cache miss, so the digest names the configuration the
	 * check applies. The reading is cached per project for the life of the stage, so a draft written
	 * afterward cannot move it.
	 *
	 * @param project - The workspace-relative TypeScript project to resolve
	 * @returns The resolved workspace-relative path and the digest of its compiler options
	 * @throws When the project escapes the workspace, when the compiler refuses it, or when the
	 * stage has already been destroyed
	 */
	resolve(project: string): Promise<Project> {
		return guardStage(this.stage, this.#resolve(project))
	}

	destroy(): Promise<void> {
		if (this.#closing !== undefined) return this.#closing
		this.#closing = guardStage(this.stage, this.#destroy())
		return this.#closing
	}

	async #inspect(subject: Case, project?: string): Promise<Check> {
		this.#refuseDestroyed()
		const started = performance.now()
		await this.#warming
		this.#refuseDestroyed()
		// Every declared path is resolved before anything is written, so a draft that escapes the
		// workspace refuses the whole inspection rather than leaving earlier drafts in the mirror.
		const test = resolveWorkspaceFile(this.#workspace, subject.test.path)
		const resolved = subject.files.map((draft) => ({
			draft,
			path: resolveWorkspaceFile(this.#workspace, draft.path),
		}))
		// Keyed by the resolved project rather than by the caller's spelling of it, so `tsconfig.json`
		// and `./tsconfig.json` name one run instead of two.
		const groups = new Map<string, Draft[]>([[this.#contain('tsconfig.json'), [subject.test]]])
		for (const candidate of resolved) {
			const selected = this.#contain(
				project ?? inferTypeProject(relativeWorkspaceFile(this.#workspace, candidate.path)),
			)
			const drafts = groups.get(selected)
			if (drafts === undefined) groups.set(selected, [candidate.draft])
			else drafts.push(candidate.draft)
		}
		this.#progress += 1
		// Every selected project's configuration is read before any draft lands in the mirror, so a
		// claim drafting its own project file cannot move the digest that project resolves to.
		for (const selected of groups.keys()) await this.#configure(selected)
		this.#refuseDestroyed()
		try {
			this.#refresh()
			this.#drafts.add(this.#place(subject.test.text, test))
			for (const candidate of resolved) {
				this.#drafts.add(this.#place(candidate.draft.text, candidate.path))
			}
			const issues: Issue[] = []
			for (const [selected, drafts] of groups) {
				this.#refuseDestroyed()
				issues.push(...(await this.#check(selected, drafts)))
			}
			return {
				stage: this.stage,
				elapsed: Math.round(performance.now() - started),
				// One draft is checked by the project its claim names and again by the root project the
				// test is checked against, so the same diagnostic arrives twice for one candidate.
				issues: filterUniqueIssues(issues),
			}
		} finally {
			this.#release()
		}
	}

	async #resolve(project: string): Promise<Project> {
		this.#refuseDestroyed()
		const contained = this.#contain(project)
		this.#progress += 1
		const config = await this.#configure(contained)
		return { path: contained, digest: computeDigest(this.#workspace, config.compilerOptions) }
	}

	async #destroy(): Promise<void> {
		// Abandon every inspection in flight rather than waiting for one: the coordinator tears a
		// stage down exactly when it cannot wait. Terminating the compiler is what makes that
		// immediate, and warming is awaited afterwards because its own run is one of the terminated
		// children and the mirror it built is the resource this releases.
		const children = [...this.#children]
		this.#children.clear()
		for (const child of children) this.#terminate(child)
		await this.#warming.catch(() => undefined)
		try {
			rmSync(this.#mirror, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
		} catch {}
		this.#configs.clear()
		this.#mirrored.clear()
		this.#drafts.clear()
	}

	// Builds each declared project's incremental state so the first inspection is warm. The runs are
	// independent — each reads the mirror and writes its own state file — so they run together and
	// the warm costs the slowest project rather than the sum of them all.
	async #warm(): Promise<void> {
		this.#sweep()
		this.#createMirror()
		this.#refresh()
		this.#refuseDestroyed()
		await Promise.all(this.#projects().map((project) => this.#check(project, [])))
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

	// Refuses an inspection this stage was torn down during. The compiler runs in a child process,
	// so the host's loop is free while it works and a caller's deadline fires against this stage on
	// its own: nothing here yields for that. The refusal is what stops an abandoned inspection
	// running a compiler over a mirror this teardown is deleting.
	#refuseDestroyed(): void {
		if (this.#closing !== undefined) throw createDestroyedError('type stage')
	}

	// Creates this stage's own mirror directory and the marker that attributes it. The marker is the
	// same one the runtime stage writes on the files it generates, so a sweep never deletes a
	// directory by its name alone.
	#createMirror(): void {
		const marker = resolveWorkspaceFile(
			this.#workspace,
			`${TYPE_MIRROR}/${this.#revision}/.probe/mirror.txt`,
			true,
		)
		mkdirSync(dirname(marker), { recursive: true })
		writeFileSync(marker, formatSpecification('', this.#revision), {
			encoding: 'utf8',
			flag: 'wx',
		})
	}

	// Removes the mirrors a dead host left behind. Every stage deletes its own at teardown, so one
	// that outlives its host belongs to a process that was killed. Three conditions together make a
	// directory this package's to delete: the name is a revision identity, the process it names is
	// gone, and the marker inside it names that same revision. A directory failing any of them stays
	// where it is, whoever wrote it.
	#sweep(): void {
		const root = resolveWorkspaceFile(this.#workspace, TYPE_MIRROR)
		let entries: readonly Dirent[] = []
		try {
			entries = readdirSync(root, { withFileTypes: true })
		} catch {
			return
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue
			const owner = parseRevisionOwner(entry.name)
			if (owner === undefined || matchesLiveProcess(owner)) continue
			const marker = attempt(() =>
				readFileSync(join(root, entry.name, '.probe', 'mirror.txt'), 'utf8'),
			)
			if (!marker.success || !matchesSpecification(marker.value, entry.name)) continue
			try {
				rmSync(join(root, entry.name), {
					recursive: true,
					force: true,
					maxRetries: 5,
					retryDelay: 20,
				})
			} catch {}
		}
	}

	// Brings the mirror level with the workspace by content digest, so a file edited since the last
	// inspection is checked as it stands on disk and an untouched file is not copied again. A file
	// the workspace no longer holds is removed from the mirror, because a stale copy there would
	// shadow the deletion.
	#refresh(): void {
		const present = new Set<string>()
		for (const path of collectWorkspaceFiles(this.#workspace)) {
			const contained = relativeWorkspaceFile(this.#workspace, path)
			present.add(contained)
			const reading = attempt(() => readFileSync(path))
			if (!reading.success) continue
			const digest = createHash('sha256').update(reading.value).digest('hex')
			if (this.#mirrored.get(contained) === digest) continue
			this.#place(reading.value, path)
			this.#mirrored.set(contained, digest)
		}
		for (const contained of [...this.#mirrored.keys()]) {
			if (present.has(contained)) continue
			this.#remove(contained)
			this.#mirrored.delete(contained)
		}
	}

	// Releases the candidate text one inspection wrote. The copy is removed rather than restored, so
	// the next refresh reads the workspace's own file again and a draft that named no workspace file
	// leaves nothing behind.
	#release(): void {
		for (const contained of this.#drafts) {
			this.#remove(contained)
			this.#mirrored.delete(contained)
		}
		this.#drafts.clear()
	}

	// Puts one file's contents at its mirrored path and reports the workspace-relative path it took,
	// which is the key every record this stage keeps is held under.
	#place(text: string | Uint8Array, path: string): string {
		const contained = relativeWorkspaceFile(this.#workspace, path)
		const target = this.#mirrorPath(contained)
		const written = attempt(() => {
			mkdirSync(dirname(target), { recursive: true })
			writeFileSync(target, text)
		})
		if (written.success) return contained
		this.#displace(target)
		mkdirSync(dirname(target), { recursive: true })
		writeFileSync(target, text)
		return contained
	}

	// Removes whatever in the mirror stands where one path must go. A workspace holding a file where
	// a draft declares a directory, and a claim declaring a file where an earlier draft made a
	// directory, both reach here: the mirror is this stage's own tree, so the path the write names
	// wins and the next refresh restores whatever the workspace still holds.
	#displace(target: string): void {
		const ancestors: string[] = []
		let directory = dirname(target)
		while (directory !== this.#mirror && directory !== dirname(directory)) {
			ancestors.unshift(directory)
			directory = dirname(directory)
		}
		for (const ancestor of [...ancestors, target]) {
			const reading = attempt(() => lstatSync(ancestor))
			if (!reading.success) continue
			if (ancestor !== target && reading.value.isDirectory()) continue
			if (ancestor === target && !reading.value.isDirectory()) continue
			rmSync(ancestor, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
			this.#mirrored.delete(relativeWorkspaceFile(this.#mirror, ancestor))
		}
	}

	// Spells one workspace-relative path inside this stage's own mirror.
	#mirrorPath(contained: string): string {
		return join(this.#mirror, contained)
	}

	// Spells one project the way this stage keys it: resolved against the workspace, then reported
	// relative to it, so every spelling of one project reaches one run and one cached configuration.
	#contain(project: string): string {
		return relativeWorkspaceFile(this.#workspace, resolveWorkspaceFile(this.#workspace, project))
	}

	#remove(contained: string): void {
		try {
			rmSync(this.#mirrorPath(contained), { force: true, maxRetries: 5, retryDelay: 20 })
		} catch {}
	}

	// Reads the configuration the compiler prints for one project against the mirror, refreshing the
	// mirror first on a cache miss so the digest names the configuration the mirror holds at that
	// moment. The reading is cached per project for the life of the stage, so a draft a later
	// inspection writes cannot move it.
	async #configure(project: string): Promise<ProjectConfig> {
		const contained = this.#contain(project)
		const existing = this.#configs.get(contained)
		if (existing !== undefined) return existing
		this.#refresh()
		const execution = await this.#spawn(['--showConfig', '-p', contained], this.#mirror)
		this.#refuseDestroyed()
		const config = parseProjectConfig(execution.stdout)
		if (config === undefined) throw this.#fault(execution, contained)
		this.#configs.set(contained, config)
		return config
	}

	// Runs one project's compiler over the mirror and reports what it said about the drafts assigned
	// to that project. A run carrying no drafts is the warming run, which builds the incremental
	// state the inspections reuse. The diagnostics decide the outcome: a run that printed one is read
	// from it whatever stderr carries, and a run that printed none and exited zero is clean whatever
	// stderr carries. Only a run that printed no diagnostic and did not exit zero raises, because
	// that run reported nothing this stage can act on.
	async #check(project: string, drafts: readonly Draft[]): Promise<readonly Issue[]> {
		const config = await this.#configure(project)
		const scratch = this.#scratch(this.#contain(project), config, drafts)
		const execution = await this.#spawn(
			['--noEmit', '--pretty', 'false', '-p', `./${scratch}`],
			this.#mirror,
		)
		this.#refuseDestroyed()
		const diagnostics = scanDiagnostics(execution.stdout)
		if (diagnostics.length === 0 && execution.status !== 0) {
			const stderr = execution.stderr.trim()
			const message =
				stderr !== ''
					? stderr
					: execution.status === undefined
						? 'The compiler reported no diagnostic and was ended by a signal'
						: `The compiler reported no diagnostic and exited ${execution.status}`
			throw new ProbeError(this.#translate(message), {
				origin: 'instrument',
				code: 'malformed',
				context: { stage: this.stage, project },
			})
		}
		return this.#issues(diagnostics, project)
	}

	// Writes the scratch project one run reads, beside the mirrored project it extends. Sitting in
	// that directory is what lets every relative path the extended chain declares resolve inside the
	// mirror unchanged, the project's own printed selection included.
	#scratch(project: string, config: ProjectConfig, drafts: readonly Draft[]): string {
		const directory = dirname(project)
		const stem = `${basename(project, extname(project))}.probe.json`
		const contained = directory === '.' ? stem : `${directory}/${stem}`
		const target = this.#mirrorPath(contained)
		const buildinfo = join(this.#mirror, '.probe', `${project.replaceAll('/', '-')}.tsbuildinfo`)
		// The project's own selection is carried across rather than left to the compiler's default,
		// because naming `files` at all suppresses that default. A selection entry the mirror does not
		// hold is dropped, so a file the workspace deleted after this reading refuses nothing.
		const selected = (config.files ?? []).filter((entry) =>
			existsSync(resolve(dirname(target), entry)),
		)
		// Each entry stays relative to the scratch project's own directory, so the mirror carries no
		// host layout and its incremental state keeps working from wherever the mirror sits.
		const files = [
			...selected,
			...drafts.map((draft) =>
				relativeWorkspaceFile(dirname(target), this.#mirrorPath(this.#contain(draft.path))),
			),
		]
		const body = {
			extends: `./${basename(project)}`,
			compilerOptions: {
				noEmit: true,
				declaration: false,
				emitDeclarationOnly: false,
				composite: false,
				incremental: true,
				tsBuildInfoFile: relativeWorkspaceFile(dirname(target), buildinfo),
			},
			...(files.length === 0 ? {} : { files }),
		}
		mkdirSync(dirname(target), { recursive: true })
		writeFileSync(target, `${JSON.stringify(body, undefined, '\t')}\n`, 'utf8')
		return contained
	}

	#issues(diagnostics: readonly Diagnostic[], project: string): readonly Issue[] {
		const issues: Issue[] = []
		for (const diagnostic of diagnostics) {
			const message = this.#translate(diagnostic.message)
			const resolved =
				diagnostic.path === undefined ? undefined : resolve(this.#mirror, diagnostic.path)
			const drafted =
				resolved !== undefined &&
				this.#drafts.has(
					escapesRoot(this.#mirror, resolved)
						? relativeWorkspaceFile(this.#workspace, resolved)
						: relativeWorkspaceFile(this.#mirror, resolved),
				)
			// A diagnostic against no file, and one against a `.json` file the claim itself did not
			// draft, names a configuration the target tree declares for itself. So the target holds
			// the only file that can close it, and reporting it as a candidate issue would charge a
			// claimant for a configuration nobody else owns. A `.json` file the claim drafted is the
			// claimant's like any other draft.
			if (resolved === undefined || (!drafted && extname(resolved) === '.json')) {
				throw new ProbeError(message, {
					origin: 'workspace',
					code: 'malformed',
					context: { stage: this.stage, project },
				})
			}
			const path = escapesRoot(this.#mirror, resolved)
				? escapesRoot(this.#workspace, resolved)
					? normalizePath(resolved)
					: relativeWorkspaceFile(this.#workspace, resolved)
				: relativeWorkspaceFile(this.#mirror, resolved)
			issues.push({
				origin: 'claimant',
				path,
				message,
				...(diagnostic.range === undefined ? {} : { range: diagnostic.range }),
			})
		}
		return issues
	}

	// Renders one message in the terms this package reports a path in. The mirror root is removed
	// first and the workspace root second, because the mirror sits inside the workspace and the
	// longer prefix is the one a compiler running there names a file by. What is left of a contained
	// path is the workspace-relative spelling a reader can open.
	#translate(message: string): string {
		return relativeWorkspaceMessage(
			this.#workspace,
			relativeWorkspaceMessage(this.#mirror, message),
		)
	}

	#fault(execution: Execution, project: string): ProbeError {
		const reported = scanDiagnostics(execution.stdout).map((diagnostic) => diagnostic.message)
		const text = reported.length > 0 ? reported.join('\n') : execution.stdout.trim()
		return new ProbeError(
			this.#translate(text === '' ? 'The compiler printed no configuration' : text),
			{
				origin: 'workspace',
				code: 'malformed',
				context: { stage: this.stage, project },
			},
		)
	}

	#spawn(args: readonly string[], cwd: string): Promise<Execution> {
		this.#refuseDestroyed()
		return new Promise<Execution>((settle, refuse) => {
			const child = spawn(process.execPath, [this.#compiler, ...args], {
				cwd,
				stdio: ['ignore', 'pipe', 'pipe'],
			})
			const output = child.stdout
			const errors = child.stderr
			if (output === null || errors === null) {
				this.#terminate(child)
				refuse(
					new ProbeError('The compiler was spawned without its own output streams', {
						origin: 'instrument',
						code: 'malformed',
						context: { stage: this.stage },
					}),
				)
				return
			}
			this.#children.add(child)
			let stdout = ''
			let stderr = ''
			output.setEncoding('utf8')
			errors.setEncoding('utf8')
			output.on('data', (chunk: string) => {
				stdout += chunk
			})
			errors.on('data', (chunk: string) => {
				stderr += chunk
			})
			child.on('error', (error: unknown) => {
				this.#children.delete(child)
				refuse(
					new ProbeError('The workspace compiler could not be started', {
						origin: 'workspace',
						code: 'malformed',
						context: { stage: this.stage, path: this.#compiler },
						cause: error,
					}),
				)
			})
			child.on('close', (code: number | null) => {
				this.#children.delete(child)
				settle({ ...(code === null ? {} : { status: code }), stdout, stderr })
			})
		})
	}

	// Ends one compiler run. A Windows host never delivers a cooperative signal to a child, and the
	// compiler is spawned through the Node executable, so the whole tree is ended there by process
	// id; every other host receives the signal it handles.
	#terminate(child: ChildProcess): void {
		const id = child.pid
		if (process.platform === 'win32' && id !== undefined) {
			spawnSync('taskkill', ['/pid', String(id), '/t', '/f'], { stdio: 'ignore' })
			return
		}
		child.kill('SIGTERM')
	}
}
