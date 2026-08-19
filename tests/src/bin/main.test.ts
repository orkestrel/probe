import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { waitForDelay } from '@orkestrel/test'
import { createScratch } from '@orkestrel/test/server'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const ENTRY = 'src/bin/main.ts'
const BUILT_ENTRY = resolve(ROOT, 'dist/bin/main.js')

describe('bin entry', () => {
	it('occupies the path the manifest declares side-effectful', () => {
		const manifest: unknown = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
		expect(manifest).toMatchObject({ sideEffects: expect.arrayContaining([`./${ENTRY}`]) })
		expect(existsSync(resolve(ROOT, ENTRY))).toBe(true)
	})

	it('starts one probe server and exports nothing', () => {
		const source = readFileSync(resolve(ROOT, ENTRY), 'utf8')
		expect(source).toContain('createProbeServer(createProbe()).start()')
		expect(source).not.toContain('export')
	})

	it(
		'answers legacy and modern requests through the built stdio entry',
		{ timeout: 60_000 },
		async () => {
			const modern = {
				'io.modelcontextprotocol/protocolVersion': '2026-07-28',
				'io.modelcontextprotocol/clientCapabilities': {},
				'io.modelcontextprotocol/clientInfo': { name: 'probe-test', version: '1.0.0' },
			}
			expect(Object.keys(modern).sort()).toStrictEqual([
				'io.modelcontextprotocol/clientCapabilities',
				'io.modelcontextprotocol/clientInfo',
				'io.modelcontextprotocol/protocolVersion',
			])
			const requests = [
				{
					jsonrpc: '2.0',
					id: 1,
					method: 'initialize',
					params: {
						protocolVersion: '2025-06-18',
						capabilities: {},
						clientInfo: { name: 'probe-test', version: '1.0.0' },
					},
				},
				{ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
				{ jsonrpc: '2.0', id: 3, method: 'tools/list', params: { _meta: modern } },
				{
					jsonrpc: '2.0',
					id: 4,
					method: 'tools/call',
					params: {
						name: 'prove',
						arguments: {
							project: 'configs/src/tsconfig.core.json',
							case: {
								files: [{ path: 'src/core/wire.ts', text: "export const VALUE = 'ok'\n" }],
								test: {
									path: 'tmp/probe/wire.test.ts',
									text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
								},
							},
							control: {
								files: [
									{
										path: 'src/core/wire.ts',
										text: "export const VALUE: number = 'bad'\n",
									},
								],
								test: {
									path: 'tmp/probe/wire.test.ts',
									text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
								},
								stage: 'type',
								reason: 'the source assigns a string to a number',
							},
						},
						_meta: modern,
					},
				},
			]
			const child = spawn(
				'/usr/bin/script',
				['-qfec', 'stty -echo; exec "$PROBE_NODE" "$PROBE_ENTRY"', '/dev/null'],
				{
					cwd: ROOT,
					stdio: ['pipe', 'pipe', 'pipe'],
					env: {
						...process.env,
						PROBE_ENTRY: BUILT_ENTRY,
						PROBE_NODE: process.execPath,
					},
				},
			)
			const lines: string[] = []
			const errors: Buffer[] = []
			child.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
			const output = createInterface({ input: child.stdout })
			try {
				await waitForDelay(250)
				child.stdin.write(requests.map((request) => JSON.stringify(request)).join('\n') + '\n')
				for await (const line of output) {
					const start = line.indexOf('{')
					if (start >= 0) lines.push(line.slice(start))
					if (lines.length === requests.length) break
				}
				expect(lines).toHaveLength(4)
				expect(Buffer.concat(errors).toString('utf8')).not.toContain('Error')
				const responses: readonly unknown[] = lines.map((line) => JSON.parse(line))
				expect(responses).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							id: 1,
							result: expect.objectContaining({
								protocolVersion: '2025-06-18',
								serverInfo: { name: 'probe', version: '0.0.1' },
							}),
						}),
						expect.objectContaining({
							id: 2,
							result: expect.objectContaining({
								tools: [expect.objectContaining({ name: 'prove' })],
							}),
						}),
						expect.objectContaining({
							id: 3,
							result: expect.objectContaining({
								tools: [expect.objectContaining({ name: 'prove' })],
							}),
						}),
						expect.objectContaining({
							id: 4,
							result: expect.objectContaining({
								content: [
									expect.objectContaining({
										type: 'text',
										text: expect.stringMatching(/^probe .+receipt probe:/s),
									}),
								],
							}),
						}),
					]),
				)
				const call = lines.find((line) => line.includes('"id":4'))
				expect(call).toContain('"text":"probe ')
				expect(call).not.toContain('"text":"\\"probe ')
			} finally {
				output.close()
				if (child.exitCode === null) {
					const exited = new Promise<void>((resolveExit) => {
						child.once('exit', () => resolveExit())
					})
					child.kill('SIGTERM')
					await exited
				}
			}
		},
	)

	it(
		'records the arming dependency leak when the entry is killed during boot',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch()
			scratch.write('package.json', '{}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			const directory = resolve(scratch.path, 'tmp/probe')
			const child = spawn(process.execPath, [BUILT_ENTRY], {
				cwd: scratch.path,
				stdio: ['pipe', 'pipe', 'pipe'],
			})
			const exited = new Promise<void>((resolveExit) => {
				child.once('exit', () => resolveExit())
			})
			let leaked: readonly string[] = []
			try {
				await waitForDelay(750)
				const arming = readdirSync(directory).filter(
					(name) => name.startsWith('arm-type-') || name.startsWith('arm-runtime-'),
				)
				expect(arming).toHaveLength(2)
				child.kill('SIGTERM')
				await exited
				leaked = readdirSync(directory).filter(
					(name) => name.startsWith('arm-type-') || name.startsWith('arm-runtime-'),
				)
				expect([...leaked].sort()).toStrictEqual(arming.sort())
			} finally {
				if (child.exitCode === null) {
					child.kill('SIGTERM')
					await exited
				}
				for (const name of leaked) rmSync(resolve(directory, name), { force: true })
				scratch.destroy()
			}
		},
	)
})
