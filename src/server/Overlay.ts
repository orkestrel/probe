import type { OverlayInterface, OverlayOptions } from './types.js'
import { randomUUID } from 'node:crypto'
import { normalizePath } from './helpers.js'

/**
 * Holds the candidate drafts one inspection substitutes for the files a tool would read from disk.
 *
 * @remarks
 * One overlay belongs to one inspection: the inspection creates it, records every candidate it
 * carries, and clears it when the inspection ends. Each stage adapts the same set to the host its
 * own tool expects rather than sharing one filesystem across tools. A fresh identity per instance
 * is what makes a resident tool re-read a path this overlay holds, so two inspections that supply
 * different text for one path never share a cached answer.
 *
 * This overlay matches a lookup key the way the host its stage declares to its tool matches file
 * names. A host that resolves two spellings of one file name to one file leaves the tool holding
 * whichever spelling it met first — the disk one, where the file is on disk — and the tool asks
 * under that, so an overlay matching keys exactly answers nothing and the tool reads the committed
 * file instead. Mint the overlay with the sensitivity the stage declares, and one reading decides
 * both. The recorded spelling is what `paths` reports and what `covers` matches a directory
 * against, so a folded key never reaches the paths a tool is handed and containment stays an exact
 * comparison.
 *
 * @example
 * ```ts
 * const overlay = new Overlay()
 * overlay.set('/srv/checkout/src/core/greeting.ts', "export const GREETING = 'hi'\n")
 * console.log(overlay.text('/srv/checkout/src/core/greeting.ts'))
 * overlay.clear()
 * ```
 */
export class Overlay implements OverlayInterface {
	readonly #revision = randomUUID()
	readonly #sensitive: boolean
	readonly #candidates = new Map<string, readonly [path: string, text: string]>()

	/**
	 * Creates an empty candidate set under a fresh identity.
	 *
	 * @param options - Construction options
	 */
	constructor(options: OverlayOptions = {}) {
		this.#sensitive = options.sensitive ?? true
	}

	get revision(): string {
		return this.#revision
	}

	get paths(): readonly string[] {
		return [...this.#candidates.values()].map(([path]) => path)
	}

	/**
	 * Records one candidate's text against the absolute path it stands in for.
	 *
	 * @remarks
	 * Recording a candidate under a path this overlay's own matching reads as one already recorded
	 * replaces that candidate, the way one file holds one text.
	 *
	 * @param path - The absolute path the candidate replaces
	 * @param text - The candidate's full contents
	 * @returns Nothing
	 */
	set(path: string, text: string): void {
		const recorded = normalizePath(path)
		this.#candidates.set(this.#key(recorded), [recorded, text])
	}

	/**
	 * Reads the candidate text recorded for one absolute path.
	 *
	 * @param path - The absolute path to read
	 * @returns The recorded text, or `undefined` when this overlay holds no candidate there
	 */
	text(path: string): string | undefined {
		return this.#candidates.get(this.#key(normalizePath(path)))?.[1]
	}

	/**
	 * Checks whether a candidate sits beneath one directory.
	 *
	 * @remarks
	 * The answer is derived from the paths the overlay holds rather than stored, so it stops being
	 * true exactly when the inspection that declared those candidates clears them. Both sides pass
	 * through `normalizePath` first, because a tool that normalizes its own paths asks about a
	 * directory in a spelling the recorded path may not share. Case is never folded here: this is a
	 * containment comparison, and it reads the recorded spelling whatever an overlay minted for a
	 * case-folding host matches its lookup keys by.
	 *
	 * @param directory - The absolute directory path to check
	 * @returns True if a candidate path sits beneath the directory; false otherwise
	 */
	covers(directory: string): boolean {
		const base = `${normalizePath(directory).replace(/\/+$/, '')}/`
		for (const [path] of this.#candidates.values()) {
			if (path.startsWith(base)) return true
		}
		return false
	}

	/**
	 * Releases every candidate.
	 *
	 * @returns Nothing
	 */
	clear(): void {
		this.#candidates.clear()
	}

	// The host this overlay was minted for decides this and nothing else does. Lowercasing is the
	// locale-independent `toLowerCase`, not the locale-sensitive form, so one candidate is not
	// reachable on one machine's locale and lost on another's.
	#key(path: string): string {
		return this.#sensitive ? path : path.toLowerCase()
	}
}
