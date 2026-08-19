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
import type { TimeoutInterface } from '@orkestrel/timeout'
import { existsSync, mkdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { Emitter } from '@orkestrel/emitter'
import { createTimeout } from '@orkestrel/timeout'
import { computeReceipt } from '@src/core'
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
 * report their respective changes. Each runtime inspection has a coordinator-owned deadline that
 * abandons and replaces a hung runtime stage.
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
			if ([...beforeType, ...beforeRuntime].some((check) => check.findings.length > 0)) {
				throw new Error('The probe boot control did not begin clean')
			}
			writeFileSync(typeDependency, 'export type Signal = number\n', 'utf8')
			const afterType = await this.#inspect(typeClaim.control, typeClaim)
			const type = afterType.find((check) => check.stage === typeClaim.control.stage)
			const tolerant = afterType.find((check) => check.stage === 'runtime')
			if (type === undefined || type.findings.length === 0) {
				throw new Error('The probe boot type control did not detect a mutated dependency')
			}
			if (tolerant === undefined || tolerant.findings.length > 0) {
				throw new Error('The probe boot type control did not remain runtime-clean')
			}
			writeFileSync(runtimeDependency, "export const SIGNAL = 'after'\n", 'utf8')
			const afterRuntime = await this.#inspect(runtimeClaim.control, runtimeClaim)
			const runtime = afterRuntime.find((check) => check.stage === runtimeClaim.control.stage)
			if (runtime === undefined || runtime.findings.length === 0) {
				throw new Error('The probe boot runtime control did not detect a mutated dependency')
			}
		} catch (error) {
			this.#emitter.emit('error', error)
			throw error
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
		return Promise.all([
			this.#type.inspect(subject, claim.project),
			this.#lint.inspect(subject),
			this.#inspectRuntime(subject, claim),
		])
	}

	async #inspectRuntime(subject: Case, claim: Claim): Promise<Check> {
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
			this.#emitter.emit('expire', claim)
			await this.#recycle(stage)
			throw error
		} finally {
			timeout.clear()
		}
	}

	async #recycle(stage: RuntimeStage): Promise<void> {
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
		if (this.#destroyed || this.#runtime !== stage) return
		this.#runtime = new RuntimeStage(this.#workspace)
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
		try {
			await Promise.all([this.#type.destroy(), this.#lint.destroy(), this.#runtime.destroy()])
		} finally {
			this.#emitter.destroy()
		}
	}

	#version(name: string): string {
		const manifest = readWorkspaceManifest(this.#workspace, name)
		const version = manifest.contents.version
		if (typeof version !== 'string') {
			throw new Error(`${name} publishes no readable version`)
		}
		return version
	}
}
