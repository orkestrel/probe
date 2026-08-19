import type { OverlayInterface } from './types.js'
import { randomUUID } from 'node:crypto'

/**
 * Holds the candidate sources one inspection substitutes for the files a tool would read from disk.
 *
 * @remarks
 * One overlay belongs to one inspection: the inspection creates it, records every candidate it
 * carries, and clears it when the inspection ends. Each stage adapts the same set to the host its
 * own tool expects rather than sharing one filesystem across tools. A fresh identity per instance
 * is what makes a resident tool re-read a path this overlay holds, so two inspections that supply
 * different text for one path never share a cached answer.
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
	readonly #candidates = new Map<string, string>()

	get revision(): string {
		return this.#revision
	}

	get paths(): readonly string[] {
		return [...this.#candidates.keys()]
	}

	/**
	 * Records one candidate's text against the absolute path it stands in for.
	 *
	 * @param path - The absolute path the candidate replaces
	 * @param text - The candidate's full contents
	 * @returns Nothing
	 */
	set(path: string, text: string): void {
		this.#candidates.set(path.replaceAll('\\', '/'), text)
	}

	/**
	 * Reads the candidate text recorded for one absolute path.
	 *
	 * @param path - The absolute path to read
	 * @returns The recorded text, or `undefined` when this overlay holds no candidate there
	 */
	text(path: string): string | undefined {
		return this.#candidates.get(path.replaceAll('\\', '/'))
	}

	/**
	 * Checks whether a candidate sits beneath one directory.
	 *
	 * @remarks
	 * The answer is derived from the paths the overlay holds rather than stored, so it stops being
	 * true exactly when the inspection that declared those candidates clears them. Both sides are
	 * compared on forward slashes, because a tool that normalizes its own paths asks about a
	 * directory in a spelling the recorded path may not share.
	 *
	 * @param directory - The absolute directory path to check
	 * @returns True if a candidate path sits beneath the directory; false otherwise
	 */
	covers(directory: string): boolean {
		const base = `${directory.replaceAll('\\', '/').replace(/\/+$/, '')}/`
		for (const path of this.#candidates.keys()) {
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
}
