import type { ProbeError } from '@src/core'
import { JSONRPC_SERVER_ERROR, MCPError } from '@orkestrel/mcp'

/**
 * Creates the protocol failure returned when the MCP handshake cannot arm the probe.
 *
 * @param error - The classified probe failure that ended initialization
 * @returns An MCP server error carrying the probe failure's origin and code as protocol data
 *
 * @example
 * ```ts
 * createHandshakeError(createDestroyedError('probe server')).code // -32000
 * ```
 */
export function createHandshakeError(error: ProbeError): MCPError {
	return new MCPError(`[${error.origin}] ${error.code}: ${error.message}`, JSONRPC_SERVER_ERROR, {
		origin: error.origin,
		code: error.code,
	})
}
