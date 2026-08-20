import { PROBE_ERROR_CODES, ProbeError, createDestroyedError, isProbeError } from '@src/core'
import { describe, expect, it } from 'vitest'
import { isConstructor, isFunction, isRecord } from '@orkestrel/contract'

// The package's own source text, read as strings rather than as modules, so the adoption sweep
// below reads what a consumer receives rather than what an import resolves to.
const SOURCES: Record<string, unknown> = import.meta.glob('../../../src/**/*.ts', {
	eager: true,
	query: '?raw',
	import: 'default',
})

// Removes the documentation blocks and line comments from one source file. A documented example
// deliberately shows a plain `Error` as the control its guard refuses, and that is prose about the
// code rather than a failure path in it.
function stripComments(source: string): string {
	return source
		.replaceAll(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.filter((line) => !line.trimStart().startsWith('//'))
		.join('\n')
}

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
			Symbol.for('@orkestrel/probe.error'),
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
			Symbol.for('@orkestrel/probe.error'),
			{ value: true },
		)

		expect(FirstConstructor).not.toBe(SecondConstructor)
		expect(other).not.toBeInstanceOf(FirstConstructor)
		expect(firstGuard(other)).toBe(true)
		expect(firstGuard(new Error('The prove tool requires a valid claim'))).toBe(false)
		expect(firstGuard(lookalike)).toBe(false)
	})

	// Adoption, not definition: the class above is worth nothing to a consumer while a failure path
	// beside it still raises a bare `Error` that carries no category to branch on.
	it('raises no uncategorized failure anywhere in the package', () => {
		const paths = Object.keys(SOURCES).sort()
		expect(paths).toContain('../../../src/core/errors.ts')
		expect(paths).toContain('../../../src/server/Probe.ts')
		const bare: string[] = []
		for (const path of paths) {
			const source = SOURCES[path]
			expect(source, `${path} did not load as text`).toBeTypeOf('string')
			if (typeof source !== 'string') continue
			if (stripComments(source).includes('new Error(')) bare.push(path)
		}
		expect(bare).toStrictEqual([])
	})
})
