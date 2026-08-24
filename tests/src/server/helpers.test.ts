import type { Draft } from '@src/core'
import { EventEmitter } from 'node:events'
import { lstatSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join, relative, resolve, sep } from 'node:path'
import { compileGuard } from '@orkestrel/contract'
import { captureError } from '@orkestrel/test'
import { createScratch } from '@orkestrel/test/server'
import {
	captureListeners,
	computeDigest,
	createRevisionFile,
	describeUnknown,
	findRefusedPaths,
	guardStage,
	inferDocumentLanguage,
	inferTestProject,
	inferTypeProject,
	isRefusedName,
	loadWorkspaceModule,
	matchesWorkspaceModule,
	normalizePath,
	normalizeValue,
	parseContentLength,
	readWorkspaceManifest,
	relativeWorkspaceFile,
	relativeWorkspaceMessage,
	releaseListeners,
	resolveWorkspaceBinary,
	resolveWorkspaceFile,
	resolveWorkspaceModule,
} from '@src/server'
import { CLAIM_SHAPE, ProbeError, isProbeError } from '@src/core'
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
		// Node refuses a NUL byte before any filesystem reads the name, so this block writes nothing
		// and needs no directory of its own.
		const embedded = 'tmp/probe/greeting\0.test.ts'
		expect(
			isRefusedName(
				embedded,
				captureError(() => writeFileSync(embedded, '')),
			),
		).toBe(true)
		expect(
			isRefusedName('tmp/probe/greeting.test.ts', new Error('the runtime stage was destroyed')),
		).toBe(false)
		expect(relativeWorkspaceFile(ROOT, resolve(ROOT, 'src/core/greeting.ts'))).toBe(
			'src/core/greeting.ts',
		)
		expect(relativeWorkspaceMessage(ROOT, `Cannot read ${resolve(ROOT, 'tsconfig.json')}`)).toBe(
			'Cannot read tsconfig.json',
		)
		const mirrored = `/mirror${normalizePath(resolve(ROOT))}/tsconfig.json`
		expect(relativeWorkspaceMessage(ROOT, `Cannot read ${mirrored}`)).toBe(
			`Cannot read ${mirrored}`,
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

describe('workspace message paths', () => {
	it('rewrites every contained spelling and leaves an uncontained path alone', () => {
		const contained = resolve(ROOT, 'src/core/greeting.ts')
		expect(relativeWorkspaceMessage(ROOT, `Cannot find ${contained}`)).toBe(
			'Cannot find src/core/greeting.ts',
		)
		expect(relativeWorkspaceMessage(ROOT, `Cannot find ${pathToFileURL(contained).href}`)).toBe(
			'Cannot find src/core/greeting.ts',
		)
		// A sibling directory whose name begins with the workspace's own is a different tree, so the
		// rewrite is bounded by the separator that ends the root rather than by the root's text.
		const sibling = `${normalizePath(resolve(ROOT))}-mirror/src/core/greeting.ts`
		expect(relativeWorkspaceMessage(ROOT, `Cannot find ${sibling}`)).toBe(`Cannot find ${sibling}`)
		const outside = normalizePath(resolve(ROOT, '../secrets.env'))
		expect(relativeWorkspaceMessage(ROOT, `Cannot find ${outside}`)).toBe(`Cannot find ${outside}`)
	})

	it('removes a root spelling only where a path begins', () => {
		// A foreign tree can hold this workspace's own spelling inside a longer path, and that path
		// names a file this workspace does not hold. Removing the root there would rewrite a foreign
		// path into a relative one, sending a reader into the tree under test instead.
		const embedded = `/mirror${normalizePath(resolve(ROOT))}/src/core/greeting.ts`
		expect(relativeWorkspaceMessage(ROOT, `Cannot find ${embedded}`)).toBe(
			`Cannot find ${embedded}`,
		)
	})

	it('rewrites a path beneath a workspace that is the host root', () => {
		// A host root ends in the separator already, so a path beneath it continues straight from the
		// root rather than from the root plus one more separator.
		const host = resolve(sep)
		const project = resolve(host, 'tsconfig.json')
		expect(relativeWorkspaceMessage(host, `Cannot read ${project}`)).toBe(
			'Cannot read tsconfig.json',
		)
		const nested = resolve(host, 'tmp/probe/greeting.test.ts')
		expect(relativeWorkspaceMessage(host, `Cannot find ${nested}`)).toBe(
			`Cannot find ${relative(host, nested)}`,
		)
	})

	it('leaves the text around a path exactly as the tool wrote it', () => {
		// Vitest escapes a newline when it prints a string inline, so an assertion message carries a
		// backslash that names no path. Measured on 2026-08-24 with Vitest 4.1.11, `expect('line1\n
		// line2').toBe('other')` reports its received value that way. A rewrite that read every
		// separator as a path separator would corrupt the evidence the message exists to carry.
		const escaped = "expected 'line1\\nline2' to be 'other' // Object.is equality"
		expect(relativeWorkspaceMessage(ROOT, escaped)).toBe(escaped)
	})

	it('leaves a name the target tree owns alone', () => {
		// The target's own file can carry this package's marker text, and renaming it in a message
		// would send a reader to a file the tree does not hold. A name carrying a complete marker is
		// still the target's: only the stage that generated a specification knows which exact name it
		// wrote, and it renames that one itself.
		const owned = 'tmp/probe/notes.probe-draft.ts'
		expect(relativeWorkspaceMessage(ROOT, `Failed to load ${owned}`)).toBe(
			`Failed to load ${owned}`,
		)
		const partial = 'tmp/probe/notes.probe-4821-1f0c9d2e.ts'
		expect(relativeWorkspaceMessage(ROOT, `Failed to load ${partial}`)).toBe(
			`Failed to load ${partial}`,
		)
		const complete = 'tmp/notes.probe-4821-1f0c9d2e-3a4b-4c6d-8e8f-90ab1c2d3e4f.ts'
		expect(relativeWorkspaceMessage(ROOT, `Failed to load ${complete}`)).toBe(
			`Failed to load ${complete}`,
		)
		const generated = createRevisionFile(ROOT, 'tmp/probe/greeting.test.ts', `${process.pid}-1f0c`)
		expect(relativeWorkspaceMessage(ROOT, `Failed to load ${generated}`)).toBe(
			`Failed to load ${relativeWorkspaceFile(ROOT, generated)}`,
		)
	})
})

describe('server stage boundary', () => {
	it('wraps an escaping fault as an instrument failure and retains its cause', async () => {
		const cause = new Error('the tool escaped')
		const error: unknown = await guardStage('lint', Promise.reject(cause)).catch(
			(failure: unknown) => failure,
		)

		expect(isProbeError(error)).toBe(true)
		expect(error).toMatchObject({
			message: 'The lint stage could not serve (the tool escaped)',
			origin: 'instrument',
			code: 'malformed',
			context: { stage: 'lint' },
			cause,
		})
	})

	it('passes a ProbeError through unchanged', async () => {
		const expected = new ProbeError('the claim was refused', {
			origin: 'claimant',
			code: 'refused',
		})
		const error: unknown = await guardStage('type', Promise.reject(expected)).catch(
			(failure: unknown) => failure,
		)

		expect(error).toBe(expected)
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

	// Every fault below is the one a real operation raised on the host this proof runs on, because
	// which code a host reports for a name it refuses is the host's choice and a literal shaped like
	// an error would only restate the choice this host made. Windows reports `ENOENT` for an overlong
	// final component and POSIX reports `ENAMETOOLONG`; the classification is the same on both, so
	// this proof asserts the classification and needs no host gate.
	it('separates a name the host refuses from a parent the tree does not hold', () => {
		const scratch = createScratch({ prefix: 'probe-helper-refused-name-' })
		try {
			const overlong = resolve(scratch.path, `${'x'.repeat(300)}.test.ts`)
			expect(
				isRefusedName(
					overlong,
					captureError(() => writeFileSync(overlong, '', 'utf8')),
				),
			).toBe(true)
			// The same `ENOENT` under a parent that does not exist reports the tree's absence rather
			// than the caller's name, and no rename repairs it.
			const orphan = resolve(scratch.path, 'absent/value.test.ts')
			expect(
				isRefusedName(
					orphan,
					captureError(() => writeFileSync(orphan, '', 'utf8')),
				),
			).toBe(false)
			// Node refuses a NUL byte itself, so this fault reaches no filesystem at all.
			const embedded = resolve(scratch.path, 'value\0.test.ts')
			expect(
				isRefusedName(
					embedded,
					captureError(() => writeFileSync(embedded, '', 'utf8')),
				),
			).toBe(true)
			// A fault carrying no filesystem code classifies nothing, whatever path it arrives with.
			expect(isRefusedName(overlong, new Error('the runtime stage was destroyed'))).toBe(false)
		} finally {
			scratch.destroy()
		}
	})

	// The predicate accepts `unknown` and is published, so a caller outside this package can hand it
	// a value whose own property reads throw. Each value below is one the predicate reports on rather
	// than one it escapes through, which is what makes the documented totality a property of the code
	// instead of a habit of the callers this package happens to have.
	it('reports false for a fault whose property reads throw', () => {
		const trapped = new Proxy(new Error('the write failed'), {
			has(): boolean {
				throw new Error('this trap refuses the membership test')
			},
		})
		expect(captureError(() => 'code' in trapped)).toMatchObject({
			message: 'this trap refuses the membership test',
		})
		expect(isRefusedName('tmp/probe/value.test.ts', trapped)).toBe(false)

		const throwing: { message: string; code?: unknown } = new Error('the write failed')
		Object.defineProperty(throwing, 'code', {
			get(): never {
				throw new Error('this getter refuses the read')
			},
		})
		expect(captureError(() => throwing.code)).toMatchObject({
			message: 'this getter refuses the read',
		})
		expect(isRefusedName('tmp/probe/value.test.ts', throwing)).toBe(false)
	})

	// `ERR_INVALID_ARG_VALUE` names every argument Node rejects, not the NUL byte alone, so the code
	// by itself cannot separate a name the host refuses from an unrelated argument the caller got
	// wrong. The fault below is the one `writeFileSync` itself raises for a bad `flag`, on a path
	// carrying no NUL — the same operation and the same code as the refusal, arriving for another
	// reason entirely.
	it('reports false for an invalid-argument fault whose path carries no NUL byte', () => {
		const scratch = createScratch({ prefix: 'probe-helper-invalid-argument-' })
		try {
			const target = resolve(scratch.path, 'value.test.ts')
			const invalid = captureError(() => writeFileSync(target, '', { flag: 'not-a-flag' }))
			expect(invalid).toMatchObject({ code: 'ERR_INVALID_ARG_VALUE' })
			expect(target.includes('\0')).toBe(false)
			expect(isRefusedName(target, invalid)).toBe(false)
			// The same code on a path that does carry the byte is the refusal, so the tightened branch
			// keeps what it was written for.
			const embedded = resolve(scratch.path, 'value\0.test.ts')
			expect(
				isRefusedName(
					embedded,
					captureError(() => writeFileSync(embedded, '', 'utf8')),
				),
			).toBe(true)
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

	// The `resolveWorkspaceModule`, `readWorkspaceManifest`, and `resolveWorkspaceBinary` helpers
	// each return an absolute native path, so each expected fragment is composed with `node:path`
	// on the host the assertion runs on. A forward-slash literal would describe a POSIX host
	// rather than the separator these helpers return.
	it('resolves installed modules and refuses absent ones', () => {
		expect(resolveWorkspaceModule(ROOT, 'typescript')).toContain(
			`${join('node_modules', 'typescript')}${sep}`,
		)
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
		expect(manifest.path).toContain(join('node_modules', 'typescript', 'package.json'))
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
		expect(resolveWorkspaceBinary(ROOT, 'oxlint')).toContain(
			join('node_modules', 'oxlint', 'bin', 'oxlint'),
		)
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
