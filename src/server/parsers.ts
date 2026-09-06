import type { ProjectConfig } from './types.js'
import { attempt, isArray, isRecord } from '@orkestrel/contract'

/**
 * Parses the configuration one compiler run printed for a TypeScript project.
 *
 * @remarks
 * Reads what `tsc --showConfig` writes: a JSON record carrying the resolved `compilerOptions`
 * beside the project's own file selection. `compilerOptions` is carried unvalidated, because a
 * caller digests it rather than reading a member out of it. `files` and `include` are read only
 * where the printed record carries one whose entries are all strings, so a member the compiler
 * printed in another shape reads as absent rather than as an empty selection. Text that is not a
 * JSON record, including the diagnostic the compiler prints for a project it refuses, yields
 * `undefined`.
 *
 * @param text - The compiler's printed configuration
 * @returns The project's resolved configuration, or `undefined` when the text carries no record
 *
 * @example
 * ```ts
 * parseProjectConfig('{"compilerOptions":{"strict":true}}')?.compilerOptions // { strict: true }
 * parseProjectConfig("error TS5058: The specified path does not exist.") // undefined
 * ```
 */
export function parseProjectConfig(text: string): ProjectConfig | undefined {
	const parsed = attempt<unknown>(() => JSON.parse(text))
	if (!parsed.success || !isRecord(parsed.value)) return undefined
	const files = parsed.value.files
	const include = parsed.value.include
	return {
		compilerOptions: parsed.value.compilerOptions,
		...(isArray(files) && files.every((entry) => typeof entry === 'string') ? { files } : {}),
		...(isArray(include) && include.every((entry) => typeof entry === 'string') ? { include } : {}),
	}
}

/**
 * Parses the process id one revision identity names.
 *
 * @remarks
 * Every file and directory this package writes into a target carries the writing host's process id
 * and a fresh UUID, joined by `-`. A sweep reads that id to decide whether the host that wrote the
 * name is gone. The whole identity must match, so a name carrying anything else yields `undefined`
 * and the sweep leaves what it found alone.
 *
 * @param revision - The revision identity a name carries
 * @returns The process id it names, or `undefined` when the text is not a revision identity
 *
 * @example
 * ```ts
 * parseRevisionOwner('4821-1b4e28ba-2fa1-11d2-883f-0016d3cca427') // 4821
 * parseRevisionOwner('4821-9f0c') // undefined
 * ```
 */
export function parseRevisionOwner(revision: string): number | undefined {
	const match = /^(\d+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.exec(
		revision,
	)
	const owner = match?.[1]
	return owner === undefined ? undefined : Number.parseInt(owner, 10)
}
