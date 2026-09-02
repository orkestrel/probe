import type { Stage } from '@src/core'
import type { ListenerCapture, WorkspaceManifest } from './types.js'
import type { EventEmitter } from 'node:events'
import type * as TypeScript from 'typescript'
import type * as VitestNode from 'vitest/node'
import {
	closeSync,
	constants,
	ftruncateSync,
	lstatSync,
	openSync,
	readFileSync,
	realpathSync,
	statSync,
	writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { attempt, compileGuard, isArray, isRecord } from '@orkestrel/contract'
import { CLAIM_SHAPE, ProbeError, isDraft } from '@src/core'

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
 * Reads the condition code a native fault carries.
 *
 * @remarks
 * A caller catches `unknown`, so every reading of a caught value's own property calls into code
 * this package does not own: a proxy whose `has` trap throws and a value whose `code` getter throws
 * both arrive here. The read is guarded, so a fault that refuses inspection reports no code rather
 * than raising a second fault over the first. A `code` the host reports as anything other than a
 * string is no code this package compares against, so it reports none either.
 *
 * One reading serves every site that classifies a native fault, so a host condition is admitted the
 * same way wherever it is read.
 *
 * @param error - The caught value to read
 * @returns The fault's `code` when it carries a string one; `undefined` otherwise
 *
 * @example
 * ```ts
 * readFaultCode(Object.assign(new Error('no such file'), { code: 'ENOENT' })) // 'ENOENT'
 * readFaultCode(new Error('the runtime stage was destroyed')) // undefined
 * readFaultCode('ENOENT') // undefined
 * ```
 */
export function readFaultCode(error: unknown): string | undefined {
	if (typeof error !== 'object' || error === null) return undefined
	const fault = error
	const reading = attempt(() => ('code' in fault ? fault.code : undefined))
	if (!reading.success) return undefined
	return typeof reading.value === 'string' ? reading.value : undefined
}

/**
 * Reports whether one path resolves outside the root it is read against.
 *
 * @remarks
 * Containment decides which paths a claim may reach and which absolute paths a digest may rewrite,
 * so one reading serves every site that asks the question. A target resolving to the root itself is
 * contained, and each caller decides on its own what that empty relative path means for it.
 *
 * The test reads the relative path rather than a string prefix of the root, so a sibling directory
 * whose name begins with the root's own text is outside rather than beneath it. An absolute
 * relative path is the answer a host returns for two paths on different volumes, which no root
 * contains.
 *
 * @param root - The root the target is read against
 * @param target - The path to test, absolute or root-relative
 * @returns True if the target resolves outside the root; false otherwise
 *
 * @example
 * ```ts
 * escapesRoot('/srv/checkout', 'src/core/greeting.ts') // false
 * escapesRoot('/srv/checkout', '../secrets.env') // true
 * escapesRoot('/srv/checkout', '/srv/checkout-backup/secrets.env') // true
 * ```
 */
export function escapesRoot(root: string, target: string): boolean {
	const path = relative(resolve(root), resolve(root, target))
	return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)
}

/**
 * Resolves a path inside a target workspace and rejects traversal outside it.
 *
 * @remarks
 * A native `ENAMETOOLONG` or NUL-byte `ERR_INVALID_ARG_VALUE` fault is a claimant refusal. This
 * classifies the fault, not the author: a workspace nested deeply enough that this package's short
 * generated names overflow the host limit also reads as a claimant refusal.
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
	if (path === '' || escapesRoot(root, file)) {
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
				const code = readFaultCode(outcome.error)
				if (code === 'ENOENT' || code === 'ENOTDIR') break
				throw outcome.error
			}
			if (outcome.value.isSymbolicLink()) {
				throw new ProbeError(`Path crosses a symbolic link: ${target}`, {
					origin: 'workspace',
					code: 'refused',
					context: { path: target },
				})
			}
			const resolved = realpathSync(descendant)
			if (escapesRoot(canonical, resolved)) {
				throw new ProbeError(`Path escapes the workspace: ${target}`, {
					origin: 'claimant',
					code: 'refused',
					context: { path: target },
				})
			}
		}
	} catch (error) {
		if (error instanceof ProbeError) throw error
		const code = readFaultCode(error)
		const claimant = code === 'ENAMETOOLONG' || code === 'ERR_INVALID_ARG_VALUE'
		throw new ProbeError(`The workspace path cannot be inspected: ${target}`, {
			origin: claimant ? 'claimant' : 'workspace',
			code: claimant ? 'refused' : 'malformed',
			context: { path: target },
			cause: error,
		})
	}
	return file
}

/**
 * Overwrites a file that already exists, through a descriptor that refuses a symbolic link at the
 * final component.
 *
 * @remarks
 * A containment walk and the write that follows it are separate calls, so a process that swaps the
 * final component between them decides where the bytes land. `writeFileSync` opens with the default
 * `w` flag, which follows a symbolic link at that component and creates the file when it is absent,
 * so the walk's reading does not bind the write. Opening `O_WRONLY | O_NOFOLLOW` moves that
 * decision into the call that writes: a link at the final component refuses the open, and the
 * omitted `O_CREAT` fails `ENOENT` for a target that has gone since the walk saw it. This is the
 * mutating counterpart of the `wx` flag every create in this package uses. Which code the refusal
 * carries is the host's; Linux with Node v22.22.2 reported `ELOOP` on 2026-08-24.
 *
 * Truncation runs through the held descriptor rather than through an `O_TRUNC` flag, so it reaches
 * the file the open bound. A Windows host refuses the numeric `O_TRUNC` without `O_CREAT` outright:
 * measured on 2026-08-26 on Windows 11 with Node v24.19.0 over NTFS, `openSync` reported `EINVAL`
 * for `O_WRONLY | O_TRUNC` and for `O_RDWR | O_TRUNC` while `O_WRONLY` alone opened, and adding
 * `O_CREAT` would trade that refusal for the create this function must never perform.
 *
 * A directory component stays open, because Node exposes no descriptor-relative call to walk and
 * write through one set of descriptors. Where a host's Node build defines no `O_NOFOLLOW`, that flag
 * contributes nothing to the flag set and the final component is open on that host too.
 *
 * @param file - The absolute path to overwrite
 * @param text - The text to write
 * @returns Nothing
 * @throws The host's own fault when the final component is a symbolic link, when the file is
 * absent, or when the host refuses the descriptor
 *
 * @example
 * ```ts
 * const file = resolveWorkspaceFile('/srv/checkout', 'tmp/probe/arm-type.ts', true)
 * writeFileSync(file, 'export type Signal = string\n', { encoding: 'utf8', flag: 'wx' })
 * overwriteFile(file, 'export type Signal = number\n')
 * readFileSync(file, 'utf8') // 'export type Signal = number\n'
 * ```
 */
export function overwriteFile(file: string, text: string): void {
	const descriptor = openSync(file, constants.O_WRONLY | constants.O_NOFOLLOW)
	try {
		ftruncateSync(descriptor, 0)
		writeFileSync(descriptor, text, 'utf8')
	} finally {
		closeSync(descriptor)
	}
}

/**
 * Reports whether a fault means the host refuses the name a caller supplied for a file to create.
 *
 * @remarks
 * A host reports one refusal with a code of its own and several unrelated conditions with one
 * shared code, so the code alone does not separate a name the host will not accept from a file
 * that is merely absent. `ENAMETOOLONG` names the refusal outright. `ERR_INVALID_ARG_VALUE` names
 * every argument Node rejects, so it names the refusal only for a path carrying the NUL byte Node
 * refuses; the same code arrives for a bad `flag` and a bad encoding, which say nothing about the
 * name. An `ENOENT` raised while the parent stats as a directory names the refusal too, because an
 * ordinary absent file beneath an existing directory would have been created instead; a Windows
 * host reports an overlong component and a character its filesystem reserves that way. Measured on
 * 2026-08-21 on Windows 11 with Node v24.18.1 over NTFS, `writeFileSync` reported `ENOENT` for a
 * 300-character final component and never reported `ENAMETOOLONG`.
 *
 * This reads the fault the host reported rather than applying a length or character policy of its
 * own, so a host that accepts a name another host refuses is not second-guessed and no platform
 * branch decides the answer. Every read of the fault is guarded, so it is total over every value a
 * published caller can supply: a proxy whose `has` trap throws, a value whose `code` getter throws,
 * a fault carrying no code, and a parent this host cannot stat each report false.
 *
 * @param file - The path whose creation failed
 * @param error - The fault the failed operation raised
 * @returns True if the fault means the host refuses this name; false otherwise
 *
 * @example
 * ```ts
 * try {
 * 	writeFileSync('tmp/probe/greeting\0.test.ts', '')
 * } catch (error) {
 * 	isRefusedName('tmp/probe/greeting\0.test.ts', error) // true
 * }
 * isRefusedName('tmp/probe/greeting.test.ts', new Error('the runtime stage was destroyed')) // false
 * ```
 */
export function isRefusedName(file: string, error: unknown): boolean {
	const code = readFaultCode(error)
	if (code === 'ENAMETOOLONG') return true
	if (code === 'ERR_INVALID_ARG_VALUE') return file.includes('\0')
	if (code !== 'ENOENT') return false
	const parent = attempt(() => statSync(dirname(file), { throwIfNoEntry: false }))
	return parent.success && parent.value !== undefined && parent.value.isDirectory()
}

/**
 * Projects an absolute tool path into the workspace-relative form issues expose.
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
 * Projects the paths one tool named in a message into the forms this package's issues expose.
 *
 * @remarks
 * An issue's `path` is workspace-relative, and its message is prose a tool wrote about the same
 * tree. Left alone that prose names a file by the host's own layout, so one issue reports a path two
 * ways and a reader on another checkout is sent to a directory that is not theirs. Each spelling of
 * the root is removed: the absolute path, the backslash spelling a Windows tool writes, and the
 * `file:` URL a runtime names a module by. A root the host itself names ends in a separator, and the
 * paths beneath it continue straight from it rather than from one more separator. A path outside the
 * workspace stands as it is, because a relative spelling of it would name a file the tree does not
 * hold.
 *
 * A spelling of the root counts only where a path begins: at the start of the message, or after a
 * character no path carries. A directory whose own name ends in this root's text holds a different
 * tree, so the root inside a longer path names a file this workspace does not hold and that path
 * survives whole.
 *
 * Only the root is removed. A name is otherwise the tool's, including a `.probe-` name that reads
 * like a specification this package generates: the stage that wrote one knows the exact name it
 * wrote and renames that name itself, which is the only reading that separates its own file from a
 * file the target tree owns.
 *
 * Everything else the tool wrote survives verbatim, separators included. A message carries text
 * that is not a path — a runtime escapes a newline as a backslash when it prints a string inline,
 * and a compiler quotes a string literal with its escapes intact — so rewriting every separator
 * would corrupt the evidence the message exists to carry. The cost is that the path left behind
 * keeps the separator the tool chose, which on Windows is not the one `Issue.path` uses.
 *
 * @param workspace - The target workspace root
 * @param message - The message a tool reported
 * @returns The message with the host's own layout removed from every path that begins with it
 *
 * @example
 * ```ts
 * relativeWorkspaceMessage('/srv/checkout', 'Cannot read /srv/checkout/tsconfig.json')
 * // 'Cannot read tsconfig.json'
 * relativeWorkspaceMessage('/srv/checkout', 'Cannot read /mirror/srv/checkout/tsconfig.json')
 * // 'Cannot read /mirror/srv/checkout/tsconfig.json'
 * ```
 */
export function relativeWorkspaceMessage(workspace: string, message: string): string {
	const root = resolve(workspace)
	const forward = normalizePath(root)
	const url = pathToFileURL(forward).href
	// On a host whose separator is a forward slash the native and forward-slash spellings are one
	// string, and a host root carries its separator already, so the set holds each distinct prefix
	// once and a root passes through as itself rather than as a doubled separator.
	const spellings = new Set([
		url.endsWith('/') ? url : `${url}/`,
		forward.endsWith('/') ? forward : `${forward}/`,
		root.endsWith(sep) ? root : `${root}${sep}`,
	])
	let text = message
	for (const spelling of spellings) {
		text = text.replaceAll(spelling, (match: string, offset: number, source: string) =>
			// A character a path carries sits before this occurrence, so the occurrence is inside a
			// longer path that another tree holds rather than at the start of one of this tree's own.
			// The character before offset 0 reads as empty, which no class matches.
			/[^\s"'`()[\]{}<>,;:=|]/u.test(source.charAt(offset - 1)) ? match : '',
		)
	}
	return text
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
	const missing = readFaultCode(error) === 'MODULE_NOT_FOUND'
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
	const missing = readFaultCode(error) === 'MODULE_NOT_FOUND'
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
		const code = readFaultCode(error)
		const missing = code === 'ENOENT' || code === 'ENOTDIR'
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
 * Selects the scoped TypeScript project for one candidate draft path.
 *
 * @param path - The workspace-relative candidate draft path
 * @returns The workspace-relative scoped project path
 * @throws When the path does not name a configured source or application environment
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
 * @returns True if the path is a script, TypeScript, Vue, or JSON module; false otherwise
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
 * Normalizes a caught or foreign error into readable text.
 *
 * @param value - The value to describe
 * @returns Its message when present, or its string representation
 *
 * @example
 * ```ts
 * describeUnknown(new Error('The lint stage has been destroyed'))
 * // 'The lint stage has been destroyed'
 * describeUnknown(17) // '17'
 * ```
 */
export function describeUnknown(value: unknown): string {
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
 * Guards one resident-stage operation with the stage failure contract.
 *
 * @param stage - The resident stage serving the operation
 * @param operation - The operation to settle
 * @returns The operation's fulfilled value
 * @throws The original `ProbeError`, or an instrument-owned malformed failure retaining the cause
 *
 * @example
 * ```ts
 * await guardStage('type', stage.inspect(subject))
 * ```
 */
export async function guardStage<T>(stage: Stage, operation: Promise<T>): Promise<T> {
	try {
		return await operation
	} catch (error) {
		if (error instanceof ProbeError) throw error
		throw new ProbeError(`The ${stage} stage could not serve (${describeUnknown(error)})`, {
			origin: 'instrument',
			code: 'malformed',
			context: { stage },
			cause: error,
		})
	}
}

/**
 * Names every draft member of a claim-shaped value whose `path` this package's guard refuses.
 *
 * @remarks
 * The published claim schema constrains `Draft.path` to a non-empty string and nothing else, while
 * `isDraft` also refuses an absolute path and one that escapes the workspace. That one member is
 * the whole of the difference between the advertised contract and the enforced one, so a caller
 * refused after satisfying the schema is refused here and nowhere else. The whole input must first
 * satisfy that schema. Each draft is then tested with `isDraft` itself rather than with a second
 * copy of its rule. Reports nothing for a value carrying no draft member, including one refused for
 * a member this contract does not declare.
 *
 * This function lives in the server helpers rather than in core: core's leaf pair, `helpers.ts` and
 * `validators.ts`, may not consume the shapes module this function reads `CLAIM_SHAPE` from, and
 * `ProbeServer` is the sole consumer of the result it returns.
 *
 * @param value - The rejected tool input
 * @returns The dotted member names, in `case` then `control` order, or an empty list
 *
 * @example
 * ```ts
 * const test = { path: 'tmp/probe/greeting.test.ts', text: '' }
 * findRefusedPaths({
 * 	project: 'tsconfig.json',
 * 	case: { files: [{ path: '../../etc/hosts', text: '' }], test },
 * 	control: { files: [], test, stage: 'type', reason: 'must not compile' },
 * })
 * // ['case.files.0.path']
 * ```
 */
export function findRefusedPaths(value: unknown): readonly string[] {
	if (!compileGuard(CLAIM_SHAPE)(value)) return []
	const members: string[] = []
	for (const phase of ['case', 'control'] as const) {
		const subject = value[phase]
		const drafts = new Map<string, unknown>([[`${phase}.test`, subject.test]])
		for (const [index, file] of subject.files.entries()) {
			drafts.set(`${phase}.files.${index}`, file)
		}
		for (const [member, draft] of drafts) {
			if (isDraft(draft)) continue
			members.push(`${member}.path`)
		}
	}
	return members
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
		if (escapesRoot(root, value)) return value
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
 * @returns The listeners each named event carries at the moment of the call
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
