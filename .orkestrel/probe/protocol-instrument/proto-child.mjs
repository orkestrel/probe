import { createMCPClient } from '@orkestrel/mcp'
import { createStdioClientTransport } from '@orkestrel/mcp/server'
const revision = process.argv[2]
const options = {
	transport: createStdioClientTransport({
		command: process.execPath,
		args: ['/home/user/probe/dist/bin/main.js'],
	}),
	identity: { name: 'protocol-audit', version: '1.0.0' },
}
if (revision !== 'unpinned') options.version = revision
const client = createMCPClient(options)
const readings = { revision, negotiated: undefined, connect: undefined, list: [], failed: undefined }
try {
	const before = performance.now()
	await client.connect()
	readings.connect = performance.now() - before
	readings.negotiated = client.version
	for (let index = 0; index < 20; index += 1) {
		const start = performance.now()
		await client.tools()
		readings.list.push(performance.now() - start)
	}
} catch (error) {
	readings.failed = error && error.message ? error.message : String(error)
} finally {
	try { await client.disconnect() } catch {}
}
console.log(JSON.stringify(readings))
