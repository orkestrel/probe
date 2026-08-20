import type { Claim, ProbeEventMap, Source, Toolchain, Verdict } from '@src/core'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRecorder, waitForDelay } from '@orkestrel/test'
import { createScratch } from '@orkestrel/test/server'
import { Probe, readWorkspaceManifest } from '@src/server'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

// A protocol-faithful Oxlint language server that records every document session it is given. It
// appends one line per `didOpen` carrying the number of documents open at that moment, waits, then
// publishes an empty diagnostic set. A coordinator that admits two inspections at once shows a
// count above one; a coordinator that admits them out of order shows the sessions transposed.
const ORDERED = [
	"import { appendFileSync } from 'node:fs'",
	'let buffer = Buffer.alloc(0)',
	'let open = 0',
	'setTimeout(() => process.exit(0), 300_000)',
	'function send(message) {',
	'\tconst content = JSON.stringify(message)',
	"\tprocess.stdout.write('Content-Length: ' + Buffer.byteLength(content) + '\\r\\n\\r\\n' + content)",
	'}',
	"process.stdin.on('data', (chunk) => {",
	'\tbuffer = Buffer.concat([buffer, chunk])',
	'\twhile (true) {',
	"\t\tconst boundary = buffer.indexOf('\\r\\n\\r\\n')",
	'\t\tif (boundary < 0) return',
	"\t\tconst header = buffer.subarray(0, boundary).toString('ascii')",
	'\t\tconst match = /Content-Length: (\\d+)/i.exec(header)',
	'\t\tif (match === null) return',
	'\t\tconst length = Number(match[1])',
	'\t\tconst start = boundary + 4',
	'\t\tif (buffer.length < start + length) return',
	"\t\tconst message = JSON.parse(buffer.subarray(start, start + length).toString('utf8'))",
	'\t\tbuffer = buffer.subarray(start + length)',
	"\t\tif (message.method === 'initialize') send({ jsonrpc: '2.0', id: message.id, result: { capabilities: {} } })",
	"\t\tif (message.method === 'textDocument/didOpen') {",
	'\t\t\tconst uri = message.params.textDocument.uri',
	'\t\t\topen += 1',
	"\t\t\tappendFileSync('probe-lint.log', 'open ' + open + ' ' + uri + '\\n')",
	"\t\t\tsetTimeout(() => send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri, diagnostics: [] } }), 100)",
	'\t\t}',
	"\t\tif (message.method === 'textDocument/didClose') {",
	'\t\t\topen -= 1',
	"\t\t\tappendFileSync('probe-lint.log', 'close ' + message.params.textDocument.uri + '\\n')",
	'\t\t}',
	"\t\tif (message.method === 'shutdown') send({ jsonrpc: '2.0', id: message.id, result: null })",
	"\t\tif (message.method === 'exit') process.exit(0)",
	'\t}',
	'})',
].join('\n')

// A protocol-faithful Oxlint language server that can be made to publish nothing. The `stall-lint`
// marker file silences every document, which is what holds the probe's own boot control past its
// deadline; the text marker `PROBE_SILENT` silences one document, which holds a claim's candidate
// while the boot controls still answer.
const STALLING = [
	"import { existsSync } from 'node:fs'",
	'let buffer = Buffer.alloc(0)',
	'setTimeout(() => process.exit(0), 300_000)',
	'function send(message) {',
	'\tconst content = JSON.stringify(message)',
	"\tprocess.stdout.write('Content-Length: ' + Buffer.byteLength(content) + '\\r\\n\\r\\n' + content)",
	'}',
	"process.stdin.on('data', (chunk) => {",
	'\tbuffer = Buffer.concat([buffer, chunk])',
	'\twhile (true) {',
	"\t\tconst boundary = buffer.indexOf('\\r\\n\\r\\n')",
	'\t\tif (boundary < 0) return',
	"\t\tconst header = buffer.subarray(0, boundary).toString('ascii')",
	'\t\tconst match = /Content-Length: (\\d+)/i.exec(header)',
	'\t\tif (match === null) return',
	'\t\tconst length = Number(match[1])',
	'\t\tconst start = boundary + 4',
	'\t\tif (buffer.length < start + length) return',
	"\t\tconst message = JSON.parse(buffer.subarray(start, start + length).toString('utf8'))",
	'\t\tbuffer = buffer.subarray(start + length)',
	"\t\tif (message.method === 'initialize') send({ jsonrpc: '2.0', id: message.id, result: { capabilities: {} } })",
	"\t\tif (message.method === 'textDocument/didOpen') {",
	'\t\t\tconst uri = message.params.textDocument.uri',
	"\t\t\tconst stalled = existsSync('stall-lint') || message.params.textDocument.text.includes('PROBE_SILENT')",
	"\t\t\tif (!stalled) send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri, diagnostics: [] } })",
	'\t\t}',
	"\t\tif (message.method === 'shutdown') send({ jsonrpc: '2.0', id: message.id, result: null })",
	"\t\tif (message.method === 'exit') process.exit(0)",
	'\t}',
	'})',
].join('\n')

// Builds one candidate whose type check costs about a second: 100 exclusions applied one after
// another to a 10,000-member template-literal union, measured at 12.8 ms per exclusion in this
// workspace. Volume is what makes the cost predictable, because the compiler pays per exclusion, so
// a claim carrying enough of these outruns a deadline by a margin no host's speed closes. The
// candidate is clean: the work is the point, and a diagnostic would report something else.
function createHeavySource(index: number): Source {
	const rows = [
		'type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9',
		'type Pair = `${Digit}${Digit}`',
		'type Quad = `${Pair}${Pair}`',
		'type Step0 = Quad',
	]
	for (let step = 1; step <= 100; step += 1) {
		rows.push(`type Step${step} = Exclude<Step${step - 1}, '${String(step).padStart(4, '0')}'>`)
	}
	rows.push(`export const HEAVY_${index}: Step100 = '9999'`)
	return { path: `src/core/probe-heavy-${index}.ts`, text: `${rows.join('\n')}\n` }
}

describe.sequential('probe', () => {
	it(
		'issues receipts only when every stage executes cleanly and returns admitted path findings',
		{ timeout: 60_000 },
		async () => {
			const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
			const test = {
				path: 'tmp/probe/probe-receipt.test.ts',
				text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
			}
			const clean = { path: 'src/core/probe-receipt.ts', text: "export const VALUE = 'ok'\n" }
			const broken = {
				path: 'src/core/probe-receipt.ts',
				text: "export const VALUE: number = 'bad'\n",
			}
			const skipped = {
				path: 'tmp/probe/probe-skipped.test.ts',
				text: "import { describe, expect, test } from 'vitest'\ntest.skip('skips', () => expect(1).toBe(2))\ntest.todo('defers')\ndescribe.skip('group', () => { test('skips with its group', () => expect(1).toBe(2)) })\n",
			}
			const unmapped = {
				path: 'tests/unmapped.test.ts',
				text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
			}
			try {
				const issued = await probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: { files: [clean], test },
					control: {
						files: [broken],
						test,
						stage: 'type',
						reason: 'the source assigns a string to a number',
					},
				})
				const refused = await probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: { files: [clean], test },
					control: {
						files: [clean],
						test,
						stage: 'type',
						reason: 'this control is deliberately clean',
					},
				})
				const unexecuted = await probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: { files: [clean], test: skipped },
					control: {
						files: [broken],
						test: skipped,
						stage: 'type',
						reason: 'the source assigns a string to a number',
					},
				})
				const admitted = await probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: { files: [clean], test: unmapped },
					control: {
						files: [broken],
						test: unmapped,
						stage: 'type',
						reason: 'the source assigns a string to a number',
					},
				})
				expect(issued.receipt).toMatch(/^probe:/)
				expect(refused.receipt).toBeUndefined()
				expect(unexecuted.receipt).toBeUndefined()
				expect(unexecuted.checks.find((check) => check.stage === 'runtime')?.findings).toEqual([
					expect.objectContaining({
						origin: 'instrument',
						message: 'Vitest ran no tests in the module',
					}),
				])
				expect(admitted.receipt).toBeUndefined()
				expect(admitted.checks.find((check) => check.stage === 'runtime')?.findings).toEqual([
					expect.objectContaining({
						origin: 'instrument',
						message: 'The runtime stage found no configured Vitest project matching the test path',
					}),
				])
			} finally {
				await probe.destroy()
			}
		},
	)

	it('carries the installed toolchain on every verdict', { timeout: 60_000 }, async () => {
		const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
		try {
			const verdict = await probe.prove({
				project: 'configs/src/tsconfig.core.json',
				case: {
					files: [{ path: 'src/core/toolchain.ts', text: "export const VALUE = 'ok'\n" }],
					test: {
						path: 'tmp/probe/toolchain.test.ts',
						text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
					},
				},
				control: {
					files: [{ path: 'src/core/toolchain.ts', text: "export const VALUE: number = 'bad'\n" }],
					test: {
						path: 'tmp/probe/toolchain.test.ts',
						text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
					},
					stage: 'type',
					reason: 'the source assigns a string to a number',
				},
			})
			expect(verdict.toolchain).toStrictEqual({
				typescript: readWorkspaceManifest(ROOT, 'typescript').contents.version,
				oxlint: readWorkspaceManifest(ROOT, 'oxlint').contents.version,
				vitest: readWorkspaceManifest(ROOT, 'vitest').contents.version,
			})
		} finally {
			await probe.destroy()
		}
	})

	it(
		'retains all stage checks when the runtime test directory is missing',
		{ timeout: 60_000 },
		async () => {
			const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
			try {
				const verdict = await probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: {
						files: [{ path: 'src/core/missing-runtime.ts', text: "export const VALUE = 'ok'\n" }],
						test: {
							path: 'tmp/probe/absent/deep/missing-runtime.test.ts',
							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
						},
					},
					control: {
						files: [
							{
								path: 'src/core/missing-runtime.ts',
								text: "export const VALUE: number = 'bad'\n",
							},
						],
						test: {
							path: 'tmp/probe/missing-runtime-control.test.ts',
							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
						},
						stage: 'type',
						reason: 'the source assigns a string to a number',
					},
				})
				expect(verdict.checks.map((check) => check.stage)).toStrictEqual([
					'type',
					'lint',
					'runtime',
				])
				expect(verdict.checks.find((check) => check.stage === 'type')?.findings).toStrictEqual([])
				expect(verdict.checks.find((check) => check.stage === 'lint')?.findings).toStrictEqual([])
				expect(verdict.checks.find((check) => check.stage === 'runtime')?.findings).toEqual([
					expect.objectContaining({
						origin: 'instrument',
						path: 'tmp/probe/absent/deep/missing-runtime.test.ts',
						message: expect.stringContaining('The runtime test directory does not exist'),
					}),
				])
			} finally {
				await probe.destroy()
			}
		},
	)

	it('names an unsupported TypeScript installation before entering the compiler', async () => {
		const scratch = createScratch()
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.write(
			'node_modules/typescript/package.json',
			'{"name":"typescript","version":"7.0.2","type":"module","exports":{".":"./index.js","./package.json":"./package.json"}}\n',
		)
		scratch.write('node_modules/typescript/index.js', "export const version = '7.0.2'\n")
		scratch.write(
			'node_modules/oxlint/package.json',
			'{"name":"oxlint","version":"1.79.0","type":"module","bin":{"oxlint":"fixture.js"}}\n',
		)
		scratch.write('node_modules/oxlint/fixture.js', 'process.exit(1)\n')
		scratch.write(
			'node_modules/vitest/package.json',
			'{"name":"vitest","version":"4.1.11","type":"module","exports":{"./node":"./node.js","./package.json":"./package.json"}}\n',
		)
		scratch.write('node_modules/vitest/node.js', 'export const createVitest = undefined\n')
		const probe = new Probe({ workspace: scratch.path })
		try {
			await expect(
				probe.prove({
					project: 'tsconfig.json',
					case: {
						files: [],
						test: {
							path: 'tmp/probe/unsupported.test.ts',
							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
						},
					},
					control: {
						files: [],
						test: {
							path: 'tmp/probe/unsupported.test.ts',
							text: "import { test } from 'vitest'\ntest('fails', () => { throw new Error('control') })\n",
						},
						stage: 'runtime',
						reason: 'the test throws',
					},
				}),
			).rejects.toThrow('The supported TypeScript range is ^6.0.0; found 7.0.2')
		} finally {
			await probe.destroy()
			scratch.destroy()
		}
	})

	it(
		'preserves the host exit code through arming and every proof',
		{ timeout: 60_000 },
		async () => {
			const inherited = process.exitCode
			process.exitCode = undefined
			const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
			const claim: Claim = {
				project: 'configs/src/tsconfig.core.json',
				case: {
					files: [{ path: 'src/core/exit-code.ts', text: "export const VALUE = 'ok'\n" }],
					test: {
						path: 'tmp/probe/exit-code.test.ts',
						text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
					},
				},
				control: {
					files: [{ path: 'src/core/exit-code.ts', text: "export const VALUE: number = 'bad'\n" }],
					test: {
						path: 'tmp/probe/exit-code.test.ts',
						text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
					},
					stage: 'type',
					reason: 'the source assigns a string to a number',
				},
			}
			try {
				await probe.prove(claim)
				expect(process.exitCode).toBeUndefined()
				process.exitCode = 23
				await probe.prove(claim)
				expect(process.exitCode).toBe(23)
			} finally {
				await probe.destroy()
				process.exitCode = inherited
			}
		},
	)

	it(
		'expires only the active inspection, cleans its revision, and serves a queued claim',
		{ timeout: 60_000 },
		async () => {
			const expirations = createRecorder<[Claim]>()
			const failures = createRecorder<[unknown]>()
			const probe = new Probe({
				workspace: ROOT,
				deadline: 6_000,
				on: { expire: expirations.handler, error: failures.handler },
			})
			const hanging: Claim = {
				project: 'configs/src/tsconfig.core.json',
				case: {
					files: [],
					test: {
						path: 'tmp/probe/expiry.test.ts',
						text: "import { test } from 'vitest'\ntest('never returns', () => { while (true) {} })\n",
					},
				},
				control: {
					files: [],
					test: {
						path: 'tmp/probe/expiry.test.ts',
						text: "import { test } from 'vitest'\ntest('never returns', () => { while (true) {} })\n",
					},
					stage: 'runtime',
					reason: 'the synchronous loop never returns',
				},
			}
			const ordinary: Claim = {
				project: 'configs/src/tsconfig.core.json',
				case: {
					files: [{ path: 'src/core/after-expiry.ts', text: "export const VALUE = 'ok'\n" }],
					test: {
						path: 'tmp/probe/after-expiry.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
					},
				},
				control: {
					files: [
						{ path: 'src/core/after-expiry.ts', text: "export const VALUE: number = 'bad'\n" },
					],
					test: {
						path: 'tmp/probe/after-expiry.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
					},
					stage: 'type',
					reason: 'the source assigns a string to a number',
				},
			}
			mkdirSync(fileURLToPath(new URL('../../../tmp/probe/', import.meta.url)), { recursive: true })
			try {
				const expired = probe.prove(hanging)
				await waitForDelay(100)
				const served = probe.prove(ordinary)
				const outcomes = await Promise.allSettled([expired, served])
				expect(outcomes[0]).toMatchObject({
					status: 'rejected',
					reason: expect.objectContaining({ message: 'The runtime stage exceeded 6000 ms' }),
				})
				expect(expirations.calls).toStrictEqual([[hanging]])
				expect(failures.count).toBe(1)
				expect(
					readdirSync(fileURLToPath(new URL('../../../tmp/probe/', import.meta.url))).filter(
						(name) => name.startsWith('expiry.test.probe-'),
					),
				).toStrictEqual([])
				expect(outcomes[1]).toMatchObject({
					status: 'fulfilled',
					value: expect.objectContaining({ receipt: expect.any(String) }),
				})
			} finally {
				await probe.destroy()
			}
		},
	)

	it('replaces a type stage its deadline destroyed', { timeout: 180_000 }, async () => {
		const expirations = createRecorder<[Claim]>()
		const probe = new Probe({
			workspace: ROOT,
			deadline: 6_000,
			on: { expire: expirations.handler },
		})
		const test = {
			path: 'tmp/probe/heavy-type.test.ts',
			text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
		}
		// Thirty candidates is about 38 seconds of compiler work behind a 6-second deadline. The
		// stage hands the host's event loop back between candidates, so the expiry lands at the
		// first boundary after the deadline rather than after the whole claim: the wait is one
		// candidate, and the margin is what keeps a faster host from finishing inside the budget.
		const files: readonly Source[] = Array.from({ length: 30 }, (_unused, index) =>
			createHeavySource(index),
		)
		const heavy: Claim = {
			project: 'configs/src/tsconfig.core.json',
			case: { files, test },
			control: {
				files,
				test,
				stage: 'type',
				reason: 'the candidate outruns the deadline the coordinator allows one stage',
			},
		}
		const clean = { path: 'src/core/after-type-expiry.ts', text: "export const VALUE = 'ok'\n" }
		mkdirSync(resolve(ROOT, 'tmp/probe'), { recursive: true })
		try {
			await expect(probe.prove(heavy)).rejects.toThrow('The type stage exceeded 6000 ms')
			expect(expirations.calls).toStrictEqual([[heavy]])
			// The claim that follows is the point: a stage the expiry only destroyed refuses it, and
			// the refusal names a stage this caller never asked about.
			const served = await probe.prove({
				project: 'configs/src/tsconfig.core.json',
				case: { files: [clean], test },
				control: {
					files: [
						{ path: 'src/core/after-type-expiry.ts', text: "export const VALUE: number = 'bad'\n" },
					],
					test,
					stage: 'type',
					reason: 'the source assigns a string to a number',
				},
			})
			expect(served.receipt).toBeTypeOf('string')
			expect(served.checks.flatMap((check) => check.findings)).toStrictEqual([])
		} finally {
			await probe.destroy()
		}
	})

	it('replaces a lint stage its deadline destroyed', { timeout: 60_000 }, async () => {
		const scratch = createScratch()
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules/typescript', resolve(ROOT, 'node_modules/typescript'))
		scratch.link('node_modules/vitest', resolve(ROOT, 'node_modules/vitest'))
		scratch.write(
			'node_modules/oxlint/package.json',
			'{"name":"oxlint","version":"1.79.0","type":"module","bin":{"oxlint":"fixture.js"}}\n',
		)
		scratch.write('node_modules/oxlint/fixture.js', STALLING)
		scratch.write(
			'tsconfig.json',
			'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":["vitest/globals"]}}\n',
		)
		scratch.write(
			'vite.config.ts',
			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
		)
		scratch.write('tmp/probe/.keep', '')
		const probe = new Probe({ workspace: scratch.path, deadline: 6_000 })
		try {
			// Boot runs its own lint control, and a boot timeout carries the identical message a
			// stage timeout carries. Waiting for `arm` is what stops this proof accepting a
			// boot-origin rejection as evidence about the candidate.
			await new Promise<void>((armed, failed) => {
				probe.emitter.on('arm', () => armed())
				probe.emitter.on('error', (error) => failed(error))
			})
			await expect(
				Promise.race([
					probe.prove({
						project: 'tsconfig.json',
						case: {
							files: [
								{ path: 'src/core/stalled.ts', text: 'export const VALUE = 1 // PROBE_SILENT\n' },
							],
							test: {
								path: 'tmp/probe/stalled-lint.test.ts',
								text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
							},
						},
						control: {
							files: [
								{ path: 'src/core/stalled.ts', text: 'export const VALUE = 1 // PROBE_SILENT\n' },
							],
							test: {
								path: 'tmp/probe/stalled-lint.test.ts',
								text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
							},
							stage: 'lint',
							reason: 'the language server publishes no diagnostics for this candidate',
						},
					}),
					waitForDelay(7_000).then(() => {
						throw new Error('The stalled lint proof did not settle within its budget')
					}),
				]),
			).rejects.toThrow('The lint stage exceeded 6000 ms')
			// The claim that follows is the point: the fixture answers every candidate that does not
			// carry the marker, so a stage the expiry replaced serves it and a stage the expiry only
			// destroyed refuses it. Without the replacement this call reports the destruction of a
			// stage the caller never asked about.
			const served = await probe.prove({
				project: 'tsconfig.json',
				case: {
					files: [{ path: 'src/server/served.ts', text: 'export const VALUE = 1\n' }],
					test: {
						path: 'tmp/probe/served-lint.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
					},
				},
				control: {
					files: [{ path: 'src/server/served.ts', text: 'export const VALUE = 1\n' }],
					test: {
						path: 'tmp/probe/served-lint.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
					},
					stage: 'lint',
					reason: 'this control is deliberately clean',
				},
			})
			expect(served.checks.map((check) => check.stage).sort()).toStrictEqual([
				'lint',
				'runtime',
				'type',
			])
			expect(served.checks.flatMap((check) => check.findings)).toStrictEqual([])
		} finally {
			await probe.destroy()
			scratch.destroy()
		}
	})

	it(
		'names arming in a boot expiry and arms again for the next claim',
		{ timeout: 180_000 },
		async () => {
			const scratch = createScratch()
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules/typescript', resolve(ROOT, 'node_modules/typescript'))
			scratch.link('node_modules/vitest', resolve(ROOT, 'node_modules/vitest'))
			scratch.write(
				'node_modules/oxlint/package.json',
				'{"name":"oxlint","version":"1.79.0","type":"module","bin":{"oxlint":"fixture.js"}}\n',
			)
			scratch.write('node_modules/oxlint/fixture.js', STALLING)
			scratch.write(
				'tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":["vitest/globals"]}}\n',
			)
			scratch.write(
				'vite.config.ts',
				"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
			)
			scratch.write('tmp/probe/.keep', '')
			// The marker silences every document, so the boot control's own lint inspection outruns the
			// deadline and arming fails the way a slow workspace makes it fail.
			scratch.write('stall-lint', '')
			const armings = createRecorder<[Toolchain]>()
			const probe = new Probe({
				workspace: scratch.path,
				deadline: 6_000,
				on: { arm: armings.handler },
			})
			const claim: Claim = {
				project: 'tsconfig.json',
				case: {
					files: [{ path: 'src/core/rearmed.ts', text: 'export const VALUE = 1\n' }],
					test: {
						path: 'tmp/probe/rearmed.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
					},
				},
				control: {
					files: [{ path: 'src/core/rearmed.ts', text: 'export const VALUE = 1\n' }],
					test: {
						path: 'tmp/probe/rearmed.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
					},
					stage: 'lint',
					reason: 'this control is deliberately clean',
				},
			}
			try {
				// A boot expiry and a claim's own stage expiry carry one message unless the boot names
				// itself, so a caller reading `The lint stage exceeded 6000 ms` cannot tell whether its
				// candidate was slow or the instrument never served. Both calls name arming: the first
				// reports the boot the constructor started, the second reports the boot it ran itself.
				await expect(probe.prove(claim)).rejects.toThrow(
					'The probe could not arm: The lint stage exceeded 6000 ms',
				)
				await expect(probe.prove(claim)).rejects.toThrow(
					'The probe could not arm: The lint stage exceeded 6000 ms',
				)
				expect(armings.count).toBe(0)
				rmSync(resolve(scratch.path, 'stall-lint'), { force: true })
				// The workspace is repaired while the host keeps running, which is the whole claim of
				// the repair: the next call arms and answers rather than reporting a boot that failed
				// before the repair landed.
				const served = await probe.prove(claim)
				expect(armings.count).toBe(1)
				expect(served.checks.map((check) => check.stage).sort()).toStrictEqual([
					'lint',
					'runtime',
					'type',
				])
				expect(served.checks.flatMap((check) => check.findings)).toStrictEqual([])
			} finally {
				await probe.destroy()
				scratch.destroy()
			}
		},
	)

	it('carries boot findings into one observed arming refusal', { timeout: 60_000 }, async () => {
		const scratch = createScratch()
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write(
			'tsconfig.json',
			'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":["vitest/globals"]}}\n',
		)
		scratch.write(
			'vite.config.ts',
			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'other', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
		)
		scratch.write('tmp/probe/.keep', '')
		const failures = createRecorder<[unknown]>()
		const probe = new Probe({
			workspace: scratch.path,
			deadline: 60_000,
			on: { error: failures.handler },
		})
		try {
			await expect(
				probe.prove({
					project: 'tsconfig.json',
					case: {
						files: [],
						test: {
							path: 'tmp/probe/refused.test.ts',
							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
						},
					},
					control: {
						files: [],
						test: {
							path: 'tmp/probe/refused.test.ts',
							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
						},
						stage: 'type',
						reason: 'the probe did not arm',
					},
				}),
			).rejects.toThrow('The probe boot control did not begin clean')
			expect(failures.count).toBe(1)
			expect(failures.calls[0]?.[0]).toEqual(
				expect.objectContaining({
					message: expect.stringMatching(
						/probe boot control did not begin clean[\s\S]*runtime:[\s\S]*no configured Vitest project named probe/i,
					),
				}),
			)
		} finally {
			await probe.destroy()
			scratch.destroy()
		}
	})

	it('emits one error for an ordinary stage failure', { timeout: 60_000 }, async () => {
		const failures = createRecorder<[unknown]>()
		const probe = new Probe({
			workspace: ROOT,
			deadline: 60_000,
			on: { error: failures.handler },
		})
		try {
			await expect(
				probe.prove({
					project: 'configs/src/missing.json',
					case: {
						files: [{ path: 'src/core/stage-failure.ts', text: 'export const VALUE = 1\n' }],
						test: {
							path: 'tmp/probe/stage-failure.test.ts',
							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
						},
					},
					control: {
						files: [],
						test: {
							path: 'tmp/probe/stage-failure.test.ts',
							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
						},
						stage: 'type',
						reason: 'the project does not exist',
					},
				}),
			).rejects.toThrow('configs/src/missing.json')
			expect(failures.count).toBe(1)
		} finally {
			await probe.destroy()
		}
	})

	it(
		'destroys idempotently and observes one error for a later proof',
		{ timeout: 60_000 },
		async () => {
			const directory = fileURLToPath(new URL('../../../tmp/probe/', import.meta.url))
			mkdirSync(directory, { recursive: true })
			const failures = createRecorder<[unknown]>()
			const probe = new Probe({
				workspace: ROOT,
				deadline: 60_000,
				on: { error: failures.handler },
			})
			await Promise.all([probe.destroy(), probe.destroy()])
			await expect(
				probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: {
						files: [],
						test: {
							path: 'tmp/probe/after-destroy.test.ts',
							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
						},
					},
					control: {
						files: [],
						test: {
							path: 'tmp/probe/after-destroy.test.ts',
							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
						},
						stage: 'runtime',
						reason: 'the probe is destroyed',
					},
				}),
			).rejects.toThrow('The probe has been destroyed')
			expect(failures.count).toBe(1)
			expect(
				readdirSync(directory).filter((name) => name.startsWith('after-destroy.test.probe-')),
			).toStrictEqual([])
		},
	)
	it('publishes exactly the four events its map declares', () => {
		// `Record<keyof ProbeEventMap, …>` admits no other key and requires every declared one, so a
		// queue lifecycle event added to the published map fails this file's typecheck before it can
		// reach a listener.
		const declared: Record<keyof ProbeEventMap, true> = {
			arm: true,
			prove: true,
			expire: true,
			error: true,
		}
		expect(Object.keys(declared).sort()).toStrictEqual(['arm', 'error', 'expire', 'prove'])
	})

	it(
		'admits one inspection per stage at a time, in arrival order',
		{ timeout: 180_000 },
		async () => {
			const scratch = createScratch()
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules/typescript', resolve(ROOT, 'node_modules/typescript'))
			scratch.link('node_modules/vitest', resolve(ROOT, 'node_modules/vitest'))
			scratch.write(
				'node_modules/oxlint/package.json',
				'{"name":"oxlint","version":"1.79.0","type":"module","bin":{"oxlint":"fixture.js"}}\n',
			)
			scratch.write('node_modules/oxlint/fixture.js', ORDERED)
			scratch.write(
				'tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":["vitest/globals"]}}\n',
			)
			scratch.write(
				'vite.config.ts',
				"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
			)
			scratch.write('tmp/probe/.keep', '')
			scratch.write('probe-lint.log', '')
			const armings = createRecorder<[Toolchain]>()
			const verdicts = createRecorder<[Verdict]>()
			const expirations = createRecorder<[Claim]>()
			const failures = createRecorder<[unknown]>()
			const probe = new Probe({
				workspace: scratch.path,
				deadline: 60_000,
				on: {
					arm: armings.handler,
					prove: verdicts.handler,
					expire: expirations.handler,
					error: failures.handler,
				},
			})
			const passing = {
				path: 'tmp/probe/order.test.ts',
				text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
			}
			const first: Claim = {
				project: 'tsconfig.json',
				case: {
					files: [{ path: 'src/core/order-first.ts', text: 'export const VALUE = 1\n' }],
					test: passing,
				},
				control: {
					files: [{ path: 'src/core/order-first.ts', text: 'export const VALUE = 1\n' }],
					test: passing,
					stage: 'type',
					reason: 'this control is deliberately clean',
				},
			}
			const second: Claim = {
				project: 'tsconfig.json',
				case: {
					files: [{ path: 'src/server/order-second.ts', text: 'export const VALUE = 2\n' }],
					test: passing,
				},
				control: {
					files: [{ path: 'src/server/order-second.ts', text: 'export const VALUE = 2\n' }],
					test: passing,
					stage: 'type',
					reason: 'this control is deliberately clean',
				},
			}
			try {
				// Boot runs its own controls through the same server, so the record starts once the
				// instrument serves and holds the two claims alone.
				await new Promise<void>((armed, failed) => {
					probe.emitter.on('arm', () => armed())
					probe.emitter.on('error', (error) => failed(error))
				})
				scratch.write('probe-lint.log', '')
				const verdict = await Promise.all([probe.prove(first), probe.prove(second)])
				const lines = (scratch.read('probe-lint.log') ?? '')
					.split('\n')
					.filter((line) => line.startsWith('open '))
				// Four inspections, each opening its candidate source and then its test.
				expect(lines).toHaveLength(8)
				expect(lines.map((line) => line.split(' ')[1])).toStrictEqual(Array(8).fill('1'))
				expect(
					lines
						.filter((line) => line.includes('/src/'))
						.map((line) => (line.includes('/src/core/') ? 'first' : 'second')),
				).toStrictEqual(['first', 'second', 'first', 'second'])
				expect(verdict.map((answer) => answer.checks.map((check) => check.stage).sort())).toEqual([
					['lint', 'runtime', 'type'],
					['lint', 'runtime', 'type'],
				])
				expect(armings.count).toBe(1)
				expect(verdicts.count).toBe(2)
				expect(expirations.count).toBe(0)
				expect(failures.count).toBe(0)
			} finally {
				await probe.destroy()
				scratch.destroy()
			}
		},
	)
	it(
		'binds the project into the token and holds the claim digest across projects',
		{ timeout: 120_000 },
		async () => {
			const id = randomUUID()
			const lax = `tmp/probe/probe-project-${id}.json`
			mkdirSync(resolve(ROOT, 'tmp/probe'), { recursive: true })
			writeFileSync(
				resolve(ROOT, lax),
				'{"compilerOptions":{"strict":false,"target":"ESNext","module":"ESNext","moduleResolution":"bundler","skipLibCheck":true,"types":[]},"files":["../../src/core/index.ts"]}\n',
				'utf8',
			)
			const test = {
				path: `tmp/probe/probe-project-${id}.test.ts`,
				text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
			}
			const clean = { path: `src/core/probe-project-${id}.ts`, text: "export const VALUE = 'ok'\n" }
			const broken = {
				path: `src/core/probe-project-${id}.ts`,
				text: "export const VALUE: number = 'bad'\n",
			}
			const claim: Claim = {
				project: 'configs/src/tsconfig.core.json',
				case: { files: [clean], test },
				control: {
					files: [broken],
					test,
					stage: 'type',
					reason: 'the source assigns a string to a number',
				},
			}
			const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
			try {
				const honest = await probe.prove(claim)
				const chosen = await probe.prove({ ...claim, project: lax })
				const repeated = await probe.prove(claim)
				const honestToken = honest.receipt?.split(':') ?? []
				const chosenToken = chosen.receipt?.split(':') ?? []

				// The claim is byte-identical across all three calls and only the project moves, so
				// the claim digest must hold and the project digest must not.
				expect(honest.digest).toBe(chosen.digest)
				expect(honest.project.path).toBe('configs/src/tsconfig.core.json')
				expect(chosen.project.path).toBe(lax)
				expect(honest.project.digest).not.toBe(chosen.project.digest)
				// The control for that inequality: a digest that varied per call would satisfy it
				// while reading nothing, so one project read twice must return one digest.
				expect(repeated.project.digest).toBe(honest.project.digest)
				expect(repeated.digest).toBe(honest.digest)

				expect(honestToken).toHaveLength(7)
				expect(chosenToken).toHaveLength(7)
				expect(honestToken.slice(0, 6)).toStrictEqual(chosenToken.slice(0, 6))
				expect(honestToken[6]).toBe(`configs/src/tsconfig.core.json@${honest.project.digest}`)
				expect(chosenToken[6]).toBe(`${lax}@${chosen.project.digest}`)
				// The call identity is fresh per call and absent from both tokens, so two honest
				// runs of one claim under one project are comparable strings.
				expect(honest.id).not.toBe(repeated.id)
				expect(repeated.receipt).toBe(honest.receipt)
			} finally {
				await probe.destroy()
				rmSync(resolve(ROOT, lax), { force: true })
			}
		},
	)

	it(
		'names the caller-chosen project in the token the workspace project refuses',
		{ timeout: 120_000 },
		async () => {
			const id = randomUUID()
			const lax = `tmp/probe/probe-forgery-${id}.json`
			mkdirSync(resolve(ROOT, 'tmp/probe'), { recursive: true })
			writeFileSync(
				resolve(ROOT, lax),
				'{"compilerOptions":{"strict":false,"target":"ESNext","module":"ESNext","moduleResolution":"bundler","skipLibCheck":true,"types":[]},"files":["../../src/core/index.ts"]}\n',
				'utf8',
			)
			const test = {
				path: `tmp/probe/probe-forgery-${id}.test.ts`,
				text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
			}
			// Clean under a project without `strictNullChecks` and reported under the workspace's
			// own, which is the whole of the attack: the caller picks what judges its case.
			const candidate = {
				path: `src/core/probe-forgery-${id}.ts`,
				text: 'export function measure(value?: string): number {\n\treturn value.length\n}\n',
			}
			const broken = {
				path: `src/core/probe-forgery-${id}.ts`,
				text: "export function measure(value?: string): number {\n\treturn value.length\n}\nexport const BAD: number = 'bad'\n",
			}
			const claim: Claim = {
				project: lax,
				case: { files: [candidate], test },
				control: {
					files: [broken],
					test,
					stage: 'type',
					reason: 'the source assigns a string to a number',
				},
			}
			const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
			try {
				const forged = await probe.prove(claim)
				const workspace = await probe.prove({
					...claim,
					project: 'configs/src/tsconfig.core.json',
				})

				expect(forged.receipt).toBe(
					`probe:${forged.digest}:type:typescript@${forged.toolchain.typescript}:oxlint@${forged.toolchain.oxlint}:vitest@${forged.toolchain.vitest}:${lax}@${forged.project.digest}`,
				)
				// The control that makes the receipt above worth reading: the same claim under the
				// workspace's own project reports the candidate and issues nothing, so a policy
				// comparing the token's project field refuses what a token without one admitted.
				expect(workspace.receipt).toBeUndefined()
				expect(workspace.checks.flatMap((check) => check.findings)).toEqual([
					expect.objectContaining({
						origin: 'code',
						path: `src/core/probe-forgery-${id}.ts`,
						message: "'value' is possibly 'undefined'.",
					}),
				])
				expect(forged.digest).toBe(workspace.digest)
			} finally {
				await probe.destroy()
				rmSync(resolve(ROOT, lax), { force: true })
			}
		},
	)

	it('separates two claims answered under one project', { timeout: 120_000 }, async () => {
		const id = randomUUID()
		const test = {
			path: `tmp/probe/probe-claims-${id}.test.ts`,
			text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
		}
		const broken = {
			path: `src/core/probe-claims-${id}.ts`,
			text: "export const VALUE: number = 'bad'\n",
		}
		const claim = (text: string): Claim => ({
			project: 'configs/src/tsconfig.core.json',
			case: { files: [{ path: `src/core/probe-claims-${id}.ts`, text }], test },
			control: {
				files: [broken],
				test,
				stage: 'type',
				reason: 'the source assigns a string to a number',
			},
		})
		const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
		try {
			const first = await probe.prove(claim("export const VALUE = 'first'\n"))
			const second = await probe.prove(claim("export const VALUE = 'second'\n"))
			const firstToken = first.receipt?.split(':') ?? []
			const secondToken = second.receipt?.split(':') ?? []

			expect(first.digest).not.toBe(second.digest)
			expect(first.project).toStrictEqual(second.project)
			expect(firstToken).toHaveLength(7)
			expect(secondToken).toHaveLength(7)
			expect(firstToken[1]).toBe(first.digest)
			expect(secondToken[1]).toBe(second.digest)
			expect(firstToken[1]).not.toBe(secondToken[1])
			// Every other field answers to the workspace rather than to the claim, so a receipt
			// earned for one claim cannot be presented as proof of another.
			expect(firstToken[0]).toBe(secondToken[0])
			expect(firstToken.slice(2)).toStrictEqual(secondToken.slice(2))
		} finally {
			await probe.destroy()
		}
	})

	it('mints one token for one claim in two separate processes', { timeout: 180_000 }, async () => {
		const id = randomUUID()
		const spec = `tmp/probe/probe-portable-${id}.test.ts`
		mkdirSync(resolve(ROOT, 'tmp/probe'), { recursive: true })
		const claim: Claim = {
			project: 'configs/src/tsconfig.core.json',
			case: {
				files: [{ path: `src/core/probe-portable-${id}.ts`, text: "export const VALUE = 'ok'\n" }],
				test: {
					path: `tmp/probe/probe-portable-subject-${id}.test.ts`,
					text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
				},
			},
			control: {
				files: [
					{
						path: `src/core/probe-portable-${id}.ts`,
						text: "export const VALUE: number = 'bad'\n",
					},
				],
				test: {
					path: `tmp/probe/probe-portable-subject-${id}.test.ts`,
					text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
				},
				stage: 'type',
				reason: 'the source assigns a string to a number',
			},
		}
		// A second process reaches this package through the workbench project the workspace
		// already configures, so the child runs the real source under the real resolution
		// rather than through a loader written for the test.
		writeFileSync(
			resolve(ROOT, spec),
			[
				"import { Probe } from '@src/server'",
				"import { test } from 'vitest'",
				'',
				`const CLAIM = ${JSON.stringify(claim)}`,
				'',
				"test('mints', { timeout: 180_000 }, async () => {",
				'\tconst probe = new Probe({ workspace: process.cwd(), deadline: 60_000 })',
				'\ttry {',
				'\t\tconst verdict = await probe.prove(CLAIM)',
				'\t\tconsole.log(`RECEIPT ${String(verdict.receipt)}`)',
				'\t} finally {',
				'\t\tawait probe.destroy()',
				'\t}',
				'})',
				'',
			].join('\n'),
			'utf8',
		)
		const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
		try {
			const local = await probe.prove(claim)
			const child = spawnSync(
				process.execPath,
				[
					resolve(ROOT, 'node_modules/vitest/vitest.mjs'),
					'run',
					'--config',
					'vite.config.ts',
					'--no-cache',
					'--reporter=dot',
					'--project',
					'probe',
					spec,
				],
				{ cwd: ROOT, encoding: 'utf8', timeout: 150_000 },
			)
			const reported = /RECEIPT (\S+)/.exec(`${child.stdout}\n${child.stderr}`)?.[1]
			if (reported === undefined) {
				throw new Error(`The second process minted no token\n${child.stdout}\n${child.stderr}`)
			}

			expect(local.receipt).toBeTypeOf('string')
			expect(reported).toBe(local.receipt)
		} finally {
			await probe.destroy()
			rmSync(resolve(ROOT, spec), { force: true })
		}
	})
})
