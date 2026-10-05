import type {
	Case,
	Check,
	Claim,
	ProbeEventMap,
	ProbeInterface,
	ProbeOptions,
	Project,
	Toolchain,
	Verdict,
} from '@src/core'
import type { EmitterInterface } from '@orkestrel/emitter'
import type { PoolInterface, PoolToken } from '@orkestrel/pool'
import type { TimeoutInterface } from '@orkestrel/timeout'
import type { Inspection, StageInterface } from './types.js'
import { existsSync, mkdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, relative } from 'node:path'
import { Emitter } from '@orkestrel/emitter'
import { isString } from '@orkestrel/contract'
import { createPool, isPoolError } from '@orkestrel/pool'
import { isLSPError } from '@orkestrel/lsp'
import { addAbortListener } from 'node:events'
import { createTimeout } from '@orkestrel/timeout'
import {
	PROBE_DEADLINE,
	PROBE_RESTARTS,
	PROBE_WARM,
	ProbeError,
	computeReceipt,
	createDestroyedError,
	formatCheck,
	formatSpecification,
	isProbeError,
} from '@src/core'
import { peerDependencies } from '../../package.json' with { type: 'json' }
import {
	buildRevisionPath,
	computeDigest,
	describeUnknown,
	overwriteFile,
	readWorkspaceManifest,
	resolveWorkspaceFile,
} from './helpers.js'
import { LintStage } from './stages/LintStage.js'
import { RuntimeStage } from './stages/RuntimeStage.js'
import { TypeStage } from './stages/TypeStage.js'

/**
 * Answers claims through its type, lint, and runtime stages.
 *
 * @remarks
 * Construction resolves the target workspace's toolchain. Starting warms every stage and waits
 * for lint and runtime; type warming and the boot controls continue behind that gate. The boot
 * controls mutate imported dependencies and refuse service unless the type and runtime stages
 * report their respective changes. One pool per stage admits inspections in arrival order, one at
 * a time, so a stage never serves two claims at once and the deadline covers active work rather
 * than queue wait. Each active stage inspection has a coordinator-owned deadline. An expiry at any
 * stage abandons that stage and replaces it before the next queued inspection begins, so one slow
 * claim costs that claim rather than the process. A failed boot is replaced the same way: the next
 * claim runs the controls again rather than inheriting a refusal.
 *
 * @example The claim that earns a receipt
 * ```ts
 * import type { Claim } from '@orkestrel/probe'
 * import { Probe } from '@orkestrel/probe/server'
 *
 * const claim: Claim = {
 * 	project: 'configs/src/tsconfig.core.json',
 * 	case: {
 * 		files: [
 * 			{
 * 				path: 'src/core/factories.ts',
 * 				text: "export function createGreeting(): string {\n\treturn 'hi'\n}\n",
 * 			},
 * 		],
 * 		test: {
 * 			path: 'tmp/probes/greeting.test.ts',
 * 			text: "import { expect, test } from 'vitest'\nimport { createGreeting } from '../../src/core/factories.js'\ntest('greets', () => expect(createGreeting()).toBe('hi'))\n",
 * 		},
 * 	},
 * 	control: {
 * 		files: [
 * 			{
 * 				path: 'src/core/factories.ts',
 * 				text: "export function createGreeting(): number {\n\treturn 'hi'\n}\n",
 * 			},
 * 		],
 * 		test: {
 * 			path: 'tmp/probes/greeting.test.ts',
 * 			text: "import { expect, test } from 'vitest'\nimport { createGreeting } from '../../src/core/factories.js'\ntest('greets', () => expect(createGreeting()).toBe('hi'))\n",
 * 		},
 * 		stage: 'type',
 * 		reason: 'a string returned as a number must not compile',
 * 	},
 * }
 *
 * const probe = new Probe({ workspace: process.cwd() })
 * const verdict = await probe.prove(claim)
 * verdict.digest // 'bdf03e5dfd6bd413ead671c7a2940fcf'
 * verdict.receipt // 'probe:bdf03e5dfd6bd413ead671c7a2940fcf:type:typescript@6.0.3:oxlint@1.86.0:vitest@4.1.11:configs/src/tsconfig.core.json@434f59254d58cf2683d453a26bd0d837'
 * await probe.destroy()
 * ```
 */
export class Probe implements ProbeInterface {
	readonly #workspace: string
	readonly #deadline: number
	readonly #warmth: number
	readonly #emitter: Emitter<ProbeEventMap>
	readonly #toolchain: Toolchain
	readonly #type: PoolInterface<TypeStage>
	readonly #lint: PoolInterface<LintStage>
	readonly #runtime: PoolInterface<RuntimeStage>
	readonly #deadlines = new WeakSet<ProbeError>()
	readonly #surfaced = new WeakSet<ProbeError>()
	readonly #survivors = new Map<StageInterface, unknown>()
	readonly #abort = new AbortController()
	#arming: Promise<void> | undefined
	#refusal: { readonly cause: unknown } | undefined
	#starting: Promise<void> | undefined
	// The teardown latch and the destroyed reading are one field: `destroy` assigns it before
	// anything it starts can suspend, so every later read of `#closing !== undefined` answers the
	// question a second flag would have answered, and no second write can drift from this one.
	#closing: Promise<void> | undefined

	/**
	 * Resolves the target toolchain and constructs the stage pools without warming them.
	 *
	 * @param options - Workspace, inspection and warm bounds, and initial observation hooks
	 */
	constructor(options?: ProbeOptions) {
		this.#workspace = options?.workspace ?? process.cwd()
		this.#deadline = createTimeout({ ms: options?.deadline ?? PROBE_DEADLINE }).ms
		this.#warmth = createTimeout({ ms: options?.warm ?? PROBE_WARM }).ms
		this.#emitter = new Emitter({
			...(options?.on === undefined ? {} : { on: options.on }),
			...(options?.error === undefined ? {} : { error: options.error }),
		})
		this.#toolchain = Object.freeze({
			typescript: this.#version('typescript'),
			oxlint: this.#version('oxlint'),
			vitest: this.#version('vitest'),
		})
		this.#type = createPool({
			create: () => this.#warm(new TypeStage(this.#workspace)),
			destroy: this.#dispose.bind(this),
			error: this.#surface.bind(this),
			min: 1,
			restarts: PROBE_RESTARTS,
		})
		this.#lint = createPool({
			create: this.#createLint.bind(this),
			destroy: this.#dispose.bind(this),
			watch: (stage) => stage.exit,
			error: this.#surface.bind(this),
			min: 1,
			restarts: PROBE_RESTARTS,
		})
		this.#runtime = createPool({
			create: () => this.#warm(new RuntimeStage(this.#workspace)),
			destroy: this.#dispose.bind(this),
			error: this.#surface.bind(this),
			min: 1,
			restarts: PROBE_RESTARTS,
		})
	}

	get emitter(): EmitterInterface<ProbeEventMap> {
		return this.#emitter
	}

	get toolchain(): Toolchain {
		return this.#toolchain
	}

	async prove(claim: Claim): Promise<Verdict> {
		try {
			this.#support()
			this.#admit(claim)
			await this.start()
			const arming = this.#arming
			try {
				await arming
			} catch (error) {
				if (this.#arming === arming) this.#arming = undefined
				const refusal = this.#refusal
				this.#refusal = undefined
				throw refusal === undefined ? error : refusal.cause
			}
			if (this.#closing !== undefined) throw createDestroyedError('probe')
			const started = performance.now()
			const id = randomUUID()
			// Resolve the project before any inspection runs, so a project this workspace cannot parse
			// fails the claim outright rather than after every stage has paid for it.
			const project = await this.#resolve(claim)
			const digest = computeDigest(this.#workspace, {
				case: claim.case,
				control: claim.control,
			})
			const subject = Object.freeze(await this.#inspect(claim.case, claim))
			const control = Object.freeze(await this.#inspect(claim.control, claim))
			const basis: Verdict = {
				id,
				digest,
				toolchain: this.#toolchain,
				project,
				reason: claim.control.reason,
				case: subject,
				control,
				elapsed: Math.round(performance.now() - started),
			}
			const receipt = computeReceipt(basis, claim.control.stage)
			const verdict: Verdict = receipt === undefined ? basis : { ...basis, receipt }
			this.#emitter.emit('prove', verdict)
			return verdict
		} catch (error) {
			// An arming failure reached the error channel as its attempt rejected. Reporting it here
			// too would show one refused boot as two faults.
			if (!isProbeError(error) || !this.#surfaced.has(error)) {
				this.#emitter.emit('error', error)
			}
			throw error
		}
	}

	destroy(): Promise<void> {
		if (this.#closing !== undefined) return this.#closing
		this.#closing = Promise.resolve().then(this.#destroy.bind(this))
		return this.#closing
	}

	start(): Promise<void> {
		if (this.#closing !== undefined) return Promise.reject(createDestroyedError('probe'))
		const warming = this.#type.start()
		void warming.catch(() => {})
		const filling = Promise.all([this.#lint.start(), this.#runtime.start()])
		void filling.catch(() => {})
		if (this.#starting !== undefined) return this.#starting
		this.#starting = this.#start(filling, warming)
		void this.#starting.then(
			() => {
				this.#starting = undefined
			},
			() => {
				this.#starting = undefined
			},
		)
		return this.#starting
	}

	async #start(filling: Promise<readonly void[]>, warming: Promise<void>): Promise<void> {
		let created = false
		try {
			this.#support()
			if (this.#arming === undefined) created = this.#workbench()
		} catch (error) {
			// The workbench refusal names the boot in its own message and reports the target tree's
			// fault, so it surfaces and rejects unchanged. Rewrapping it here would report a
			// directory this workspace blocks as this package refusing to serve.
			this.#surface(error)
			throw error
		}
		try {
			await filling
			if (this.#closing !== undefined) throw createDestroyedError('probe')
		} catch (error) {
			throw this.#refuseArm(error)
		}
		if (this.#arming === undefined) {
			this.#arming = this.#arm(warming, created)
			void this.#arming.catch(() => {
				if (this.#refusal === undefined) this.#arming = undefined
			})
		}
	}

	async #arm(warming: Promise<void>, created: boolean): Promise<void> {
		try {
			await warming
		} catch (error) {
			if (this.#closing !== undefined) throw createDestroyedError('probe')
			const cause = this.#refusal?.cause ?? (isPoolError(error) ? error.cause : error)
			this.#surface(cause)
			throw cause
		}
		try {
			if (this.#closing !== undefined) throw createDestroyedError('probe')
			await this.#boot(created)
		} catch (error) {
			throw this.#refuseArm(error)
		}
		// The boot control's own files are gone before this line, so a listener is told the
		// instrument serves only after the workspace holds nothing the control wrote.
		this.#emitter.emit('arm', this.#toolchain)
	}

	// Reports an arming attempt's refusal as it happens. `arm` never fires for a rejected attempt
	// and the attempt is retained for the next `prove` to retry, so a host that waits for `arm` and
	// a host that calls nothing are both told nothing without this. Recording the failure is what
	// keeps `prove` from reporting one refusal a second time when the same attempt reaches it.
	// Observation only: the retry, its timing, and what the next caller reads are unchanged.
	#surface(error: unknown): void {
		if (this.#closing !== undefined) return
		if (isProbeError(error)) this.#surfaced.add(error)
		this.#emitter.emit('error', error)
	}

	#workbench(): boolean {
		const path = 'tmp/probes'
		const directory = resolveWorkspaceFile(this.#workspace, path)
		// A returned `true` means this directory was absent before this call, so the boot teardown
		// that follows owns removing it again.
		const created = !existsSync(directory)
		try {
			mkdirSync(resolveWorkspaceFile(this.#workspace, path, true), { recursive: true })
		} catch (error) {
			const code = isProbeError(error) && error.origin === 'workspace' ? error.code : 'malformed'
			throw new ProbeError(
				`The probe could not create the boot workbench (${describeUnknown(error)})`,
				{
					origin: 'workspace',
					code,
					context: { path },
					cause: error,
				},
			)
		}
		return created
	}

	async #boot(created: boolean): Promise<void> {
		// The dependencies that follow are real files in the target's tree, so they carry the same
		// revision identity a generated specification does: the writing host's process id, then a
		// fresh UUID. A boot the host does not survive leaves them behind, and the next runtime
		// warm sweeps a file whose writer is gone while leaving a live neighbour's alone.
		const revision = `${process.pid}-${randomUUID()}`
		const typeDependency = buildRevisionPath(this.#workspace, 'tmp/probes/arm-type.ts', revision)
		const runtimeDependency = buildRevisionPath(
			this.#workspace,
			'tmp/probes/arm-runtime.ts',
			revision,
		)
		const typeModule = basename(typeDependency, '.ts')
		const runtimeModule = basename(runtimeDependency, '.ts')
		const typeTest = {
			path: `tmp/probes/${typeModule}.test.ts`,
			text: `import type { Signal } from './${typeModule}.js'\nimport { expect, test } from 'vitest'\nconst SIGNAL: Signal = 'before'\ntest('revalidates a mutated type', () => {\n\texpect(SIGNAL).toBe('before')\n})\n`,
		}
		const runtimeTest = {
			path: `tmp/probes/${runtimeModule}.test.ts`,
			text: `import { SIGNAL } from './${runtimeModule}.js'\nimport { expect, test } from 'vitest'\ntest('revalidates a mutated value', () => {\n\texpect(SIGNAL).toBe('before')\n})\n`,
		}
		const typeClaim: Claim = {
			project: 'tsconfig.json',
			case: { files: [], test: typeTest },
			control: {
				files: [],
				test: typeTest,
				stage: 'type',
				reason: 'the imported type changed on disk between the two inspections',
			},
		}
		const runtimeClaim: Claim = {
			project: 'tsconfig.json',
			case: { files: [], test: runtimeTest },
			control: {
				files: [],
				test: runtimeTest,
				stage: 'runtime',
				reason: 'the imported dependency changed after the resident runtime cached it',
			},
		}
		try {
			resolveWorkspaceFile(this.#workspace, relative(this.#workspace, typeDependency), true)
			resolveWorkspaceFile(this.#workspace, relative(this.#workspace, runtimeDependency), true)
			writeFileSync(
				typeDependency,
				formatSpecification('export type Signal = string\n', revision),
				{
					encoding: 'utf8',
					flag: 'wx',
				},
			)
			writeFileSync(
				runtimeDependency,
				formatSpecification("export const SIGNAL = 'before'\n", revision),
				{
					encoding: 'utf8',
					flag: 'wx',
				},
			)
			const beforeType = await this.#inspect(typeClaim.case, typeClaim)
			const beforeRuntime = await this.#inspect(runtimeClaim.case, runtimeClaim)
			const before = [...beforeType, ...beforeRuntime]
			if (before.some((check) => check.issues.length > 0)) {
				throw new ProbeError(
					`The probe boot control did not begin clean\n${before.map(formatCheck).join('\n')}`,
					{ origin: 'instrument', code: 'malformed' },
				)
			}
			resolveWorkspaceFile(this.#workspace, relative(this.#workspace, typeDependency), true)
			overwriteFile(typeDependency, formatSpecification('export type Signal = number\n', revision))
			const afterType = await this.#inspect(typeClaim.control, typeClaim)
			const type = afterType.find((check) => check.stage === typeClaim.control.stage)
			const tolerant = afterType.find((check) => check.stage === 'runtime')
			if (type === undefined || type.issues.length === 0) {
				throw new ProbeError(
					`The probe boot type control did not detect a mutated dependency\n${afterType.map(formatCheck).join('\n')}`,
					{
						origin: 'instrument',
						code: 'malformed',
						context: { stage: typeClaim.control.stage },
					},
				)
			}
			if (tolerant === undefined || tolerant.issues.length > 0) {
				throw new ProbeError(
					`The probe boot type control did not remain runtime-clean\n${afterType.map(formatCheck).join('\n')}`,
					{
						origin: 'instrument',
						code: 'malformed',
						context: { stage: 'runtime' },
					},
				)
			}
			resolveWorkspaceFile(this.#workspace, relative(this.#workspace, runtimeDependency), true)
			overwriteFile(
				runtimeDependency,
				formatSpecification("export const SIGNAL = 'after'\n", revision),
			)
			const afterRuntime = await this.#inspect(runtimeClaim.control, runtimeClaim)
			const runtime = afterRuntime.find((check) => check.stage === runtimeClaim.control.stage)
			if (runtime === undefined || runtime.issues.length === 0) {
				throw new ProbeError(
					`The probe boot runtime control did not detect a mutated dependency\n${afterRuntime.map(formatCheck).join('\n')}`,
					{
						origin: 'instrument',
						code: 'malformed',
						context: { stage: runtimeClaim.control.stage },
					},
				)
			}
		} finally {
			rmSync(
				resolveWorkspaceFile(this.#workspace, relative(this.#workspace, typeDependency), true),
				{ force: true },
			)
			rmSync(
				resolveWorkspaceFile(this.#workspace, relative(this.#workspace, runtimeDependency), true),
				{ force: true },
			)
			if (created) {
				try {
					rmdirSync(resolveWorkspaceFile(this.#workspace, 'tmp/probes', true))
				} catch {}
			}
		}
	}

	#inspect(subject: Case, claim: Claim): Promise<readonly Check[]> {
		const inspection: Inspection = { subject, claim }
		return Promise.all([
			this.#inspectType(inspection),
			this.#inspectLint(inspection),
			this.#inspectRuntime(inspection),
		])
	}

	async #inspectType(inspection: Inspection): Promise<Check> {
		const token = await this.#lease(this.#type)
		return this.#inspectStage(
			token,
			() => token.value.inspect(inspection.subject, inspection.claim.project),
			inspection.claim,
		)
	}

	async #inspectLint(inspection: Inspection): Promise<Check> {
		const token = await this.#lease(this.#lint)
		return this.#inspectStage(
			token,
			(signal) => token.value.inspect(inspection.subject, { signal }),
			inspection.claim,
		)
	}

	async #inspectRuntime(inspection: Inspection): Promise<Check> {
		const token = await this.#lease(this.#runtime)
		return this.#inspectStage(
			token,
			() => token.value.inspect(inspection.subject),
			inspection.claim,
		)
	}

	async #inspectStage<T>(
		token: PoolToken<StageInterface>,
		operation: (signal: AbortSignal) => Promise<T>,
		claim: Claim,
		message = `The ${token.value.stage} stage exceeded ${this.#deadline} ms`,
	): Promise<T> {
		const stage = token.value
		try {
			return await this.#bound(operation, message, stage, stage.progress)
		} catch (error) {
			if (isProbeError(error) && this.#deadlines.has(error)) {
				await token.destroy().catch(() => {})
				if (this.#closing === undefined) this.#emitter.emit('expire', claim)
			}
			throw error
		} finally {
			token.release()
		}
	}

	async #bound<T>(
		operation: (signal: AbortSignal) => Promise<T>,
		message: string,
		stage: StageInterface,
		progress: number,
		ms = this.#deadline,
	): Promise<T> {
		const timeout = createTimeout({ ms })
		timeout.start()
		const expiry = this.#expiry(timeout, message, stage, progress)
		const refusal = expiry.catch((error: unknown) => error)
		try {
			return await Promise.race([operation(timeout.signal), expiry])
		} catch (error) {
			if (timeout.expired) throw await refusal
			throw error
		} finally {
			timeout.clear()
		}
	}

	async #resolve(claim: Claim): Promise<Project> {
		const token = await this.#lease(this.#type)
		// A replacement can fail while acquisition waits, even after the original boot completed.
		if (this.#refusal !== undefined) {
			const refusal = this.#refusal
			this.#refusal = undefined
			token.release()
			throw refusal.cause
		}
		const stage = token.value
		return this.#inspectStage(
			token,
			() => stage.resolve(claim.project),
			claim,
			`The type stage project resolution exceeded ${this.#deadline} ms`,
		)
	}

	async #lease<T>(pool: PoolInterface<T>): Promise<PoolToken<T>> {
		try {
			return await pool.acquire()
		} catch (error) {
			if (isPoolError(error)) {
				if (error.code === 'destroyed') throw createDestroyedError('probe')
				if (error.code === 'create' || error.code === 'cleanup') throw error.cause
			}
			throw error
		}
	}

	#createLint(): Promise<LintStage> {
		for (const cause of this.#survivors.values()) {
			throw new ProbeError(
				'The Oxlint language server survived cleanup; restart the probe server',
				{ origin: 'instrument', code: 'malformed', context: { stage: 'lint' }, cause },
			)
		}
		return this.#warm(new LintStage(this.#workspace))
	}

	async #warm<T extends StageInterface>(stage: T): Promise<T> {
		const bound = stage.stage === 'type' ? this.#warmth : this.#deadline
		const aborted = Promise.withResolvers<never>()
		// A create admitted before teardown can refuse before entering the race.
		void aborted.promise.catch(() => {})
		const subscription = addAbortListener(this.#abort.signal, () =>
			aborted.reject(createDestroyedError('probe')),
		)
		try {
			if (this.#closing !== undefined) throw createDestroyedError('probe')
			await this.#bound(
				() => Promise.race([stage.start(), aborted.promise]),
				`The ${stage.stage} stage warm exceeded ${bound} ms`,
				stage,
				stage.progress,
				bound,
			)
			return stage
		} catch (error) {
			if (stage.stage === 'type' && this.#closing === undefined) this.#refusal ??= { cause: error }
			try {
				await this.#dispose(stage)
			} catch (failure) {
				// Outside teardown only a lint timeout rejects disposal. Retain any rejected cleanup
				// here so teardown also reports a resource whose failed warm prevented insertion.
				this.#survivors.set(stage, failure)
				throw failure
			}
			throw error
		} finally {
			subscription[Symbol.dispose]()
		}
	}

	async #dispose(stage: StageInterface): Promise<void> {
		try {
			await this.#bound(
				() => stage.destroy(),
				`The ${stage.stage} stage teardown exceeded ${this.#deadline} ms`,
				stage,
				stage.progress,
			)
		} catch (error) {
			if (isProbeError(error) && this.#deadlines.has(error)) return
			if (
				this.#closing !== undefined ||
				(stage.stage === 'lint' &&
					isProbeError(error) &&
					isLSPError(error.cause) &&
					error.cause.code === 'timeout')
			)
				throw error
			this.#surface(error)
		}
	}

	#refuseArm(error: unknown): ProbeError {
		if (this.#closing !== undefined) return createDestroyedError('probe')
		const cause = isPoolError(error) ? error.cause : error
		const failure = new ProbeError(`The probe could not arm: ${describeUnknown(cause)}`, {
			origin: 'instrument',
			code: 'malformed',
			cause,
		})
		this.#surface(failure)
		return failure
	}

	// Rejects when the deadline fires, so a race against it settles even when the operation it
	// races never returns. The stage travels beside the message because a caller catching this
	// branches on the category and the budget, and reads the message only to print it.
	#expiry(
		timeout: TimeoutInterface,
		message: string,
		stage: StageInterface,
		progress: number,
	): Promise<never> {
		return new Promise<never>((_resolve, reject) => {
			timeout.signal.addEventListener(
				'abort',
				() => {
					const error = new ProbeError(message, {
						origin: stage.progress > progress ? 'claimant' : 'instrument',
						code: 'deadline',
						context: { stage: stage.stage, deadline: timeout.ms },
					})
					this.#deadlines.add(error)
					reject(error)
				},
				{ once: true },
			)
		})
	}

	async #destroy(): Promise<void> {
		this.#abort.abort()
		const barriers = Promise.allSettled([
			this.#type.destroy(),
			this.#lint.destroy(),
			this.#runtime.destroy(),
		])
		try {
			await this.#starting?.catch(() => {})
			await this.#arming?.catch(() => {})
			const results = await barriers
			const survivors = await Promise.allSettled(
				[...this.#survivors.keys()].map((stage) => this.#dispose(stage)),
			)
			this.#survivors.clear()
			for (const result of [...results, ...survivors]) {
				if (result.status === 'rejected')
					throw isPoolError(result.reason) ? result.reason.cause : result.reason
			}
		} finally {
			this.#emitter.destroy()
		}
	}

	#version(name: string): string {
		const manifest = readWorkspaceManifest(this.#workspace, name)
		const version = manifest.contents.version
		if (!isString(version)) {
			throw new ProbeError(`${name} publishes no readable version`, {
				origin: 'workspace',
				code: 'malformed',
				context: { name },
			})
		}
		return version
	}

	// Refuses a control that is the case again. No stage inspects such a claim: the refusal answers
	// before any stage is asked for an inspection and before the instrument is awaited, so it reads
	// the same in every workspace state. Admission precedes this call's onset, and the boot controls
	// never touch this claim. Such a control can only
	// break by nondeterminism, and the receipt it would earn that way attests a falsification that
	// never happened — the worst answer this package can return. Identity covers the whole case, the
	// candidate drafts and the test, and it is decided on the bytes rather than on the digest a
	// verdict carries: that digest rewrites every workspace-contained absolute string to its relative
	// form, so two drafts one byte apart can hash alike and a control the claimant can break would be
	// refused. The control's `stage` and `reason` describe the drafts rather than being them, so
	// neither rescues a control whose files and test are the case's. Drafts are paired by position,
	// because a shared path materializes the last draft that carries it and reordering the list
	// therefore changes what the stages read.
	#admit(claim: Claim): void {
		const subject = claim.case
		const control = claim.control
		if (subject.test.path !== control.test.path) return
		if (subject.test.text !== control.test.text) return
		if (subject.files.length !== control.files.length) return
		const repeated = subject.files.every((draft, index) => {
			const other = control.files[index]
			return other !== undefined && other.path === draft.path && other.text === draft.text
		})
		if (!repeated) return
		throw new ProbeError(
			'The control must differ from the case; it carries the same candidate drafts and the same test',
			{ origin: 'claimant', code: 'refused' },
		)
	}

	#support(): void {
		const version = this.#toolchain.typescript
		const range = peerDependencies.typescript
		const supported = /^\^(\d+)\./u.exec(range)?.[1]
		const found = /^(\d+)\./u.exec(version)?.[1]
		if (supported === undefined || found !== supported) {
			throw new ProbeError(`The supported TypeScript range is ${range}; found ${version}`, {
				origin: 'workspace',
				code: 'malformed',
				context: { name: 'typescript', value: version },
			})
		}
	}
}
