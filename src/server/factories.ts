import type { ProbeInterface, ProbeOptions } from '@src/core'
import { compileSchema } from '@orkestrel/contract'
import { createMCPLegacy, createMCPServer } from '@orkestrel/mcp'
import { createStdioServer } from '@orkestrel/mcp/server'
import { createTool, createToolManager } from '@orkestrel/tool'
import { CLAIM_SHAPE, formatVerdict, isClaim, isVerdict } from '@src/core'
import manifest from '../../package.json' with { type: 'json' }
import { Probe } from './Probe.js'

/**
 * Creates a resident probe for one target workspace.
 *
 * @param options - Workspace, deadline, and initial observation hooks
 * @returns A probe that begins warming at construction
 */
export function createProbe(options?: ProbeOptions): ProbeInterface {
	return new Probe(options)
}

/**
 * Creates the dual-era Model Context Protocol stdio server for a probe.
 *
 * @param probe - The resident probe the `prove` tool drives
 * @returns A stdio server handle ready to start
 */
export function createProbeServer(probe: ProbeInterface): ReturnType<typeof createStdioServer> {
	const tools = createToolManager()
	tools.add(
		createTool({
			name: 'prove',
			description: 'Proves a claim with type, lint, and runtime evidence.',
			parameters: Object.fromEntries(Object.entries(compileSchema(CLAIM_SHAPE))),
			execute: async (input) => {
				if (!isClaim(input)) throw new Error('The prove tool requires a valid claim')
				return probe.prove(input)
			},
		}),
	)
	const mcp = createMCPServer({
		identity: { name: 'probe', version: manifest.version },
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
