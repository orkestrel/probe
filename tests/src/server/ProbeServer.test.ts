import { fileURLToPath } from 'node:url'
import { createRecorder, waitForDelay } from '@orkestrel/test'
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
	// A stream nobody has read reports `readableFlowing` as `null` and `isPaused()` as false, so a
	// teardown rule that reads `isPaused()` alone cannot tell it from a stream the host is already
	// reading, and leaves a fresh one flowing on a handle that keeps the process alive. This worker
	// begins with exactly that stream, and the state is unrecoverable once anything reads it, which
	// is why this case runs first in the file and asserts the premise it needs.
	it('pauses a standard input stream nobody had read', { timeout: 180_000 }, async () => {
		expect(
			process.stdin.readableFlowing,
			'a case before this one already read the standard input of this worker',
		).toBeNull()
		const server = createProbeServer({ workspace: ROOT, deadline: 120_000 })
		server.start()
		await server.destroy()
		expect(process.stdin.isPaused()).toBe(true)
	})

	// A host reading its own standard input is the other side of the same decision, and the flow it
	// keeps is worth more than the flag behind it: this asserts the bytes, not the state. The
	// delivery is real, because `push` puts bytes through the same read queue the pipe feeds and a
	// paused stream holds them back.
	it(
		'keeps delivering to a reader that was reading before it started',
		{ timeout: 180_000 },
		async () => {
			const initial = process.stdin.isPaused()
			const reader = createRecorder<[Buffer]>()
			process.stdin.resume()
			process.stdin.on('data', reader.handler)
			const server = createProbeServer({ workspace: ROOT, deadline: 120_000 })
			try {
				server.start()
				await server.destroy()
				expect(process.stdin.isPaused()).toBe(false)
				process.stdin.push('probe')
				await waitForDelay(20)
				expect(reader.calls.map((call) => String(call[0]))).toStrictEqual(['probe'])
			} finally {
				process.stdin.removeListener('data', reader.handler)
				if (initial) process.stdin.pause()
				else process.stdin.resume()
			}
		},
	)

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

	// Standard input's flow is process-wide state this server borrows rather than owns. Both
	// directions run against a real server, because what teardown must restore is what `start`
	// found: a host already reading its own input keeps reading it, and a host that was not gets
	// its paused stream back.
	it('restores the standard input flow it found', { timeout: 180_000 }, async () => {
		const initial = process.stdin.isPaused()
		try {
			for (const flowing of [true, false]) {
				if (flowing) process.stdin.resume()
				else process.stdin.pause()
				expect(process.stdin.isPaused(), 'the test could not set the flow it needs').toBe(!flowing)
				const server = createProbeServer({ workspace: ROOT, deadline: 120_000 })
				server.start()
				await server.destroy()
				expect(process.stdin.isPaused(), `flowing before start: ${String(flowing)}`).toBe(!flowing)
			}
		} finally {
			if (initial) process.stdin.pause()
			else process.stdin.resume()
		}
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
