import { parseProjectConfig, parseRevisionOwner } from '@src/server'
import { describe, expect, it } from 'vitest'

describe('project configuration', () => {
	it('reads the documented examples', () => {
		expect(
			parseProjectConfig('{"compilerOptions":{"strict":true}}')?.compilerOptions,
		).toStrictEqual({ strict: true })
		expect(parseProjectConfig('error TS5058: The specified path does not exist.')).toBeUndefined()
	})

	// The compiler prints the resolved options beside the project's own file selection, and both
	// readings are load-bearing: the options are what a receipt digests, and the presence of
	// `include` is what decides whether a scratch project must restore the compiler's own default.
	it('carries the options and the declared include', () => {
		const config = parseProjectConfig(
			'{"compilerOptions":{"rootDir":"../../src/core"},"include":["../../src/core/**/*.ts"],"files":["../../src/core/index.ts"]}',
		)
		expect(config?.compilerOptions).toStrictEqual({ rootDir: '../../src/core' })
		expect(config?.include).toStrictEqual(['../../src/core/**/*.ts'])
	})

	// A project declaring no include takes the compiler's own default, so the reading must report
	// its absence rather than an empty list a caller would write out as a project matching nothing.
	it('reports no include where the printed configuration declares none', () => {
		expect(parseProjectConfig('{"compilerOptions":{}}')?.include).toBeUndefined()
		expect(parseProjectConfig('{"compilerOptions":{},"include":"src"}')?.include).toBeUndefined()
		expect(parseProjectConfig('{"compilerOptions":{},"include":[1]}')?.include).toBeUndefined()
	})

	it('refuses text that carries no record', () => {
		expect(parseProjectConfig('')).toBeUndefined()
		expect(parseProjectConfig('[]')).toBeUndefined()
		expect(parseProjectConfig('null')).toBeUndefined()
		expect(parseProjectConfig('17')).toBeUndefined()
		expect(parseProjectConfig('{"compilerOptions":')).toBeUndefined()
	})

	// A configuration carrying no options at all still parses, because the compiler prints exactly
	// that for a project that sets none, and a receipt digests the empty record it prints.
	it('carries an absent options member as the value it is', () => {
		expect(parseProjectConfig('{}')?.compilerOptions).toBeUndefined()
	})
})

describe('revision identity', () => {
	it('reads the documented examples', () => {
		expect(parseRevisionOwner('4821-1b4e28ba-2fa1-11d2-883f-0016d3cca427')).toBe(4821)
		expect(parseRevisionOwner('4821-9f0c')).toBeUndefined()
	})

	// A sweep deletes what a dead host left behind, so a name that is not a whole revision identity
	// must read as no identity at all: anything else deletes a neighbour's directory on a partial
	// match.
	it('refuses a name that is not a whole revision identity', () => {
		expect(parseRevisionOwner('')).toBeUndefined()
		expect(parseRevisionOwner('1b4e28ba-2fa1-11d2-883f-0016d3cca427')).toBeUndefined()
		expect(parseRevisionOwner('mirror-4821-1b4e28ba-2fa1-11d2-883f-0016d3cca427')).toBeUndefined()
		expect(parseRevisionOwner('4821-1b4e28ba-2fa1-11d2-883f-0016d3cca427-copy')).toBeUndefined()
		expect(parseRevisionOwner('4821-1B4E28BA-2FA1-11D2-883F-0016D3CCA427')).toBeUndefined()
	})

	it('reads the identity this host writes', () => {
		expect(parseRevisionOwner(`${process.pid}-1b4e28ba-2fa1-11d2-883f-0016d3cca427`)).toBe(
			process.pid,
		)
	})
})
