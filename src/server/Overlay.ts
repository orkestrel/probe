import type { OverlayInterface } from './types.js'
import { randomUUID } from 'node:crypto'
import { normalizePath } from './helpers.js'

/**
 * Implements `OverlayInterface` over a private map from normalized absolute path to candidate text,
 * minting at construction the `revision` a resident tool caches its answers against.
 *
 * @remarks
 * One overlay belongs to one inspection: the inspection creates it, records every candidate it
 * carries, and clears it when the inspection ends. Each stage adapts the same set to the host its
 * own tool expects rather than sharing one filesystem across tools. A fresh identity per instance
 * is what makes a resident tool re-read a path this overlay holds, so two inspections that supply
 * different text for one path never share a cached answer.
 *
 * A lookup key matches a recorded path exactly, after both pass through `normalizePath`, so a tool
 * that reports its own paths with backslashes still reaches a candidate recorded with forward
 * slashes. Case is never folded: the recorded spelling is what `paths` reports, what `covers`
 * compares a directory against, and what `text` answers under. A stage whose tool resolves two
 * spellings of one file name to one file therefore reports the path its tool served rather than
 * matching the two spellings here.
 *
 * @example
 * ```ts
 * const overlay = new Overlay()
 * const path = '/srv/checkout/src/core/factories.ts'
 * overlay.set(path, "export function createGreeting(): string {\n\treturn 'hi'\n}\n")
 * console.log(overlay.text(path))
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
	 * @remarks
	 * Recording a candidate under a path this overlay already holds replaces that candidate, the way
	 * one file holds one text.
	 *
	 * @param path - The absolute path the candidate replaces
	 * @param text - The candidate's full contents
	 * @returns Nothing
	 */
	set(path: string, text: string): void {
		this.#candidates.set(normalizePath(path), text)
	}

	/**
	 * Reads the candidate text recorded for one absolute path.
	 *
	 * @param path - The absolute path to read
	 * @returns The recorded text, or `undefined` when this overlay holds no candidate there
	 */
	text(path: string): string | undefined {
		return this.#candidates.get(normalizePath(path))
	}

	/**
	 * Checks whether a candidate sits beneath one directory.
	 *
	 * @remarks
	 * The answer is derived from the paths the overlay holds rather than stored, so it stops being
	 * true exactly when the inspection that declared those candidates clears them. Both sides pass
	 * through `normalizePath` first, because a tool that normalizes its own paths asks about a
	 * directory in a spelling the recorded path may not share.
	 *
	 * @param directory - The absolute directory path to check
	 * @returns True if a candidate path sits beneath the directory; false otherwise
	 */
	covers(directory: string): boolean {
		const base = `${normalizePath(directory).replace(/\/+$/, '')}/`
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
