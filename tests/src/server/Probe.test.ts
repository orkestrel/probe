import type { Claim, ProbeEventMap, Toolchain, Verdict } from '@src/core'
import { mkdirSync, readdirSync } from 'node:fs'
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

	it('bounds a lint stage that does not publish diagnostics', { timeout: 60_000 }, async () => {
		const scratch = createScratch()
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules/typescript', resolve(ROOT, 'node_modules/typescript'))
		scratch.link('node_modules/vitest', resolve(ROOT, 'node_modules/vitest'))
		scratch.write(
			'node_modules/oxlint/package.json',
			'{"name":"oxlint","version":"1.79.0","type":"module","bin":{"oxlint":"fixture.js"}}\n',
		)
		scratch.write(
			'node_modules/oxlint/fixture.js',
			"let buffer = Buffer.alloc(0)\nsetTimeout(() => process.exit(0), 30_000)\nprocess.stdin.on('data', (chunk) => {\n\tbuffer = Buffer.concat([buffer, chunk])\n\twhile (true) {\n\t\tconst boundary = buffer.indexOf('\\r\\n\\r\\n')\n\t\tif (boundary < 0) return\n\t\tconst header = buffer.subarray(0, boundary).toString('ascii')\n\t\tconst match = /Content-Length: (\\d+)/i.exec(header)\n\t\tif (match === null) return\n\t\tconst length = Number(match[1])\n\t\tconst start = boundary + 4\n\t\tif (buffer.length < start + length) return\n\t\tconst message = JSON.parse(buffer.subarray(start, start + length).toString('utf8'))\n\t\tbuffer = buffer.subarray(start + length)\n\t\tif (message.method === 'initialize') {\n\t\t\tconst content = JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { capabilities: {} } })\n\t\t\tprocess.stdout.write(`Content-Length: ${Buffer.byteLength(content)}\\r\\n\\r\\n${content}`)\n\t\t}\n\t\tif (message.method === 'textDocument/didOpen' && !message.params.textDocument.uri.includes('/src/core/')) {\n\t\t\tconst content = JSON.stringify({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: message.params.textDocument.uri, diagnostics: [] } })\n\t\t\tprocess.stdout.write(`Content-Length: ${Buffer.byteLength(content)}\\r\\n\\r\\n${content}`)\n\t\t}\n\t\tif (message.method === 'shutdown') {\n\t\t\tconst content = JSON.stringify({ jsonrpc: '2.0', id: message.id, result: null })\n\t\t\tprocess.stdout.write(`Content-Length: ${Buffer.byteLength(content)}\\r\\n\\r\\n${content}`)\n\t\t}\n\t\tif (message.method === 'exit') process.exit(0)\n\t}\n})\n",
		)
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
							files: [{ path: 'src/core/stalled.ts', text: 'export const VALUE = 1\n' }],
							test: {
								path: 'tmp/probe/stalled-lint.test.ts',
								text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
							},
						},
						control: {
							files: [{ path: 'src/core/stalled.ts', text: 'export const VALUE = 1\n' }],
							test: {
								path: 'tmp/probe/stalled-lint.test.ts',
								text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
							},
							stage: 'lint',
							reason: 'the language server does not publish diagnostics for ignored source',
						},
					}),
					waitForDelay(7_000).then(() => {
						throw new Error('The stalled lint proof did not settle within its budget')
					}),
				]),
			).rejects.toThrow('The lint stage exceeded 6000 ms')
		} finally {
			await Promise.race([probe.destroy(), waitForDelay(5_000)])
			scratch.destroy()
		}
	})

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
})
