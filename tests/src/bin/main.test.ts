import type { ScratchInterface } from '@orkestrel/test/server'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createMCPClient } from '@orkestrel/mcp'
import { createStdioClientTransport } from '@orkestrel/mcp/server'
import { waitForDelay } from '@orkestrel/test'
import { createScratch } from '@orkestrel/test/server'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const ENTRY = 'src/bin/main.ts'
const BUILT_ENTRY = resolve(ROOT, 'dist/bin/main.js')
// The program that gives the entry a real terminal, by running it inside a pseudo-terminal session.
// A proof needing one spawns this exact path, and skips where the path names no file: Git Bash on
// Windows ships no `script` program, so the fixture these proofs drive is absent there. The skip
// cites that absent binary and claims nothing about other terminals the host can build — a host
// with no `script` can still have programs that present a pseudo-terminal, and a proof driving one
// of those is a fixture this file does not have rather than a proof this host cannot hold. Reading
// the spawned path keeps the condition a statement about this filesystem rather than about the
// platform name.
const TERMINAL = '/usr/bin/script'
const ARMING_TIMEOUT = 30_000
// The wall clock a graceful teardown is given, from the signal to the child's exit. A boot-time
// teardown awaits the boot in flight, which measured 2.3 s on the host `guides/probe.md` § Cost
// names; this bound sits far above that so a loaded host reports a hang rather than its own load.
const TEARDOWN_BOUND = 60_000
const DELIVERIES = [
	{ signal: 'SIGTERM', phase: 'boot' },
	{ signal: 'SIGINT', phase: 'boot' },
	{ signal: 'SIGTERM', phase: 'service' },
	{ signal: 'SIGINT', phase: 'service' },
] as const

// A bare child that answers a termination signal the way the entry does: a handler that exits 0. It
// announces on its standard output that the handler is installed, so a parent signals it only after
// the handler is in place, and the timer holds it open until the signal arrives.
const HANDLED = [
	"for (const name of ['SIGTERM', 'SIGINT']) process.on(name, () => process.exit(0))",
	"process.stdout.write('armed')",
	'setTimeout(() => {}, 10_000)',
].join('\n')
// The same child with no handler. It cannot exit 0 on a signal, which is what makes it the control
// for the reading that follows.
const UNHANDLED = ["process.stdout.write('armed')", 'setTimeout(() => {}, 10_000)'].join('\n')

function readWorkbench(directory: string): readonly string[] {
	try {
		return readdirSync(directory)
	} catch (error: unknown) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
		throw error
	}
}

function readArming(directory: string): readonly string[] {
	return readWorkbench(directory).filter((name) => name.startsWith('arm-'))
}

async function waitForArming(directory: string): Promise<readonly string[]> {
	const deadline = performance.now() + ARMING_TIMEOUT
	do {
		const arming = readArming(directory)
		if (arming.length === 2) return arming
		await waitForDelay(10)
	} while (performance.now() < deadline)
	throw new Error(`Timed out waiting for two arming files in ${directory}`)
}

// Waits for the boot to finish rather than for the `arm` event, which no observer outside the
// process can read. The boot dependencies exist for the whole boot and are removed as it ends,
// so their disappearance is the same moment from out here.
async function waitForArmed(directory: string): Promise<void> {
	await waitForArming(directory)
	const deadline = performance.now() + ARMING_TIMEOUT
	do {
		if (readArming(directory).length === 0) return
		await waitForDelay(10)
	} while (performance.now() < deadline)
	throw new Error(`Timed out waiting for the boot to end in ${directory}`)
}

// Reads how this host ends a child that `child.kill` signals, phrased the way the entry's own exit
// is read. A host that delivers the signal to the child runs whatever handler the child installed,
// and the child exits under its own code; a host that terminates the child instead reports the
// signal and runs no handler. `child.kill` is the door the proofs below use, and the door decides,
// so this reading comes through the same one.
async function readSignalEnding(
	signal: NodeJS.Signals,
	program: string,
): Promise<{ readonly code: number | null; readonly signal: string | null }> {
	const child = spawn(process.execPath, ['-e', program], { stdio: ['ignore', 'pipe', 'ignore'] })
	const ended = new Promise<{ code: number | null; signal: string | null }>((settle) => {
		child.once('exit', (code, ending) => settle({ code, signal: ending }))
	})
	await new Promise<void>((armed) => {
		child.stdout.once('data', () => armed())
	})
	child.kill(signal)
	return await ended
}

// Builds a target the entry can really arm against: a peer-resolution or configuration failure
// surfaces at stage construction, so a workspace missing its TypeScript project or its Vitest
// configuration aborts the boot at a point that varies per run.
function writeTarget(scratch: ScratchInterface): void {
	scratch.write('package.json', '{}\n')
	scratch.link('node_modules', resolve(ROOT, 'node_modules'))
	scratch.write(
		'tsconfig.json',
		'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","strict":true,"types":[]}}\n',
	)
	scratch.write(
		'vite.config.ts',
		"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: { label: 'probe' }, include: ['tmp/probe/**/*.test.ts'], environment: 'node' } }] } })\n",
	)
}

describe('bin entry', () => {
	it('occupies the path the manifest declares side-effectful', () => {
		const manifest: unknown = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
		expect(manifest).toMatchObject({ sideEffects: expect.arrayContaining([`./${ENTRY}`]) })
		expect(existsSync(resolve(ROOT, ENTRY))).toBe(true)
	})

	it('starts one probe server and exports nothing', () => {
		const source = readFileSync(resolve(ROOT, ENTRY), 'utf8')
		expect(source).toContain('new ProbeServer().start()')
		expect(source).not.toContain('export')
	})

	it('reports a construction refusal as a formatted stderr line without a stack', async () => {
		const scratch = createScratch({ files: { 'package.json': '{}\n' } })
		const child = spawn(process.execPath, [BUILT_ENTRY], {
			cwd: scratch.path,
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		const output: Buffer[] = []
		const errors: Buffer[] = []
		child.stdout.on('data', (chunk: Buffer) => output.push(chunk))
		child.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
		try {
			const status = await new Promise<number | null>((resolveClose) => {
				child.once('close', (code) => resolveClose(code))
			})
			const reported = Buffer.concat(errors).toString('utf8')
			expect(status).toBe(1)
			expect(Buffer.concat(output).toString('utf8')).toBe('')
			expect(reported).toContain(
				'[workspace] missing: typescript does not publish a readable manifest\n',
			)
			expect(reported).not.toContain('ProbeError:')
		} finally {
			if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
			scratch.destroy()
		}
	})

	it.skipIf(!existsSync(TERMINAL))(
		'answers both protocol eras without exposing worker output on stdout',
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
			const passing = {
				project: 'configs/src/tsconfig.core.json',
				case: {
					files: [{ path: 'src/core/wire.ts', text: "export const VALUE = 'ok'\n" }],
					test: {
						path: 'tmp/probe/bin/wire-runtime.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
					},
				},
				control: {
					files: [{ path: 'src/core/wire.ts', text: "export const VALUE: number = 'bad'\n" }],
					test: {
						path: 'tmp/probe/bin/wire-runtime.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
					},
					stage: 'type',
					reason: 'the source assigns a string to a number',
				},
			}
			const withoutNewline = {
				...passing,
				case: {
					...passing.case,
					test: {
						path: 'tmp/probe/bin/wire-without-newline-runtime.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('writes', () => { process.stdout.write('worker-without-newline'); expect(2 + 2).toBe(4) })\n",
					},
				},
				control: {
					...passing.control,
					test: {
						path: 'tmp/probe/bin/wire-without-newline-runtime.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('writes', () => { process.stdout.write('worker-without-newline'); expect(2 + 2).toBe(4) })\n",
					},
				},
			}
			const withNewline = {
				...passing,
				case: {
					...passing.case,
					test: {
						path: 'tmp/probe/bin/wire-with-newline-runtime.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('writes', () => { process.stdout.write('worker-with-newline\\n'); expect(2 + 2).toBe(4) })\n",
					},
				},
				control: {
					...passing.control,
					test: {
						path: 'tmp/probe/bin/wire-with-newline-runtime.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('writes', () => { process.stdout.write('worker-with-newline\\n'); expect(2 + 2).toBe(4) })\n",
					},
				},
			}
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
						arguments: passing,
						_meta: modern,
					},
				},
				{
					jsonrpc: '2.0',
					id: 5,
					method: 'tools/call',
					params: { name: 'prove', arguments: withoutNewline, _meta: modern },
				},
				{
					jsonrpc: '2.0',
					id: 6,
					method: 'tools/call',
					params: { name: 'prove', arguments: withNewline, _meta: modern },
				},
			]
			const directory = resolve(ROOT, 'tmp/probe/bin')
			mkdirSync(directory, { recursive: true })
			const child = spawn(
				TERMINAL,
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
					const frame = line.replaceAll('\u001b[?25l', '').replaceAll('\u001b[?25h', '')
					if (frame.trim() !== '') lines.push(frame)
					if (lines.length === requests.length) break
				}
				expect(lines).toHaveLength(6)
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
						expect.objectContaining({
							id: 5,
							result: expect.objectContaining({
								content: [
									expect.objectContaining({
										type: 'text',
										text: expect.stringMatching(/^probe .+receipt probe:/s),
									}),
								],
							}),
						}),
						expect.objectContaining({
							id: 6,
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
				try {
					rmdirSync(directory)
				} catch {}
			}
		},
	)

	// A foreign client, not this file's own line writer: `@orkestrel/mcp`'s stdio client spawns the
	// shipped entry, negotiates the era, and correlates the reply itself. What it hands back is the
	// reply shape § Registering the server documents — one rendered text block whose closing line
	// carries the receipt — read through a client that knows nothing about this package.
	it('answers a driven third-party client with one text block', { timeout: 120_000 }, async () => {
		const claim = {
			project: 'configs/src/tsconfig.core.json',
			case: {
				files: [{ path: 'src/core/client.ts', text: "export const VALUE = 'ok'\n" }],
				test: {
					path: 'tmp/probe/bin/client-runtime.test.ts',
					text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
				},
			},
			control: {
				files: [{ path: 'src/core/client.ts', text: "export const VALUE: number = 'bad'\n" }],
				test: {
					path: 'tmp/probe/bin/client-runtime.test.ts',
					text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
				},
				stage: 'type',
				reason: 'the source assigns a string to a number',
			},
		}
		const directory = resolve(ROOT, 'tmp/probe/bin')
		mkdirSync(directory, { recursive: true })
		const client = createMCPClient({
			transport: createStdioClientTransport({
				command: process.execPath,
				args: [BUILT_ENTRY],
			}),
			identity: { name: 'probe-foreign-client', version: '1.0.0' },
			// Well above the client's own default, because the first call waits on arming and this
			// deadline is here to catch a hang rather than to grade the host.
			timeout: 300_000,
		})
		try {
			await client.connect()
			expect(client.connected).toBe(true)
			expect(client.version).toBeDefined()
			const tools = await client.tools()
			expect(tools.map((tool) => tool.name)).toStrictEqual(['prove'])
			expect(tools[0]?.description).toContain('measure before proving')
			expect(tools[0]?.description).toContain("import.meta.env.MODE === 'benchmark'")
			const outcome = await client.call('prove', claim)
			expect(outcome.resultType).toBe('complete')
			if (outcome.resultType !== 'complete') return
			// A string rather than a record: the tool answers with rendered text, so a client holding
			// the reply holds `formatVerdict`'s output and not the `Verdict` the process built.
			expect(typeof outcome.value).toBe('string')
			const text = String(outcome.value)
			expect(text.startsWith('probe ')).toBe(true)
			expect(text.trimEnd().split('\n').at(-1)).toMatch(/^receipt probe:/)
		} finally {
			await client.disconnect()
			try {
				rmdirSync(directory)
			} catch {}
		}
	})

	it(
		'answers a pinned legacy client through the initialize path',
		{ timeout: 120_000 },
		async () => {
			const claim = {
				project: 'configs/src/tsconfig.core.json',
				case: {
					files: [{ path: 'src/core/legacy.ts', text: "export const VALUE = 'ok'\n" }],
					test: {
						path: 'tmp/probe/bin/legacy-runtime.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
					},
				},
				control: {
					files: [{ path: 'src/core/legacy.ts', text: "export const VALUE: number = 'bad'\n" }],
					test: {
						path: 'tmp/probe/bin/legacy-runtime.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
					},
					stage: 'type',
					reason: 'the source assigns a string to a number',
				},
			}
			const directory = resolve(ROOT, 'tmp/probe/bin')
			mkdirSync(directory, { recursive: true })
			const client = createMCPClient({
				transport: createStdioClientTransport({
					command: process.execPath,
					args: [BUILT_ENTRY],
				}),
				identity: { name: 'probe-foreign-client', version: '1.0.0' },
				// Well above the client's own default, because the first call waits on arming and this
				// deadline is here to catch a hang rather than to grade the host.
				timeout: 300_000,
				version: '2025-06-18',
			})
			try {
				await client.connect()
				expect(client.connected).toBe(true)
				expect(client.version).toBe('2025-06-18')
				const tools = await client.tools()
				expect(tools.map((tool) => tool.name)).toStrictEqual(['prove'])
				expect(tools[0]?.description).toContain('measure before proving')
				expect(tools[0]?.description).toContain("import.meta.env.MODE === 'benchmark'")
				const outcome = await client.call('prove', claim)
				expect(outcome.resultType).toBe('complete')
				if (outcome.resultType !== 'complete') return
				// A string rather than a record: the tool answers with rendered text, so a client holding
				// the reply holds `formatVerdict`'s output and not the `Verdict` the process built.
				expect(typeof outcome.value).toBe('string')
				const text = String(outcome.value)
				expect(text.startsWith('probe ')).toBe(true)
				expect(text.trimEnd().split('\n').at(-1)).toMatch(/^receipt probe:/)
			} finally {
				await client.disconnect()
				try {
					rmdirSync(directory)
				} catch {}
			}
		},
	)

	it.skipIf(!existsSync(TERMINAL))(
		'preserves worker diagnostics on stderr',
		{ timeout: 60_000 },
		async () => {
			const modern = {
				'io.modelcontextprotocol/protocolVersion': '2026-07-28',
				'io.modelcontextprotocol/clientCapabilities': {},
				'io.modelcontextprotocol/clientInfo': { name: 'probe-test', version: '1.0.0' },
			}
			const request = {
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: {
					name: 'prove',
					arguments: {
						project: 'configs/src/tsconfig.core.json',
						case: {
							files: [{ path: 'src/core/stderr.ts', text: "export const VALUE = 'ok'\n" }],
							test: {
								path: 'tmp/probe/bin/stderr-runtime.test.ts',
								text: "import { expect, test } from 'vitest'\ntest('warns', () => { process.emitWarning('worker-stderr-marker'); expect(2 + 2).toBe(4) })\n",
							},
						},
						control: {
							files: [{ path: 'src/core/stderr.ts', text: "export const VALUE: number = 'bad'\n" }],
							test: {
								path: 'tmp/probe/bin/stderr-runtime.test.ts',
								text: "import { expect, test } from 'vitest'\ntest('warns', () => { process.emitWarning('worker-stderr-marker'); expect(2 + 2).toBe(4) })\n",
							},
							stage: 'type',
							reason: 'the source assigns a string to a number',
						},
					},
					_meta: modern,
				},
			}
			const directory = resolve(ROOT, 'tmp/probe/bin')
			mkdirSync(directory, { recursive: true })
			const diagnostic = resolve(directory, 'worker-stderr.txt')
			const child = spawn(
				TERMINAL,
				['-qfec', 'stty -echo; exec "$PROBE_NODE" "$PROBE_ENTRY" 2>"$PROBE_STDERR"', '/dev/null'],
				{
					cwd: ROOT,
					stdio: ['pipe', 'pipe', 'pipe'],
					env: {
						...process.env,
						PROBE_ENTRY: BUILT_ENTRY,
						PROBE_NODE: process.execPath,
						PROBE_STDERR: diagnostic,
					},
				},
			)
			const output = createInterface({ input: child.stdout })
			try {
				await waitForDelay(250)
				child.stdin.write(JSON.stringify(request) + '\n')
				let response: unknown
				for await (const line of output) {
					const frame = line.replaceAll('\u001b[?25l', '').replaceAll('\u001b[?25h', '')
					if (frame.trim() === '') continue
					response = JSON.parse(frame)
					break
				}
				expect(response).toMatchObject({
					id: 1,
					result: {
						content: [
							expect.objectContaining({
								type: 'text',
								text: expect.stringMatching(/^probe .+receipt probe:/s),
							}),
						],
					},
				})
				expect(readFileSync(diagnostic, 'utf8')).toContain('worker-stderr-marker')
			} finally {
				output.close()
				if (child.exitCode === null) {
					const exited = new Promise<void>((resolveExit) => {
						child.once('exit', () => resolveExit())
					})
					child.kill('SIGTERM')
					await exited
				}
				rmSync(diagnostic, { force: true })
				try {
					rmdirSync(directory)
				} catch {}
			}
		},
	)

	// The signals, and the moments a harness delivers one in. The boot-time delivery is the
	// load-bearing half: teardown awaits the boot in flight, so it takes seconds, and every
	// termination listener Vitest installs while warming would end the process a millisecond after
	// the signal and leave the boot's own files in the target's tree.
	for (const delivery of DELIVERIES) {
		it(
			`leaves the target clean when ${delivery.signal} reaches the entry during ${delivery.phase}`,
			{ timeout: 120_000 },
			async (context) => {
				// The control comes first: a child holding no handler cannot exit 0 on the signal, so an
				// instrument reporting a handled ending for that one would be reading nothing about the
				// handler.
				expect(await readSignalEnding(delivery.signal, UNHANDLED)).not.toStrictEqual({
					code: 0,
					signal: null,
				})
				const ending = await readSignalEnding(delivery.signal, HANDLED)
				// The graceful teardown this proof is about starts in the entry's own signal handler, so
				// a host that terminates a signalled child instead of delivering the signal cannot build
				// the condition through this door. The skip leaves the graceful path unmeasured here and
				// claims nothing about the entry: what such a host leaves in the target is swept at the
				// next boot, which the orphan-sweep proofs cover.
				context.skip(
					ending.code !== 0,
					`this host ends a child holding its own ${delivery.signal} handler as ${ending.signal === null ? `code ${ending.code}` : `signal ${ending.signal}`}, so child.kill runs no handler here and the entry's graceful teardown cannot be reached`,
				)
				const scratch = createScratch()
				writeTarget(scratch)
				const directory = resolve(scratch.path, 'tmp/probe')
				const child = spawn(process.execPath, [BUILT_ENTRY], {
					cwd: scratch.path,
					stdio: ['pipe', 'pipe', 'pipe'],
				})
				const exited = new Promise<{ code: number | null; signal: string | null }>(
					(resolveExit) => {
						child.once('exit', (code, signal) => resolveExit({ code, signal }))
					},
				)
				try {
					if (delivery.phase === 'boot') await waitForArming(directory)
					else await waitForArmed(directory)
					const started = performance.now()
					child.kill(delivery.signal)
					const outcome = await exited
					const elapsed = performance.now() - started
					// A zero exit code is the whole claim: a host that lost the race to Vitest's own
					// handler exits 143, and one the harness force-killed reports a signal instead of
					// a code. The bound is generous against the seconds a boot-time teardown takes,
					// because it is here to catch a hang rather than to grade the host.
					expect(outcome).toStrictEqual({ code: 0, signal: null })
					expect(elapsed).toBeLessThan(TEARDOWN_BOUND)
					expect(readWorkbench(directory)).toStrictEqual([])
				} finally {
					if (child.exitCode === null && child.signalCode === null) {
						child.kill('SIGKILL')
						await exited
					}
					scratch.destroy()
				}
			},
		)
	}
})
