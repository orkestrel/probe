import { fileURLToPath } from 'node:url'
import { createProbeServer } from '@src/server'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

// Every count below is a delta against the moment it was read. A sibling test in this project holds
// listeners of its own, and the worker these run in is not a fresh process.
function readInput() {
	return {
		data: process.stdin.listenerCount('data'),
		close: process.stdin.listenerCount('close'),
		error: process.stdin.listenerCount('error'),
	}
}

function readSignals() {
	return {
		SIGINT: process.listenerCount('SIGINT'),
		SIGTERM: process.listenerCount('SIGTERM'),
	}
}

describe('probe server', () => {
	it('returns the process it seized, and settles once', { timeout: 180_000 }, async () => {
		const input = readInput()
		const server = createProbeServer({ workspace: ROOT, deadline: 120_000 })
		// Construction seizes no stream: a host that never starts the server still owns its own
		// standard input. It does load the target's own Vitest, which installs one process-wide
		// termination listener of its own the first time any host in this process loads it. That
		// listener belongs to that package, defers to every other listener on the signal, and is
		// not this server's to remove — so the signal baseline is read after construction.
		expect(readInput()).toStrictEqual(input)
		const signals = readSignals()
		const seized = {
			data: input.data + 1,
			close: input.close + 1,
			error: input.error + 1,
		}
		const armed = { SIGINT: signals.SIGINT + 1, SIGTERM: signals.SIGTERM + 1 }
		let closing: Promise<void> | undefined
		try {
			server.start()
			expect(readInput()).toStrictEqual(seized)
			expect(readSignals()).toStrictEqual(armed)
			// A second call on a server already serving registers no second pair of handlers, which
			// would otherwise leave one pair attached for the life of the process.
			server.start()
			expect(readInput()).toStrictEqual(seized)
			expect(readSignals()).toStrictEqual(armed)
		} finally {
			closing = server.destroy()
			// The latch is the promise itself, so a second caller joins the first teardown rather
			// than starting a second one against resources the first is already releasing.
			expect(server.destroy()).toBe(closing)
			await closing
		}
		expect(readInput()).toStrictEqual(input)
		expect(readSignals()).toStrictEqual(signals)
		await expect(server.destroy()).resolves.toBeUndefined()
		expect(readInput()).toStrictEqual(input)
		expect(readSignals()).toStrictEqual(signals)
	})

	it('destroys a server that never started', { timeout: 180_000 }, async () => {
		const input = readInput()
		const signals = readSignals()
		const server = createProbeServer({ workspace: ROOT, deadline: 120_000 })
		await expect(server.destroy()).resolves.toBeUndefined()
		expect(readInput()).toStrictEqual(input)
		expect(readSignals()).toStrictEqual(signals)
	})
})
