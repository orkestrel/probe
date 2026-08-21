import { spawnSync } from 'node:child_process'
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createScratch } from '@orkestrel/test/server'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)))

describe.sequential('published distribution', () => {
	it('refuses an export path absent from the published manifest', () => {
		const control = spawnSync(
			process.execPath,
			['--input-type=module', '--eval', "await import('@orkestrel/probe/absent')"],
			{ cwd: ROOT, encoding: 'utf8' },
		)
		expect(control.status).toBe(1)
		expect(control.stderr).toContain('ERR_PACKAGE_PATH_NOT_EXPORTED')
	})

	it('installs and drives every published entry under ESM and CommonJS', () => {
		const scratch = createScratch({ prefix: 'probe-distribution-' })
		const cache = resolve(scratch.path, 'cache')
		const environment = { ...process.env, npm_config_cache: cache }
		const npm = process.env.npm_execpath
		if (npm === undefined) throw new Error('npm did not report its executable path')
		try {
			const packed = spawnSync(
				process.execPath,
				[npm, 'pack', '--json', '--ignore-scripts', '--pack-destination', scratch.path],
				{
					cwd: ROOT,
					encoding: 'utf8',
					env: environment,
					timeout: 60_000,
				},
			)
			if (packed.status !== 0) throw new Error(`npm pack failed\n${packed.stderr}`)
			const archives = globSync('*.tgz', { cwd: scratch.path })
			expect(archives).toHaveLength(1)
			const [archive] = archives
			if (archive === undefined) throw new Error('npm pack produced no archive')
			const tarball = resolve(scratch.path, archive)
			const consumer = scratch.ensure('consumer')
			const installed = spawnSync(
				process.execPath,
				[
					npm,
					'install',
					tarball,
					'--ignore-scripts',
					'--no-audit',
					'--no-fund',
					'--fetch-retries=0',
				],
				{ cwd: consumer, encoding: 'utf8', env: environment, timeout: 120_000 },
			)
			const output = `${installed.stdout}\n${installed.stderr}`
			const unavailable =
				output.includes('EAI_AGAIN') ||
				(installed.error !== undefined &&
					'code' in installed.error &&
					installed.error.code === 'EPERM')
			let installation = installed.status === 0
			let evidence = `${output}\n${JSON.stringify(installed.error, Object.getOwnPropertyNames(installed.error ?? {}))}`
			if (!installation && unavailable && import.meta.env.MODE !== 'release') {
				scratch.remove('consumer/node_modules')
				scratch.remove('consumer/package-lock.json')
				const packageDirectory = scratch.ensure('consumer/node_modules/@orkestrel/probe')
				const extracted = spawnSync(
					'tar',
					['-xzf', tarball, '--strip-components=1', '-C', packageDirectory],
					{ encoding: 'utf8', timeout: 60_000 },
				)
				const manifest: unknown = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
				if (typeof manifest !== 'object' || manifest === null) {
					throw new Error('The package manifest is not a record')
				}
				const dependencies = Object.getOwnPropertyDescriptor(manifest, 'dependencies')?.value
				if (typeof dependencies !== 'object' || dependencies === null) {
					throw new Error('The package manifest carries no dependencies')
				}
				for (const dependency of Object.keys(dependencies)) {
					scratch.link(
						`consumer/node_modules/${dependency}`,
						resolve(ROOT, 'node_modules', dependency),
					)
				}
				installation = extracted.status === 0
				evidence = `${extracted.stdout}\n${extracted.stderr}\n${String(extracted.error)}`
			}
			if (!installation) throw new Error(`The distribution could not be installed\n${evidence}`)

			// The peers are optional dependencies of this package and resolve from the workspace being
			// probed, so a consumer that installs only the package cannot drive a stage. Link them on
			// BOTH paths: the real install succeeds on a networked host and the extraction fallback
			// runs where a nested install is denied, and a consumer materialized by either route needs
			// the same toolchain present.
			for (const peer of ['oxlint', 'typescript', 'vitest']) {
				scratch.link(`consumer/node_modules/${peer}`, resolve(ROOT, 'node_modules', peer))
			}
			scratch.write(
				'consumer/tsconfig.json',
				'{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ESNext","strict":true,"types":[]}}\n',
			)
			scratch.write(
				'consumer/vite.config.ts',
				"import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: { label: 'probe' }, include: ['tmp/probe/**/*.test.ts'], environment: 'node' } }] } })\n",
			)
			scratch.ensure('consumer/tmp/probe')
			const claim = JSON.stringify({
				project: 'tsconfig.json',
				case: {
					files: [],
					test: {
						path: 'tmp/probe/distribution.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('passes', () => expect(2 + 2).toBe(4))\n",
					},
				},
				control: {
					files: [],
					test: {
						path: 'tmp/probe/distribution.test.ts',
						text: "import { expect, test } from 'vitest'\ntest('fails', () => expect(2 + 2).toBe(5))\n",
					},
					stage: 'runtime',
					reason: 'the assertion is false',
				},
			})
			scratch.write(
				'consumer/consumer.mjs',
				[
					"import * as core from '@orkestrel/probe'",
					"import * as server from '@orkestrel/probe/server'",
					"import manifest from '@orkestrel/probe/package.json' with { type: 'json' }",
					"if (!Array.isArray(core.PROBE_STAGES) || !core.PROBE_STAGES.includes('type')) throw new Error('The core export is unreadable')",
					"if (typeof core.isProject !== 'function') throw new Error('The project guard is unreadable')",
					"if (typeof server.Probe !== 'function') throw new Error('The server export is unreadable')",
					"if (typeof server.computeDigest !== 'function' || typeof server.normalizeValue !== 'function') throw new Error('The digest leaves are unreadable')",
					"if (manifest.name !== '@orkestrel/probe') throw new Error('The manifest export is unreadable')",
					// The published formats of one install are separate module instances, so the class
					// this consumer imported is not the class the required copy constructs. The
					// `instanceof` line is the control: it proves the copies really are distinct, and
					// without it the guard assertion beneath would pass against a single copy.
					"import { createRequire } from 'node:module'",
					"const required = createRequire(import.meta.url)('@orkestrel/probe')",
					"const foreign = new required.ProbeError('cross-copy failure', { origin: 'workspace', code: 'malformed' })",
					"if (foreign instanceof core.ProbeError) throw new Error('The two module formats resolved to one class')",
					"if (!core.isProbeError(foreign)) throw new Error('The guard refused a failure from the required copy')",
					"if (foreign.origin !== 'workspace' || foreign.code !== 'malformed') throw new Error('The classification did not survive the crossing')",
					"if (core.isProbeError(new Error('cross-copy failure'))) throw new Error('The guard admitted a plain Error')",
					// The guard reads the declared tuples rather than the constructor, so a value the other
					// copy branded with an origin this copy never declared stays outside the type.
					"const undeclared = new required.ProbeError('cross-copy failure', { origin: 'workspace', code: 'malformed' })",
					"Object.defineProperty(undeclared, 'origin', { value: 'operator' })",
					"if (core.isProbeError(undeclared)) throw new Error('The guard admitted an undeclared origin from the required copy')",
					`const claim = ${claim}`,
					'const probe = new server.Probe({ workspace: process.cwd(), deadline: 60_000 })',
					'try {',
					'\tconst verdict = await probe.prove(claim)',
					"\tif (typeof verdict.receipt !== 'string' || verdict.case.length !== 3 || verdict.control.length !== 3) throw new Error('The ESM probe returned no verdict')",
					"\tif (!core.isProject(verdict.project) || verdict.project.path !== 'tsconfig.json') throw new Error('The ESM verdict named no project')",
					'\tconst fields = verdict.receipt.split(core.RECEIPT_SEPARATOR)',
					"\tif (fields.length !== 7 || fields[1] !== verdict.digest) throw new Error('The ESM receipt bound no claim')",
					"\tif (fields[6] !== verdict.project.path + '@' + verdict.project.digest) throw new Error('The ESM receipt bound no project')",
					'} finally {',
					'\tawait probe.destroy()',
					'}',
				].join('\n'),
			)
			scratch.write(
				'consumer/consumer.cjs',
				[
					"const core = require('@orkestrel/probe')",
					"const server = require('@orkestrel/probe/server')",
					"const manifest = require('@orkestrel/probe/package.json')",
					"if (!Array.isArray(core.PROBE_STAGES) || !core.PROBE_STAGES.includes('type')) throw new Error('The core export is unreadable')",
					"if (typeof core.isProject !== 'function') throw new Error('The project guard is unreadable')",
					"if (typeof server.Probe !== 'function') throw new Error('The server export is unreadable')",
					"if (typeof server.computeDigest !== 'function' || typeof server.normalizeValue !== 'function') throw new Error('The digest leaves are unreadable')",
					"if (manifest.name !== '@orkestrel/probe') throw new Error('The manifest export is unreadable')",
					`const claim = ${claim}`,
					'const probe = new server.Probe({ workspace: process.cwd(), deadline: 60_000 })',
					';(async () => {',
					'\ttry {',
					'\t\tconst verdict = await probe.prove(claim)',
					"\t\tif (typeof verdict.receipt !== 'string' || verdict.case.length !== 3 || verdict.control.length !== 3) throw new Error('The CommonJS probe returned no verdict')",
					"\t\tif (!core.isProject(verdict.project) || verdict.project.path !== 'tsconfig.json') throw new Error('The CommonJS verdict named no project')",
					'\t\tconst fields = verdict.receipt.split(core.RECEIPT_SEPARATOR)',
					"\t\tif (fields.length !== 7 || fields[1] !== verdict.digest) throw new Error('The CommonJS receipt bound no claim')",
					"\t\tif (fields[6] !== verdict.project.path + '@' + verdict.project.digest) throw new Error('The CommonJS receipt bound no project')",
					'\t} finally {',
					'\t\tawait probe.destroy()',
					'\t}',
					'})().catch((error) => { console.error(error); process.exitCode = 1 })',
				].join('\n'),
			)
			const modules = globSync('node_modules/@orkestrel/probe/dist/**/*.cjs', { cwd: consumer })
			expect(modules.length).toBeGreaterThan(0)
			for (const module of modules) {
				expect.soft(readFileSync(resolve(consumer, module), 'utf8').includes('{}.')).toBe(false)
			}
			const imported = spawnSync(process.execPath, ['consumer.mjs'], {
				cwd: consumer,
				encoding: 'utf8',
				timeout: 120_000,
			})
			if (imported.status !== 0) {
				throw new Error(`The ESM consumer failed\n${imported.stdout}\n${imported.stderr}`)
			}
			const required = spawnSync(process.execPath, ['consumer.cjs'], {
				cwd: consumer,
				encoding: 'utf8',
				timeout: 120_000,
			})
			expect.soft(required.status).toBe(0)
		} finally {
			scratch.destroy()
		}
	})
})
