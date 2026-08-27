import type { ScratchInterface } from '@orkestrel/test/server'
import type { JSONValue } from '@orkestrel/contract'
import type { Interface } from 'node:readline'
import { version } from '../../../package.json' with { type: 'json' }
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
	MCP_FALLBACK_VERSION,
	MCP_MODERN_VERSION,
	createMCPClient,
	createMCPLegacyClientTransport,
	isJSONObject,
} from '@orkestrel/mcp'
import { createStdioClientTransport } from '@orkestrel/mcp/server'
import { createTeardown, waitForCondition, waitForDelay } from '@orkestrel/test'
import { createScratch } from '@orkestrel/test/server'
import { formatVerdict, isVerdict } from '@src/core'
import { describe, expect, it } from 'vitest'
import { readSignalEnding } from '../../setupServer.js'
import { WORKSPACE_ROOT } from '../../setup.js'

const ROOT = fileURLToPath(WORKSPACE_ROOT)
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
// The module text a claim's case carries, and the text its control carries in place of it. The
// control's annotation refuses the string literal beside it, so the type stage reports one issue.
const CLEAN = "export const VALUE = 'ok'\n"
const BROKEN = "export const VALUE: number = 'bad'\n"
// The same refusal repeated, so the type stage reports an issue per declaration. `@orkestrel/mcp`
// bounds a tool-call result by total enumerable keys as well as by bytes, and a verdict's key count
// grows with the issues its stages report, so this control is what drives the record past the key
// bound the package defaults to.
const WIDE = Array.from(
	{ length: 30 },
	(_, index) => `export const VALUE_${String(index)}: number = 'bad'`,
).join('\n')
// The same refusal repeated past the key bound the server publishes. A whole result costs 44 keys
// plus 11 for each issue, so `PROBE_KEYS` carries a record reporting up to 368 issues; this control
// reports past that, which makes the record the part of the answer that cannot travel.
const WIDER = Array.from(
	{ length: 400 },
	(_, index) => `export const VALUE_${String(index)}: number = 'bad'`,
).join('\n')
// The reserved metadata a current-revision request carries, and extension keys past the installed
// default key bound of 64. `PROBE_KEYS` reaches inbound metadata as well as produced content, so a
// request the default would refuse is admitted here.
const RESERVED = {
	'io.modelcontextprotocol/protocolVersion': '2026-07-28',
	'io.modelcontextprotocol/clientCapabilities': {},
} as const
const EXTENSIONS = Object.fromEntries(
	Array.from({ length: 200 }, (_, index) => [`probe.test/extension-${String(index)}`, index]),
)
// A control whose test throws a message longer than the 4 MiB content bound. The string is built
// inside the child rather than sent to it, so a claim of a few hundred bytes produces a rendering
// the reply cannot carry — which is the one input under which the rendered text is refused too.
const THROWING =
	"import { test } from 'vitest'\ntest('breaks', () => {\n\tthrow new Error('A'.repeat(5_000_000))\n})\n"
// The test text every case phase runs. It asserts against no draft, so a control breaking at the
// type stage and one breaking at the runtime stage differ only in the draft each replaces.
const PASSING =
	"import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n"

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
	let arming: readonly string[] = []
	await waitForCondition(
		`two arming files in ${directory}`,
		() => {
			arming = readArming(directory)
			return arming.length === 2
		},
		{ budget: ARMING_TIMEOUT, interval: 10 },
	)
	return arming
}

// Waits for the boot to finish rather than for the `arm` event, which no observer outside the
// process can read. The boot dependencies exist for the whole boot and are removed as it ends,
// so their disappearance is the same moment from out here.
async function waitForArmed(directory: string): Promise<void> {
	await waitForArming(directory)
	await waitForCondition(
		`the boot to end in ${directory}`,
		() => readArming(directory).length === 0,
		{
			budget: ARMING_TIMEOUT,
			interval: 10,
		},
	)
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

// Reads one JSON-RPC response line as the `result` record it carries, or `undefined` when the line
// carries an error or anything else. `isJSONObject` is the installed guard, so nothing here
// re-implements the envelope's shape.
function readAnswer(line: string): Readonly<Record<string, JSONValue>> | undefined {
	const message: unknown = JSON.parse(line)
	if (!isJSONObject(message)) return undefined
	const answer = message['result']
	return isJSONObject(answer) ? answer : undefined
}

// Pairs each answered frame with the request id it carries, so a reader takes the reply to one
// request rather than the frame that happened to arrive first.
function indexFrames(frames: readonly string[]): ReadonlyMap<number, string> {
	const answered = new Map<number, string>()
	for (const frame of frames) {
		const message: unknown = JSON.parse(frame)
		if (isJSONObject(message) && typeof message['id'] === 'number') {
			answered.set(message['id'], frame)
		}
	}
	return answered
}

// Reads the text of the one content block a result carries, or `undefined` when the result carries
// anything else. The block count is part of the reading: every reply this server produces carries
// exactly one, and a reader that took the first of several would not notice the second.
function readText(answer: Readonly<Record<string, JSONValue>>): string | undefined {
	const content = answer['content']
	if (!Array.isArray(content) || content.length !== 1) return undefined
	const block = content[0]
	if (!isJSONObject(block) || block['type'] !== 'text') return undefined
	const text = block['text']
	return typeof text === 'string' ? text : undefined
}

// Collects newline-delimited JSON-RPC responses from a child's standard output until the expected
// number of non-empty frames has arrived.
async function readFrames(output: Interface, expected: number): Promise<readonly string[]> {
	const frames: string[] = []
	for await (const line of output) {
		if (line.trim() !== '') frames.push(line)
		if (frames.length === expected) break
	}
	return frames
}

// One claim that earns a receipt in this workspace, named so two claims never share a draft path.
// `control` is the text the named module carries in the control phase, which is what decides how
// many issues the type stage reports for it.
function buildClaim(name: string, control: string): Readonly<Record<string, unknown>> {
	const specification = { path: `tmp/probe/bin/${name}-runtime.test.ts`, text: PASSING }
	return {
		project: 'configs/src/tsconfig.core.json',
		case: {
			files: [{ path: `src/core/${name}.ts`, text: CLEAN }],
			test: specification,
		},
		control: {
			files: [{ path: `src/core/${name}.ts`, text: control }],
			test: specification,
			stage: 'type',
			reason: 'the source assigns a string to a number',
		},
	}
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
			const teardown = createTeardown()
			teardown.add(() => scratch.destroy())
			teardown.add(() => {
				if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
			})
			await teardown.destroy()
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
								serverInfo: { name: 'probe', version },
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
				const teardown = createTeardown()
				teardown.add(() => {
					try {
						rmdirSync(directory)
					} catch {}
				})
				teardown.add(async () => {
					if (child.exitCode === null) {
						const exited = new Promise<void>((resolveExit) => {
							child.once('exit', () => resolveExit())
						})
						child.kill('SIGTERM')
						await exited
					}
				})
				teardown.add(() => output.close())
				await teardown.destroy()
			}
		},
	)

	// The reply shape § Registering the server documents, read off the raw wire on both eras: the
	// record in `structuredContent` and the rendered text in the result's one content block. The
	// text is compared against `formatVerdict` applied to the record that arrived beside it, so the
	// two wire fields have to agree about the same verdict rather than each being plausible alone.
	// A plain spawn rather than a pseudo-terminal, because this claim is about the reply and not
	// about what a terminal does to the worker's output.
	it(
		'carries the verdict record beside the rendered text on both eras',
		{ timeout: 300_000 },
		async () => {
			const modern = {
				'io.modelcontextprotocol/protocolVersion': '2026-07-28',
				'io.modelcontextprotocol/clientCapabilities': {},
				'io.modelcontextprotocol/clientInfo': { name: 'probe-test', version: '1.0.0' },
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
				{
					jsonrpc: '2.0',
					id: 2,
					method: 'tools/call',
					params: { name: 'prove', arguments: buildClaim('era-legacy', BROKEN) },
				},
				{
					jsonrpc: '2.0',
					id: 3,
					method: 'tools/call',
					params: { name: 'prove', arguments: buildClaim('era-modern', BROKEN), _meta: modern },
				},
			]
			const directory = resolve(ROOT, 'tmp/probe/bin')
			mkdirSync(directory, { recursive: true })
			const child = spawn(process.execPath, [BUILT_ENTRY], {
				cwd: ROOT,
				stdio: ['pipe', 'pipe', 'pipe'],
			})
			const errors: Buffer[] = []
			child.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
			const output = createInterface({ input: child.stdout })
			try {
				child.stdin.write(requests.map((request) => JSON.stringify(request)).join('\n') + '\n')
				const frames = await readFrames(output, requests.length)
				expect(Buffer.concat(errors).toString('utf8')).not.toContain('Error')
				// The handshake first, so a failure there is not read as a failure of the two calls.
				expect(readAnswer(frames[0] ?? '')).toMatchObject({
					protocolVersion: '2025-06-18',
					serverInfo: { name: 'probe', version },
				})
				for (const frame of frames.slice(1)) {
					const answer = readAnswer(frame)
					expect(answer, `no result on ${frame}`).toBeDefined()
					if (answer === undefined) continue
					const record = answer['structuredContent']
					expect(isVerdict(record), `no verdict on ${frame}`).toBe(true)
					if (!isVerdict(record)) continue
					expect(answer['content']).toStrictEqual([{ type: 'text', text: formatVerdict(record) }])
					expect(record.receipt).toMatch(/^probe:/)
					expect(answer['isError']).toBeUndefined()
				}
			} finally {
				const teardown = createTeardown()
				teardown.add(() => {
					try {
						rmdirSync(directory)
					} catch {}
				})
				teardown.add(async () => {
					if (child.exitCode === null) {
						const exited = new Promise<void>((resolveExit) => {
							child.once('exit', () => resolveExit())
						})
						child.kill('SIGTERM')
						await exited
					}
				})
				teardown.add(() => output.close())
				await teardown.destroy()
			}
		},
	)

	// The record's breadth is the claimant's, not this package's: a control that refuses one
	// declaration reports one issue, and a control that refuses many reports many. `@orkestrel/mcp`
	// counts total enumerable keys across a produced result and refuses one that exceeds the bound,
	// so a bound sized for request metadata would answer the case above and turn this one into a
	// JSON-RPC error carrying neither the record nor the receipt.
	it(
		'carries a record whose control reports an issue per refused declaration',
		{ timeout: 300_000 },
		async () => {
			const directory = resolve(ROOT, 'tmp/probe/bin')
			mkdirSync(directory, { recursive: true })
			const child = spawn(process.execPath, [BUILT_ENTRY], {
				cwd: ROOT,
				stdio: ['pipe', 'pipe', 'pipe'],
			})
			const output = createInterface({ input: child.stdout })
			try {
				child.stdin.write(
					JSON.stringify({
						jsonrpc: '2.0',
						id: 1,
						method: 'tools/call',
						params: { name: 'prove', arguments: buildClaim('wide', WIDE) },
					}) + '\n',
				)
				const frames = await readFrames(output, 1)
				const answer = readAnswer(frames[0] ?? '')
				expect(answer, `no result on ${frames[0] ?? ''}`).toBeDefined()
				if (answer === undefined) return
				const record = answer['structuredContent']
				expect(isVerdict(record), `no verdict on ${frames[0] ?? ''}`).toBe(true)
				if (!isVerdict(record)) return
				expect(answer['content']).toStrictEqual([{ type: 'text', text: formatVerdict(record) }])
				// Measured against the installed package: its default key bound carries a verdict whose
				// control reports one issue and refuses the next one, so a control reporting more than
				// that is what separates the published bound from the default.
				const broke = record.control.find((check) => check.stage === 'type')
				expect(broke?.issues.length).toBeGreaterThan(2)
				expect(record.receipt).toMatch(/^probe:/)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => {
					try {
						rmdirSync(directory)
					} catch {}
				})
				teardown.add(async () => {
					if (child.exitCode === null) {
						const exited = new Promise<void>((resolveExit) => {
							child.once('exit', () => resolveExit())
						})
						child.kill('SIGTERM')
						await exited
					}
				})
				teardown.add(() => output.close())
				await teardown.destroy()
			}
		},
	)

	// The size the record stops travelling at, driven through the shipped entry against a real claim.
	// A whole result costs 44 keys plus 11 for each issue, so `PROBE_KEYS` carries a record reporting
	// up to 368 issues and refuses the next one. The reply keeps the rendered text there rather than
	// failing, so the receipt still answers. The same child reads the other direction that published
	// bound reaches: a request whose `_meta` carries extension keys past the installed default of 64
	// is admitted rather than refused as malformed metadata.
	it(
		'answers a record past the published key bound with the rendered text alone',
		{ timeout: 300_000 },
		async () => {
			const requests = [
				{
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: { name: 'prove', arguments: buildClaim('wider', WIDER) },
				},
				{
					jsonrpc: '2.0',
					id: 2,
					method: 'tools/list',
					params: { _meta: { ...RESERVED, ...EXTENSIONS } },
				},
			]
			const directory = resolve(ROOT, 'tmp/probe/bin')
			mkdirSync(directory, { recursive: true })
			const child = spawn(process.execPath, [BUILT_ENTRY], {
				cwd: ROOT,
				stdio: ['pipe', 'pipe', 'pipe'],
			})
			const output = createInterface({ input: child.stdout })
			try {
				child.stdin.write(requests.map((request) => JSON.stringify(request)).join('\n') + '\n')
				const answered = indexFrames(await readFrames(output, requests.length))
				const wide = answered.get(1) ?? ''
				expect(wide, 'no frame answered the wide claim').not.toBe('')
				expect(wide).not.toContain('-32603')
				const answer = readAnswer(wide)
				expect(answer, `no result on ${wide.slice(0, 200)}`).toBeDefined()
				if (answer === undefined) return
				expect(answer['structuredContent']).toBeUndefined()
				const text = readText(answer)
				expect(text, 'the result carries no single text block').toBeDefined()
				if (text === undefined) return
				// The whole rendering rather than the fallback: the stage lines are what the fallback
				// drops, and the issues this control reports are what put the record past the bound.
				const reported = /^control type: (\d+) issues/m.exec(text)?.[1]
				expect(Number(reported)).toBeGreaterThan(368)
				expect(text.split('\n').at(-1)).toMatch(/^receipt probe:/)
				const listed = answered.get(2) ?? ''
				expect(readAnswer(listed), `no result on ${listed.slice(0, 200)}`).toBeDefined()
			} finally {
				const teardown = createTeardown()
				teardown.add(() => {
					try {
						rmdirSync(directory)
					} catch {}
				})
				teardown.add(async () => {
					if (child.exitCode === null) {
						const exited = new Promise<void>((resolveExit) => {
							child.once('exit', () => resolveExit())
						})
						child.kill('SIGTERM')
						await exited
					}
				})
				teardown.add(() => output.close())
				await teardown.destroy()
			}
		},
	)

	// The size the rendered text itself stops travelling at. The control's test throws a message
	// past the 4 MiB content bound, so neither the record nor the whole rendering can be carried,
	// and the reply answers with what `formatReceipt` renders: the identity, the claim, the reason,
	// and the closing receipt line. The claim is written here rather than through the builder above
	// because it is the one claim in this file whose control replaces the test instead of the module.
	it(
		'answers a rendering past the content bound with the receipt block',
		{ timeout: 300_000 },
		async () => {
			const specification = { path: 'tmp/probe/bin/throwing-runtime.test.ts', text: PASSING }
			const module = { path: 'src/core/throwing.ts', text: CLEAN }
			const reason = 'the test throws a message longer than the reply can carry'
			const request = {
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: {
					name: 'prove',
					arguments: {
						project: 'configs/src/tsconfig.core.json',
						case: { files: [module], test: specification },
						control: {
							files: [module],
							test: { path: specification.path, text: THROWING },
							stage: 'runtime',
							reason,
						},
					},
				},
			}
			const directory = resolve(ROOT, 'tmp/probe/bin')
			mkdirSync(directory, { recursive: true })
			const child = spawn(process.execPath, [BUILT_ENTRY], {
				cwd: ROOT,
				stdio: ['pipe', 'pipe', 'pipe'],
			})
			const output = createInterface({ input: child.stdout })
			try {
				child.stdin.write(JSON.stringify(request) + '\n')
				const frames = await readFrames(output, 1)
				const frame = frames[0] ?? ''
				expect(frame).not.toContain('-32603')
				const answer = readAnswer(frame)
				expect(answer, `no result on ${frame.slice(0, 200)}`).toBeDefined()
				if (answer === undefined) return
				expect(answer['structuredContent']).toBeUndefined()
				const text = readText(answer)
				expect(text, 'the result carries no single text block').toBeDefined()
				if (text === undefined) return
				const lines = text.split('\n')
				expect(lines).toHaveLength(4)
				expect(lines[0]).toMatch(/^probe [0-9a-f-]+ \(\d+ ms\)$/)
				expect(lines[1]).toMatch(/^claim [0-9a-f]+$/)
				expect(lines[2]).toBe(`reason ${reason}`)
				expect(lines.at(-1)).toMatch(/^receipt probe:/)
				// The stage lines separate this answer from the whole rendering.
				expect(text).not.toContain('control runtime:')
			} finally {
				const teardown = createTeardown()
				teardown.add(() => {
					try {
						rmdirSync(directory)
					} catch {}
				})
				teardown.add(async () => {
					if (child.exitCode === null) {
						const exited = new Promise<void>((resolveExit) => {
							child.once('exit', () => resolveExit())
						})
						child.kill('SIGTERM')
						await exited
					}
				})
				teardown.add(() => output.close())
				await teardown.destroy()
			}
		},
	)

	// A foreign client, not this file's own line writer: `@orkestrel/mcp`'s stdio client spawns the
	// shipped entry, negotiates the era, and correlates the reply itself. What it hands back is the
	// reply shape § Registering the server documents — the `Verdict` record, because a client of
	// this package prefers a result's `structuredContent` over its content blocks — read through a
	// client that knows nothing about this package.
	it(
		'answers a driven third-party client with the verdict record',
		{ timeout: 120_000 },
		async () => {
			const claim = buildClaim('client', BROKEN)
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
				// A record rather than a string: this client prefers a result's `structuredContent` over
				// its content blocks, so a client holding the reply holds the `Verdict` the process built.
				// The rendered text rides beside it in the result's one content block, which the raw-wire
				// drives read.
				expect(isVerdict(outcome.value)).toBe(true)
				if (!isVerdict(outcome.value)) return
				expect(formatVerdict(outcome.value).trimEnd().split('\n').at(-1)).toMatch(/^receipt probe:/)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => {
					try {
						rmdirSync(directory)
					} catch {}
				})
				teardown.add(() => client.disconnect())
				await teardown.destroy()
			}
		},
	)

	it(
		'answers a pinned legacy client through the initialize path',
		{ timeout: 120_000 },
		async () => {
			const claim = buildClaim('legacy', BROKEN)
			const directory = resolve(ROOT, 'tmp/probe/bin')
			mkdirSync(directory, { recursive: true })
			const client = createMCPClient({
				transport: createMCPLegacyClientTransport(
					createStdioClientTransport({
						command: process.execPath,
						args: [BUILT_ENTRY],
					}),
					{
						identity: { name: 'probe-foreign-client', version: '1.0.0' },
						version: MCP_FALLBACK_VERSION,
						// Well above the handshake default, because the first forwarded call waits on
						// arming and this deadline is here to catch a hang rather than to grade the host.
						timeout: 300_000,
					},
				),
				identity: { name: 'probe-foreign-client', version: '1.0.0' },
				// Well above the client's own default, because the first call waits on arming and this
				// deadline is here to catch a hang rather than to grade the host.
				timeout: 300_000,
			})
			try {
				await client.connect()
				expect(client.connected).toBe(true)
				// The adapter is modern-facing: the pinned legacy revision rides the wire while the
				// client reads the modern era.
				expect(client.version).toBe(MCP_MODERN_VERSION)
				const tools = await client.tools()
				expect(tools.map((tool) => tool.name)).toStrictEqual(['prove'])
				expect(tools[0]?.description).toContain('measure before proving')
				expect(tools[0]?.description).toContain("import.meta.env.MODE === 'benchmark'")
				const outcome = await client.call('prove', claim)
				expect(outcome.resultType).toBe('complete')
				if (outcome.resultType !== 'complete') return
				// The record survives the legacy projection: `createMCPLegacy` drops the modern stamp
				// and carries `structuredContent` through, so a client pinned to the legacy revision
				// reads the same `Verdict` a modern client reads.
				expect(isVerdict(outcome.value)).toBe(true)
				if (!isVerdict(outcome.value)) return
				expect(formatVerdict(outcome.value).trimEnd().split('\n').at(-1)).toMatch(/^receipt probe:/)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => {
					try {
						rmdirSync(directory)
					} catch {}
				})
				teardown.add(() => client.disconnect())
				await teardown.destroy()
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
				const teardown = createTeardown()
				teardown.add(() => {
					try {
						rmdirSync(directory)
					} catch {}
				})
				teardown.add(() => rmSync(diagnostic, { force: true }))
				teardown.add(async () => {
					if (child.exitCode === null) {
						const exited = new Promise<void>((resolveExit) => {
							child.once('exit', () => resolveExit())
						})
						child.kill('SIGTERM')
						await exited
					}
				})
				teardown.add(() => output.close())
				await teardown.destroy()
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
					const teardown = createTeardown()
					teardown.add(() => scratch.destroy())
					teardown.add(async () => {
						if (child.exitCode === null && child.signalCode === null) {
							child.kill('SIGKILL')
							await exited
						}
					})
					await teardown.destroy()
				}
			},
		)
	}
})
