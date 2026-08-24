import { describe, expect, it } from 'vitest'
import { WORKSPACE_ROOT } from './setup.js'

describe('test setup', () => {
	it('resolves the workspace root above the tests directory', () => {
		expect(WORKSPACE_ROOT.href).toBe(new URL('../', import.meta.url).href)
	})
})
