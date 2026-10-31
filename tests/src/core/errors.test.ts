import { fileURLToPath } from 'node:url'
import { PROBE_ERROR_CODES, ProbeError, createDestroyedError, isProbeError } from '@src/core'
import { readWorkspaceManifest } from '@src/server'
import { captureError, createTeardown } from '@orkestrel/test'
import { createScratch } from '@orkestrel/test/server'
import { describe, expect, it } from 'vitest'
import { isConstructor, isFunction, isRecord } from '@orkestrel/contract'
import { WORKSPACE_ROOT, findBareErrors, describeFailure } from '../../setup.js'
import { buildProbeFailureDrives } from '../../setupServer.js'

const ROOT = fileURLToPath(WORKSPACE_ROOT)

// Every source module's own text, read as strings rather than as modules, so the construction check
// reads what a consumer receives rather than what an import resolves to.
const SOURCES: Record<string, unknown> = import.meta.glob('../../../src/**/*.ts', {
	eager: true,
	query: '?raw',
	import: 'default',
})

describe('probe error', () => {
	it('narrows its own failure and refuses a plain Error', () => {
		const error = createDestroyedError('probe')
		expect(isProbeError(error)).toBe(true)
		expect(error.name).toBe('ProbeError')
		expect(error.message).toBe('The probe has been destroyed')
		expect(error.origin).toBe('claimant')
		expect(error.code).toBe('destroyed')
		expect(error.context).toBeUndefined()
		expect(isProbeError(new Error('The probe has been destroyed'))).toBe(false)
		expect(isProbeError(undefined)).toBe(false)
		expect(isProbeError({ name: 'ProbeError', origin: 'claimant', code: 'destroyed' })).toBe(false)
	})

	it('carries the context and the cause it was given', () => {
		const cause = new Error('EACCES')
		const error = new ProbeError('Path escapes the workspace: ../secrets.env', {
			origin: 'claimant',
			code: 'refused',
			context: { path: '../secrets.env' },
			cause,
		})
		expect(error.context).toStrictEqual({ path: '../secrets.env' })
		expect(error.cause).toBe(cause)
		expect(isProbeError(error)).toBe(true)
	})

	// The guard's admitted set is compared against the declared tuple, and the refusal control is
	// drawn from outside it, so the pair pins the exact set rather than re-deriving it.
	it('admits every declared code and refuses one the tuple does not declare', () => {
		expect(PROBE_ERROR_CODES.length).toBeGreaterThan(0)
		for (const code of PROBE_ERROR_CODES) {
			expect(isProbeError(new ProbeError('declared', { origin: 'claimant', code }))).toBe(true)
		}
		const undeclared = Object.defineProperty(
			Object.assign(new Error('undeclared'), {
				origin: 'claimant',
				code: 'stalled',
				name: 'ProbeError',
			}),
			Symbol.for('@orkestrel/probe.ProbeError'),
			{ value: true },
		)
		expect(isProbeError(undeclared)).toBe(false)
	})

	it('refuses a branded error carrying an undeclared origin', () => {
		const undeclared = Object.defineProperty(
			new ProbeError('undeclared', { origin: 'claimant', code: 'destroyed' }),
			'origin',
			{ value: 'operator' },
		)

		expect(isProbeError(undeclared)).toBe(false)
	})

	// A consumer can hold two copies of this package at once — a duplicate installation, or the ESM
	// and CommonJS builds together — and then the class one copy threw is not the class the other
	// copy's `instanceof` tests against. Two module instances of the same source stand in for that
	// here, which is the same shape without a build.
	it('recognizes a failure thrown by a second copy of the package', () => {
		const firstModules = import.meta.glob('../../../src/core/errors.ts', {
			eager: true,
			query: '?copy=first',
		})
		const secondModules = import.meta.glob('../../../src/core/errors.ts', {
			eager: true,
			query: '?copy=second',
		})
		const first: unknown = Object.values(firstModules)[0]
		const second: unknown = Object.values(secondModules)[0]
		if (!isRecord(first) || !isRecord(second)) throw new Error('source error copies did not load')
		const firstGuard = first.isProbeError
		const FirstConstructor = first.ProbeError
		const SecondConstructor = second.ProbeError
		if (
			!isFunction(firstGuard) ||
			!isConstructor(FirstConstructor) ||
			!isConstructor(SecondConstructor)
		) {
			throw new Error('source error exports did not load')
		}
		const other: unknown = Reflect.construct(SecondConstructor, [
			'The prove tool requires a valid claim',
			{ origin: 'claimant', code: 'refused' },
		])
		const lookalike = Object.defineProperty(
			new Error('The prove tool requires a valid claim'),
			Symbol.for('@orkestrel/probe.ProbeError'),
			{ value: true },
		)

		expect(FirstConstructor).not.toBe(SecondConstructor)
		expect(other).not.toBeInstanceOf(FirstConstructor)
		expect(firstGuard(other)).toBe(true)
		expect(firstGuard(new Error('The prove tool requires a valid claim'))).toBe(false)
		expect(firstGuard(lookalike)).toBe(false)
	})
})

// Adoption, not definition: the preceding class is worth nothing to a consumer while a failure path
// beside it still raises a value that carries no ownership and no condition to branch on. The
// failure this package raises most often is not one it constructs — it is a dependency's own,
// caught and translated — so these run the paths and read what came back.
describe('failure adoption', () => {
	it('sanctions MCPError construction only in createHandshakeError in server/errors.ts', () => {
		const path = '../../../src/server/errors.ts'
		const factory =
			'export function createHandshakeError(error: ProbeError): MCPError { return new MCPError("failed") }'
		expect(findBareErrors(factory, path)).toStrictEqual([])
		expect(findBareErrors(factory, '../../../src/server/ProbeServer.ts')).toStrictEqual([
			'../../../src/server/ProbeServer.ts MCPError',
		])
		expect(
			findBareErrors(factory.replace('createHandshakeError', 'createOtherError'), path),
		).toStrictEqual([`${path} MCPError`])
		expect(findBareErrors('const error = new MCPError("failed"); throw error', path)).toStrictEqual(
			[`${path} MCPError`],
		)
		expect(findBareErrors('throw new MCPError("failed")', path)).toStrictEqual([`${path} MCPError`])
	})

	it('classifies every failure path a test can drive without a resident tool', async () => {
		const workspace = createScratch({ prefix: 'probe-adoption-workspace-' })
		const outside = createScratch({ prefix: 'probe-adoption-outside-' })
		try {
			workspace.write('package.json', '{"name":"target","version":"0.0.0"}\n')
			workspace.write('node_modules/unparsable/package.json', '{ this is not JSON\n')
			workspace.write('node_modules/listed/package.json', '["not","a","record"]\n')
			workspace.write('node_modules/binless/package.json', '{"name":"binless","version":"1.0.0"}\n')
			workspace.write(
				'node_modules/oddbin/package.json',
				'{"name":"oddbin","version":"1.0.0","bin":{"oddbin":7}}\n',
			)
			outside.write('secret.ts', 'export const SECRET = 1\n')
			workspace.link('link', outside.path)

			const drives = buildProbeFailureDrives(workspace.path, ROOT)

			expect(drives.length).toBeGreaterThan(0)
			const reported = drives.map((drive) => {
				const raised = captureError(drive[3])
				expect(raised, `${drive[0]} raised nothing`).toBeDefined()
				return `${drive[0]}: ${describeFailure(raised)}`
			})
			expect(reported).toStrictEqual(drives.map((drive) => `${drive[0]}: ${drive[1]}/${drive[2]}`))
			// The translated ones keep the dependency's own fault reachable, so a caller can print
			// what the host said as well as what probe made of it.
			const translated = captureError(() => readWorkspaceManifest(workspace.path, 'unparsable'))
			expect(isProbeError(translated) && translated.cause instanceof Error).toBe(true)
		} finally {
			const teardown = createTeardown()
			teardown.add(() => outside.destroy())
			teardown.add(() => workspace.destroy())
			await teardown.destroy()
		}
	})

	// The control for the preceding assertion, drawn from outside the population it covers: the
	// untranslated shape `readWorkspaceManifest` replaced. A gate that admitted this would report
	// green over exactly the defect it exists to catch.
	it('refuses a failure a dependency raised and this package did not translate', () => {
		const workspace = createScratch({ prefix: 'probe-adoption-control-' })
		try {
			workspace.write('node_modules/unparsable/package.json', '{ this is not JSON\n')
			const untranslated = captureError(() =>
				JSON.parse(workspace.read('node_modules/unparsable/package.json') ?? ''),
			)
			expect(untranslated).toBeInstanceOf(Error)
			expect(isProbeError(untranslated)).toBe(false)
			expect(describeFailure(untranslated)).toContain('unclassified')
		} finally {
			workspace.destroy()
		}
	})

	// The text check covers every source module. Driven paths prove the branches this project can
	// reach, while this catches a bare construction in a branch that requires a resident tool.
	it('constructs no unclassified failure in any source module', () => {
		const paths = Object.keys(SOURCES).sort()
		expect(paths).toContain('../../../src/server/helpers.ts')
		expect(paths).toContain('../../../src/server/errors.ts')
		expect(findBareErrors("throw new Error('unclassified')", 'control.ts')).toStrictEqual([
			'control.ts Error',
		])
		const bare: string[] = []
		for (const path of paths) {
			const source = SOURCES[path]
			expect(source, `${path} did not load as text`).toBeTypeOf('string')
			if (typeof source !== 'string') continue
			bare.push(...findBareErrors(source, path))
		}
		expect(bare).toStrictEqual([])
	})
})
