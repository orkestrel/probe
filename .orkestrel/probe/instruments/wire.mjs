import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
const child = spawn(process.execPath, ['dist/bin/main.js'], { cwd: '/workspace/probe', stdio: 'pipe' })
let err = ''
child.stderr.on('data', (c) => { err += c })
child.on('exit', (code, sig) => console.log(`[child exited code=${code} signal=${sig}]`))
const pending = new Map(); let id = 0
createInterface({ input: child.stdout }).on('line', (l) => {
	if (!l.trim()) return
	console.log('[stdout line]', l.slice(0, 160))
	let b; try { b = JSON.parse(l) } catch { return }
	const r = pending.get(b.id); if (r) { pending.delete(b.id); r(b) }
})
const send = (m, p) => {
	const x = { jsonrpc: '2.0', id: ++id, method: m, ...(p === undefined ? {} : { params: p }) }
	child.stdin.write(JSON.stringify(x) + '\n')
	return new Promise((res, rej) => { pending.set(x.id, res); setTimeout(() => rej(new Error('timeout on ' + m)), 45_000) })
}
try {
	const init = await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'oc', version: '1' } })
	console.log('INITIALIZE OK ->', JSON.stringify(init.result?.serverInfo ?? init.error))
	const list = await send('tools/list', {})
	console.log('TOOLS/LIST OK ->', (list.result?.tools ?? []).map((t) => t.name).join(', ') || JSON.stringify(list.error))
} catch (e) {
	console.log('FAILED:', e.message)
	console.log('stderr captured:', JSON.stringify(err.slice(0, 800)))
}
child.kill('SIGTERM')
