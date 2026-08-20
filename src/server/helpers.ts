import type { WorkspaceManifest } from './types.js'
import type * as TypeScript from 'typescript'
import type * as VitestNode from 'vitest/node'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { isArray, isRecord } from '@orkestrel/contract'

/**
 * Resolves a path inside a target workspace and rejects traversal outside it.
 *
 * @param workspace - The target workspace root
 * @param target - A workspace-relative path
 * @returns The absolute contained path
 * @throws When the path resolves outside the workspace
 *
 * @example
 * ```ts
 * resolveWorkspaceFile('/srv/checkout', 'src/core/greeting.ts')
 * // '/srv/checkout/src/core/greeting.ts'
 * resolveWorkspaceFile('/srv/checkout', '../secrets.env')
 * // throws: Path escapes the workspace: ../secrets.env
 * ```
 */
export function resolveWorkspaceFile(workspace: string, target: string): string {
	const root = resolve(workspace)
	const file = resolve(root, target)
	const path = relative(root, file)
	if (path === '' || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
		throw new Error(`Path escapes the workspace: ${target}`)
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
	return relative(resolve(workspace), resolve(file)).replaceAll('\\', '/')
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
	const require = createRequire(resolve(workspace, 'package.json'))
	return require.resolve(specifier)
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
	const require = createRequire(resolve(workspace, 'package.json'))
	return specifier === 'typescript' ? require('typescript') : require('vitest/node')
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
	const path = resolveWorkspaceModule(workspace, `${name}/package.json`)
	const contents: unknown = JSON.parse(readFileSync(path, 'utf8'))
	if (!isRecord(contents)) {
		throw new Error(`${name} does not publish a readable manifest`)
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
		throw new Error(`${name} does not publish a bin field`)
	}
	if (typeof bin === 'string') return resolve(manifest.path, '..', bin)
	if (!isRecord(bin) || !(name in bin)) {
		throw new Error(`${name} does not publish the ${name} binary`)
	}
	const entry = bin[name]
	if (typeof entry !== 'string') {
		throw new Error(`${name} publishes an invalid ${name} binary`)
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
	const [axis, environment] = path.replaceAll('\\', '/').split('/')
	if ((axis !== 'src' && axis !== 'app') || environment === undefined || environment === '') {
		throw new Error(`Cannot infer a scoped TypeScript project for ${path}`)
	}
	return `configs/${axis}/tsconfig.${environment}.json`
}

/**
 * Selects the Vitest project whose environment matches one test path.
 *
 * @param path - The workspace-relative test path
 * @returns The project name, or `undefined` for the root project
 *
 * @example
 * ```ts
 * inferTestProject('tmp/probe/greeting.test.ts') // 'probe'
 * inferTestProject('tests/src/server/helpers.test.ts') // 'src:server'
 * inferTestProject('tests/config.test.ts') // undefined
 * ```
 */
export function inferTestProject(path: string): string | undefined {
	const [root, axis, environment] = path.replaceAll('\\', '/').split('/')
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
		return path.replaceAll('\\', '/')
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
