import { ProbeError } from '@src/core'
import { createHandshakeError } from '@src/server'
import { JSONRPC_SERVER_ERROR, MCPError } from '@orkestrel/mcp'
import { describe, expect, it } from 'vitest'

describe('createHandshakeError', () => {
	it('carries the probe failure in the MCP server error answer', () => {
		const failure = new ProbeError('The lint stage could not start', {
			origin: 'workspace',
			code: 'missing',
			context: { stage: 'lint' },
		})
		const error = createHandshakeError(failure)

		expect(error).toBeInstanceOf(MCPError)
		expect(error.code).toBe(JSONRPC_SERVER_ERROR)
		expect(error.code).toBe(-32000)
		expect(error.context).toStrictEqual({ origin: failure.origin, code: failure.code })
		expect(error.message).toBe('[workspace] missing: The lint stage could not start')
	})
})
