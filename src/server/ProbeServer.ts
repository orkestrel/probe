import type { ProbeInterface, ProbeOptions } from '@src/core'
import type { ListenerCapture, ProbeServerInterface } from './types.js'
import { compileSchema, schemaToParameters } from '@orkestrel/contract'
import { createMCPLegacy, createMCPServer } from '@orkestrel/mcp'
import { createStdioServer } from '@orkestrel/mcp/server'
import { createTool, createToolManager } from '@orkestrel/tool'
import { CLAIM_SHAPE, formatVerdict, isClaim, isVerdict } from '@src/core'
import { version } from '../../package.json' with { type: 'json' }
import { captureListeners, releaseListeners } from './helpers.js'
import { Probe } from './Probe.js'

/**
 * Serves one probe over this process's Model Context Protocol stdio transport.
 *
 * @remarks
 * Construction creates the probe, publishes the `prove` tool, and binds the dual-era dispatcher to
 * the stdio transport. The probe begins warming there, so a harness that spawns the entry pays
 * arming while its client is still handshaking.
 *
 * `start` seizes standard input and registers the two signals a harness ends a child with. It takes
 * a listener capture on each before it does either, and `destroy` releases exactly what appeared
 * between them, so a process that outlives this server reads its own standard input again and
 * receives its own signals. Teardown removes the signal handlers first: it takes seconds when a boot
 * is in flight, and a harness that signals twice means the second one to kill rather than to queue.
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
	readonly #transport: ReturnType<typeof createStdioServer>
	#signals: ListenerCapture | undefined
	#input: ListenerCapture | undefined
	#closing: Promise<void> | undefined

	/**
	 * Creates the probe this server publishes and binds it to this process's stdio transport.
	 *
	 * @param options - Workspace, deadline, and initial observation hooks for the probe it creates
	 */
	constructor(options?: ProbeOptions) {
		this.#probe = new Probe(options)
		this.#transport = createStdioServer(createMCPLegacy(this.#publish()))
	}

	start(): void {
		// The capture is the record of what this server seized, so its presence is also the record
		// that the server is already serving. A second call would otherwise register a second pair of
		// signal handlers and forget the first pair's capture.
		if (this.#signals !== undefined) return
		this.#input = captureListeners(process.stdin, ['data', 'close', 'error'])
		this.#signals = captureListeners(process, ['SIGINT', 'SIGTERM'])
		this.#transport.start()
		process.on('SIGINT', () => {
			void this.destroy()
		})
		process.on('SIGTERM', () => {
			void this.destroy()
		})
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
		if (this.#signals !== undefined) releaseListeners(process, this.#signals)
		this.#signals = undefined
		this.#transport.stop()
		// `@orkestrel/mcp` 0.0.19 closes its transport without detaching the stdin listeners its
		// `start` attached, so the pipe keeps reading and this process's event loop stays alive on a
		// handle nothing is serving. Release what the transport gained and pause the stream, which is
		// the state standard input begins a process in. A later transport that detaches its own
		// listeners leaves this release with nothing to do rather than making it wrong.
		if (this.#input !== undefined) releaseListeners(process.stdin, this.#input)
		this.#input = undefined
		process.stdin.pause()
		await this.#probe.destroy()
	}

	// Advertises `prove` as the one tool this server publishes, and renders each verdict as the text
	// a client reads. The claim guard runs here rather than inside the probe, because a tool call
	// arrives as unknown JSON and the coordinator's contract begins at a `Claim`.
	#publish(): ReturnType<typeof createMCPServer> {
		const parameters = schemaToParameters(compileSchema(CLAIM_SHAPE))
		if (parameters === undefined) {
			throw new Error('The claim schema cannot be advertised as tool parameters')
		}
		const tools = createToolManager()
		tools.add(
			createTool({
				name: 'prove',
				description: 'Proves a claim with type, lint, and runtime evidence.',
				parameters,
				execute: async (input) => {
					if (!isClaim(input)) throw new Error('The prove tool requires a valid claim')
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
				if (!isVerdict(result.value)) throw new Error('The prove tool returned an invalid verdict')
				return {
					resultType: 'complete',
					content: [{ type: 'text', text: formatVerdict(result.value) }],
				}
			},
		})
	}
}
