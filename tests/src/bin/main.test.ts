import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The entry is side-effectful: importing it constructs a probe and starts a server inside this
// worker, which spawns an Oxlint child, boots a nested Vitest, and leaves the arming dependency in
// the workspace when the worker is torn down first. Read the entry rather than importing it.
// Driving the running entry belongs to the proof that can own a spawned child process.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const ENTRY = 'src/bin/main.ts'

describe('bin entry', () => {
	it('occupies the path the manifest declares side-effectful', () => {
		const manifest: unknown = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
		expect(manifest).toMatchObject({ sideEffects: expect.arrayContaining([`./${ENTRY}`]) })
		expect(existsSync(resolve(ROOT, ENTRY))).toBe(true)
	})

	it('starts one probe server and exports nothing', () => {
		const source = readFileSync(resolve(ROOT, ENTRY), 'utf8')
		expect(source).toContain('createProbeServer(createProbe()).start()')
		expect(source).not.toContain('export')
	})
})
