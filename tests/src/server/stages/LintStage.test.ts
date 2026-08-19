import { fileURLToPath } from 'node:url'
import { createScratch } from '@orkestrel/test/server'
import { LintStage } from '@src/server'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

// A protocol-faithful Oxlint language server that answers `initialize`, then publishes an empty
// diagnostic set for every document except one opened under `src/core`, which it leaves silent for
// the life of the connection. A stage that chains its inspections never reaches the second document.
const SILENT = [
	'let buffer = Buffer.alloc(0)',
	'setTimeout(() => process.exit(0), 60_000)',
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
	"\t\tif (message.method === 'textDocument/didOpen' && !message.params.textDocument.uri.includes('/src/core/')) {",
	"\t\t\tsend({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: message.params.textDocument.uri, diagnostics: [] } })",
	'\t\t}',
	"\t\tif (message.method === 'shutdown') send({ jsonrpc: '2.0', id: message.id, result: null })",
	"\t\tif (message.method === 'exit') process.exit(0)",
	'\t}',
	'})',
].join('\n')

describe('lint stage', () => {
	it(
		'reports a workspace lint finding for a gitignored test path',
		{ timeout: 60_000 },
		async () => {
			const stage = new LintStage(ROOT)
			try {
				const check = await stage.inspect({
					files: [],
					test: { path: 'tmp/probe/lint-stage.test.ts', text: 'debugger\n' },
				})
				expect(check.findings.length).toBeGreaterThan(0)
				expect(check.findings).toEqual(
					expect.arrayContaining([
						expect.objectContaining({ origin: 'code', path: 'tmp/probe/lint-stage.test.ts' }),
					]),
				)
				// Oxlint publishes diagnostics about the supplied text and nothing else, so every
				// finding this stage returns carries the origin that can disprove a claim.
				expect(check.findings.every((finding) => finding.origin === 'code')).toBe(true)
			} finally {
				await stage.destroy()
			}
		},
	)

	it('abandons an inspection and destroys idempotently', { timeout: 60_000 }, async () => {
		const stage = new LintStage(ROOT)
		const inspection = stage.inspect({
			files: [],
			test: { path: 'tmp/probe/lint-destroy.test.ts', text: 'debugger\n' },
		})
		void inspection.catch(() => {})
		await Promise.all([stage.destroy(), stage.destroy()])
		await expect(inspection).rejects.toThrow('The lint stage has been destroyed')
		await expect(stage.destroy()).resolves.toBeUndefined()
	})

	it(
		'serves a later inspection after an earlier one is abandoned',
		{ timeout: 20_000 },
		async () => {
			const scratch = createScratch()
			scratch.write('package.json', '{"type":"module"}\n')
			scratch.write(
				'node_modules/oxlint/package.json',
				'{"name":"oxlint","version":"1.79.0","type":"module","bin":{"oxlint":"fixture.js"}}\n',
			)
			scratch.write('node_modules/oxlint/fixture.js', SILENT)
			const stage = new LintStage(scratch.path)
			const held = stage.inspect({
				files: [{ path: 'src/core/held.ts', text: 'export const VALUE = 1\n' }],
				test: {
					path: 'tmp/probe/held.test.ts',
					text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
				},
			})
			void held.catch(() => {})
			try {
				const served = await stage.inspect({
					files: [],
					test: {
						path: 'tmp/probe/served.test.ts',
						text: "import { test } from 'vitest'\ntest('passes', () => {})\n",
					},
				})
				expect(served.stage).toBe('lint')
				expect(served.findings).toStrictEqual([])
			} finally {
				await stage.destroy()
				scratch.destroy()
			}
		},
	)
})
