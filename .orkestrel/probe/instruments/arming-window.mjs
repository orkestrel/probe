// How wide is the window between arming creating tmp/probe and cleanup removing it?
// Sampled every 15ms so the repair unit's brief carries a real number rather than a guess.
import { readdirSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
const { createScratch } = await import('/workspace/probe/node_modules/@orkestrel/test/dist/src/server/index.js')
const BUILT_ENTRY = '/workspace/probe/dist/bin/main.js'
const runs = []
for (let run = 0; run < 3; run += 1) {
	const scratch = createScratch()
	scratch.write('package.json', '{}\n')
	scratch.link('node_modules', '/workspace/probe/node_modules')
	const directory = resolve(scratch.path, 'tmp/probe')
	const child = spawn(process.execPath, [BUILT_ENTRY], { cwd: scratch.path, stdio: ['pipe', 'pipe', 'pipe'] })
	child.stderr.resume(); child.stdout.resume()
	const start = Date.now()
	let appeared, vanished
	for (let i = 0; i < 200; i += 1) {
		const n = existsSync(directory) ? readdirSync(directory).filter((x) => x.startsWith('arm-')).length : -1
		if (appeared === undefined && n >= 2) appeared = Date.now() - start
		if (appeared !== undefined && vanished === undefined && n < 2) { vanished = Date.now() - start; break }
		await new Promise((r) => setTimeout(r, 15))
	}
	runs.push({ run: run + 1, appeared, vanished, window: appeared !== undefined && vanished !== undefined ? vanished - appeared : undefined })
	child.kill('SIGKILL'); scratch.destroy()
}
for (const r of runs) console.log(`run ${r.run}: armed at ${r.appeared}ms, gone by ${r.vanished}ms, window ${r.window}ms  (the test reads at 750ms)`)
