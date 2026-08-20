import type { ProbeInterface, ProbeOptions } from '@src/core'
import type { ProbeServerInterface } from './types.js'
import { PassThrough } from 'node:stream'
import { compileSchema, schemaToParameters } from '@orkestrel/contract'
import { createMCPLegacy, createMCPServer } from '@orkestrel/mcp'
import { createStdioServer } from '@orkestrel/mcp/server'
import { createTool, createToolManager } from '@orkestrel/tool'
import {
	CLAIM_SHAPE,
	ProbeError,
	createDestroyedError,
	findRefusedPaths,
	formatVerdict,
	isClaim,
	isVerdict,
} from '@src/core'
import { version } from '../../package.json' with { type: 'json' }
import { Probe } from './Probe.js'

/**
 * Serves one probe over this process's Model Context Protocol stdio transport.
 *
 * @remarks
 * Construction creates the probe, publishes the `prove` tool, and binds the dual-era dispatcher to
 * the stdio transport. The probe begins warming there, so a harness that spawns the entry pays
 * arming while its client is still handshaking.
 *
 * `start` seizes standard input and registers the signals a harness ends a child with, and records
 * whether standard input was already flowing. Every listener it attaches is held as a field, and
 * `destroy` removes exactly those by reference, so a listener a host registers while this server is
 * serving is still attached and still fires afterwards. The transport reads a stream this server
 * owns rather than this process's standard input, which is what makes that possible: the
 * transport's own listeners land on that stream, and the only listeners this server ever puts on
 * `process.stdin` are the `data`, `close`, and `error` forwarders into it. `destroy` pauses the
 * stream only when this server is what set it flowing and nothing else is reading it, so a process
 * that outlives this server reads its own standard input again and receives its own signals.
 * Teardown removes the signal handlers first: it takes seconds when a boot is in flight, and a
 * harness that signals again means to kill rather than to queue.
 *
 * @example
 * ```ts
 * const server = new ProbeServer({ workspace: process.cwd() })
 * server.start()
 * await server.destroy()
 * ```
 */
export class ProbeServer implements ProbeServerInterface {
	readonly #probe: ProbeInterface
	readonly #stream: PassThrough
	readonly #transport: ReturnType<typeof createStdioServer>
	readonly #data: (chunk: Buffer) => void
	readonly #close: () => void
	readonly #error: (error: Error) => void
	readonly #signal: () => void
	#owns: boolean | undefined
	#closing: Promise<void> | undefined

	/**
	 * Creates the probe this server publishes and binds it to this process's stdio transport.
	 *
	 * @param options - Workspace, deadline, and initial observation hooks for the probe it creates
	 */
	constructor(options?: ProbeOptions) {
		this.#probe = new Probe(options)
		// `@orkestrel/mcp` 0.0.19 attaches three anonymous listeners to whatever stream it is given
		// and detaches none of them when its transport closes. Give it a stream this server owns, so
		// those listeners are never on `process.stdin` and teardown never has to decide which
		// listeners there were the transport's. A later transport that detaches its own leaves this
		// arrangement doing the same work rather than making it wrong.
		this.#stream = new PassThrough()
		this.#transport = createStdioServer(createMCPLegacy(this.#publish()), { input: this.#stream })
		// One stable reference per listener, bound once here, because an emitter removes a listener
		// by identity and a reference built at attach time cannot be rebuilt at release time.
		this.#data = this.#receive.bind(this)
		this.#close = this.#finish.bind(this)
		this.#error = this.#fail.bind(this)
		this.#signal = this.#release.bind(this)
	}

	start(): void {
		// `#owns` records that this server is serving and `#closing` that teardown has begun. A second
		// call while serving would attach another listener set and forget the first, while a call after
		// teardown would write into a stream this server has already destroyed.
		if (this.#closing !== undefined) throw createDestroyedError('probe server')
		if (this.#owns !== undefined) return
		// The stream's flow is what this server takes from the process beside the listener sets. Read
		// it here, before anything attaches, because this is the only moment the
		// answer exists. Read `readableFlowing` rather than `isPaused()`: a stream nobody has read
		// reports `readableFlowing` as `null`, and `isPaused()` folds that into the same `false` an
		// already-flowing stream reports, so only the flow itself separates a flow this server is
		// about to start from one it found running.
		this.#owns = process.stdin.readableFlowing !== true
		// Arm the transport before the forwarders, so the stream it reads has its reader attached
		// before the first chunk can arrive on it.
		this.#transport.start()
		process.stdin.on('data', this.#data)
		process.stdin.on('close', this.#close)
		process.stdin.on('error', this.#error)
		process.on('SIGINT', this.#signal)
		process.on('SIGTERM', this.#signal)
	}

	destroy(): Promise<void> {
		if (this.#closing !== undefined) return this.#closing
		this.#closing = this.#destroy()
		return this.#closing
	}

	async #destroy(): Promise<void> {
		// Release the signal handlers before anything slow. Teardown awaits the boot in flight and
		// takes seconds; a harness that signals again inside that window is asking for the process
		// rather than for a second graceful attempt, and with these handlers gone it gets it.
		process.removeListener('SIGINT', this.#signal)
		process.removeListener('SIGTERM', this.#signal)
		this.#transport.stop()
		// Take back exactly the forwarders `start` attached, by reference. Removing a `data`
		// listener does not pause the stream, so the flow is decided after they are off: pause only
		// when this server both started the flow and is the last thing reading it. A host that was
		// already reading its own standard input keeps reading it, a host that began reading while
		// this server was serving keeps reading it too, and a host that never read gets its paused
		// stream back.
		process.stdin.removeListener('data', this.#data)
		process.stdin.removeListener('close', this.#close)
		process.stdin.removeListener('error', this.#error)
		if (this.#owns === true && process.stdin.listenerCount('data') === 0) process.stdin.pause()
		this.#owns = undefined
		// Safe only after the forwarders are off: a chunk arriving on a destroyed stream would raise
		// a write-after-destroy error nothing is left to answer.
		this.#stream.destroy()
		await this.#probe.destroy()
	}

	// Forwards one chunk of this process's standard input into the stream the transport reads.
	#receive(chunk: Buffer): void {
		this.#stream.write(chunk)
	}

	// Ends the transport's stream when standard input closes, so buffered bytes are still framed
	// before the transport reads the close.
	#finish(): void {
		this.#stream.end()
	}

	// Carries a standard input failure to the transport as its stream's own error.
	#fail(error: Error): void {
		this.#stream.destroy(error)
	}

	// Answers a termination signal. One reference serves both signals, and each removal names its
	// own event, so `destroy` takes it off `SIGINT` and `SIGTERM` independently.
	#release(): void {
		void this.destroy()
	}

	// Advertises `prove` as the one tool this server publishes, and renders each verdict as the text
	// a client reads. The claim guard runs here rather than inside the probe, because a tool call
	// arrives as unknown JSON and the coordinator's contract begins at a `Claim`.
	#publish(): ReturnType<typeof createMCPServer> {
		const parameters = schemaToParameters(compileSchema(CLAIM_SHAPE))
		if (parameters === undefined) {
			throw new ProbeError('The claim schema cannot be advertised as tool parameters', {
				origin: 'instrument',
				code: 'malformed',
			})
		}
		const tools = createToolManager()
		tools.add(
			createTool({
				name: 'prove',
				description: 'Proves a claim with type, lint, and runtime evidence.',
				parameters,
				execute: async (input) => {
					if (!isClaim(input)) {
						const refused = findRefusedPaths(input)
						throw new ProbeError(
							refused.length === 0
								? 'The prove tool requires a claim matching the advertised schema'
								: `The prove tool refuses ${refused.join(', ')}: a source path must stay inside the workspace, which the advertised schema does not constrain`,
							{
								origin: 'claimant',
								code: 'refused',
								context: { value: input },
							},
						)
					}
					return this.#probe.prove(input)
				},
			}),
		)
		return createMCPServer({
			identity: { name: 'probe', version },
			tools,
			execution: async ({ call }) => {
				const result = await tools.execute(call)
				if (!result.success) return result
				if (!isVerdict(result.value)) {
					throw new ProbeError('The prove tool returned an invalid verdict', {
						origin: 'instrument',
						code: 'malformed',
						context: { value: result.value },
					})
				}
				return {
					resultType: 'complete',
					content: [{ type: 'text', text: formatVerdict(result.value) }],
				}
			},
		})
	}
}
