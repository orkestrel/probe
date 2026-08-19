// Reproduces tests/src/bin/main.test.ts:326 exactly, including createScratch and piped-but-unread
// stdio, and then reads the child's stderr — which the test discards, so a crash is invisible to it.
import { readdirSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
const { createScratch } = await import('/workspace/probe/node_modules/@orkestrel/test/dist/src/server/index.js')
const ROOT = '/workspace/probe/'
const BUILT_ENTRY = resolve(ROOT, 'dist/bin/main.js')

const scratch = createScratch()
scratch.write('package.json', '{}\n')
scratch.link('node_modules', resolve(ROOT, 'node_modules'))
const directory = resolve(scratch.path, 'tmp/probe')
console.log('scratch.path      =', scratch.path)
console.log('node_modules link =', existsSync(resolve(scratch.path, 'node_modules')))
console.log('BUILT_ENTRY exists=', existsSync(BUILT_ENTRY))

const child = spawn(process.execPath, [BUILT_ENTRY], { cwd: scratch.path, stdio: ['pipe', 'pipe', 'pipe'] })
let err = '', out = ''
child.stderr.setEncoding('utf8'); child.stderr.on('data', (c) => { err += c })
child.stdout.setEncoding('utf8'); child.stdout.on('data', (c) => { out += c })
let exit = null
child.once('exit', (code, signal) => { exit = `${code}/${signal}` })

for (const ms of [250, 500, 750, 1500, 3000, 6000]) {
	await new Promise((r) => setTimeout(r, ms === 250 ? 250 : ms - (ms === 500 ? 250 : ms === 750 ? 500 : ms === 1500 ? 750 : ms === 3000 ? 1500 : 3000)))
	const present = existsSync(directory)
	const names = present ? readdirSync(directory).filter((n) => n.startsWith('arm-type-') || n.startsWith('arm-runtime-')) : []
	console.log(`t=${String(ms).padStart(4)}ms dirExists=${present} armingFiles=${names.length} childExit=${exit}`)
}
console.log('--- child stderr ---'); console.log(err.slice(0, 2000) || '(empty)')
console.log('--- child stdout (first 400) ---'); console.log(out.slice(0, 400) || '(empty)')
child.kill('SIGKILL')
scratch.destroy()
