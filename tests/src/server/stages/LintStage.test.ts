import { fileURLToPath } from 'node:url'
import { LintStage } from '@src/server'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

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
})
