import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { createScratch } from '@orkestrel/test/server'
import { describe, expect, it } from 'vitest'
import {
	isProcessLive,
	killFixtureServer,
	readFixtureServer,
	readSignalEnding,
	waitForFixtureServer,
} from './setupServer.js'

describe('server test setup', () => {
	it('reads the ending of a real child after signaling it', async () => {
		const ending = await readSignalEnding(
			'SIGTERM',
			[
				"process.once('SIGTERM', () => process.exit(7))",
				"process.stdout.write('armed')",
				'setTimeout(() => {}, 10_000)',
			].join('\n'),
		)
		expect(
			(ending.code === 7 && ending.signal === null) ||
				(ending.code === null && ending.signal === 'SIGTERM'),
		).toBe(true)
	})

	it('waits for, reads, and kills an announced fixture process', async () => {
		const scratch = createScratch({ prefix: 'probe-setup-server-' })
		const child = spawn(
			process.execPath,
			[
				'-e',
				"import { writeFileSync } from 'node:fs'; writeFileSync(process.argv[1], String(process.pid)); setTimeout(() => {}, 10_000)",
				resolve(scratch.path, 'server.pid'),
			],
			{ stdio: 'ignore' },
		)
		const id = child.pid
		if (id === undefined) throw new Error('The fixture child never reported a process id')
		const ended = new Promise<void>((settle) => {
			child.once('exit', () => settle())
		})
		try {
			expect(isProcessLive(id)).toBe(true)
			expect(await waitForFixtureServer(scratch)).toBe(id)
			expect(readFixtureServer(scratch)).toBe(id)
			killFixtureServer(scratch)
			await ended
			expect(isProcessLive(id)).toBe(false)
		} finally {
			try {
				if (isProcessLive(id)) {
					child.kill('SIGKILL')
					await ended
				}
			} finally {
				scratch.destroy()
			}
		}
	})
})
