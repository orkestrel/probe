import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
	createRevisionFile,
	inferDocumentLanguage,
	inferTestProject,
	inferTypeProject,
	loadWorkspaceModule,
	matchesWorkspaceModule,
	messageFromUnknown,
	parseContentLength,
	readWorkspaceManifest,
	relativeWorkspaceFile,
	resolveWorkspaceBinary,
	resolveWorkspaceFile,
	resolveWorkspaceModule,
} from '@src/server'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

describe('server project inferers', () => {
	it('infers source and application TypeScript projects and refuses other paths', () => {
		expect(inferTypeProject('src/core/value.ts')).toBe('configs/src/tsconfig.core.json')
		expect(inferTypeProject('app/server/main.ts')).toBe('configs/app/tsconfig.server.json')
		expect(() => inferTypeProject('tests/src/core/value.test.ts')).toThrow(
			'Cannot infer a scoped TypeScript project for tests/src/core/value.test.ts',
		)
	})

	it('infers every mapped Vitest project and returns undefined for every unmapped shape', () => {
		expect(inferTestProject('tmp/probe/value.test.ts')).toBe('probe')
		expect(inferTestProject('tests/src/server/value.test.ts')).toBe('src:server')
		expect(inferTestProject('tests/app/core/value.test.ts')).toBe('app:core')
		expect(inferTestProject('source/src/core/value.test.ts')).toBeUndefined()
		expect(inferTestProject('tests/policy/value.test.ts')).toBeUndefined()
		expect(inferTestProject('tests/src')).toBeUndefined()
	})

	it('infers every supported document language', () => {
		expect(inferDocumentLanguage('component.tsx')).toBe('typescriptreact')
		expect(inferDocumentLanguage('component.jsx')).toBe('javascriptreact')
		expect(inferDocumentLanguage('module.js')).toBe('javascript')
		expect(inferDocumentLanguage('module.mjs')).toBe('javascript')
		expect(inferDocumentLanguage('module.cjs')).toBe('javascript')
		expect(inferDocumentLanguage('module.ts')).toBe('typescript')
	})
})

describe('server path helpers', () => {
	it('creates sibling revision paths with and without extensions', () => {
		expect(createRevisionFile(ROOT, 'tmp/probe/value.test.ts', 'revision')).toBe(
			resolve(ROOT, 'tmp/probe/value.test.probe-revision.ts'),
		)
		expect(createRevisionFile(ROOT, 'tmp/probe/value', 'revision')).toBe(
			resolve(ROOT, 'tmp/probe/value.probe-revision'),
		)
	})

	it('resolves contained files and reports portable relative paths', () => {
		const file = resolveWorkspaceFile(ROOT, 'src/server/helpers.ts')
		expect(file).toBe(resolve(ROOT, 'src/server/helpers.ts'))
		expect(relativeWorkspaceFile(ROOT, file)).toBe('src/server/helpers.ts')
		expect(() => resolveWorkspaceFile(ROOT, '../outside.ts')).toThrow(
			'Path escapes the workspace: ../outside.ts',
		)
	})

	it('accepts a contained file whose name begins with two dots', () => {
		expect(resolveWorkspaceFile(ROOT, '..hidden.ts')).toBe(resolve(ROOT, '..hidden.ts'))
		expect(resolveWorkspaceFile(ROOT, '..config/value.ts')).toBe(resolve(ROOT, '..config/value.ts'))
		expect(resolveWorkspaceFile(ROOT, '...weird.ts')).toBe(resolve(ROOT, '...weird.ts'))
	})

	it('refuses a parent-directory traversal and an absolute escape while accepting a dot-prefixed name', () => {
		expect(() => resolveWorkspaceFile(ROOT, '..')).toThrow('Path escapes the workspace: ..')
		expect(() => resolveWorkspaceFile(ROOT, '/etc/passwd')).toThrow(
			'Path escapes the workspace: /etc/passwd',
		)
		expect(() => resolveWorkspaceFile(ROOT, './a/../../escape.ts')).toThrow(
			'Path escapes the workspace: ./a/../../escape.ts',
		)
		expect(resolveWorkspaceFile(ROOT, '..hidden.ts')).toBe(resolve(ROOT, '..hidden.ts'))
	})

	it('refuses the empty target because the workspace root is not a file', () => {
		expect(() => resolveWorkspaceFile(ROOT, '')).toThrow('Path escapes the workspace: ')
	})

	it('resolves installed modules and refuses absent ones', () => {
		expect(resolveWorkspaceModule(ROOT, 'typescript')).toContain('node_modules/typescript/')
		expect(() => resolveWorkspaceModule(ROOT, 'missing-probe-package')).toThrow(
			'Cannot find module',
		)
	})

	it('loads installed tool modules from the workspace', () => {
		expect(loadWorkspaceModule(ROOT, 'typescript').version).toMatch(/^\d+\.\d+\.\d+/)
		expect(loadWorkspaceModule(ROOT, 'vitest/node').createVitest).toBeTypeOf('function')
	})

	it('reads installed manifests and refuses absent packages', () => {
		const manifest = readWorkspaceManifest(ROOT, 'typescript')
		expect(manifest.path).toContain('node_modules/typescript/package.json')
		expect(manifest.contents).toMatchObject({ name: 'typescript', version: expect.any(String) })
		expect(() => readWorkspaceManifest(ROOT, 'missing-probe-package')).toThrow('Cannot find module')
	})

	it('resolves package binaries and refuses a package without the requested key', () => {
		expect(resolveWorkspaceBinary(ROOT, 'oxlint')).toContain('node_modules/oxlint/bin/oxlint')
		expect(() => resolveWorkspaceBinary(ROOT, 'typescript')).toThrow(
			'typescript does not publish the typescript binary',
		)
	})
})

describe('server wire helpers', () => {
	it('parses valid content lengths and refuses missing, malformed, and unsafe values', () => {
		expect(parseContentLength('Content-Type: application/json\r\nContent-Length: 12')).toBe(12)
		expect(parseContentLength('content-length: 0')).toBe(0)
		expect(parseContentLength('Content-Type: application/json')).toBeUndefined()
		expect(parseContentLength('Content-Length: -1')).toBeUndefined()
		expect(parseContentLength('Content-Length: 9007199254740992')).toBeUndefined()
	})

	it('matches each workspace module family and refuses unrelated files', () => {
		for (const path of [
			'value.ts',
			'value.mts',
			'value.cts',
			'value.tsx',
			'value.js',
			'value.vue',
			'value.json',
		]) {
			expect(matchesWorkspaceModule(path)).toBe(true)
		}
		expect(matchesWorkspaceModule('value.css')).toBe(false)
	})

	it('normalizes errors, strings, message records, and other values', () => {
		expect(messageFromUnknown(new Error('failed'))).toBe('failed')
		expect(messageFromUnknown('failed')).toBe('failed')
		expect(messageFromUnknown({ message: 'failed' })).toBe('failed')
		expect(messageFromUnknown(17)).toBe('17')
	})
})
