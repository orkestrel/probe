import type { ListenerCapture, WorkspaceManifest } from './types.js'
import type { EventEmitter } from 'node:events'
import type * as TypeScript from 'typescript'
import type * as VitestNode from 'vitest/node'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { attempt, isArray, isRecord } from '@orkestrel/contract'
import { ProbeError } from '@src/core'

/**
 * Rewrites one path into the forward-slash spelling this package compares and reports paths in.
 *
 * @remarks
 * Windows reports a path with backslashes and accepts either separator, so two spellings of one
 * file compare unequal until they are rewritten. Every path this package keys a map on, matches a
 * prefix against, or hands a caller passes through here first.
 *
 * @param path - The path to rewrite
 * @returns The same path with every backslash replaced by a forward slash
 *
 * @example
 * ```ts
 * normalizePath('src\\core\\greeting.ts') // 'src/core/greeting.ts'
 * normalizePath('src/core/greeting.ts') // 'src/core/greeting.ts'
 * ```
 */
export function normalizePath(path: string): string {
	return path.replaceAll('\\', '/')
}

/**
 * Resolves a path inside a target workspace and rejects traversal outside it.
 *
 * @param workspace - The target workspace root
 * @param target - A workspace-relative path
 * @param mutate - If `true`, refuses a symbolic link in an existing descendant; if `false`,
 * resolves lexically. Default: `false`
 * @returns The absolute contained path
 * @throws When the path resolves outside the workspace, mutation would cross a symbolic link, or
 * the target tree cannot be inspected
 *
 * @example
 * ```ts
 * resolveWorkspaceFile('/srv/checkout', 'src/core/greeting.ts')
 * // '/srv/checkout/src/core/greeting.ts'
 * resolveWorkspaceFile('/srv/checkout', '../secrets.env')
 * // throws: Path escapes the workspace: ../secrets.env
 * ```
 */
export function resolveWorkspaceFile(workspace: string, target: string, mutate = false): string {
	const root = resolve(workspace)
	const file = resolve(root, target)
	const path = relative(root, file)
	if (path === '' || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
		throw new ProbeError(`Path escapes the workspace: ${target}`, {
			origin: 'claimant',
			code: 'refused',
			context: { path: target },
		})
	}
	if (!mutate) return file
	try {
		const canonical = realpathSync(root)
		let descendant = root
		for (const segment of path.split(sep)) {
			descendant = resolve(descendant, segment)
			const outcome = attempt(() => lstatSync(descendant))
			if (!outcome.success) {
				const error = outcome.error
				if (
					typeof error === 'object' &&
					error !== null &&
					'code' in error &&
					(error.code === 'ENOENT' || error.code === 'ENOTDIR')
				) {
					break
				}
				throw error
			}
			if (outcome.value.isSymbolicLink()) {
				throw new ProbeError(`Path crosses a symbolic link: ${target}`, {
					origin: 'workspace',
					code: 'refused',
					context: { path: target },
				})
			}
			const resolved = realpathSync(descendant)
			const remainder = relative(canonical, resolved)
			if (remainder === '..' || remainder.startsWith(`..${sep}`) || isAbsolute(remainder)) {
				throw new ProbeError(`Path escapes the workspace: ${target}`, {
					origin: 'claimant',
					code: 'refused',
					context: { path: target },
				})
			}
		}
	} catch (error) {
		if (error instanceof ProbeError) throw error
		throw new ProbeError(`The workspace path cannot be inspected: ${target}`, {
			origin: 'workspace',
			code: 'malformed',
			context: { path: target },
			cause: error,
		})
	}
	return file
}

/**
 * Projects an absolute tool path into the workspace-relative form findings expose.
 *
 * @param workspace - The target workspace root
 * @param file - The path a tool reported
 * @returns A forward-slash workspace-relative path
 *
 * @example
 * ```ts
 * relativeWorkspaceFile('/srv/checkout', '/srv/checkout/src/core/greeting.ts')
 * // 'src/core/greeting.ts'
 * ```
 */
export function relativeWorkspaceFile(workspace: string, file: string): string {
	return normalizePath(relative(resolve(workspace), resolve(file)))
}

/**
 * Resolves one installed module from the target workspace.
 *
 * @param workspace - The target workspace root
 * @param specifier - The module specifier to resolve
 * @returns The installed module entry path
 * @throws When the workspace does not install the module
 *
 * @example
 * ```ts
 * resolveWorkspaceModule(process.cwd(), 'typescript/package.json') ===
 * 	readWorkspaceManifest(process.cwd(), 'typescript').path // true
 * ```
 */
export function resolveWorkspaceModule(workspace: string, specifier: string): string {
	const outcome = attempt(() =>
		createRequire(resolve(workspace, 'package.json')).resolve(specifier),
	)
	if (outcome.success) return outcome.value
	const error = outcome.error
	const missing =
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		error.code === 'MODULE_NOT_FOUND'
	throw new ProbeError(`The workspace cannot resolve ${specifier}`, {
		origin: 'workspace',
		code: missing ? 'missing' : 'malformed',
		context: { name: specifier },
		cause: error,
	})
}

/**
 * Loads one installed tool module from a target workspace.
 *
 * @param workspace - The target workspace root
 * @param specifier - The module specifier to load
 * @returns The installed module
 * @throws When the workspace cannot load the module
 *
 * @example
 * ```ts
 * const typescript = loadWorkspaceModule(process.cwd(), 'typescript')
 * console.log(typescript.version)
 * ```
 */
export function loadWorkspaceModule(workspace: string, specifier: 'typescript'): typeof TypeScript
export function loadWorkspaceModule(workspace: string, specifier: 'vitest/node'): typeof VitestNode
export function loadWorkspaceModule(
	workspace: string,
	specifier: 'typescript' | 'vitest/node',
): typeof TypeScript | typeof VitestNode {
	const outcome = attempt(() => {
		const require = createRequire(resolve(workspace, 'package.json'))
		return specifier === 'typescript' ? require('typescript') : require('vitest/node')
	})
	if (outcome.success) return outcome.value
	const error = outcome.error
	const missing =
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		error.code === 'MODULE_NOT_FOUND'
	throw new ProbeError(`The workspace cannot load ${specifier}`, {
		origin: 'workspace',
		code: missing ? 'missing' : 'malformed',
		context: { name: specifier },
		cause: error,
	})
}

/**
 * Reads one installed package manifest from the target workspace.
 *
 * @param workspace - The target workspace root
 * @param name - The installed package name
 * @returns The manifest's absolute path and parsed record
 * @throws When the package cannot be resolved, read, parsed, or does not publish a record manifest
 *
 * @example
 * ```ts
 * const manifest = readWorkspaceManifest(process.cwd(), 'typescript')
 * console.log(manifest.contents.version)
 * ```
 */
export function readWorkspaceManifest(workspace: string, name: string): WorkspaceManifest {
	let path: string
	try {
		path = resolveWorkspaceModule(workspace, `${name}/package.json`)
	} catch (error) {
		if (!(error instanceof ProbeError)) throw error
		throw new ProbeError(`${name} does not publish a readable manifest`, {
			origin: 'workspace',
			code: error.code,
			context: { name },
			cause: error.cause,
		})
	}
	const reading = attempt(() => readFileSync(path, 'utf8'))
	if (!reading.success) {
		const error = reading.error
		const missing =
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error.code === 'ENOENT' || error.code === 'ENOTDIR')
		throw new ProbeError(`${name} does not publish a readable manifest`, {
			origin: 'workspace',
			code: missing ? 'missing' : 'malformed',
			context: { name, path },
			cause: error,
		})
	}
	const parsing = attempt<unknown>(() => JSON.parse(reading.value))
	if (!parsing.success) {
		throw new ProbeError(`${name} does not publish a readable manifest`, {
			origin: 'workspace',
			code: 'malformed',
			context: { name, path },
			cause: parsing.error,
		})
	}
	const contents = parsing.value
	if (!isRecord(contents)) {
		throw new ProbeError(`${name} does not publish a readable manifest`, {
			origin: 'workspace',
			code: 'malformed',
			context: { name, path },
		})
	}
	return { path, contents }
}

/**
 * Resolves a package's portable JavaScript binary from the target workspace.
 *
 * @param workspace - The target workspace root
 * @param name - The installed package name and binary key
 * @returns The absolute JavaScript entry named by the package's `bin` field
 * @throws When the package does not publish a binary under the requested name
 *
 * @example
 * ```ts
 * relativeWorkspaceFile(process.cwd(), resolveWorkspaceBinary(process.cwd(), 'oxlint'))
 * // 'node_modules/oxlint/bin/oxlint'
 * resolveWorkspaceBinary(process.cwd(), 'typescript')
 * // throws: typescript does not publish the typescript binary
 * ```
 */
export function resolveWorkspaceBinary(workspace: string, name: string): string {
	const manifest = readWorkspaceManifest(workspace, name)
	const bin = manifest.contents.bin
	if (bin === undefined) {
		throw new ProbeError(`${name} does not publish a bin field`, {
			origin: 'workspace',
			code: 'missing',
			context: { name },
		})
	}
	if (typeof bin === 'string') return resolve(manifest.path, '..', bin)
	if (!isRecord(bin) || !(name in bin)) {
		throw new ProbeError(`${name} does not publish the ${name} binary`, {
			origin: 'workspace',
			code: 'missing',
			context: { name },
		})
	}
	const entry = bin[name]
	if (typeof entry !== 'string') {
		throw new ProbeError(`${name} publishes an invalid ${name} binary`, {
			origin: 'workspace',
			code: 'malformed',
			context: { name, value: entry },
		})
	}
	return resolve(manifest.path, '..', entry)
}

/**
 * Selects the scoped TypeScript project for one candidate source path.
 *
 * @param path - The workspace-relative candidate source path
 * @returns The workspace-relative scoped project path
 * @throws When the source does not name a configured source or application environment
 *
 * @example
 * ```ts
 * inferTypeProject('src/core/greeting.ts') // 'configs/src/tsconfig.core.json'
 * inferTypeProject('tests/src/core/greeting.test.ts')
 * // throws: Cannot infer a scoped TypeScript project for tests/src/core/greeting.test.ts
 * ```
 */
export function inferTypeProject(path: string): string {
	const [axis, environment] = normalizePath(path).split('/')
	if ((axis !== 'src' && axis !== 'app') || environment === undefined || environment === '') {
		throw new ProbeError(`Cannot infer a scoped TypeScript project for ${path}`, {
			origin: 'claimant',
			code: 'refused',
			context: { path },
		})
	}
	return `configs/${axis}/tsconfig.${environment}.json`
}

/**
 * Selects the Vitest project whose environment matches one test path.
 *
 * @remarks
 * There is no root-project fallback. A path no configured project collects returns `undefined`,
 * and the runtime stage refuses that claimant test with `code: 'missing'` rather than running it
 * somewhere the workspace never configured.
 *
 * @param path - The workspace-relative test path
 * @returns The matching project's name, or `undefined` when no configured project collects the path
 *
 * @example
 * ```ts
 * inferTestProject('tmp/probe/greeting.test.ts') // 'probe'
 * inferTestProject('tests/src/server/helpers.test.ts') // 'src:server'
 * inferTestProject('tests/config.test.ts') // undefined
 * ```
 */
export function inferTestProject(path: string): string | undefined {
	const [root, axis, environment] = normalizePath(path).split('/')
	if (root === 'tmp' && axis === 'probe') return 'probe'
	if (root !== 'tests' || axis === undefined || environment === undefined) return undefined
	if (axis !== 'src' && axis !== 'app') return undefined
	return `${axis}:${environment}`
}

/**
 * Selects the Language Server Protocol language identifier for a source path.
 *
 * @param path - The source path whose extension selects the language
 * @returns The matching JavaScript or TypeScript language identifier
 *
 * @example
 * ```ts
 * inferDocumentLanguage('src/core/greeting.ts') // 'typescript'
 * inferDocumentLanguage('src/browser/Panel.tsx') // 'typescriptreact'
 * ```
 */
export function inferDocumentLanguage(path: string): string {
	const extension = extname(path).toLowerCase()
	if (extension === '.tsx') return 'typescriptreact'
	if (extension === '.js' || extension === '.mjs' || extension === '.cjs') return 'javascript'
	if (extension === '.jsx') return 'javascriptreact'
	return 'typescript'
}

/**
 * Creates a fresh sibling identity while preserving a test's resolution directory.
 *
 * @param workspace - The target workspace root
 * @param path - The workspace-relative test path
 * @param revision - The fresh revision identity
 * @returns An absolute sibling file path
 *
 * @example
 * ```ts
 * relativeWorkspaceFile(
 * 	'/srv/checkout',
 * 	createRevisionFile('/srv/checkout', 'tmp/probe/greeting.test.ts', '4821-9f0c'),
 * )
 * // 'tmp/probe/greeting.test.probe-4821-9f0c.ts'
 * ```
 */
export function createRevisionFile(workspace: string, path: string, revision: string): string {
	const file = resolveWorkspaceFile(workspace, path)
	const extension = extname(file)
	const stem = extension === '' ? file : file.slice(0, -extension.length)
	return `${stem}.probe-${revision}${extension}`
}

/**
 * Reports whether a path is a workspace module Vitest can cache.
 *
 * @param path - The candidate file path
 * @returns True for script, TypeScript, Vue, and JSON modules; false otherwise
 *
 * @example
 * ```ts
 * matchesWorkspaceModule('src/core/greeting.ts') // true
 * matchesWorkspaceModule('src/styles/tokens.css') // false
 * ```
 */
export function matchesWorkspaceModule(path: string): boolean {
	return /\.(?:[cm]?[jt]sx?|vue|json)$/.test(path)
}

/**
 * Reads a JSON-RPC frame's declared byte length.
 *
 * @param header - The frame header text without its terminating empty line
 * @returns The non-negative content length, or `undefined` for an invalid header
 *
 * @example
 * ```ts
 * parseContentLength('Content-Length: 128') // 128
 * parseContentLength('Content-Type: application/json') // undefined
 * ```
 */
export function parseContentLength(header: string): number | undefined {
	const match = /(?:^|\r\n)Content-Length:\s*(\d+)(?:\r\n|$)/i.exec(header)
	const text = match?.[1]
	if (text === undefined) return undefined
	const length = Number.parseInt(text, 10)
	return Number.isSafeInteger(length) && length >= 0 ? length : undefined
}

/**
 * Normalizes a caught or foreign error into readable text.
 *
 * @param value - The value to describe
 * @returns Its message when present, or its string representation
 *
 * @example
 * ```ts
 * messageFromUnknown(new Error('The lint stage has been destroyed'))
 * // 'The lint stage has been destroyed'
 * messageFromUnknown(17) // '17'
 * ```
 */
export function messageFromUnknown(value: unknown): string {
	if (value instanceof Error) return value.message
	if (
		typeof value === 'object' &&
		value !== null &&
		'message' in value &&
		typeof value.message === 'string'
	) {
		return value.message
	}
	return String(value)
}

/**
 * Rewrites every workspace-contained absolute path in a value to its workspace-relative form and
 * sorts every record's keys.
 *
 * @remarks
 * A parsed TypeScript project carries the absolute root it was parsed at, so the same commit
 * checked out at two paths produces two values that describe one configuration. Rewriting those
 * members makes the value portable and stops a host path leaking into anything derived from it. A
 * path that escapes the workspace is left as it stands, because rewriting it would name a file
 * outside the tree by a relative spelling. Key order is the parser's, not the configuration's, so
 * sorting removes a difference that means nothing.
 *
 * @param workspace - The target workspace root
 * @param value - The value to rewrite
 * @returns The value with contained absolute paths made relative and every record key sorted
 *
 * @example
 * ```ts
 * normalizeValue('/srv/checkout', { rootDir: '/srv/checkout/src/core', strict: true })
 * // { rootDir: 'src/core', strict: true }
 * ```
 */
export function normalizeValue(workspace: string, value: unknown): unknown {
	const root = resolve(workspace)
	if (typeof value === 'string') {
		if (!isAbsolute(value)) return value
		const path = relative(root, resolve(value))
		if (path === '') return '.'
		if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) return value
		return normalizePath(path)
	}
	if (isArray(value)) return value.map((entry) => normalizeValue(workspace, entry))
	if (isRecord(value)) {
		const record: Record<string, unknown> = {}
		for (const key of Object.keys(value).sort()) record[key] = normalizeValue(workspace, value[key])
		return record
	}
	return value
}

/**
 * Computes the canonical digest of one value as it stands in a target workspace.
 *
 * @remarks
 * Digests the normalized value rather than the value itself, so one commit read at two absolute
 * roots produces one digest and a digest carries no host path. The result is the leading 32 hex
 * characters of a SHA-256 over the normalized JSON.
 *
 * @param workspace - The target workspace root the value's paths are read against
 * @param value - The value to digest
 * @returns 32 lowercase hex characters
 *
 * @example
 * ```ts
 * computeDigest('/srv/checkout', { strict: true }).length // 32
 * ```
 */
export function computeDigest(workspace: string, value: unknown): string {
	return createHash('sha256')
		.update(JSON.stringify(normalizeValue(workspace, value)))
		.digest('hex')
		.slice(0, 32)
}

/**
 * Records the listeners one emitter carries for a set of events.
 *
 * @param emitter - The emitter to read
 * @param events - The event names to record
 * @returns The listeners each named event carries now
 *
 * @example
 * ```ts
 * const capture = captureListeners(process, ['SIGTERM'])
 * capture.get('SIGTERM')?.length === process.listenerCount('SIGTERM') // true
 * ```
 */
export function captureListeners(
	emitter: EventEmitter,
	events: readonly string[],
): ListenerCapture {
	const capture = new Map<string, readonly Function[]>()
	for (const event of events) capture.set(event, emitter.listeners(event))
	return capture
}

/**
 * Removes every listener one emitter gained for the captured events since its capture.
 *
 * @remarks
 * Compares identity rather than name, so a listener whose name a dependency changes between
 * releases is still recognized and a listener that merely shares a name is still left alone. A
 * listener the capture already held survives, and a listener the capture held that has since been
 * removed is not restored.
 *
 * A gain is not evidence of who caused it, so this reads every gain as the callee's. Call it only
 * across a window nothing else can attach in — a synchronous call, or a call whose handlers land
 * before its first await and that is released as it returns — because a listener anyone else
 * attaches inside that window is removed with the rest. Where a caller cannot promise that window,
 * hold each handler as a field and remove it by reference instead of capturing at all.
 *
 * @param emitter - The emitter to release
 * @param capture - The listeners the emitter carried at capture time
 * @returns Nothing
 *
 * @example
 * ```ts
 * const capture = captureListeners(process, ['SIGTERM'])
 * process.on('SIGTERM', () => {})
 * releaseListeners(process, capture)
 * process.listenerCount('SIGTERM') === capture.get('SIGTERM')?.length // true
 * ```
 */
export function releaseListeners(emitter: EventEmitter, capture: ListenerCapture): void {
	for (const [event, captured] of capture) {
		for (const listener of emitter.listeners(event)) {
			if (captured.includes(listener)) continue
			emitter.removeListener(event, listener)
		}
	}
}
