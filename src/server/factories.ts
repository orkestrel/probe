import type { ProbeInterface, ProbeOptions } from '@src/core'
import type { ProbeServerInterface } from './types.js'
import { compileSchema, schemaToParameters } from '@orkestrel/contract'
import { createMCPLegacy, createMCPServer } from '@orkestrel/mcp'
import { createStdioServer } from '@orkestrel/mcp/server'
import { createTool, createToolManager } from '@orkestrel/tool'
import { CLAIM_SHAPE, formatVerdict, isClaim, isVerdict } from '@src/core'
import { version } from '../../package.json' with { type: 'json' }
import { Probe } from './Probe.js'

/**
 * Creates a resident probe for one target workspace.
 *
 * @remarks
 * `options.on` installs initial event listeners. `options.error` receives listener throws.
 * `options.workspace` selects the target root and defaults to the current working directory.
 * `options.deadline` limits one runtime stage in milliseconds and defaults to 30,000.
 *
 * @param options - Initial listeners, listener error handler, workspace, and runtime deadline
 * @returns A probe that begins warming at construction
 *
 * @example
 * ```ts
 * const probe = createProbe({
 * 	workspace: process.cwd(),
 * 	deadline: 30_000,
 * 	on: { arm: (toolchain) => console.log(toolchain.typescript) },
 * 	error: (error) => console.error(error),
 * })
 * console.log(probe.toolchain.vitest)
 * await probe.destroy()
 * ```
 */
export function createProbe(options?: ProbeOptions): ProbeInterface {
	return new Probe(options)
}

/**
 * Creates the dual-era Model Context Protocol stdio server for a probe.
 *
 * @param probe - The resident probe the `prove` tool drives
 * @returns A stdio server handle ready to start
 *
 * @example
 * ```ts
 * const probe = createProbe({ workspace: process.cwd() })
 * const server = createProbeServer(probe)
 * server.start()
 * server.stop()
 * await probe.destroy()
 * ```
 */
export function createProbeServer(probe: ProbeInterface): ProbeServerInterface {
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
				return probe.prove(input)
			},
		}),
	)
	const mcp = createMCPServer({
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
	return createStdioServer(createMCPLegacy(mcp))
}
