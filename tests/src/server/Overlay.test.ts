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

	// The recorded spelling is what a tool receives as a file name and what a lookup answers under.
	// A stage whose tool resolves two spellings of one name to one file reports the path its tool
	// served rather than reaching a second spelling here.
	it('reads a candidate by exact spelling', () => {
		const overlay = new Overlay()
		overlay.set('C:/workspace/src/Value.ts', "export const VALUE = 'candidate'\n")

		expect(overlay.text('C:/workspace/src/Value.ts')).toBe("export const VALUE = 'candidate'\n")
		expect(overlay.text('C:\\workspace\\src\\Value.ts')).toBe("export const VALUE = 'candidate'\n")
		expect(overlay.text('C:/workspace/src/value.ts')).toBeUndefined()
		expect(overlay.paths).toStrictEqual(['C:/workspace/src/Value.ts'])
	})

	it('replaces a candidate recorded at a path it already holds', () => {
		const overlay = new Overlay()
		overlay.set('C:/workspace/src/value.ts', "export const VALUE = 'first'\n")
		overlay.set('C:\\workspace\\src\\value.ts', "export const VALUE = 'second'\n")

		expect(overlay.paths).toStrictEqual(['C:/workspace/src/value.ts'])
		expect(overlay.text('C:/workspace/src/value.ts')).toBe("export const VALUE = 'second'\n")
	})

	// A directory spelled in another case names another directory: containment is an exact
	// comparison, whatever a host does with file names.
	it('never folds case in a containment check', () => {
		const overlay = new Overlay()
		overlay.set('/srv/workspace/src/value.ts', '')

		expect(overlay.covers('/srv/workspace/src')).toBe(true)
		expect(overlay.covers('/srv/workspace/SRC')).toBe(false)
	})
})
