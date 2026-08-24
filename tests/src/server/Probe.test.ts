import type { Check, Claim, Draft, ProbeEventMap, Toolchain, Verdict } from '@src/core'
import {
	closeSync,
	constants,
	existsSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
	writeSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRecorder, createTeardown, waitForCondition, waitForDelay } from '@orkestrel/test'
import { createScratch } from '@orkestrel/test/server'
import { peerDependencies } from '../../../package.json' with { type: 'json' }
import { Probe, readWorkspaceManifest } from '@src/server'
import { matchesSpecification } from '@src/core'
import { describe, expect, it } from 'vitest'
import { WORKSPACE_ROOT } from '../../setup.js'

const ROOT = fileURLToPath(WORKSPACE_ROOT)

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

// Builds one candidate draft whose type check costs about a second: 100 exclusions applied one
// after another to a 10,000-member template-literal union, measured at 12.8 ms per exclusion in this
// workspace. Volume is what makes the cost predictable, because the compiler pays per exclusion, so
// a claim carrying enough of these outruns a deadline by a margin no host's speed closes. The
// candidate is clean: the work is the point, and a diagnostic would report something else.
function createHeavyDraft(index: number): Draft {
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

// The timings the `Verdict` contract's own `@example` states, in the order the block writes them:
// each case stage, each control stage, then the whole call. `prove` runs the case through
// its stages and only then the control through its own, so an example whose call is faster than the
// slowest stage of each phase together describes an accounting this coordinator does not have.
function readDocumentedTimings(): readonly number[] {
	const contract = readFileSync(resolve(ROOT, 'src/core/types.ts'), 'utf8')
	const start = contract.indexOf('const verdict: Verdict = {')
	const end = contract.indexOf('export interface Verdict', start)
	return [...contract.slice(start, end).matchAll(/elapsed: (\d+)/g)].map((match) =>
		Number(match[1]),
	)
}

function slowest(checks: readonly Check[]): number {
	return Math.max(...checks.map((check) => check.elapsed))
}

// Returns the draft again carrying one trailing comment, which every stage reads as the draft it
// already was. A fixture whose subject is a deadline, a queue, or a teardown wants its control to
// reach the stages, and `prove` refuses a control repeating the whole case without letting a stage
// inspect it, so each such control varies here rather than in the behaviour the fixture is measuring.
function varyDraft(draft: Draft): Draft {
	return { path: draft.path, text: `${draft.text}// the control, one comment apart\n` }
}

describe.sequential('probe', () => {
	it(
		'mints receipts only when every stage executes cleanly, including for a control that shares no path with its case, and returns admitted path issues',
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
			// Broken code at a path the case never names, paired with a test the case never declares.
			// Nothing about this control is a mutation of its case, which is the pairing the guide says
			// probe admits and the reader judges.
			const foreign = {
				path: 'src/core/probe-receipt-foreign.ts',
				text: "export const FOREIGN: number = 'bad'\n",
			}
			const foreignTest = {
				path: 'tmp/probe/probe-foreign.test.ts',
				text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(3 * 3).toBe(9))\n",
			}
			try {
				const minted = await probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: { files: [clean], test },
					control: {
						files: [broken],
						test,
						stage: 'type',
						reason: 'the source assigns a string to a number',
					},
				})
				// Admitted, because it is not the case again, and unable to break, because the only thing
				// it varies is a comment: every stage reports clean and the claim earns no receipt.
				const unbroken = await probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: { files: [clean], test },
					control: {
						files: [varyDraft(clean)],
						test,
						stage: 'type',
						reason: 'this control is deliberately clean',
					},
				})
				const unrelated = await probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: { files: [clean], test },
					control: {
						files: [foreign],
						test: foreignTest,
						stage: 'type',
						reason: 'a source file the case never names assigns a string to a number',
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
				await expect(
					probe.prove({
						project: 'configs/src/tsconfig.core.json',
						case: { files: [clean], test: unmapped },
						control: {
							files: [broken],
							test: unmapped,
							stage: 'type',
							reason: 'the source assigns a string to a number',
						},
					}),
				).rejects.toMatchObject({
					origin: 'claimant',
					code: 'missing',
					context: { stage: 'runtime', path: 'tests/unmapped.test.ts' },
				})
				expect(minted.receipt).toMatch(/^probe:/)
				expect(minted.reason).toBe('the source assigns a string to a number')
				// The control shares neither path with the case, so the receipt it earned is evidence
				// that relatedness is no receipt condition.
				expect(foreign.path).not.toBe(clean.path)
				expect(foreignTest.path).not.toBe(test.path)
				expect(unrelated.receipt).toMatch(/^probe:/)
				expect(unbroken.receipt).toBeUndefined()
				expect(unexecuted.receipt).toBeUndefined()
				expect(unexecuted.case.find((check) => check.stage === 'runtime')?.issues).toEqual([
					expect.objectContaining({
						origin: 'instrument',
						message: 'Vitest ran no tests in the module',
					}),
				])
			} finally {
				await probe.destroy()
			}
		},
	)

	it(
		'refuses a control that repeats the whole case, and admits one a byte apart',
		{ timeout: 120_000 },
		async () => {
			// This workspace cannot arm: its Vitest configuration declares no project collecting the
			// boot control's test path, so every claim that reaches the stages ends in the arming
			// failure. A claimant refusal here is therefore evidence no stage inspected the claim, and
			// the arming failure is evidence a control a byte apart got past the refusal.
			const scratch = createScratch({ prefix: 'probe-identical-' })
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
			const files = [{ path: 'src/core/identical.ts', text: "export const VALUE = 'ok'\n" }]
			const test = {
				path: 'tmp/probe/identical.test.ts',
				text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
			}
			const armed = {
				origin: 'instrument',
				code: 'malformed',
				message: expect.stringContaining('The probe could not arm'),
			}
			const probe = new Probe({ workspace: scratch.path, deadline: 60_000 })
			try {
				await expect(
					probe.prove({
						project: 'tsconfig.json',
						case: { files, test },
						control: { files, test, stage: 'type', reason: 'this control is the case again' },
					}),
				).rejects.toMatchObject({
					name: 'ProbeError',
					origin: 'claimant',
					code: 'refused',
					message: expect.stringContaining('The control must differ from the case'),
				})
				// The reason is the claimant's prose about the drafts rather than the drafts themselves,
				// so restating it leaves a control that still cannot break.
				await expect(
					probe.prove({
						project: 'tsconfig.json',
						case: { files, test },
						control: {
							files,
							test,
							stage: 'runtime',
							reason: 'the same control, in other words, at another stage',
						},
					}),
				).rejects.toMatchObject({ origin: 'claimant', code: 'refused' })
				// One byte apart in the candidate draft.
				await expect(
					probe.prove({
						project: 'tsconfig.json',
						case: { files, test },
						control: {
							files: [{ path: 'src/core/identical.ts', text: "export const VALUE = 'Ok'\n" }],
							test,
							stage: 'type',
							reason: 'the draft names another value',
						},
					}),
				).rejects.toMatchObject(armed)
				// One byte apart in the test, with the candidate drafts repeated: the case is both, so a
				// control varying either one is a control that can break.
				await expect(
					probe.prove({
						project: 'tsconfig.json',
						case: { files, test },
						control: {
							files,
							test: {
								path: 'tmp/probe/identical.test.ts',
								text: "import { test } from 'vitest'\ntest('Passes', () => {})\n",
							},
							stage: 'runtime',
							reason: 'the test asserts under another name',
						},
					}),
				).rejects.toMatchObject(armed)
				// One byte apart, and alike under the digest a verdict carries: that digest rewrites every
				// workspace-contained absolute string to its workspace-relative form, so these two
				// spellings of one anchor collapse to one hash. A refusal reading that digest would refuse
				// a control the claimant can break, so this control is admitted and reaches the arming
				// failure.
				const anchored = `${scratch.path}/anchor`
				await expect(
					probe.prove({
						project: 'tsconfig.json',
						case: { files: [{ path: 'src/core/identical.ts', text: `/${anchored}` }], test },
						control: {
							files: [{ path: 'src/core/identical.ts', text: `//${anchored}` }],
							test,
							stage: 'type',
							reason: 'the drafts spell one anchor two ways',
						},
					}),
				).rejects.toMatchObject(armed)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => probe.destroy())
				await teardown.destroy()
			}
		},
	)

	it(
		'accounts one verdict for the two phases it ran in sequence',
		{ timeout: 60_000 },
		async () => {
			const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
			const test = {
				path: 'tmp/probe/probe-elapsed.test.ts',
				text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
			}
			try {
				const verdict = await probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: {
						files: [{ path: 'src/core/probe-elapsed.ts', text: "export const VALUE = 'ok'\n" }],
						test,
					},
					control: {
						files: [
							{ path: 'src/core/probe-elapsed.ts', text: "export const VALUE: number = 'bad'\n" },
						],
						test,
						stage: 'type',
						reason: 'the source assigns a string to a number',
					},
				})
				const documented = readDocumentedTimings()

				expect(verdict.elapsed).toBeGreaterThanOrEqual(
					slowest(verdict.case) + slowest(verdict.control),
				)
				// The same relation applied to the contract's own example, so the documented figure
				// cannot drift back below the accounting the preceding run demonstrated.
				expect(documented).toHaveLength(7)
				expect(documented[6]).toBeGreaterThanOrEqual(
					Math.max(...documented.slice(0, 3)) + Math.max(...documented.slice(3, 6)),
				)
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
		'retains all stage checks when the runtime stage cannot write its specification',
		{ timeout: 60_000 },
		async () => {
			const marker = `probe-blocked-${randomUUID()}`
			const path = `tmp/probe/${marker}/deep/missing-runtime.test.ts`
			const blocker = resolve(ROOT, 'tmp/probe', marker)
			mkdirSync(resolve(ROOT, 'tmp/probe'), { recursive: true })
			// A file where the case's declared test directory belongs. The runtime stage creates the
			// directory a claim declares, so a directory it cannot create is what leaves the stage
			// with nowhere to write.
			writeFileSync(blocker, '', 'utf8')
			const probe = new Probe({ workspace: ROOT, deadline: 60_000 })
			try {
				const verdict = await probe.prove({
					project: 'configs/src/tsconfig.core.json',
					case: {
						files: [{ path: 'src/core/missing-runtime.ts', text: "export const VALUE = 'ok'\n" }],
						test: { path, text: "import { test } from 'vitest'\ntest('passes', () => {})\n" },
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
				expect(verdict.case.map((check) => check.stage)).toStrictEqual(['type', 'lint', 'runtime'])
				expect(verdict.case.find((check) => check.stage === 'type')?.issues).toStrictEqual([])
				expect(verdict.case.find((check) => check.stage === 'lint')?.issues).toStrictEqual([])
				expect(verdict.case.find((check) => check.stage === 'runtime')?.issues).toEqual([
					expect.objectContaining({
						origin: 'workspace',
						path,
						message: expect.stringContaining(
							'The runtime stage could not write the generated specification',
						),
					}),
				])
			} finally {
				const teardown = createTeardown()
				teardown.add(() => rmSync(blocker, { force: true }))
				teardown.add(() => probe.destroy())
				await teardown.destroy()
			}
		},
	)

	it('reports a blocked boot workbench as a workspace failure', async () => {
		const scratch = createScratch()
		scratch.write('package.json', '{"type":"module"}\n')
		scratch.link('node_modules', resolve(ROOT, 'node_modules'))
		scratch.write(
			'tsconfig.json',
			'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","types":["vitest/globals"]}}\n',
		)
		scratch.write(
			'vite.config.ts',
			"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'] } }] } })\n",
		)
		scratch.write('tmp/probe', '')
		const probe = new Probe({ workspace: scratch.path })
		try {
			await expect(
				probe.prove({
					project: 'tsconfig.json',
					case: {
						files: [],
						test: {
							path: 'tmp/probe/blocked-workbench.test.ts',
							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
						},
					},
					control: {
						files: [],
						test: {
							path: 'tmp/probe/blocked-workbench.test.ts',
							text: "import { test } from 'vitest'\ntest('fails', () => { throw new Error('control') })\n",
						},
						stage: 'runtime',
						reason: 'the test throws',
					},
				}),
			).rejects.toMatchObject({
				name: 'ProbeError',
				message: expect.stringContaining('The probe could not create the boot workbench'),
				origin: 'workspace',
				code: 'malformed',
				context: { path: 'tmp/probe' },
				cause: expect.any(Error),
			})
		} finally {
			const teardown = createTeardown()
			teardown.add(() => scratch.destroy())
			teardown.add(() => probe.destroy())
			await teardown.destroy()
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
			).rejects.toMatchObject({
				name: 'ProbeError',
				message: `The supported TypeScript range is ${peerDependencies.typescript}; found 7.0.2`,
				origin: 'workspace',
				code: 'malformed',
				context: { name: 'typescript', value: '7.0.2' },
			})
		} finally {
			const teardown = createTeardown()
			teardown.add(() => scratch.destroy())
			teardown.add(() => probe.destroy())
			await teardown.destroy()
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
					test: varyDraft({
						path: 'tmp/probe/expiry.test.ts',
						text: "import { test } from 'vitest'\ntest('never returns', () => { while (true) {} })\n",
					}),
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
					reason: expect.objectContaining({
						origin: 'claimant',
						code: 'deadline',
						message: 'The runtime stage exceeded 6000 ms',
					}),
				})
				expect(expirations.calls).toStrictEqual([[hanging]])
				expect(
					readdirSync(fileURLToPath(new URL('../../../tmp/probe/', import.meta.url))).filter(
						(name) => name.startsWith('expiry.test.probe-'),
					),
				).toStrictEqual([])
				expect(outcomes[1]).toMatchObject({
					status: 'fulfilled',
					value: expect.objectContaining({ receipt: expect.any(String) }),
				})
				expect(failures.count).toBe(1)
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
		const files: readonly Draft[] = Array.from({ length: 30 }, (_unused, index) =>
			createHeavyDraft(index),
		)
		const heavy: Claim = {
			project: 'configs/src/tsconfig.core.json',
			case: { files, test },
			control: {
				files,
				test: varyDraft(test),
				stage: 'type',
				reason: 'the candidate outruns the deadline the coordinator allows one stage',
			},
		}
		const clean = { path: 'src/core/after-type-expiry.ts', text: "export const VALUE = 'ok'\n" }
		mkdirSync(resolve(ROOT, 'tmp/probe'), { recursive: true })
		try {
			await expect(probe.prove(heavy)).rejects.toMatchObject({
				name: 'ProbeError',
				message: 'The type stage exceeded 6000 ms',
				origin: 'claimant',
				code: 'deadline',
				context: { stage: 'type', deadline: 6000 },
			})
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
			expect(served.case.flatMap((check) => check.issues)).toStrictEqual([])
		} finally {
			await probe.destroy()
		}
	})

	it(
		'expires caller-named project resolution and serves through the recycled type stage',
		{ timeout: 180_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-project-deadline-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","strict":true,"types":["node","vitest/globals"]},"files":["src/core/index.ts"]}\n',
			)
			scratch.write('src/core/index.ts', 'export const READY = true\n')
			scratch.write(
				'vite.config.ts',
				"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'], environment: 'node' } }] } })\n",
			)
			scratch.write('tmp/probe/.keep', '')
			const include: string[] = []
			for (let index = 0; index < 10_000; index += 1) {
				const directory = `generated/d${index}`
				scratch.write(`${directory}/index.ts`, 'export {}\n')
				if (index < 1_200) include.push(`../${directory}/**/*.ts`)
			}
			const project = 'projects/tsconfig.generated.json'
			scratch.write(
				project,
				`${JSON.stringify({ compilerOptions: { skipLibCheck: true, types: [] }, include })}\n`,
			)
			const expirations = createRecorder<[Claim]>()
			const probe = new Probe({
				workspace: scratch.path,
				deadline: 2_000,
				on: { expire: expirations.handler },
			})
			const test = {
				path: 'tmp/probe/project-deadline.test.ts',
				text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
			}
			const claim: Claim = {
				project,
				case: {
					files: [{ path: 'src/core/project-deadline.ts', text: 'export const VALUE = 1\n' }],
					test,
				},
				control: {
					files: [
						varyDraft({ path: 'src/core/project-deadline.ts', text: 'export const VALUE = 1\n' }),
					],
					test,
					stage: 'type',
					reason: 'project discovery outruns the coordinator budget',
				},
			}
			try {
				await Promise.race([
					new Promise<void>((armed) => probe.emitter.on('arm', () => armed())),
					waitForDelay(10_000).then(() => {
						throw new Error('The project deadline fixture did not arm')
					}),
				])
				await expect(probe.prove(claim)).rejects.toMatchObject({
					name: 'ProbeError',
					message: 'The type stage project resolution exceeded 2000 ms',
					origin: 'claimant',
					code: 'deadline',
					context: { stage: 'type', deadline: 2000 },
				})
				expect(expirations.calls).toStrictEqual([[claim]])
				const served = await probe.prove({
					project: 'tsconfig.json',
					case: {
						files: [
							{ path: 'src/core/after-project-deadline.ts', text: 'export const VALUE = 1\n' },
						],
						test,
					},
					control: {
						files: [
							{
								path: 'src/core/after-project-deadline.ts',
								text: "export const VALUE: number = 'bad'\n",
							},
						],
						test,
						stage: 'type',
						reason: 'the source assigns a string to a number',
					},
				})
				expect(served.receipt).toBeTypeOf('string')
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => probe.destroy())
				await teardown.destroy()
			}
		},
	)

	it(
		'serializes project resolution against a live type inspection',
		{ timeout: 180_000 },
		async () => {
			const scratch = createScratch({ prefix: 'probe-project-serialization-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","strict":true,"types":["node","vitest/globals"]},"files":["src/core/index.ts"]}\n',
			)
			scratch.write('src/core/index.ts', 'export const READY = true\n')
			scratch.write(
				'vite.config.ts',
				"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'], environment: 'node' } }] } })\n",
			)
			scratch.write('tmp/probe/.keep', '')
			const projectA = 'projects/tsconfig.a.json'
			const projectB = 'projects/tsconfig.b.json'
			const project =
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","strict":true,"types":[]},"files":["../src/core/index.ts"]}\n'
			scratch.write(projectA, project)
			scratch.write(projectB, '{"compilerOptions" {"strict":true}}\n')
			const probe = new Probe({ workspace: scratch.path, deadline: 60_000 })
			const test = {
				path: 'tmp/probe/project-serialization.test.ts',
				text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
			}
			const first: Claim = {
				project: projectA,
				case: {
					files: Array.from({ length: 4 }, (_unused, index) => createHeavyDraft(index)),
					test,
				},
				control: {
					files: Array.from({ length: 4 }, (_unused, index) => varyDraft(createHeavyDraft(index))),
					test,
					stage: 'type',
					reason: 'this control is deliberately clean',
				},
			}
			const second: Claim = {
				project: projectB,
				case: {
					files: [{ path: 'src/core/project-serialization.ts', text: 'export const VALUE = 1\n' }],
					test,
				},
				control: {
					files: [
						varyDraft({
							path: 'src/core/project-serialization.ts',
							text: 'export const VALUE = 1\n',
						}),
					],
					test,
					stage: 'type',
					reason: 'this control is deliberately clean',
				},
			}
			try {
				await new Promise<void>((armed, failed) => {
					probe.emitter.on('arm', () => armed())
					probe.emitter.on('error', (error) => failed(error))
				})
				const inspecting = probe.prove(first)
				await waitForDelay(100)
				const resolving = probe.prove(second)
				void resolving.catch(() => {})
				await waitForDelay(20)
				scratch.write(projectB, project)
				const verdicts = await Promise.all([inspecting, resolving])
				expect(verdicts.flatMap((verdict) => verdict.case)).toEqual(
					expect.arrayContaining([
						expect.objectContaining({ stage: 'type', issues: [] }),
						expect.objectContaining({ stage: 'type', issues: [] }),
					]),
				)
				const recycled = await probe.prove(second)
				expect(recycled.case.flatMap((check) => check.issues)).toStrictEqual([])
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => probe.destroy())
				await teardown.destroy()
			}
		},
	)

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
								varyDraft({
									path: 'src/core/stalled.ts',
									text: 'export const VALUE = 1 // PROBE_SILENT\n',
								}),
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
					files: [varyDraft({ path: 'src/server/served.ts', text: 'export const VALUE = 1\n' })],
					test: {
						path: 'tmp/probe/served-lint.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
					},
					stage: 'lint',
					reason: 'this control is deliberately clean',
				},
			})
			expect(served.case.map((check) => check.stage).sort()).toStrictEqual([
				'lint',
				'runtime',
				'type',
			])
			expect(served.case.flatMap((check) => check.issues)).toStrictEqual([])
		} finally {
			const teardown = createTeardown()
			teardown.add(() => scratch.destroy())
			teardown.add(() => probe.destroy())
			await teardown.destroy()
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
					files: [varyDraft({ path: 'src/core/rearmed.ts', text: 'export const VALUE = 1\n' })],
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
				expect(served.case.map((check) => check.stage).sort()).toStrictEqual([
					'lint',
					'runtime',
					'type',
				])
				expect(served.case.flatMap((check) => check.issues)).toStrictEqual([])
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => probe.destroy())
				await teardown.destroy()
			}
		},
	)

	it(
		"writes its boot dependencies under the sweep's revision identity",
		{ timeout: 60_000 },
		async () => {
			// The boot controls write real files into the target's `tmp/probe`, and a host killed
			// before the boot's own cleanup runs leaves them there. They carry the revision marker
			// for the same reason a generated specification does: the next warm sweeps a file whose
			// writing process is gone and leaves a live neighbour's alone.
			const scratch = createScratch()
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","strict":true,"types":[]}}\n',
			)
			scratch.write(
				'vite.config.ts',
				"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: { label: 'probe' }, include: ['tmp/probe/**/*.test.ts'], environment: 'node' } }] } })\n",
			)
			const directory = resolve(scratch.path, 'tmp/probe')
			const probe = new Probe({ workspace: scratch.path, deadline: 60_000 })
			let observed: readonly string[] = []
			try {
				await waitForCondition(
					'the probe boot dependencies to appear',
					() => {
						observed = existsSync(directory)
							? readdirSync(directory).filter((name) => name.startsWith('arm-'))
							: []
						return observed.length === 2
					},
					{ budget: 30_000, interval: 5 },
				)
				const revision = `probe-${process.pid}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`
				expect([...observed].sort()).toStrictEqual([
					expect.stringMatching(new RegExp(`^arm-runtime\\.${revision}\\.ts$`)),
					expect.stringMatching(new RegExp(`^arm-type\\.${revision}\\.ts$`)),
				])
				for (const name of observed) {
					const match = /\.probe-(.+)\.ts$/u.exec(name)
					const marked = match?.[1]
					if (marked === undefined) throw new Error(`Boot dependency carries no revision: ${name}`)
					expect(matchesSpecification(readFileSync(resolve(directory, name), 'utf8'), marked)).toBe(
						true,
					)
				}
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => probe.destroy())
				await teardown.destroy()
			}
		},
	)

	it(
		'refuses a receipt when the case reaches a string-declared runtime project',
		{ timeout: 60_000 },
		async () => {
			const scratch = createScratch()
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","strict":true,"types":["vitest/globals"]},"include":["src/**/*.ts","tests/**/*.ts","tmp/**/*.ts"]}\n',
			)
			scratch.write(
				'configs/src/tsconfig.core.json',
				'{"extends":"../../tsconfig.json","compilerOptions":{"types":[]},"include":["../../src/core/**/*.ts"]}\n',
			)
			scratch.write('src/core/index.ts', 'export const READY = true\n')
			scratch.write(
				'vite.config.ts',
				"import { defineConfig } from 'vitest/config'\nconst probe = { test: { name: { label: 'probe' }, include: ['tmp/probe/**/*.test.ts'], environment: 'node' } }\nexport default defineConfig({ test: { projects: [probe, './vitest.src.config.ts'] } })\n",
			)
			scratch.write(
				'vitest.src.config.ts',
				"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { name: { label: 'src:core' }, include: ['tests/src/core/**/*.test.ts'], environment: 'node' } })\n",
			)
			const id = randomUUID()
			const claim: Claim = {
				project: 'configs/src/tsconfig.core.json',
				case: {
					files: [{ path: `src/core/string-${id}.ts`, text: 'export const VALUE = 1\n' }],
					test: {
						path: `tests/src/core/string-${id}.test.ts`,
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
					},
				},
				control: {
					files: [
						{ path: `src/core/string-${id}.ts`, text: "export const VALUE: number = 'bad'\n" },
					],
					test: {
						path: `tests/src/core/string-${id}.test.ts`,
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(1).toBe(1))\n",
					},
					stage: 'type',
					reason: 'the source assigns a string to a number',
				},
			}
			const probe = new Probe({ workspace: scratch.path, deadline: 60_000 })
			try {
				const verdict = await probe.prove(claim)
				expect(verdict.case.flatMap((check) => check.issues)).toEqual([
					expect.objectContaining({ origin: 'workspace', path: claim.case.test.path }),
				])
				expect(verdict.receipt).toBeUndefined()
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => probe.destroy())
				await teardown.destroy()
			}
		},
	)

	it(
		'carries a boot stage failure into one observed arming refusal',
		{ timeout: 60_000 },
		async () => {
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
							test: varyDraft({
								path: 'tmp/probe/refused.test.ts',
								text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
							}),
							stage: 'type',
							reason: 'the probe did not arm',
						},
					}),
				).rejects.toMatchObject({
					origin: 'instrument',
					code: 'malformed',
					message:
						'The probe could not arm: The runtime stage found no configured Vitest project named probe',
					cause: expect.objectContaining({
						origin: 'claimant',
						code: 'missing',
						context: { stage: 'runtime', path: expect.any(String) },
					}),
				})
				expect(failures.count).toBe(1)
				expect(failures.calls[0]?.[0]).toEqual(
					expect.objectContaining({
						origin: 'instrument',
						code: 'malformed',
						message:
							'The probe could not arm: The runtime stage found no configured Vitest project named probe',
					}),
				)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => probe.destroy())
				await teardown.destroy()
			}
		},
	)

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
						test: varyDraft({
							path: 'tmp/probe/after-destroy.test.ts',
							text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
						}),
						stage: 'runtime',
						reason: 'the probe is destroyed',
					},
				}),
			).rejects.toMatchObject({
				name: 'ProbeError',
				message: 'The probe has been destroyed',
				code: 'destroyed',
			})
			expect(failures.count).toBe(1)
			expect(
				readdirSync(directory).filter((name) => name.startsWith('after-destroy.test.probe-')),
			).toStrictEqual([])
		},
	)

	it(
		'bounds teardown while a runtime specification is blocked',
		{ timeout: 60_000 },
		async (context) => {
			const scratch = createScratch({ prefix: 'probe-destroy-bound-' })
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.link('node_modules', resolve(ROOT, 'node_modules'))
			scratch.write(
				'tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","strict":true,"types":["node","vitest/globals"]},"include":["src/**/*.ts","tmp/**/*.ts"]}\n',
			)
			scratch.write('src/core/index.ts', 'export const READY = true\n')
			scratch.write(
				'vite.config.ts',
				"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'probe', include: ['tmp/probe/**/*.test.ts'], environment: 'node' } }] } })\n",
			)
			scratch.write('tmp/probe/.keep', '')
			const absent = resolve(scratch.path, 'absent/destroy-gate')
			expect(spawnSync('mkfifo', [absent]).status).not.toBe(0)
			expect(existsSync(absent)).toBe(false)
			const gate = resolve(scratch.path, 'tmp/probe/destroy-gate')
			const fifo = spawnSync('mkfifo', [gate])
			context.skip(
				fifo.status !== 0 || !existsSync(gate) || !lstatSync(gate).isFIFO(),
				'this host cannot create the FIFO that parks a generated Vitest specification during teardown',
			)
			const ready = resolve(scratch.path, 'tmp/probe/destroy-ready')
			const probe = new Probe({ workspace: scratch.path, deadline: 6_000 })
			let closing: Promise<void> | undefined
			const claim: Claim = {
				project: 'tsconfig.json',
				case: {
					files: [],
					test: {
						path: 'tmp/probe/destroy-bound.test.ts',
						text: "import { readFileSync, writeFileSync } from 'node:fs'\nimport { test } from 'vitest'\ntest('parks in a FIFO', { timeout: 60_000 }, () => { writeFileSync(new URL('destroy-ready', import.meta.url), ''); readFileSync(new URL('destroy-gate', import.meta.url)) })\n",
					},
				},
				control: {
					files: [],
					test: varyDraft({
						path: 'tmp/probe/destroy-bound.test.ts',
						text: "import { readFileSync, writeFileSync } from 'node:fs'\nimport { test } from 'vitest'\ntest('parks in a FIFO', { timeout: 60_000 }, () => { writeFileSync(new URL('destroy-ready', import.meta.url), ''); readFileSync(new URL('destroy-gate', import.meta.url)) })\n",
					}),
					stage: 'runtime',
					reason: 'the specification is blocked in a FIFO',
				},
			}
			const proof = probe.prove(claim)
			void proof.catch(() => {})
			try {
				const budget = performance.now() + 30_000
				while (!existsSync(ready) && performance.now() < budget) await waitForDelay(10)
				expect(existsSync(ready), 'the generated specification never reached its FIFO').toBe(true)
				await waitForDelay(50)
				const started = performance.now()
				closing = probe.destroy()
				const settled = await Promise.race([
					closing.then(() => true),
					waitForDelay(7_000).then(() => false),
				])
				expect(settled).toBe(true)
				expect(performance.now() - started).toBeLessThan(7_000)
			} finally {
				let descriptor: number | undefined
				try {
					descriptor = openSync(gate, constants.O_WRONLY | constants.O_NONBLOCK)
					writeSync(descriptor, 'release')
				} catch {
				} finally {
					if (descriptor !== undefined) closeSync(descriptor)
				}
				await (closing ?? probe.destroy()).catch(() => {})
				scratch.destroy()
			}
		},
	)
	it('publishes exactly the events its map declares', () => {
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
					files: [varyDraft({ path: 'src/core/order-first.ts', text: 'export const VALUE = 1\n' })],
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
					files: [
						varyDraft({ path: 'src/server/order-second.ts', text: 'export const VALUE = 2\n' }),
					],
					test: passing,
					stage: 'type',
					reason: 'this control is deliberately clean',
				},
			}
			try {
				// Boot runs its own controls through the same server, so the record starts once the
				// instrument serves and holds these claims alone.
				await new Promise<void>((armed, failed) => {
					probe.emitter.on('arm', () => armed())
					probe.emitter.on('error', (error) => failed(error))
				})
				scratch.write('probe-lint.log', '')
				const verdict = await Promise.all([probe.prove(first), probe.prove(second)])
				const lines = (scratch.read('probe-lint.log') ?? '')
					.split('\n')
					.filter((line) => line.startsWith('open '))
				// Each inspection opens its candidate draft and then its test.
				expect(lines).toHaveLength(8)
				expect(lines.map((line) => line.split(' ')[1])).toStrictEqual(Array(8).fill('1'))
				expect(
					lines
						.filter((line) => line.includes('/src/'))
						.map((line) => (line.includes('/src/core/') ? 'first' : 'second')),
				).toStrictEqual(['first', 'second', 'first', 'second'])
				expect(verdict.map((answer) => answer.case.map((check) => check.stage).sort())).toEqual([
					['lint', 'runtime', 'type'],
					['lint', 'runtime', 'type'],
				])
				expect(armings.count).toBe(1)
				expect(verdicts.count).toBe(2)
				expect(expirations.count).toBe(0)
				expect(failures.count).toBe(0)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => scratch.destroy())
				teardown.add(() => probe.destroy())
				await teardown.destroy()
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

				// The claim is byte-identical across every call and only the project moves, so
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
				const teardown = createTeardown()
				teardown.add(() => rmSync(resolve(ROOT, lax), { force: true }))
				teardown.add(() => probe.destroy())
				await teardown.destroy()
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
				// The control that makes the preceding receipt worth reading: the same claim under the
				// workspace's own project reports the candidate and issues nothing, so a policy
				// comparing the token's project field refuses what a token without one admitted.
				expect(workspace.receipt).toBeUndefined()
				expect(workspace.case.flatMap((check) => check.issues)).toEqual([
					expect.objectContaining({
						origin: 'claimant',
						path: `src/core/probe-forgery-${id}.ts`,
						message: "'value' is possibly 'undefined'.",
					}),
				])
				expect(forged.digest).toBe(workspace.digest)
			} finally {
				const teardown = createTeardown()
				teardown.add(() => rmSync(resolve(ROOT, lax), { force: true }))
				teardown.add(() => probe.destroy())
				await teardown.destroy()
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
			const teardown = createTeardown()
			teardown.add(() => rmSync(resolve(ROOT, spec), { force: true }))
			teardown.add(() => probe.destroy())
			await teardown.destroy()
		}
	})
})
