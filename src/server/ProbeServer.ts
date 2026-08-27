import type { ProbeInterface, ProbeOptions, Verdict } from '@src/core'
import type { MCPCallResult, MCPExecutionContext } from '@orkestrel/mcp'
import type { ToolResult } from '@orkestrel/tool'
import type { ProbeServerInterface } from './types.js'
import { PassThrough } from 'node:stream'
import { compileSchema, schemaToParameters } from '@orkestrel/contract'
import { DEFAULT_MCP_LIMITS, createMCPLegacy, createMCPServer, isBoundedJSON } from '@orkestrel/mcp'
import { createStdioServer } from '@orkestrel/mcp/server'
import { createTool, createToolManager } from '@orkestrel/tool'
import {
	CLAIM_SHAPE,
	PROBE_KEYS,
	ProbeError,
	createDestroyedError,
	formatVerdict,
	isClaim,
	isVerdict,
} from '@src/core'
import { version } from '../../package.json' with { type: 'json' }
import { findRefusedPaths } from './helpers.js'
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
	// The bounds this server judges its own answer by, and the source of the key bound it
	// publishes. `@orkestrel/mcp` counts total enumerable keys across a bounded value and applies
	// one bound to inbound metadata and to produced tool content alike, and its default leaf is
	// sized for metadata: a verdict costs 38 keys empty and 11 more for each issue a stage reports,
	// so the default carries a verdict whose control refuses one declaration and stops carrying the
	// next one. It stops by replacing the whole answer with a JSON-RPC internal error, which costs
	// the rendered text and its receipt as well as the record. This bound leaves the byte bounds the
	// binding ones for a verdict a real claim produces. It reaches inbound metadata too, whose own
	// 16 KiB byte limit is unchanged.
	readonly #limits = {
		bytes: DEFAULT_MCP_LIMITS.content,
		keys: PROBE_KEYS,
		depth: DEFAULT_MCP_LIMITS.depth,
	}
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
				description:
					"Answers whether a TypeScript edit compiles, lints, and passes its test in this workspace — call it before relying on such a claim, instead of reasoning or writing a throwaway probe. Supply the edit you believe is correct and an edit that must break with the stage it breaks at; the closing line is a receipt only when the case ran clean and the control broke exactly at its declared stage, and no receipt otherwise. For a performance claim, measure before proving: write a guarded bench block — if (import.meta.env.MODE === 'benchmark') — beside the probe test, run the workspace bench script, and record only magnitudes; a settled ratio then proves here as an ordinary runtime claim.",
				parameters,
				execute: this.#prove.bind(this),
			}),
		)
		return createMCPServer({
			identity: { name: 'probe', version },
			tools,
			limit: { keys: this.#limits.keys },
			execution: this.#execute.bind(this),
		})
	}

	async #prove(input: Readonly<Record<string, unknown>>): Promise<Verdict> {
		if (!isClaim(input)) {
			const refused = findRefusedPaths(input)
			throw new ProbeError(
				refused.length === 0
					? 'The prove tool requires a claim matching the advertised schema'
					: `The prove tool refuses ${refused.join(', ')}: a draft path must stay inside the workspace, which the advertised schema does not constrain`,
				{
					origin: 'claimant',
					code: 'refused',
					context: { value: input },
				},
			)
		}
		return this.#probe.prove(input)
	}

	async #execute(context: MCPExecutionContext): Promise<ToolResult | MCPCallResult> {
		const result = await context.tools.execute(context.call)
		if (!result.success) return result
		if (!isVerdict(result.value)) {
			throw new ProbeError('The prove tool returned an invalid verdict', {
				origin: 'instrument',
				code: 'malformed',
				context: { value: result.value },
			})
		}
		const rendered: MCPCallResult = {
			resultType: 'complete',
			content: [{ type: 'text', text: formatVerdict(result.value) }],
		}
		// The record travels beside the text rather than in place of it, and `isBoundedJSON` is what
		// admits a `Verdict` into a field the protocol types as JSON. The rendered text is the answer
		// a client always gets: a result the published bounds refuse reaches it as a JSON-RPC
		// internal error instead, which would cost the receipt to carry the record, so an unbounded
		// pair falls back to the text alone.
		if (!isBoundedJSON(result.value, this.#limits)) return rendered
		const carried: MCPCallResult = { ...rendered, structuredContent: result.value }
		return isBoundedJSON(carried, this.#limits) ? carried : rendered
	}
}
