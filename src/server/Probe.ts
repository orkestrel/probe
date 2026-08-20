import type {
	Case,
	Check,
	Claim,
	ProbeEventMap,
	ProbeInterface,
	ProbeOptions,
	Toolchain,
	Verdict,
} from '@src/core'
import type { EmitterInterface } from '@orkestrel/emitter'
import type { QueueInterface } from '@orkestrel/queue'
import type { TimeoutInterface } from '@orkestrel/timeout'
import type { Inspection, StageInterface } from './types.js'
import { existsSync, mkdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, relative } from 'node:path'
import { Emitter } from '@orkestrel/emitter'
import { createQueue } from '@orkestrel/queue'
import { createTimeout } from '@orkestrel/timeout'
import {
	ProbeError,
	computeReceipt,
	createDestroyedError,
	formatCheck,
	formatSpecification,
} from '@src/core'
import { peerDependencies } from '../../package.json' with { type: 'json' }
import {
	computeDigest,
	createRevisionFile,
	messageFromUnknown,
	readWorkspaceManifest,
	resolveWorkspaceFile,
} from './helpers.js'
import { LintStage } from './stages/LintStage.js'
import { RuntimeStage } from './stages/RuntimeStage.js'
import { TypeStage } from './stages/TypeStage.js'

/**
 * Answers claims through resident TypeScript, Oxlint, and Vitest stages.
 *
 * @remarks
 * Construction resolves the target workspace's toolchain and begins warming every stage. The boot
 * controls mutate imported dependencies and refuse service unless the type and runtime stages
 * report their respective changes. One queue per stage admits inspections in arrival order, one at
 * a time, so a stage never serves two claims at once and the deadline covers active work rather
 * than queue wait. Each active stage inspection has a coordinator-owned deadline. An expiry at any
 * stage abandons that stage and replaces it before the next queued inspection begins, so one slow
 * claim costs that claim rather than the process. A failed boot is replaced the same way: the next
 * claim runs the controls again rather than inheriting a refusal.
 *
 * @example
 * ```ts
 * const probe = new Probe({ workspace: '/srv/checkout' })
 * const verdict = await probe.prove(claim)
 * await probe.destroy()
 * ```
 */
export class Probe implements ProbeInterface {
	readonly #workspace: string
	readonly #deadline: number
	readonly #emitter: Emitter<ProbeEventMap>
	readonly #toolchain: Toolchain
	#type: TypeStage
	#lint: LintStage
	#runtime: RuntimeStage
	readonly #typeQueue: QueueInterface<Inspection, Check>
	readonly #lintQueue: QueueInterface<Inspection, Check>
	readonly #runtimeQueue: QueueInterface<Inspection, Check>
	#arming: Promise<void>
	#closing: Promise<void> | undefined
	#destroyed = false

	/**
	 * Resolves the target toolchain and starts warming the resident stages.
	 *
	 * @param options - Workspace, deadline, and initial observation hooks
	 */
	constructor(options?: ProbeOptions) {
		this.#workspace = options?.workspace ?? process.cwd()
		this.#deadline = createTimeout({ ms: options?.deadline ?? 30_000 }).ms
		this.#emitter = new Emitter({
			...(options?.on === undefined ? {} : { on: options.on }),
			...(options?.error === undefined ? {} : { error: options.error }),
		})
		this.#toolchain = Object.freeze({
			typescript: this.#version('typescript'),
			oxlint: this.#version('oxlint'),
			vitest: this.#version('vitest'),
		})
		this.#type = new TypeStage(this.#workspace)
		this.#lint = new LintStage(this.#workspace)
		this.#runtime = new RuntimeStage(this.#workspace)
		// One queue per stage, strictly ordered and one deep, is the only place this coordinator
		// serializes: a stage admits nothing itself. `retries: 0` keeps the queue from re-running an
		// inspection, because a stage that exceeded its deadline is recycled rather than retried, and
		// that recovery runs inside the handler so it finishes before the next claim is admitted.
		this.#typeQueue = createQueue<Inspection, Check>({
			concurrency: 1,
			retries: 0,
			handler: (inspection) =>
				this.#inspectStage(
					this.#type,
					this.#type.progress,
					this.#type.inspect(inspection.subject, inspection.claim.project),
					inspection.claim,
				),
		})
		this.#lintQueue = createQueue<Inspection, Check>({
			concurrency: 1,
			retries: 0,
			handler: (inspection) =>
				this.#inspectStage(
					this.#lint,
					this.#lint.progress,
					this.#lint.inspect(inspection.subject),
					inspection.claim,
				),
		})
		this.#runtimeQueue = createQueue<Inspection, Check>({
			concurrency: 1,
			retries: 0,
			handler: (inspection) =>
				this.#inspectStage(
					this.#runtime,
					this.#runtime.progress,
					this.#runtime.inspect(inspection.subject),
					inspection.claim,
				),
		})
		this.#arming = this.#arm()
		// Observe the stored promise here. Nothing else reads it until `prove` or `destroy`, and a
		// host that calls neither takes an unhandled rejection that ends the process. The stored
		// promise keeps rejecting, so `prove` still reports the arming failure to its caller.
		void this.#arming.catch(() => {})
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
			await this.#ready()
			if (this.#destroyed) throw createDestroyedError('probe')
			const started = performance.now()
			const id = randomUUID()
			// Resolve the project before any inspection runs, so a project this workspace cannot parse
			// fails the claim outright rather than after every stage has paid for it.
			const project = await this.#type.resolve(claim.project)
			const digest = computeDigest(this.#workspace, {
				case: claim.case,
				control: claim.control,
			})
			const checks = Object.freeze(await this.#inspect(claim.case, claim))
			const control = Object.freeze(await this.#inspect(claim.control, claim))
			const basis: Verdict = {
				id,
				digest,
				toolchain: this.#toolchain,
				project,
				reason: claim.control.reason,
				checks,
				control,
				elapsed: Math.round(performance.now() - started),
			}
			const receipt = computeReceipt(basis, claim.control.stage)
			const verdict: Verdict = receipt === undefined ? basis : { ...basis, receipt }
			this.#emitter.emit('prove', verdict)
			return verdict
		} catch (error) {
			this.#emitter.emit('error', error)
			throw error
		}
	}

	destroy(): Promise<void> {
		if (this.#closing !== undefined) return this.#closing
		this.#destroyed = true
		this.#closing = this.#destroy()
		return this.#closing
	}

	// Awaits the arming attempt in flight and starts one replacement for an attempt that failed.
	// Arming runs the boot controls through the same stages a claim uses, so the failure that ends
	// it is usually the workspace's — a stage that outran the deadline, a project that had no
	// Vitest environment yet — and those are repaired while this process keeps running. One
	// replacement per call bounds the cost: a workspace that still cannot arm pays one boot and
	// reports it, rather than looping. A caller that already started the replacement is joined
	// rather than replaced, so several callers waiting on one failed boot start one boot between
	// them.
	async #ready(): Promise<void> {
		const attempt = this.#arming
		try {
			await attempt
			return
		} catch (error) {
			if (this.#destroyed) throw error
		}
		if (this.#arming === attempt) {
			this.#arming = this.#arm()
			void this.#arming.catch(() => {})
		}
		await this.#arming
	}

	async #arm(): Promise<void> {
		try {
			await this.#boot()
		} catch (error) {
			// A boot failure and a claim's own stage failure are otherwise one message: the controls
			// run through the same stages under the same deadline, so `The lint stage exceeded 6000
			// ms` reads as evidence about the candidate when it is the instrument refusing to serve.
			throw new ProbeError(`The probe could not arm: ${messageFromUnknown(error)}`, {
				origin: 'instrument',
				code: 'malformed',
				cause: error,
			})
		}
		// The boot control's own files are gone before this line, so a listener is told the
		// instrument serves only after the workspace holds nothing the control wrote.
		this.#emitter.emit('arm', this.#toolchain)
	}

	async #boot(): Promise<void> {
		// The dependencies below are real files in the target's tree, so they carry the same
		// revision identity a generated specification does: the writing host's process id, then a
		// fresh UUID. A boot the host does not survive leaves them behind, and the next runtime
		// warm sweeps a file whose writer is gone while leaving a live neighbour's alone.
		const revision = `${process.pid}-${randomUUID()}`
		const directory = resolveWorkspaceFile(this.#workspace, 'tmp/probe')
		const typeDependency = createRevisionFile(this.#workspace, 'tmp/probe/arm-type.ts', revision)
		const runtimeDependency = createRevisionFile(
			this.#workspace,
			'tmp/probe/arm-runtime.ts',
			revision,
		)
		const created = !existsSync(directory)
		const typeModule = basename(typeDependency, '.ts')
		const runtimeModule = basename(runtimeDependency, '.ts')
		const typeTest = {
			path: `tmp/probe/${typeModule}.test.ts`,
			text: `import type { Signal } from './${typeModule}.js'\nimport { expect, test } from 'vitest'\nconst SIGNAL: Signal = 'before'\ntest('revalidates a mutated type', () => {\n\texpect(SIGNAL).toBe('before')\n})\n`,
		}
		const runtimeTest = {
			path: `tmp/probe/${runtimeModule}.test.ts`,
			text: `import { SIGNAL } from './${runtimeModule}.js'\nimport { expect, test } from 'vitest'\ntest('revalidates a mutated value', () => {\n\texpect(SIGNAL).toBe('before')\n})\n`,
		}
		const typeClaim: Claim = {
			project: 'tsconfig.json',
			case: { files: [], test: typeTest },
			control: {
				files: [],
				test: typeTest,
				stage: 'type',
				reason: 'the imported type changed after the resident type host cached it',
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
			mkdirSync(resolveWorkspaceFile(this.#workspace, 'tmp/probe', true), { recursive: true })
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
			if (before.some((check) => check.findings.length > 0)) {
				throw new ProbeError(
					`The probe boot control did not begin clean\n${before.map(formatCheck).join('\n')}`,
					{ origin: 'instrument', code: 'malformed' },
				)
			}
			resolveWorkspaceFile(this.#workspace, relative(this.#workspace, typeDependency), true)
			writeFileSync(
				typeDependency,
				formatSpecification('export type Signal = number\n', revision),
				'utf8',
			)
			const afterType = await this.#inspect(typeClaim.control, typeClaim)
			const type = afterType.find((check) => check.stage === typeClaim.control.stage)
			const tolerant = afterType.find((check) => check.stage === 'runtime')
			if (type === undefined || type.findings.length === 0) {
				throw new ProbeError(
					`The probe boot type control did not detect a mutated dependency\n${afterType.map(formatCheck).join('\n')}`,
					{
						origin: 'instrument',
						code: 'malformed',
						context: { stage: typeClaim.control.stage },
					},
				)
			}
			if (tolerant === undefined || tolerant.findings.length > 0) {
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
			writeFileSync(
				runtimeDependency,
				formatSpecification("export const SIGNAL = 'after'\n", revision),
				'utf8',
			)
			const afterRuntime = await this.#inspect(runtimeClaim.control, runtimeClaim)
			const runtime = afterRuntime.find((check) => check.stage === runtimeClaim.control.stage)
			if (runtime === undefined || runtime.findings.length === 0) {
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
					rmdirSync(resolveWorkspaceFile(this.#workspace, 'tmp/probe', true))
				} catch {}
			}
		}
	}

	#inspect(subject: Case, claim: Claim): Promise<readonly Check[]> {
		const inspection: Inspection = { subject, claim }
		const admitted = [
			this.#typeQueue.enqueue(inspection),
			this.#lintQueue.enqueue(inspection),
			this.#runtimeQueue.enqueue(inspection),
		]
		// `Promise.all` reports the first rejection and stops observing the rest, and an unobserved
		// rejection ends the host process. Observe each one here; the caller still reads the first.
		for (const pending of admitted) void pending.catch(() => {})
		return Promise.all(admitted)
	}

	async #inspectStage(
		stage: StageInterface,
		progress: number,
		operation: Promise<Check>,
		claim: Claim,
	): Promise<Check> {
		const timeout = createTimeout({ ms: this.#deadline })
		timeout.start()
		try {
			return await Promise.race([
				operation,
				this.#expiry(
					timeout,
					`The ${stage.stage} stage exceeded ${this.#deadline} ms`,
					stage,
					progress,
				),
			])
		} catch (error) {
			if (!timeout.expired) throw error
			// The recovery runs before this handler returns, so the replacement is installed before
			// the queue admits the next inspection and the claim behind this one meets a stage that
			// serves rather than one that reports a stranger's expiry.
			if (await this.#recycle(stage)) this.#emitter.emit('expire', claim)
			throw error
		} finally {
			timeout.clear()
		}
	}

	// Replaces the stage one expired deadline destroyed, so a single slow claim costs that claim
	// rather than the process. A resident server whose type, lint, or runtime stage stays destroyed
	// answers every later claim with the destruction of a stage that caller never asked about.
	async #recycle(stage: StageInterface): Promise<boolean> {
		const timeout = createTimeout({ ms: this.#deadline })
		timeout.start()
		try {
			// Teardown of a hung stage can reject or outlive its own deadline, and the replacement
			// must be installed either way: the field otherwise stays destroyed for the life of the
			// process and every later claim reports that instead of its own evidence.
			await Promise.race([
				stage.destroy(),
				this.#expiry(
					timeout,
					`The ${stage.stage} stage recovery exceeded ${this.#deadline} ms`,
					stage,
					stage.progress,
				),
			])
		} catch {
			// The failure belongs to the stage being replaced, and the replacement below is the
			// recovery the caller is owed.
		} finally {
			timeout.clear()
		}
		if (this.#destroyed) return false
		// Identity, not kind: a second expiry racing this one names the stage this call already
		// replaced, and rebuilding on that report would discard a live stage the queues are using.
		if (stage === this.#type) {
			this.#type = new TypeStage(this.#workspace)
			return true
		}
		if (stage === this.#lint) {
			this.#lint = new LintStage(this.#workspace)
			return true
		}
		if (stage === this.#runtime) {
			this.#runtime = new RuntimeStage(this.#workspace)
			return true
		}
		return false
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
				() =>
					reject(
						new ProbeError(message, {
							origin: stage.progress > progress ? 'claimant' : 'instrument',
							code: 'deadline',
							context: { stage: stage.stage, deadline: this.#deadline },
						}),
					),
				{ once: true },
			)
		})
	}

	async #destroy(): Promise<void> {
		try {
			await this.#arming
		} catch {}
		// Tear the stages down and leave the queues running. A queue holds no host resource — no
		// timer, no listener, no store — and stage teardown settles every entry still admitted, so
		// each caller reads the stage's own refusal. Destroying a queue instead abandons those
		// entries, and a stage rejecting after its queue stopped observing ends the host process.
		await Promise.all([this.#type.destroy(), this.#lint.destroy(), this.#runtime.destroy()])
	}

	#version(name: string): string {
		const manifest = readWorkspaceManifest(this.#workspace, name)
		const version = manifest.contents.version
		if (typeof version !== 'string') {
			throw new ProbeError(`${name} publishes no readable version`, {
				origin: 'workspace',
				code: 'malformed',
				context: { name },
			})
		}
		return version
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
