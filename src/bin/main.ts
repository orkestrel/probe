import { isProbeError } from '@src/core'
import { ProbeServer } from '@src/server'

try {
	new ProbeServer().start()
} catch (error) {
	if (!isProbeError(error)) throw error
	console.error(`[${error.origin}] ${error.code}: ${error.message.split(/\r\n|\n/u).join(' ')}`)
	process.exitCode = 1
}
