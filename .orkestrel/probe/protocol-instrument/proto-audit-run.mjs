import { spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync } from 'node:fs'

const consumer = '/tmp/claude-0/-home-user/c32a4fba-a43a-5868-8bb6-99eb4bc6d839/scratchpad/mcp-drive-proto'
copyFileSync('/tmp/claude-0/-home-user/c32a4fba-a43a-5868-8bb6-99eb4bc6d839/scratchpad/proto-child.mjs', `${consumer}/proto-child.mjs`)
const rounds = Number(process.argv[2] ?? 10)
const revisions = ['unpinned', '2026-07-28', '2025-11-25', '2025-06-18']
const collected = []
for (let round = 0; round < rounds; round += 1) {
	for (const revision of revisions) {
		const result = spawnSync(process.execPath, [`${consumer}/proto-child.mjs`, revision], {
			encoding: 'utf8',
			timeout: 120_000,
			cwd: '/home/user/probe',
		})
		const line = (result.stdout ?? '').trim().split('\n').at(-1) ?? ''
		collected.push(line)
		appendFileSync(`${consumer}/readings.ndjson`, line + '\n')
	}
}
const median = (values) => {
	const sorted = [...values].sort((left, right) => left - right)
	return sorted[Math.floor(sorted.length / 2)]
}
const parsed = collected.map((line) => { try { return JSON.parse(line) } catch { return undefined } }).filter(Boolean)
for (const revision of revisions) {
	const rows = parsed.filter((row) => row.revision === revision)
	const ok = rows.filter((row) => row.failed === undefined)
	const lists = ok.flatMap((row) => row.list)
	console.log(JSON.stringify({
		revision,
		runs: rows.length,
		completed: ok.length,
		negotiated: [...new Set(ok.map((row) => row.negotiated))],
		connectMedianMs: ok.length ? Math.round(median(ok.map((row) => row.connect)) * 10) / 10 : undefined,
		listMedianMs: lists.length ? Math.round(median(lists) * 100) / 100 : undefined,
		failures: [...new Set(rows.filter((row) => row.failed !== undefined).map((row) => String(row.failed).slice(0, 90)))],
	}))
}
