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
})
