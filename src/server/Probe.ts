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
import { Emitter } from '@orkestrel/emitter'
import { createQueue } from '@orkestrel/queue'
import { createTimeout } from '@orkestrel/timeout'
import { computeReceipt, formatCheck } from '@src/core'
import { peerDependencies } from '../../package.json' with { type: 'json' }
import { readWorkspaceManifest, resolveWorkspaceFile } from './helpers.js'
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
 * than queue wait. Each active stage inspection has a coordinator-owned deadline. A runtime expiry
 * abandons and replaces its worker before the next queued inspection begins.
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
	readonly #type: TypeStage
	readonly #lint: LintStage
	#runtime: RuntimeStage
	readonly #typeQueue: QueueInterface<Inspection, Check>
	readonly #lintQueue: QueueInterface<Inspection, Check>
	readonly #runtimeQueue: QueueInterface<Inspection, Check>
	readonly #arming: Promise<void>
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
					this.#type.inspect(inspection.subject, inspection.claim.project),
				),
		})
		this.#lintQueue = createQueue<Inspection, Check>({
			concurrency: 1,
			retries: 0,
			handler: (inspection) =>
				this.#inspectStage(this.#lint, this.#lint.inspect(inspection.subject)),
		})
		this.#runtimeQueue = createQueue<Inspection, Check>({
			concurrency: 1,
			retries: 0,
			handler: (inspection) => this.#runRuntime(inspection.subject, inspection.claim),
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
			await this.#arming
			if (this.#destroyed) throw new Error('The probe has been destroyed')
			const started = performance.now()
			const id = randomUUID()
			const checks = Object.freeze(await this.#inspect(claim.case, claim))
			const control = Object.freeze(await this.#inspect(claim.control, claim))
			const basis: Verdict = {
				id,
				toolchain: this.#toolchain,
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

	async #arm(): Promise<void> {
		const id = randomUUID()
		const directory = resolveWorkspaceFile(this.#workspace, 'tmp/probe')
		const typeDependency = resolveWorkspaceFile(this.#workspace, `tmp/probe/arm-type-${id}.ts`)
		const runtimeDependency = resolveWorkspaceFile(
			this.#workspace,
			`tmp/probe/arm-runtime-${id}.ts`,
		)
		const created = !existsSync(directory)
		const typeTest = {
			path: `tmp/probe/arm-type-${id}.test.ts`,
			text: `import type { Signal } from './arm-type-${id}.js'\nimport { expect, test } from 'vitest'\nconst SIGNAL: Signal = 'before'\ntest('revalidates a mutated type', () => {\n\texpect(SIGNAL).toBe('before')\n})\n`,
		}
		const runtimeTest = {
			path: `tmp/probe/arm-runtime-${id}.test.ts`,
			text: `import { SIGNAL } from './arm-runtime-${id}.js'\nimport { expect, test } from 'vitest'\ntest('revalidates a mutated value', () => {\n\texpect(SIGNAL).toBe('before')\n})\n`,
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
			mkdirSync(directory, { recursive: true })
			writeFileSync(typeDependency, 'export type Signal = string\n', {
				encoding: 'utf8',
				flag: 'wx',
			})
			writeFileSync(runtimeDependency, "export const SIGNAL = 'before'\n", {
				encoding: 'utf8',
				flag: 'wx',
			})
			const beforeType = await this.#inspect(typeClaim.case, typeClaim)
			const beforeRuntime = await this.#inspect(runtimeClaim.case, runtimeClaim)
			const before = [...beforeType, ...beforeRuntime]
			if (before.some((check) => check.findings.length > 0)) {
				throw new Error(
					`The probe boot control did not begin clean\n${before.map(formatCheck).join('\n')}`,
				)
			}
			writeFileSync(typeDependency, 'export type Signal = number\n', 'utf8')
			const afterType = await this.#inspect(typeClaim.control, typeClaim)
			const type = afterType.find((check) => check.stage === typeClaim.control.stage)
			const tolerant = afterType.find((check) => check.stage === 'runtime')
			if (type === undefined || type.findings.length === 0) {
				throw new Error(
					`The probe boot type control did not detect a mutated dependency\n${afterType.map(formatCheck).join('\n')}`,
				)
			}
			if (tolerant === undefined || tolerant.findings.length > 0) {
				throw new Error(
					`The probe boot type control did not remain runtime-clean\n${afterType.map(formatCheck).join('\n')}`,
				)
			}
			writeFileSync(runtimeDependency, "export const SIGNAL = 'after'\n", 'utf8')
			const afterRuntime = await this.#inspect(runtimeClaim.control, runtimeClaim)
			const runtime = afterRuntime.find((check) => check.stage === runtimeClaim.control.stage)
			if (runtime === undefined || runtime.findings.length === 0) {
				throw new Error(
					`The probe boot runtime control did not detect a mutated dependency\n${afterRuntime.map(formatCheck).join('\n')}`,
				)
			}
		} finally {
			rmSync(typeDependency, { force: true })
			rmSync(runtimeDependency, { force: true })
			if (created) {
				try {
					rmdirSync(directory)
				} catch {}
			}
		}
		// The `finally` above runs before this line, so the control's own files are gone by the
		// time a listener is told the instrument serves.
		this.#emitter.emit('arm', this.#toolchain)
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

	async #inspectStage(stage: StageInterface, operation: Promise<Check>): Promise<Check> {
		const timeout = createTimeout({ ms: this.#deadline })
		timeout.start()
		try {
			return await Promise.race([
				operation,
				this.#expiry(timeout, `The ${stage.stage} stage exceeded ${this.#deadline} ms`),
			])
		} catch (error) {
			if (timeout.expired) void stage.destroy().catch(() => {})
			throw error
		} finally {
			timeout.clear()
		}
	}

	async #runRuntime(subject: Case, claim: Claim): Promise<Check> {
		const stage = this.#runtime
		const timeout = createTimeout({ ms: this.#deadline })
		timeout.start()
		try {
			return await Promise.race([
				stage.inspect(subject),
				this.#expiry(timeout, `The runtime stage exceeded ${this.#deadline} ms`),
			])
		} catch (error) {
			if (!timeout.expired) throw error
			const recycled = await this.#recycle(stage)
			if (recycled) this.#emitter.emit('expire', claim)
			throw error
		} finally {
			timeout.clear()
		}
	}

	async #recycle(stage: RuntimeStage): Promise<boolean> {
		const timeout = createTimeout({ ms: this.#deadline })
		timeout.start()
		try {
			// Teardown of a hung stage can reject or outlive its own deadline, and the replacement
			// must be installed either way: `#runtime` otherwise stays destroyed for the life of
			// the process and every later claim reports that instead of its own evidence.
			await Promise.race([
				stage.destroy(),
				this.#expiry(timeout, `The runtime stage recovery exceeded ${this.#deadline} ms`),
			])
		} catch {
			// The failure belongs to the stage being replaced, and the replacement below is the
			// recovery the caller is owed.
		} finally {
			timeout.clear()
		}
		if (this.#destroyed || this.#runtime !== stage) return false
		this.#runtime = new RuntimeStage(this.#workspace)
		return true
	}

	// Rejects when the deadline fires, so a race against it settles even when the operation it
	// races never returns.
	#expiry(timeout: TimeoutInterface, message: string): Promise<never> {
		return new Promise<never>((_resolve, reject) => {
			timeout.signal.addEventListener('abort', () => reject(new Error(message)), { once: true })
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
			throw new Error(`${name} publishes no readable version`)
		}
		return version
	}

	#support(): void {
		const version = this.#toolchain.typescript
		const range = peerDependencies.typescript
		const supported = /^\^(\d+)\./u.exec(range)?.[1]
		const found = /^(\d+)\./u.exec(version)?.[1]
		if (supported === undefined || found !== supported) {
			throw new Error(`The supported TypeScript range is ${range}; found ${version}`)
		}
	}
}
