import { Overlay } from '../../../src/server/Overlay.js'
import { describe, expect, it } from 'vitest'

describe('overlay', () => {
	it('normalizes candidate keys and clears their text', () => {
		const overlay = new Overlay()
		const revision = overlay.revision
		overlay.set('C:\\workspace\\src\\value.ts', "export const VALUE = 'candidate'\n")

		expect(overlay.paths).toStrictEqual(['C:/workspace/src/value.ts'])
		expect(overlay.text('C:/workspace/src/value.ts')).toBe("export const VALUE = 'candidate'\n")
		expect(overlay.text('C:\\workspace\\src\\value.ts')).toBe("export const VALUE = 'candidate'\n")
		overlay.clear()
		expect(overlay.paths).toStrictEqual([])
		expect(overlay.text('C:/workspace/src/value.ts')).toBeUndefined()
		expect(overlay.revision).toBe(revision)
	})

	it('covers only directories that contain a candidate', () => {
		const overlay = new Overlay()
		overlay.set('/srv/workspace/src/value.ts', '')

		expect(overlay.covers('/srv/workspace')).toBe(true)
		expect(overlay.covers('/srv/workspace/src/')).toBe(true)
		expect(overlay.covers('/srv/work')).toBe(false)
		expect(overlay.covers('/srv/workspace/source')).toBe(false)
	})

	// The recorded path and the asked-about directory reach `covers` in opposite spellings, which is
	// what the shared `normalizePath` leaf exists to settle: a tool that reports its own paths with
	// backslashes still gets a true answer about a candidate recorded with forward slashes.
	it('covers a directory asked about in the opposite separator', () => {
		const overlay = new Overlay()
		overlay.set('C:/workspace/src/value.ts', '')

		expect(overlay.covers('C:\\workspace\\src')).toBe(true)
		expect(overlay.covers('C:\\workspace\\source')).toBe(false)
	})

	// A stage that declares case-insensitive file names to its tool mints its overlay the same way,
	// so the tool reaches the candidate under whichever spelling of the name it kept.
	it('reads a candidate through a divergent-case spelling where the host ignores case', () => {
		const overlay = new Overlay({ sensitive: false })
		overlay.set('C:/workspace/src/Value.ts', "export const VALUE = 'candidate'\n")

		expect(overlay.text('C:/workspace/src/value.ts')).toBe("export const VALUE = 'candidate'\n")
		expect(overlay.text('c:\\WORKSPACE\\src\\VALUE.ts')).toBe("export const VALUE = 'candidate'\n")
		// The recorded spelling is what a tool receives as a file name, so the folding decides the
		// lookup and nothing a tool is handed.
		expect(overlay.paths).toStrictEqual(['C:/workspace/src/Value.ts'])
	})

	it('reads a candidate by exact spelling where the host reads case', () => {
		const overlay = new Overlay()
		overlay.set('C:/workspace/src/Value.ts', "export const VALUE = 'candidate'\n")

		expect(overlay.text('C:/workspace/src/Value.ts')).toBe("export const VALUE = 'candidate'\n")
		expect(overlay.text('C:/workspace/src/value.ts')).toBeUndefined()
	})

	it('replaces a candidate whose path its own matching reads as one already recorded', () => {
		const overlay = new Overlay({ sensitive: false })
		overlay.set('C:/workspace/src/Value.ts', "export const VALUE = 'first'\n")
		overlay.set('C:/workspace/src/value.ts', "export const VALUE = 'second'\n")

		expect(overlay.paths).toStrictEqual(['C:/workspace/src/value.ts'])
		expect(overlay.text('C:/workspace/src/VALUE.ts')).toBe("export const VALUE = 'second'\n")
	})

	// A directory spelled in another case names another directory here, whatever the host does with
	// file names: this is a containment comparison rather than a lookup, so the folding stops at the
	// key.
	it('never folds case in a containment check', () => {
		const overlay = new Overlay({ sensitive: false })
		overlay.set('/srv/workspace/src/value.ts', '')

		expect(overlay.covers('/srv/workspace/src')).toBe(true)
		expect(overlay.covers('/srv/workspace/SRC')).toBe(false)
	})
})
