import type { MCPLimitOptions } from '@orkestrel/mcp'
import type { JSONValue } from '@orkestrel/contract'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createMCPLegacy, createMCPServer } from '@orkestrel/mcp'
import { createStdioServer } from '@orkestrel/mcp/server'
import { captureError, createRecorder, createTeardown, waitForDelay } from '@orkestrel/test'
import { createTool, createToolManager } from '@orkestrel/tool'
import { ProbeServer } from '@src/server'
import { describe, expect, it } from 'vitest'
import { WORKSPACE_ROOT } from '../../setup.js'

const ROOT = fileURLToPath(WORKSPACE_ROOT)

// A verdict carrying one issue per refused declaration, which is what a control refusing several
// declarations at once produces. The shape is the `Verdict` record `isVerdict` admits; the values
// are inert, because what is read here is how the installed package bounds the record rather than
// what the record says.
function buildRecord(issues: number): JSONValue {
	return {
		id: '88a5addc-7d33-40dc-9a5a-104b71f8787d',
		digest: '6ca20c3bff623031d3955b9d1a76d71d',
		toolchain: { typescript: '6.0.3', oxlint: '1.79.0', vitest: '4.1.11' },
		project: { path: 'configs/src/tsconfig.core.json', digest: '3b674fdf121c85efb9ed1bab25ceeec8' },
		case: [{ stage: 'type', elapsed: 61, issues: [] }],
		control: [
			{
				stage: 'type',
				elapsed: 58,
				issues: Array.from({ length: issues }, (_, index) => ({
					origin: 'claimant',
					path: `src/core/wide-${String(index)}.ts`,
					message: 'not assignable',
					range: {
						start: { line: index, character: 6 },
						end: { line: index, character: 13 },
					},
				})),
			},
		],
		elapsed: 549,
		receipt: 'probe:6ca20c3bff623031d3955b9d1a76d71d:type',
	}
}

// Dispatches one `tools/call` against a server composed the way `ProbeServer` composes its own —
// an explicit execution policy answering with a complete result that carries the record beside one
// rendered text block — and returns the parsed JSON-RPC message the dispatcher answered with.
async function readCall(record: JSONValue, limit: MCPLimitOptions): Promise<unknown> {
	const tools = createToolManager()
	tools.add(
		createTool({
			name: 'prove',
			description: 'Answers whether a TypeScript edit compiles, lints, and passes its test',
			parameters: { type: 'object', properties: {} },
			execute: () => record,
		}),
	)
	const server = createMCPServer({
		identity: { name: 'probe', version: '0.0.0' },
		tools,
		limit,
		execution: () =>
			Promise.resolve({
				resultType: 'complete',
				content: [{ type: 'text', text: 'probe rendered\nreceipt probe:6ca20c' }],
				structuredContent: record,
			}),
	})
	const answer = await createMCPLegacy(server).handle(
		JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'prove', arguments: {} },
		}),
	)
	return typeof answer === 'string' ? JSON.parse(answer) : undefined
}

// Every following count is a delta against the moment it was read. A sibling test in this project
// holds listeners of its own, and the worker these run in is not a fresh process.
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
		const server = new ProbeServer({ workspace: ROOT, deadline: 120_000 })
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
			const server = new ProbeServer({ workspace: ROOT, deadline: 120_000 })
			try {
				server.start()
				await server.destroy()
				expect(process.stdin.isPaused()).toBe(false)
				process.stdin.push('probe')
				await waitForDelay(20)
				expect(reader.calls.map((call) => String(call[0]))).toStrictEqual(['probe'])
			} finally {
				const teardown = createTeardown()
				teardown.add(() => {
					if (initial) process.stdin.pause()
					else process.stdin.resume()
				})
				teardown.add(() => {
					process.stdin.removeListener('data', reader.handler)
				})
				await teardown.destroy()
			}
		},
	)

	it('returns the process it seized, and settles once', { timeout: 180_000 }, async () => {
		const input = readInput()
		const server = new ProbeServer({ workspace: ROOT, deadline: 120_000 })
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
				const server = new ProbeServer({ workspace: ROOT, deadline: 120_000 })
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
		const server = new ProbeServer({ workspace: ROOT, deadline: 120_000 })
		await expect(server.destroy()).resolves.toBeUndefined()
		expect(readInput()).toStrictEqual(input)
		expect(readSignals()).toStrictEqual(signals)
	})

	it('refuses a start after teardown', { timeout: 180_000 }, async () => {
		const server = new ProbeServer({ workspace: ROOT, deadline: 120_000 })
		await server.destroy()
		const error = captureError(() => server.start())
		expect(error).toMatchObject({
			name: 'ProbeError',
			origin: 'claimant',
			code: 'destroyed',
			message: 'The probe server has been destroyed',
		})
	})

	// The two following cases attach after `start`. A teardown that removed whatever an emitter had
	// gained could not tell that a listener a host registers there is not this server's.
	it(
		'keeps a signal listener a host attached while it was serving',
		{ timeout: 180_000 },
		async () => {
			const interrupt = createRecorder<[NodeJS.Signals]>()
			const terminate = createRecorder<[NodeJS.Signals]>()
			const server = new ProbeServer({ workspace: ROOT, deadline: 120_000 })
			const signals = readSignals()
			try {
				server.start()
				process.on('SIGINT', interrupt.handler)
				process.on('SIGTERM', terminate.handler)
				await server.destroy()
				// This server's own handler is off both signals and the host's is on both, so each signal
				// carries the baseline plus the one the host registered.
				expect(readSignals()).toStrictEqual({
					SIGINT: signals.SIGINT + 1,
					SIGTERM: signals.SIGTERM + 1,
				})
				expect(process.listeners('SIGINT')).toContain(interrupt.handler)
				expect(process.listeners('SIGTERM')).toContain(terminate.handler)
				// Attached is not the same fact as live, so the signals are delivered rather than counted.
				process.emit('SIGINT', 'SIGINT')
				process.emit('SIGTERM', 'SIGTERM')
				expect(interrupt.count).toBe(1)
				expect(terminate.count).toBe(1)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => {
					process.removeListener('SIGTERM', terminate.handler)
				})
				teardown.add(() => {
					process.removeListener('SIGINT', interrupt.handler)
				})
				await teardown.destroy()
			}
		},
	)

	// The flow case that makes the release-time reader count behavioural. The
	// stream was not flowing when `start` read it, so the flow is this server's to pause, and the
	// host then started reading it anyway. A teardown that took the host's reader first always read
	// a reader count of zero here, so the count could never hold a stream open and the rule it
	// states could never be observed.
	it(
		'keeps delivering to a reader that started reading while it was serving',
		{ timeout: 180_000 },
		async () => {
			const initial = process.stdin.isPaused()
			const reader = createRecorder<[Buffer]>()
			process.stdin.pause()
			const input = readInput()
			const server = new ProbeServer({ workspace: ROOT, deadline: 120_000 })
			try {
				server.start()
				expect(process.stdin.isPaused(), 'the server resumed a stream the host had paused').toBe(
					true,
				)
				// The host reads a paused stream the way any host does, by resuming it. Attaching alone
				// leaves an explicitly paused stream paused, so the flow at release is the host's doing
				// and the flow at `start` was nobody's.
				process.stdin.on('data', reader.handler)
				process.stdin.resume()
				await server.destroy()
				// This server took back the forwarders it attached and left the host's reader, so `data`
				// carries the host's own listener above the baseline and `close` and `error` are back at it.
				expect(readInput()).toStrictEqual({ ...input, data: input.data + 1 })
				expect(process.stdin.listeners('data')).toContain(reader.handler)
				expect(process.stdin.isPaused()).toBe(false)
				process.stdin.push('probe')
				await waitForDelay(20)
				expect(reader.calls.map((call) => String(call[0]))).toStrictEqual(['probe'])
			} finally {
				const teardown = createTeardown()
				teardown.add(() => {
					if (initial) process.stdin.pause()
					else process.stdin.resume()
				})
				teardown.add(() => {
					process.stdin.removeListener('data', reader.handler)
				})
				await teardown.destroy()
			}
		},
	)

	// Probe's teardown relies on the installed `@orkestrel/mcp` detach: the transport removes its
	// own `data`, `close`, and `error` listeners from the stream it was given when it stops.
	// `ProbeServer` composes a transport this same way over a stream it owns, so this pins the
	// installed behavior at that composition seam directly, without going through the server. The
	// same detach through the server's own public door, against the real `process.stdin` it seizes,
	// is what 'returns the process it seized, and settles once' pins.
	it('detaches the transport listeners from the stream it was given', { timeout: 180_000 }, () => {
		const stream = new PassThrough()
		const server = createMCPServer({
			identity: { name: 'probe', version: '0.0.0' },
			tools: createToolManager(),
		})
		const transport = createStdioServer(createMCPLegacy(server), { input: stream })
		expect(stream.listenerCount('data')).toBe(0)
		transport.start()
		expect(stream.listenerCount('data')).toBeGreaterThan(0)
		const result = transport.stop()
		expect(result).toBeUndefined()
		expect(stream.listenerCount('data')).toBe(0)
		expect(stream.listenerCount('close')).toBe(0)
		expect(stream.listenerCount('error')).toBe(0)
	})

	// The installed bound behind `ProbeServer`'s own `limit`. `@orkestrel/mcp` bounds a produced
	// tool-call result by total enumerable keys as well as by bytes, and its package default is
	// sized for request metadata. A verdict's key count grows with the issues its stages report, so
	// the default carries a verdict whose control refuses one declaration and stops carrying the
	// next one — and it stops by replacing the whole answer with a JSON-RPC internal error, which
	// costs the rendered text and its receipt as well as the record. That is why the server
	// publishes a key bound of its own rather than leaving the leaf absent.
	it('refuses a record-bearing result under the package default key bound', async () => {
		expect(await readCall(buildRecord(1), {})).toMatchObject({
			id: 1,
			result: { structuredContent: buildRecord(1) },
		})
		expect(await readCall(buildRecord(8), {})).toMatchObject({
			id: 1,
			error: { message: 'Server execution returned an invalid tool result' },
		})
		// The same record under a bound above the default, which is the fix the server applies.
		expect(await readCall(buildRecord(8), { keys: 4096 })).toMatchObject({
			id: 1,
			result: {
				structuredContent: buildRecord(8),
				content: [{ type: 'text', text: 'probe rendered\nreceipt probe:6ca20c' }],
			},
		})
	})
})
