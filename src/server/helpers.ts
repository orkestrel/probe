import type { WorkspaceManifest } from './types.js'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import { isRecord } from '@orkestrel/contract'

/**
 * Resolves a path inside a target workspace and rejects traversal outside it.
 *
 * @param workspace - The target workspace root
 * @param target - A workspace-relative path
 * @returns The absolute contained path
 * @throws When the path resolves outside the workspace
 */
export function resolveWorkspaceFile(workspace: string, target: string): string {
	const root = resolve(workspace)
	const file = resolve(root, target)
	const path = relative(root, file)
	if (path.startsWith('..') || isAbsolute(path)) {
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
 */
export function resolveWorkspaceModule(workspace: string, specifier: string): string {
	const require = createRequire(resolve(workspace, 'package.json'))
	return require.resolve(specifier)
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
 */
export function matchesWorkspaceModule(path: string): boolean {
	return /\.(?:[cm]?[jt]sx?|vue|json)$/.test(path)
}

/**
 * Reads a JSON-RPC frame's declared byte length.
 *
 * @param header - The frame header text without its terminating empty line
 * @returns The non-negative content length, or `undefined` for an invalid header
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
