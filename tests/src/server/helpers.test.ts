import type { Draft } from '@src/core'
import { EventEmitter } from 'node:events'
import { lstatSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { compileGuard } from '@orkestrel/contract'
import { captureError } from '@orkestrel/test'
import { createScratch } from '@orkestrel/test/server'
import {
	captureListeners,
	computeDigest,
	createRevisionFile,
	describeUnknown,
	findRefusedPaths,
	inferDocumentLanguage,
	inferTestProject,
	inferTypeProject,
	loadWorkspaceModule,
	matchesWorkspaceModule,
	normalizePath,
	normalizeValue,
	parseContentLength,
	readWorkspaceManifest,
	relativeWorkspaceFile,
	releaseListeners,
	resolveWorkspaceBinary,
	resolveWorkspaceFile,
	resolveWorkspaceModule,
} from '@src/server'
import { CLAIM_SHAPE, isProbeError } from '@src/core'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

// Two distinct listeners reporting one name, so a release keyed on the name cannot tell them apart
// and a release keyed on identity can. The name is assigned rather than declared, because two
// function declarations cannot share a name in one scope, which is the whole difficulty the pair
// under test exists to survive.
function onExit(): void {}
function onExitAgain(): void {}
Object.defineProperty(onExitAgain, 'name', { value: 'onExit' })

// Every `@example` block the documented server helpers carry, run verbatim and asserted against
// the value each block states. An illustrative `/srv/checkout` root stands for the workspace under
// test, so a documented value carrying a path is composed the same way the block composes it rather
// than pinned to one host's separator.
describe('server helper examples', () => {
	it('returns the documented value for every documented server-helper example', () => {
		expect(normalizePath('src\\core\\greeting.ts')).toBe('src/core/greeting.ts')
		expect(normalizePath('src/core/greeting.ts')).toBe('src/core/greeting.ts')
		expect(resolveWorkspaceFile(ROOT, 'src/core/greeting.ts')).toBe(
			resolve(ROOT, 'src/core/greeting.ts'),
		)
		expect(() => resolveWorkspaceFile(ROOT, '../secrets.env')).toThrow(
			'Path escapes the workspace: ../secrets.env',
		)
		expect(relativeWorkspaceFile(ROOT, resolve(ROOT, 'src/core/greeting.ts'))).toBe(
			'src/core/greeting.ts',
		)
		expect(resolveWorkspaceModule(ROOT, 'typescript/package.json')).toBe(
			readWorkspaceManifest(ROOT, 'typescript').path,
		)
		expect(relativeWorkspaceFile(ROOT, resolveWorkspaceBinary(ROOT, 'oxlint'))).toBe(
			'node_modules/oxlint/bin/oxlint',
		)
		expect(() => resolveWorkspaceBinary(ROOT, 'typescript')).toThrow(
			'typescript does not publish the typescript binary',
		)
		expect(inferTypeProject('src/core/greeting.ts')).toBe('configs/src/tsconfig.core.json')
		expect(() => inferTypeProject('tests/src/core/greeting.test.ts')).toThrow(
			'Cannot infer a scoped TypeScript project for tests/src/core/greeting.test.ts',
		)
		expect(inferTestProject('tmp/probe/greeting.test.ts')).toBe('probe')
		expect(inferTestProject('tests/src/server/helpers.test.ts')).toBe('src:server')
		expect(inferTestProject('tests/config.test.ts')).toBeUndefined()
		expect(inferDocumentLanguage('src/core/greeting.ts')).toBe('typescript')
		expect(inferDocumentLanguage('src/browser/Panel.tsx')).toBe('typescriptreact')
		expect(
			relativeWorkspaceFile(
				ROOT,
				createRevisionFile(ROOT, 'tmp/probe/greeting.test.ts', '4821-9f0c'),
			),
		).toBe('tmp/probe/greeting.test.probe-4821-9f0c.ts')
		expect(matchesWorkspaceModule('src/core/greeting.ts')).toBe(true)
		expect(matchesWorkspaceModule('src/styles/tokens.css')).toBe(false)
		expect(parseContentLength('Content-Length: 128')).toBe(128)
		expect(parseContentLength('Content-Type: application/json')).toBeUndefined()
		expect(describeUnknown(new Error('The lint stage has been destroyed'))).toBe(
			'The lint stage has been destroyed',
		)
		expect(describeUnknown(17)).toBe('17')
		const capture = captureListeners(process, ['SIGTERM'])
		expect(capture.get('SIGTERM')?.length).toBe(process.listenerCount('SIGTERM'))
		process.on('SIGTERM', () => {})
		releaseListeners(process, capture)
		expect(process.listenerCount('SIGTERM')).toBe(capture.get('SIGTERM')?.length)
	})
})

describe('server listener leaves', () => {
	it('releases what an emitter gained and leaves every captured listener attached', () => {
		const emitter = new EventEmitter()
		const kept = (): void => {}
		emitter.on('close', kept)
		const capture = captureListeners(emitter, ['close', 'error'])
		emitter.on('close', () => {})
		emitter.on('error', () => {})
		emitter.on('data', () => {})
		releaseListeners(emitter, capture)
		expect(emitter.listeners('close')).toStrictEqual([kept])
		expect(emitter.listenerCount('error')).toBe(0)
		// An event no capture named is not this release's business, however recently it arrived.
		expect(emitter.listenerCount('data')).toBe(1)
	})

	it('leaves a listener the capture held and something else removed', () => {
		const emitter = new EventEmitter()
		const departed = (): void => {}
		emitter.on('close', departed)
		const capture = captureListeners(emitter, ['close'])
		emitter.removeListener('close', departed)
		releaseListeners(emitter, capture)
		expect(emitter.listenerCount('close')).toBe(0)
	})

	// Identity is what the pair compares. Two listeners can share a name, and a dependency can
	// rename its own between releases, so a release keyed on the name would strip a stranger's
	// listener and miss the one it came for.
	it('separates two listeners that share a name', () => {
		const emitter = new EventEmitter()
		expect(onExitAgain.name).toBe(onExit.name)
		expect(onExitAgain).not.toBe(onExit)
		emitter.on('close', onExit)
		const capture = captureListeners(emitter, ['close'])
		emitter.on('close', onExitAgain)
		releaseListeners(emitter, capture)
		expect(emitter.listeners('close')).toStrictEqual([onExit])
	})
})

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
	// One helper, two callers. `Overlay` keys its candidates through it and matches a directory
	// prefix through it, and the runtime stage keys the Vitest result cache through it, so a
	// backslash spelling and a forward-slash spelling of one path can never miss each other.
	it('rewrites every backslash and leaves an already-normalized path alone', () => {
		expect(normalizePath('C:\\workspace\\src\\value.ts')).toBe('C:/workspace/src/value.ts')
		expect(normalizePath('tmp/probe/value.test.ts')).toBe('tmp/probe/value.test.ts')
		expect(normalizePath('mixed\\path/value.ts')).toBe('mixed/path/value.ts')
		expect(normalizePath('')).toBe('')
		expect(normalizePath('\\\\server\\share\\value.ts')).toBe('//server/share/value.ts')
	})

	// The leaves that each carried their own copy of this rewrite before it was promoted, asserted
	// against the literal a caller reads rather than against a second call to the shared helper.
	it('reports one spelling for a path a caller declares with backslashes', () => {
		expect(inferTypeProject('src\\core\\value.ts')).toBe('configs/src/tsconfig.core.json')
		expect(inferTestProject('tests\\src\\server\\value.test.ts')).toBe('src:server')
		expect(relativeWorkspaceFile(ROOT, resolve(ROOT, 'src/core/value.ts'))).toBe(
			'src/core/value.ts',
		)
		expect(normalizeValue(ROOT, resolve(ROOT, 'src/core/value.ts'))).toBe('src/core/value.ts')
	})

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

	it('refuses a symbolic link when resolving a filesystem mutation', () => {
		const scratch = createScratch({ prefix: 'probe-helper-containment-' })
		try {
			scratch.write('real/value.ts', 'export const VALUE = 1\n')
			scratch.link('link', resolve(scratch.path, 'real'))

			expect(resolveWorkspaceFile(scratch.path, 'link/value.ts')).toBe(
				resolve(scratch.path, 'link/value.ts'),
			)
			const error = captureError(() => resolveWorkspaceFile(scratch.path, 'link/value.ts', true))
			expect(error).toMatchObject({
				origin: 'workspace',
				code: 'refused',
				context: { path: 'link/value.ts' },
			})
		} finally {
			scratch.destroy()
		}
	})

	it('translates a native path inspection fault and retains its cause', () => {
		const scratch = createScratch({ prefix: 'probe-helper-native-fault-' })
		try {
			const target = 'invalid\0path.ts'
			const native = captureError(() => lstatSync(resolve(scratch.path, target)))
			const translated = captureError(() => resolveWorkspaceFile(scratch.path, target, true))

			expect(native).toBeInstanceOf(TypeError)
			expect(native).toMatchObject({ code: 'ERR_INVALID_ARG_VALUE' })
			expect(translated).toMatchObject({
				origin: 'claimant',
				code: 'refused',
				context: { path: target },
				cause: native,
			})
		} finally {
			scratch.destroy()
		}
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
		const absent = captureError(() => resolveWorkspaceModule(ROOT, 'missing-probe-package'))
		expect(isProbeError(absent)).toBe(true)
		expect(absent).toMatchObject({
			origin: 'workspace',
			code: 'missing',
			context: { name: 'missing-probe-package' },
			cause: expect.any(Error),
		})
	})

	it('loads installed tool modules from the workspace', () => {
		expect(loadWorkspaceModule(ROOT, 'typescript').version).toMatch(/^\d+\.\d+\.\d+/)
		expect(loadWorkspaceModule(ROOT, 'vitest/node').createVitest).toBeTypeOf('function')
	})

	it('reads installed manifests and refuses absent packages', () => {
		const manifest = readWorkspaceManifest(ROOT, 'typescript')
		expect(manifest.path).toContain('node_modules/typescript/package.json')
		expect(manifest.contents).toMatchObject({ name: 'typescript', version: expect.any(String) })
		const absent = captureError(() => readWorkspaceManifest(ROOT, 'missing-probe-package'))
		expect(isProbeError(absent)).toBe(true)
		expect(absent).toMatchObject({
			origin: 'workspace',
			code: 'missing',
			context: { name: 'missing-probe-package' },
			cause: expect.any(Error),
		})
	})

	it('resolves package binaries and refuses a package without the requested key', () => {
		expect(resolveWorkspaceBinary(ROOT, 'oxlint')).toContain('node_modules/oxlint/bin/oxlint')
		expect(() => resolveWorkspaceBinary(ROOT, 'typescript')).toThrow(
			'typescript does not publish the typescript binary',
		)
	})

	// Each leaf's refusal is caught as a value rather than matched on its message, because the
	// category and the context are what a caller branches on and a message is what it prints.
	it('refuses through a categorized failure that names what it refused', () => {
		const escape = captureError(() => resolveWorkspaceFile(ROOT, '../secrets.env'))
		expect(isProbeError(escape)).toBe(true)
		expect(escape).toMatchObject({
			origin: 'claimant',
			code: 'refused',
			context: { path: '../secrets.env' },
		})
		const inferred = captureError(() => inferTypeProject('tests/src/core/greeting.test.ts'))
		expect(inferred).toMatchObject({
			origin: 'claimant',
			code: 'refused',
			context: { path: 'tests/src/core/greeting.test.ts' },
		})
		const binary = captureError(() => resolveWorkspaceBinary(ROOT, 'typescript'))
		expect(binary).toMatchObject({
			origin: 'workspace',
			code: 'missing',
			context: { name: 'typescript' },
		})
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
		expect(describeUnknown(new Error('failed'))).toBe('failed')
		expect(describeUnknown('failed')).toBe('failed')
		expect(describeUnknown({ message: 'failed' })).toBe('failed')
		expect(describeUnknown(17)).toBe('17')
	})
})

describe('server digest leaves', () => {
	it('rewrites contained absolute paths, leaves escaping ones, and sorts record keys', () => {
		expect(normalizeValue(ROOT, resolve(ROOT, 'src/core/index.ts'))).toBe('src/core/index.ts')
		expect(normalizeValue(ROOT, ROOT)).toBe('.')
		expect(normalizeValue(ROOT, 'src/core/index.ts')).toBe('src/core/index.ts')
		// A path outside the workspace has no relative spelling that names the same file from
		// another checkout, so rewriting it would replace a true absolute with a false relative.
		expect(normalizeValue(ROOT, resolve(ROOT, '../outside/value.ts'))).toBe(
			resolve(ROOT, '../outside/value.ts'),
		)
		expect(
			normalizeValue(ROOT, { strict: true, rootDir: resolve(ROOT, 'src/core') }),
		).toStrictEqual({ rootDir: 'src/core', strict: true })
		expect(normalizeValue(ROOT, [resolve(ROOT, 'src/core'), 17, null, true])).toStrictEqual([
			'src/core',
			17,
			null,
			true,
		])
		expect(
			Object.keys(normalizeValue(ROOT, { second: 1, first: 2, third: 3 }) ?? {}),
		).toStrictEqual(['first', 'second', 'third'])
	})

	it('digests one project identically at two absolute workspace roots', () => {
		const scratch = createScratch({ prefix: 'probe-digest-' })
		try {
			const typescript = loadWorkspaceModule(ROOT, 'typescript')
			const project =
				'{"compilerOptions":{"strict":true,"rootDir":"./src","outDir":"./dist"},"files":["./src/value.ts"]}\n'
			const roots = ['first', 'second'].map((name) => {
				scratch.write(`${name}/tsconfig.json`, project)
				scratch.write(`${name}/src/value.ts`, 'export const VALUE = 1\n')
				return resolve(scratch.path, name)
			})
			const parsed = roots.map((root) => {
				const file = resolve(root, 'tsconfig.json')
				const config = typescript.readConfigFile(file, typescript.sys.readFile)
				return typescript.parseJsonConfigFileContent(
					config.config,
					typescript.sys,
					root,
					undefined,
					file,
				).options
			})
			const [first, second] = parsed
			const [firstRoot, secondRoot] = roots
			if (first === undefined || second === undefined) throw new Error('The projects did not parse')
			if (firstRoot === undefined || secondRoot === undefined) {
				throw new Error('The scratch roots were not created')
			}
			// A root containing neither checkout leaves every absolute member absolute, so this is
			// what the digest reads when the normalization is not applied.
			const outside = resolve(scratch.path, 'outside')

			expect(first).not.toStrictEqual(second)
			expect(computeDigest(firstRoot, first)).toBe(computeDigest(secondRoot, second))
			expect(computeDigest(firstRoot, first)).toMatch(/^[0-9a-f]{32}$/)
			// The control: without the rewrite the same commit read at two paths digests
			// differently, so a receipt could never be checked away from the tree that minted it.
			expect(computeDigest(outside, first)).not.toBe(computeDigest(outside, second))
		} finally {
			scratch.destroy()
		}
	})

	it('moves the digest for a changed value and holds it for a reordered one', () => {
		expect(computeDigest(ROOT, { strict: true })).not.toBe(computeDigest(ROOT, { strict: false }))
		expect(computeDigest(ROOT, { first: 1, second: 2 })).toBe(
			computeDigest(ROOT, { second: 2, first: 1 }),
		)
	})
})

describe('server claim refusal', () => {
	const draft: Draft = { path: 'src/core/greeting.ts', text: '' }
	const control = { files: [], test: draft, stage: 'type', reason: 'must not compile' }

	it('names every draft member whose path the guard refuses', () => {
		expect(
			findRefusedPaths({
				project: 'configs/src/tsconfig.core.json',
				case: { files: [draft], test: draft },
				control,
			}),
		).toStrictEqual([])
		expect(
			findRefusedPaths({
				project: 'configs/src/tsconfig.core.json',
				case: {
					files: [draft, { path: '../../etc/hosts', text: '' }],
					test: { path: '/etc/hosts', text: '' },
				},
				control: { ...control, files: [{ path: 'C:\\Windows\\hosts', text: '' }] },
			}),
		).toStrictEqual(['case.test.path', 'case.files.1.path', 'control.files.0.path'])
	})

	it('reports nothing for a refusal the advertised schema already explains', () => {
		// A missing text, a member this contract does not declare, and a value that is no claim at
		// all are all refusals the schema itself reports, so blaming a path for one would name the
		// wrong member.
		const missingPath = {
			project: 'configs/src/tsconfig.core.json',
			case: { files: [{ text: '' }], test: draft },
			control,
		}
		expect(compileGuard(CLAIM_SHAPE)(missingPath)).toBe(false)
		expect(findRefusedPaths(missingPath)).toStrictEqual([])
		expect(
			findRefusedPaths({
				project: 'configs/src/tsconfig.core.json',
				case: { files: [{ path: 'src/core/greeting.ts' }], test: draft },
				control,
			}),
		).toStrictEqual([])
		expect(
			findRefusedPaths({
				project: 'configs/src/tsconfig.core.json',
				case: { files: [], test: draft },
				control,
				surplus: true,
			}),
		).toStrictEqual([])
		expect(findRefusedPaths(undefined)).toStrictEqual([])
		expect(findRefusedPaths([draft])).toStrictEqual([])
		expect(findRefusedPaths({ case: 17, control: 'control' })).toStrictEqual([])
	})
})
