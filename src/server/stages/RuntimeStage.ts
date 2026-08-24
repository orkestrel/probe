import type { Case, Check, Draft, Issue, Stage } from '@src/core'
import type { OverlayInterface, StageInterface } from '../types.js'
import type {
	TestProjectConfiguration,
	UserProjectConfigFn,
	UserWorkspaceConfig,
	ViteUserConfig,
} from 'vitest/config'
import type { TestProject, TestRunResult, Vitest, createVitest } from 'vitest/node'
import type { Dirent } from 'node:fs'
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { attempt } from '@orkestrel/contract'
import {
	ProbeError,
	createDestroyedError,
	formatSpecification,
	isProbeError,
	matchesSpecification,
} from '@src/core'
import {
	captureListeners,
	createRevisionFile,
	describeUnknown,
	guardStage,
	inferTestProject,
	isRefusedName,
	loadWorkspaceModule,
	matchesWorkspaceModule,
	normalizePath,
	releaseListeners,
	relativeWorkspaceFile,
	resolveWorkspaceFile,
} from '../helpers.js'
import { Overlay } from '../Overlay.js'

/**
 * Inspects tests through one resident Vitest service from the target workspace.
 *
 * @remarks
 * Construction starts Vitest with the threads pool and instruments each inline or function-declared
 * project with a Vite plugin that reads the active inspection's candidate overlay. A selected
 * string-declared project reports a workspace issue because its configuration carries no runtime
 * overlay plugin. Every inspection writes one fresh sibling specification, invalidates each
 * workspace module whose disk content or candidate revision changed, runs that specification,
 * evicts its result, and deletes the file. Clearing the overlay makes the next snapshot differ from
 * the candidate revision, so the next inspection invalidates that module and reads disk again.
 *
 * Vite retains one unresolved URL for every specification path, so the stage replaces its whole
 * Vitest service after 64 specifications rather than deleting from each map that service owns. Any
 * bound holds the retention flat, because the replacement releases everything the instance held,
 * and 64 is the value chosen. The inspection that crosses the bound pays the replacement
 * synchronously: it closes the resident service and warms a new one before it runs. On 2026-08-20,
 * over this package's own workspace on the host `guides/probe.md` § Cost names, two runs of 66
 * inspections put that one at 480 ms and 269 ms against median inspections of 156 ms and 155 ms, so
 * budget one call in 64 at 110 ms to 330 ms above the rest.
 *
 * Every issue this stage emits names its party, and the stage emits an issue for every party
 * `Party` declares. An `origin: 'claimant'` issue is a failure Vitest reported about the candidate.
 * An `origin: 'workspace'` issue names the target tree: a project the root configuration declares
 * as a path string, into which the stage can install no overlay, and a specification path that
 * crosses a symbolic link, whose existing components this host cannot inspect, or whose directory
 * the target tree blocks probe from creating. An `origin: 'instrument'` issue names this package's
 * own machinery: a specification it could not write after its directory exists and the host did not
 * refuse the caller's own name, or one it could not run, evict, or delete, in each case for a
 * reason the target tree does not own, and a run that reported no test. An unmapped caller test and
 * a test whose named project is absent are claimant failures with `code: 'missing'`, and a declared
 * test path the host refuses to create is a claimant failure with `code: 'refused'`. Each is thrown
 * rather than reported, because a test that never ran is no evidence about the candidate.
 *
 * The write path's physical-containment guarantee covers the claim inputs and the target tree as
 * inspected. A concurrent process that mutates a path component between the final inspection and
 * the write is outside that guarantee.
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
	#vitest: Promise<Vitest> | undefined
	#overlay: OverlayInterface = new Overlay()
	readonly #modules = new Map<string, string>()
	readonly #revisions = new Set<string>()
	#specifications = 0
	#closing: Promise<void> | undefined
	#progress = 0
	#destroyed = false

	/**
	 * Starts warming the target workspace's Vitest service.
	 *
	 * @param workspace - The target workspace root. Default: the current working directory
	 */
	constructor(workspace: string = process.cwd()) {
		this.#workspace = workspace
		const vitest = loadWorkspaceModule(this.#workspace, 'vitest/node')
		this.#store(this.#warm(vitest.createVitest))
	}

	get stage(): Stage {
		return 'runtime'
	}

	get progress(): number {
		return this.#progress
	}

	inspect(subject: Case): Promise<Check> {
		return guardStage(this.stage, this.#inspect(subject))
	}

	destroy(): Promise<void> {
		if (this.#closing !== undefined) return this.#closing
		this.#destroyed = true
		this.#closing = guardStage(this.stage, this.#destroy())
		return this.#closing
	}

	async #inspect(subject: Case): Promise<Check> {
		if (this.#destroyed) throw createDestroyedError('runtime stage')
		const started = performance.now()
		// Vitest reports a failed run by setting `process.exitCode` on this host, and a stage that
		// runs a claim's negative control fails a run deliberately. Restore whatever the host had,
		// rather than assigning zero over a code the host set for itself.
		const exitCode = process.exitCode
		const vitest = await this.#runner()
		if (this.#destroyed) throw createDestroyedError('runtime stage')
		const project = this.#project(vitest, subject.test.path)
		if ('message' in project) {
			return {
				stage: this.stage,
				elapsed: Math.round(performance.now() - started),
				issues: [project],
			}
		}
		const overlay = new Overlay()
		this.#overlay = overlay
		try {
			for (const draft of subject.files) {
				overlay.set(resolveWorkspaceFile(this.#workspace, draft.path), draft.text)
			}
			this.#revalidate(vitest)
			const specification = this.#specification(subject.test)
			if (typeof specification !== 'string') {
				return {
					stage: this.stage,
					elapsed: Math.round(performance.now() - started),
					issues: [specification],
				}
			}
			// Vitest stores a specification under the exact identifier it is handed, while its deletion
			// handler rewrites the path it is given to forward slashes before looking that key up. So on
			// a host whose separator is a backslash the native spelling is stored and never found again:
			// the eviction below misses, Vitest keeps the module in its file map, and every later run
			// returns it among that run's own results. The module a failed arming left behind then
			// reports as a claimant issue against a clean case and refuses its receipt. Hand Vitest one
			// identifier for the specification, its results, and its eviction. Read the host separator
			// rather than the platform name, for the reason `#invalidate` gives. The file itself is
			// written and deleted through the native path `relative` and `realpathSync` return from this
			// one.
			const file = sep === '\\' ? normalizePath(specification) : specification
			this.#specifications += 1
			this.#revisions.add(file)
			let issues: readonly Issue[] = []
			let cleanup: readonly Issue[] = []
			const task = project.createSpecification(file, undefined, 'threads')
			this.#progress += 1
			try {
				try {
					const result = await vitest.runTestSpecifications([task], false)
					issues = this.#issues(result, file, subject.test.path)
				} catch (error) {
					if (error instanceof ProbeError) throw error
					throw new ProbeError(
						`The runtime stage could not run the generated specification (${describeUnknown(error)})`,
						{
							origin: 'instrument',
							code: 'malformed',
							context: { stage: this.stage, path: subject.test.path },
							cause: error,
						},
					)
				}
			} finally {
				this.#progress -= 1
				process.exitCode = exitCode
				this.#revisions.delete(file)
				cleanup = await this.#evict(vitest, file)
				try {
					const contained = resolveWorkspaceFile(
						this.#workspace,
						relative(this.#workspace, file),
						true,
					)
					if (existsSync(contained)) unlinkSync(contained)
				} catch (error) {
					cleanup = [
						...cleanup,
						{
							origin:
								error instanceof ProbeError && error.origin === 'workspace'
									? 'workspace'
									: 'instrument',
							path: relativeWorkspaceFile(this.#workspace, file),
							message: `The runtime stage could not delete the generated specification (${describeUnknown(error)})`,
						},
					]
				}
			}
			return {
				stage: this.stage,
				elapsed: Math.round(performance.now() - started),
				issues: [...issues, ...cleanup],
			}
		} finally {
			overlay.clear()
		}
	}

	async #destroy(): Promise<void> {
		try {
			// Remove the abandoned specifications first. An inspection the coordinator gave up on keeps
			// its file until the run it started finally settles, and a file left behind is ordinary
			// TypeScript in the target's tree: the workspace's own `check` and `lint:check` read it
			// and report its diagnostics as the consumer's own.
			for (const file of this.#revisions) {
				try {
					const contained = resolveWorkspaceFile(
						this.#workspace,
						relative(this.#workspace, file),
						true,
					)
					if (existsSync(contained)) unlinkSync(contained)
				} catch {}
			}
			this.#revisions.clear()
			// A stage whose warming failed holds nothing to release, so teardown settles rather than
			// re-reporting a failure its constructor already surfaced.
			const vitest = await this.#vitest?.catch(() => undefined)
			if (vitest !== undefined) {
				void vitest.cancelCurrentRun('keyboard-input').catch(() => {})
				await vitest.close()
			}
		} finally {
			this.#modules.clear()
			this.#overlay.clear()
		}
	}

	async #warm(create: typeof createVitest): Promise<Vitest> {
		this.#sweep()
		const output = new PassThrough()
		output.resume()
		// Vitest installs one `SIGINT` and one `SIGTERM` handler per `createVitest` call, and each
		// one force exits this process about a millisecond after the signal arrives. Teardown takes
		// three orders of magnitude longer than that, so a host answering the signal gracefully
		// loses the race and leaves its generated files in the consumer's tree. Diff the listeners
		// across the call and remove exactly what appeared: the handler's name is an unexported
		// Vitest detail, and matching on it would both miss a rename and strip a coincidental name
		// match this stage does not own. Every warm strips, because every replacement and every
		// stage the coordinator recycles calls `createVitest` again. Vitest's `exit` handler is left
		// alone: it runs while the process is already leaving rather than racing a teardown.
		//
		// The call is not awaited here, and that is what makes the diff correct rather than merely
		// tidy. Vitest registers those handlers before its first await, so releasing them as the
		// call returns leaves no window a signal can arrive in. Releasing them after the promise
		// settles would leave the whole warm exposed, and would remove every termination listener
		// the host registered meanwhile — including the server's own, which starts after this
		// constructor returns.
		const signals = captureListeners(process, ['SIGINT', 'SIGTERM'])
		let warming: Promise<Vitest>
		try {
			// Only standard output frames the Model Context Protocol transport. Preserve worker
			// diagnostics on standard error while draining standard output into a bounded stream.
			warming = create(
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
				{
					plugins: [
						{
							name: 'orkestrel-project-instrumentation',
							enforce: 'post',
							config: this.#configure.bind(this),
						},
					],
				},
				{ stdout: output, stderr: process.stderr },
			)
		} catch (error) {
			throw this.#configuration(error)
		} finally {
			releaseListeners(process, signals)
		}
		try {
			return await warming
		} catch (error) {
			throw this.#configuration(error)
		}
	}

	#configure(config: ViteUserConfig): void {
		const test = config.test
		if (test?.projects === undefined) return
		// Vite concatenates project arrays returned from config hooks. Replace the hook-owned slot so
		// each configured project keeps one identity while gaining the runtime adapter.
		test.projects = test.projects.map((project) => this.#augment(project))
	}

	#augment(project: TestProjectConfiguration): TestProjectConfiguration {
		if (typeof project === 'string') return project
		if (typeof project === 'function') return this.#wrap(project)
		return Promise.resolve(project).then(this.#instrument.bind(this))
	}

	#wrap(project: UserProjectConfigFn): UserProjectConfigFn {
		return async (environment) => this.#instrument(await project(environment))
	}

	#instrument(config: UserWorkspaceConfig): UserWorkspaceConfig {
		return {
			...config,
			plugins: [
				...(config.plugins ?? []),
				{
					name: 'orkestrel-runtime-overlay',
					enforce: 'pre',
					resolveId: this.#resolve.bind(this),
					load: this.#load.bind(this),
				},
			],
		}
	}

	#resolve(id: string, importer: string | undefined): string | undefined {
		const separator = id.lastIndexOf('?')
		const specifier = separator === -1 ? id : id.slice(0, separator)
		const suffix = separator === -1 ? '' : id.slice(separator)
		if (!specifier.startsWith('.') && !isAbsolute(specifier)) return undefined
		if (importer === undefined && !isAbsolute(specifier)) return undefined
		const imported = isAbsolute(specifier)
			? specifier
			: resolve(dirname(importer ?? this.#workspace), specifier)
		const candidates = [imported]
		const extension = extname(imported)
		if (extension === '.js') candidates.push(`${imported.slice(0, -extension.length)}.ts`)
		if (extension === '') candidates.push(`${imported}.ts`)
		for (const candidate of candidates) {
			const resolved = `${candidate}${suffix}`
			if (this.#load(resolved) !== undefined) return resolved
		}
		return undefined
	}

	#load(id: string): string | undefined {
		const text = this.#overlay.text(id)
		if (text !== undefined) return text
		const separator = id.lastIndexOf('?')
		if (separator === -1) return undefined
		const query = id.slice(separator + 1)
		if (
			!query.startsWith('v=') ||
			query.length === 2 ||
			query.includes('&') ||
			query.includes('#') ||
			query.slice(2).includes('?')
		) {
			return undefined
		}
		return this.#overlay.text(id.slice(0, separator))
	}

	#specification(test: Draft): string | Issue {
		let creating = false
		// The sibling path the write aimed at, kept where the classification below can read it. That
		// path is composed inside the attempt because it carries a revision minted there, and the
		// classification needs the path itself rather than the fault's own text.
		let generated: string | undefined
		const outcome = attempt(() => {
			// The writing host's own process id leads the revision, so a later host can tell a file
			// whose writer is gone from one a live host still holds. Several hosts share one
			// workspace routinely — this package's own suite is one — and a sweep reading the name
			// alone deletes a neighbour's specification out from under its run. The same revision
			// goes into the file's own marker, so the sweep reads one value from two places.
			const revision = `${process.pid}-${randomUUID()}`
			const file = createRevisionFile(this.#workspace, test.path, revision)
			generated = file
			const target = relative(this.#workspace, file)
			resolveWorkspaceFile(this.#workspace, target, true)
			// The caller declared where its test lives, so creating that directory is part of what the
			// declaration asked for. `tmp` is ignored by version control and the coordinator's boot
			// tidies away the workbench it created, so the path the convention names is absent in a
			// fresh checkout of a target: a stage that refused over the absence alone refused the first
			// claim of every consumer. A directory the host will not create still refuses through the
			// issue a failed write reports.
			creating = true
			mkdirSync(dirname(file), { recursive: true })
			creating = false
			resolveWorkspaceFile(this.#workspace, target, true)
			// The marker goes in the file rather than in its name alone, because the name is the
			// caller's path and the text is the caller's test: without it nothing in the tree says
			// this package wrote the file, and the sweep would have to delete on a name.
			writeFileSync(file, formatSpecification(test.text, revision), {
				encoding: 'utf8',
				flag: 'wx',
			})
			return file
		})
		if (outcome.success) return outcome.value
		if (outcome.error instanceof ProbeError && outcome.error.origin === 'claimant') {
			throw new ProbeError(outcome.error.message, {
				origin: outcome.error.origin,
				code: outcome.error.code,
				context: { ...outcome.error.context, path: test.path },
				cause: outcome.error.cause,
			})
		}
		// A create the host refused is the caller's name, not this package's machinery and not the
		// target tree. The directory exists by this point, so an ordinary absent file would have been
		// created; what remains is a name the host will not accept. `creating` bounds this to the
		// final write, leaving a directory the tree blocks to the workspace issue below.
		if (!creating && generated !== undefined && isRefusedName(generated, outcome.error)) {
			throw new ProbeError(
				`The runtime stage cannot write a specification beside a test path the host refuses (${describeUnknown(outcome.error)})`,
				{
					origin: 'claimant',
					code: 'refused',
					context: { stage: this.stage, path: test.path },
					cause: outcome.error,
				},
			)
		}
		return {
			origin:
				(outcome.error instanceof ProbeError && outcome.error.origin === 'workspace') || creating
					? 'workspace'
					: 'instrument',
			path: test.path,
			message: `The runtime stage could not write the generated specification (${describeUnknown(outcome.error)})`,
		}
	}

	// Returns the project or the issue that replaces it, never both and never neither. A pair of
	// independent optionals would let a caller write the combination carrying neither, and that branch
	// reports a clean check for a case whose test never ran.
	#project(vitest: Vitest, path: string): TestProject | Issue {
		// `inferTestProject` reads a workspace-relative path, and a caller declares whatever path it
		// holds. An absolute one splits into leading segments that match no project, which silently
		// selected the root project before this resolved.
		const name = inferTestProject(relative(this.#workspace, resolve(this.#workspace, path)))
		if (name === undefined) {
			throw new ProbeError(
				'The runtime stage found no configured Vitest project matching the test path',
				{
					origin: 'claimant',
					code: 'missing',
					context: { stage: this.stage, path },
				},
			)
		}
		const project = vitest.projects.find((candidate) => candidate.name === name)
		if (project === undefined) {
			throw new ProbeError(`The runtime stage found no configured Vitest project named ${name}`, {
				origin: 'claimant',
				code: 'missing',
				context: { stage: this.stage, path },
			})
		}
		if (
			!project.vite.config.plugins.some((plugin) => plugin.name === 'orkestrel-runtime-overlay')
		) {
			return {
				origin: 'workspace',
				path,
				message: `The runtime stage cannot instrument the string-declared Vitest project ${name} because its configuration carries no runtime overlay plugin`,
			}
		}
		return project
	}

	async #evict(vitest: Vitest, file: string): Promise<readonly Issue[]> {
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
			vitest.cache.results.removeFromCache(normalizePath(relative(this.#workspace, file)))
			await vitest.cache.results.writeToCache()
			return []
		} catch (error) {
			return [
				{
					origin: 'instrument',
					path: relativeWorkspaceFile(this.#workspace, file),
					message: `The runtime stage could not evict the generated specification (${describeUnknown(error)})`,
				},
			]
		}
	}

	// Reads the specification count rather than incrementing it. An inspection that writes no
	// specification retains no URL, so counting it would recycle a runner that never grew.
	#runner(): Promise<Vitest> {
		// Vite retains one unresolved URL for each fresh specification path. A 64-specification
		// lifetime bounds that internal map without giving up the resident runner on each call.
		const current = this.#vitest
		if (current !== undefined && this.#specifications < 64) return current
		if (current !== undefined) return this.#store(this.#replace(current))
		const runner = loadWorkspaceModule(this.#workspace, 'vitest/node')
		return this.#store(
			this.#specifications < 64
				? this.#warm(runner.createVitest)
				: this.#replace(undefined, runner.createVitest),
		)
	}

	async #replace(
		current: Promise<Vitest> | undefined,
		create?: typeof createVitest,
	): Promise<Vitest> {
		if (current !== undefined) {
			const vitest = await current
			await vitest.close()
		}
		if (this.#destroyed) throw createDestroyedError('runtime stage')
		const runner = create ?? loadWorkspaceModule(this.#workspace, 'vitest/node').createVitest
		const replacement = await this.#warm(runner)
		this.#specifications = 0
		return replacement
	}

	#store(vitest: Promise<Vitest>): Promise<Vitest> {
		this.#vitest = vitest
		void vitest.catch(() => {
			if (this.#vitest === vitest) this.#vitest = undefined
		})
		return vitest
	}

	#configuration(error: unknown): ProbeError {
		if (isProbeError(error)) return error
		return new ProbeError(
			`The runtime stage could not load vite.config.ts (${describeUnknown(error)})`,
			{
				origin: 'workspace',
				code: 'malformed',
				context: { stage: this.stage, path: 'vite.config.ts' },
				cause: error,
			},
		)
	}

	#revalidate(vitest: Vitest): void {
		const modules = this.#snapshot()
		for (const [path, digest] of modules) {
			if (this.#modules.get(path) === digest) continue
			this.#invalidate(vitest, path)
		}
		for (const path of this.#modules.keys()) {
			if (modules.has(path)) continue
			this.#invalidate(vitest, path)
		}
		this.#modules.clear()
		for (const [path, digest] of modules) this.#modules.set(path, digest)
	}

	// Vite keys its module graph on the forward-slash spelling of a resolved id, and `invalidateFile`
	// looks that key up exactly. `#walk` builds each path with `join` and the overlay holds paths
	// `resolve` produced, so on a host whose separator is a backslash the native spelling matches no
	// key, the invalidation is dropped without an error, and the resident runner serves the previous
	// module. Read the host separator rather than the platform name, and rewrite only where it is a
	// backslash: a backslash is a legal filename character on a host whose separator is a forward
	// slash, so rewriting there would turn a key Vite holds into one it does not.
	#invalidate(vitest: Vitest, path: string): void {
		const id = sep === '\\' ? normalizePath(path) : path
		vitest.invalidateFile(id)
		vitest.watcher.invalidates.add(id)
	}

	#snapshot(): ReadonlyMap<string, string> {
		const modules = new Map<string, string>()
		for (const path of this.#walk()) {
			if (!matchesWorkspaceModule(path)) continue
			try {
				const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
				modules.set(path, digest)
			} catch {}
		}
		for (const path of this.#overlay.paths) {
			modules.set(path, `overlay:${this.#overlay.revision}`)
		}
		return modules
	}

	// Removes the files a dead host left behind. Every inspection deletes its own file and teardown
	// deletes the ones it abandoned, so a file that outlives both belongs to a host that was killed.
	// No Vitest project collects it — the revision marker sits between the stem and the extension,
	// so a specification generated from a `.test.ts` path is not itself a `.test.ts` file — but it
	// is ordinary TypeScript in the target's tree, so the workspace's own `check` and `lint:check`
	// report its diagnostics against the consumer. These conditions together make one file this
	// package's to delete: the name carries a revision, the identity leading that revision names a
	// process that is gone, and the file is one `#owned` can attribute. A file failing any of them
	// stays where it is, whoever wrote it.
	#sweep(): void {
		for (const path of this.#walk()) {
			const matches = [
				...basename(path).matchAll(
					/\.probe-((\d+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=\.|$)/gu,
				),
			]
			const match = matches.at(-1)
			const revision = match?.[1]
			const owner = match?.[2]
			if (revision === undefined || owner === undefined) continue
			if (this.#alive(Number.parseInt(owner, 10))) continue
			if (!this.#owned(path, revision)) continue
			try {
				unlinkSync(resolveWorkspaceFile(this.#workspace, relative(this.#workspace, path), true))
			} catch {}
		}
	}

	// Whether this package wrote one file. A name proves nothing on its own: a consumer's own file
	// can carry the same shape, and deleting it is data loss in their tree. A generated
	// specification carries the caller's own test text, so the marker this stage appends to it is
	// what attributes it, and the revision in the name must be the revision in the marker. The
	// coordinator's boot writes the same terminal marker on its dependencies, so every deletion uses
	// the same content-backed ownership rule.
	#owned(path: string, revision: string): boolean {
		const outcome = attempt(() => readFileSync(path, 'utf8'))
		return outcome.success && matchesSpecification(outcome.value, revision)
	}

	// Whether the host that wrote one specification is still running. Signal 0 delivers nothing and
	// reports reachability alone. A host this process may not signal reports `EPERM` and is read as
	// alive, and a non-positive identity names a process group rather than a process, so both leave
	// the file where it is: the safe direction is to keep a file this stage cannot account for.
	#alive(id: number): boolean {
		if (!Number.isSafeInteger(id) || id <= 0) return true
		try {
			process.kill(id, 0)
			return true
		} catch (error) {
			return error instanceof Error && 'code' in error && error.code === 'EPERM'
		}
	}

	// Yields every file the target workspace holds, skipping the trees no inspection reads: version
	// control, build output, and installed packages. A directory this host cannot list is skipped
	// rather than raised: the walk runs at construction and before every inspection, and one
	// unreadable directory in a consumer's tree is not a reason to refuse the workspace.
	*#walk(): Generator<string> {
		const directories = [resolve(this.#workspace)]
		while (directories.length > 0) {
			const directory = directories.pop()
			if (directory === undefined) break
			let entries: readonly Dirent[] = []
			try {
				entries = readdirSync(directory, { withFileTypes: true })
			} catch {}
			for (const entry of entries) {
				if (entry.name === '.git' || entry.name === 'dist' || entry.name === 'node_modules') {
					continue
				}
				const path = join(directory, entry.name)
				if (entry.isDirectory()) {
					directories.push(path)
					continue
				}
				if (entry.isFile()) yield path
			}
		}
	}

	#issues(result: TestRunResult, file: string, original: string): readonly Issue[] {
		const specification = this.#real(file)
		const issues: Issue[] = []
		for (const module of result.testModules) {
			const before = issues.length
			for (const error of module.errors()) {
				issues.push(this.#issue(error, specification, original))
			}
			for (const test of module.children.allTests('failed')) {
				const errors = test.result().errors ?? []
				for (const error of errors) issues.push(this.#issue(error, specification, original))
			}
			const state: string = module.state()
			if (state === 'passed') {
				if (Array.from(module.children.allTests()).length === 0) {
					issues.push({
						origin: 'instrument',
						path: original,
						message: 'Vitest ran no tests in the module',
					})
				}
				for (const test of module.children.allTests('skipped')) {
					issues.push({
						origin: 'instrument',
						path: original,
						message: `Vitest did not run the test (${test.fullName})`,
					})
				}
				continue
			}
			if (state === 'skipped') {
				issues.push({
					origin: 'instrument',
					path: original,
					message: 'Vitest ran no tests in the module',
				})
				continue
			}
			if (state === 'failed') {
				if (issues.length === before) {
					issues.push({
						origin: 'claimant',
						path: original,
						message: 'Vitest reported a failed test module',
					})
				}
				continue
			}
			if (state === 'pending' || state === 'queued') {
				issues.push({
					origin: 'instrument',
					path: original,
					message: `Vitest did not finish the test module (${state})`,
				})
				continue
			}
			issues.push({
				origin: 'instrument',
				path: original,
				message: `Vitest reported an unrecognized test module state (${state})`,
			})
		}
		for (const error of result.unhandledErrors) {
			issues.push(this.#issue(error, specification, original))
		}
		if (result.testModules.length === 0 && issues.length === 0) {
			issues.push({
				origin: 'instrument',
				path: original,
				message: 'Vitest returned no test module',
			})
		}
		return issues
	}

	// Resolves one path through its real form, and leaves a path it cannot resolve as it stands.
	// `resolve` does not follow a symbolic link, so a workspace handed to this stage as a link
	// produces a specification path no reported frame ever equals, and the mapping that follows reports
	// the generated `probe-<revision>` file a caller cannot open instead of the test it declared.
	#real(path: string): string {
		const outcome = attempt(() => realpathSync(path))
		return outcome.success ? outcome.value : path
	}

	// Every error reaching here came out of a run Vitest completed over the candidate's own test,
	// so each one is that code failing rather than this stage faulting. `specification` arrives
	// already resolved through its real path, and every reported frame is resolved the same way, so
	// the two sides compare on one spelling.
	#issue(error: unknown, specification: string, original: string): Issue {
		const message = describeUnknown(error)
		if (typeof error !== 'object' || error === null || !('stacks' in error)) {
			return { origin: 'claimant', path: original, message }
		}
		const stacks = error.stacks
		if (!Array.isArray(stacks)) return { origin: 'claimant', path: original, message }
		for (const stack of stacks) {
			if (typeof stack !== 'object' || stack === null) continue
			if (!('file' in stack) || typeof stack.file !== 'string') continue
			const declared = stack.file.startsWith('file:')
				? fileURLToPath(stack.file)
				: isAbsolute(stack.file)
					? stack.file
					: resolve(this.#workspace, stack.file)
			const reported = this.#real(declared)
			const path =
				reported === specification
					? original
					: relativeWorkspaceFile(this.#real(this.#workspace), reported)
			if (!('line' in stack) || typeof stack.line !== 'number') {
				return { origin: 'claimant', path, message }
			}
			return { origin: 'claimant', path, message, line: stack.line }
		}
		return { origin: 'claimant', path: original, message }
	}
}
