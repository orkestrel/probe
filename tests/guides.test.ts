// The consumer-side guides-parity entry runs `@orkestrel/guide` against this
// repository's own `guides/README.md` manifest. The constants that follow are this
// package's own, as is the executed section that closes the file.

import type { Claim } from '@src/core'
import { GuideCommand } from '@orkestrel/guide/server'
import { readInventory } from '@orkestrel/test/server'
import { createVitest } from 'vitest/node'

/** Every fence language this package's guides are allowed to use. */
const FENCE_LANGUAGES = Object.freeze(['json', 'text', 'ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
/** The one guide this package sources, whose tagline the README pitch equals. */
const GUIDE_SPEC = 'guides/probe.md'
/** The package identity that binds its manifest, module map, and README pitch. */
const PACKAGE_NAME = '@orkestrel/probe'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({
	[PACKAGE_NAME]: 'src/core',
	'@orkestrel/probe/server': 'src/server',
	'@src/core': 'src/core',
	'@src/server': 'src/server',
})
/**
 * Declarations deliberately kept out of the barrel, as `computeSymbolKey` strings.
 *
 * Interning is for a declaration a consumer cannot construct from values they already
 * hold, and this package has none: every class here takes either nothing or a workspace
 * path. The empty list is the healthy state — and the assertion that follows it fails when
 * a name here stops being stranded, so the list cannot rot.
 */
const INTERNAL: readonly string[] = Object.freeze([])

await new GuideCommand({
	root: new URL('../', import.meta.url),
	patterns: ['src/**/*.ts', 'tests/**/*.ts', 'guides/*.md', '*.md', 'package.json'],
	modules: MODULES,
	languages: FENCE_LANGUAGES,
	language: EXAMPLE_LANGUAGE,
	reader: readInventory,
	runner: createVitest,
}).execute(async ({ files, report, root, rows }) => {
	const { isConstructor, isRecord, parseJSON } = await import('@orkestrel/contract')
	const { computeSymbolKey, extractDeclaration, extractMemberMethods, findMissingSymbols } =
		await import('@orkestrel/guide')
	const { requireValue } = await import('@orkestrel/test')
	const {
		extractClaimLiteral,
		extractExportComment,
		extractInterfaceProperties,
		extractProbeSection,
	} = await import('./setupServer.js')
	const core = await import('@src/core')
	const server = await import('@src/server')
	const { PROBE_STAGES, RECEIPT_PREFIX, RECEIPT_SEPARATOR } = core
	const { computeDigest, Probe, readWorkspaceManifest, RuntimeStage } = server
	const { existsSync, rmSync } = await import('node:fs')
	const { resolve } = await import('node:path')
	const { describe, expect, it } = await import('vitest')
	const own = requireValue(
		rows.find((row) => row.entry.spec === GUIDE_SPEC),
		`Missing manifest row: ${GUIDE_SPEC}`,
	)
	const manifest = parseJSON(requireValue(files['package.json'], 'Missing inventory: package.json'))
	if (!isRecord(manifest)) throw new Error('Invalid package manifest: package.json')

	it('manifest lists at least one guide', () => {
		expect(report.input).toEqual([])
		expect(rows.length).toBeGreaterThan(0)
		expect(rows.map((row) => row.entry.spec)).toContain(GUIDE_SPEC)
	})

	// The example half of the equality case is silent over an empty population: with no
	// title on either side, the comparison has no pair. This pins the population this
	// repository's own guide contributes.
	it('pairs at least one example title across the guide and the source', () => {
		expect(report.examples.titles.filter((finding) => finding.spec === GUIDE_SPEC)).toEqual([])
	})

	it('opens the README with the guide tagline', () => {
		expect(manifest.name).toBe(PACKAGE_NAME)
		expect(report.pitch).toEqual([])
	})

	for (const { entry, guide, source } of rows) {
		describe(`${entry.concept}`, () => {
			it('uses only listed fence languages', () => {
				expect(report.fences.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('extracts a non-empty documented surface', () => {
				expect(guide.surface().length).toBeGreaterThan(0)
			})

			it('carries a summary for every documented and declared symbol', () => {
				expect(guide.surface().filter((symbol) => symbol.summary === undefined)).toEqual([])
				expect(source.surface().filter((symbol) => symbol.summary === undefined)).toEqual([])
			})
			it('re-exports every direct declaration that is not named internal', () => {
				const stranded = findMissingSymbols(source.exports(), source.surface())
				expect(stranded.filter((key) => !INTERNAL.includes(key))).toEqual([])
			})
			it('names no symbol internal that the barrel already exports', () => {
				const stranded = findMissingSymbols(source.exports(), source.surface())
				expect(INTERNAL.filter((key) => !stranded.includes(key))).toEqual([])
			})
			it('re-exports only direct declarations', () => {
				expect(findMissingSymbols(source.surface(), source.exports())).toEqual([])
			})
			it('documents every barrel export', () => {
				expect(findMissingSymbols(source.surface(), guide.surface())).toEqual([])
			})
			it('documents only barrel exports', () => {
				expect(findMissingSymbols(guide.surface(), source.surface())).toEqual([])
			})

			it('exposes no hidden module-scope declarations', () => {
				expect(source.hidden().map(computeSymbolKey)).toEqual([])
			})

			it('documents a populated method group', () => {
				expect(report.sections.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('keeps behavioral interfaces and implementing classes in parity', () => {
				expect(report.methods.filter((finding) => finding.spec === entry.spec)).toEqual([])
				expect(report.declarations.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('keeps every compared summary and example equal to its source', () => {
				expect(report.drift.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('documents an example for every Surface function', () => {
				expect(report.examples.fences.filter((finding) => finding.spec === entry.spec)).toEqual([])
				expect(report.examples.functions.filter((finding) => finding.spec === entry.spec)).toEqual(
					[],
				)
			})

			it('documents an example for every method', () => {
				expect(report.examples.methods.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('imports only real exports in every ```ts fence', () => {
				expect(report.imports.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('resolves every relative link', () => {
				expect(report.links.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('links only to test files that exist', () => {
				expect(report.tests.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})
		})
	}

	// This package's own section. Every check before it reads a name — from the guide text or
	// from the barrel — and a name that resolves proves nothing about the sentence beside it,
	// so a fence whose comment claims a value the code contradicts passes all of them. The
	// cases here read what the barrels resolve at runtime, what each implementation publishes,
	// and the values the flagship fences claim. Change a fence, change the transcription
	// beside it.

	const ROOT = root
	const WORKBENCH = resolve(root, 'tmp/probe')

	// The claim the guide tells a reader to run verbatim. The same literal appears in
	// `guides/probe.md`, in the `Claim` contract's own `@example`, and here; the transcription case
	// reads each of them out of their files and refuses any difference, so this copy cannot drift
	// away from what a consumer copies.
	const CLAIM: Claim = {
		project: 'configs/src/tsconfig.core.json',
		case: {
			files: [
				{
					path: 'src/core/factories.ts',
					text: "export function createGreeting(): string {\n\treturn 'hi'\n}\n",
				},
			],
			test: {
				path: 'tmp/probe/greeting.test.ts',
				text: "import { expect, test } from 'vitest'\nimport { createGreeting } from '../../src/core/factories.js'\ntest('greets', () => expect(createGreeting()).toBe('hi'))\n",
			},
		},
		control: {
			files: [
				{
					path: 'src/core/factories.ts',
					text: "export function createGreeting(): number {\n\treturn 'hi'\n}\n",
				},
			],
			test: {
				path: 'tmp/probe/greeting.test.ts',
				text: "import { expect, test } from 'vitest'\nimport { createGreeting } from '../../src/core/factories.js'\ntest('greets', () => expect(createGreeting()).toBe('hi'))\n",
			},
			stage: 'type',
			reason: 'a string returned as a number must not compile',
		},
	}

	const OPENING = 'const claim: Claim = {'
	const DIGEST = 'fcb88a2dee987b8673c1fc7107979470'
	const DEFAULT_DESCRIPTION = 'The @orkestrel/probe package.'

	// Each published class beside the contracts it declares it implements, inherited ones included,
	// because an interface body carries only its own members.
	const IMPLEMENTATIONS: ReadonlyArray<readonly [string, readonly string[]]> = [
		['Probe', ['ProbeInterface']],
		['ProbeServer', ['ProbeServerInterface']],
		['TypeStage', ['TypeStageInterface', 'StageInterface']],
		['LintStage', ['LintStageInterface', 'StageInterface']],
		['RuntimeStage', ['StageInterface']],
		['Overlay', ['OverlayInterface']],
	]

	const GUIDE = requireValue(files[GUIDE_SPEC], `Missing file: ${GUIDE_SPEC}`)
	const CORE_TYPES = requireValue(files['src/core/types.ts'], 'Missing file: src/core/types.ts')
	const SERVER_TYPES = requireValue(
		files['src/server/types.ts'],
		'Missing file: src/server/types.ts',
	)
	const reflected = own.source

	describe('guides parity', () => {
		// The reflected surface is the population of record, and these are the values behind it. Every
		// name a barrel resolves at runtime is one that surface names, and every one of them resolves to
		// a value, so a barrel row that names a module the reflection never read fails here rather than
		// shipping.
		it('resolves every value the barrels publish', () => {
			const published = reflected.surface().map((symbol) => symbol.name)
			expect(published.length).toBeGreaterThan(0)
			for (const entry of [core, server]) {
				for (const [name, value] of Object.entries(entry)) {
					expect(value, `${name} resolved to undefined`).toBeDefined()
					expect(published, `${name} is reachable from no barrel`).toContain(name)
				}
			}
		})

		// The compiler agrees a class is at least its interface, and nothing in the language says it is
		// no more than that. This reads the prototype the barrel resolves and compares it against the
		// interfaces the class declares it implements, so public behavior no contract declares — and no
		// guide row therefore documents — fails here rather than shipping.
		it('publishes exactly the members each implementation declares it implements', () => {
			const resolved = new Map<string, unknown>([
				...Object.entries(core),
				...Object.entries(server),
			])
			expect(IMPLEMENTATIONS.length).toBeGreaterThan(0)
			for (const [name, contracts] of IMPLEMENTATIONS) {
				const implementation = resolved.get(name)
				expect(isConstructor(implementation), `${name} did not resolve to a class`).toBe(true)
				if (!isConstructor(implementation)) continue
				const declared = contracts.flatMap((contract) => {
					const declaration =
						extractDeclaration(CORE_TYPES, 'interface', contract) ??
						extractDeclaration(SERVER_TYPES, 'interface', contract)
					const body = requireValue(declaration, `Missing interface: ${contract}`).body
					return [
						...extractMemberMethods(body).map((member) => member.name),
						...extractInterfaceProperties(body),
					]
				})
				expect(declared.length, `${name} declares no members`).toBeGreaterThan(0)
				expect(
					Object.getOwnPropertyNames(implementation.prototype)
						.filter((member) => member !== 'constructor')
						.sort(),
				).toStrictEqual([...new Set(declared)].sort())
			}
		})

		// Wider than the Surface-function sweep the drop-in runs: every barrelled export carries a
		// worked block, a type and a constant included, because a consumer meets each of them in an
		// editor rather than in the guide.
		it('carries a documented example for every barrelled export', () => {
			const exampled = new Set(reflected.examples().map((example) => example.name))
			const published = reflected.surface().map((symbol) => symbol.name)
			expect(published.length).toBeGreaterThan(0)
			expect(published.filter((name) => !exampled.has(name))).toStrictEqual([])
		})

		it('names the guard the tool actually applies to an arriving claim', () => {
			const shapers = requireValue(
				files['src/core/shapers.ts'],
				'Missing file: src/core/shapers.ts',
			)
			const remarks = extractExportComment(shapers, 'const CLAIM_SHAPE')
			expect(remarks).toBeDefined()
			if (remarks === undefined) throw new Error('Missing CLAIM_SHAPE documentation')
			const named = /admits a call with\s+`([^`]+)`/.exec(remarks)?.[1]
			expect(named).toBe('isClaim')
			expect(
				requireValue(files['src/server/ProbeServer.ts'], 'Missing file: src/server/ProbeServer.ts'),
			).toContain(`if (!${String(named)}(input))`)
		})

		it('ships registry metadata and a README that are not the scaffold default', () => {
			expect(manifest).toMatchObject({
				name: PACKAGE_NAME,
				description: expect.not.stringContaining(DEFAULT_DESCRIPTION),
				keywords: expect.arrayContaining([expect.any(String)]),
			})
			const readme = requireValue(files['README.md'], 'Missing file: README.md')
			expect(readme).toContain('dist/bin/main.js')
			expect(readme).toContain('prove')
			expect(readme).toContain('receipt')
		})
	})

	describe('guides fences', () => {
		it('states the same claim in the guide, the contract, the README, and this proof', () => {
			const transcribed = extractClaimLiteral(
				requireValue(files['tests/guides.test.ts'], 'Missing file: tests/guides.test.ts'),
				`${OPENING.replace('claim', 'CLAIM')}`,
			)
			expect(transcribed).toBeDefined()
			if (transcribed === undefined) throw new Error('Missing proof claim literal')
			const documented = extractClaimLiteral(GUIDE, OPENING)
			const comment = extractExportComment(CORE_TYPES, 'interface Claim')
			expect(comment).toBeDefined()
			if (comment === undefined) throw new Error('Missing Claim documentation')
			const contract = extractClaimLiteral(comment, OPENING)
			const pitched = extractClaimLiteral(
				requireValue(files['README.md'], 'Missing file: README.md'),
				OPENING,
			)
			expect(documented).toBeDefined()
			expect(contract).toBeDefined()
			expect(pitched).toBeDefined()
			if (documented === undefined) throw new Error('Missing guide claim literal')
			if (contract === undefined) throw new Error('Missing contract claim literal')
			if (pitched === undefined) throw new Error('Missing README claim literal')
			expect(documented).toBe(contract)
			expect(documented).toBe(pitched)
			expect(documented).toBe(transcribed.replace('const CLAIM: Claim = {', OPENING))
		})

		it('states the constants at the values it publishes', () => {
			const constants = extractProbeSection(GUIDE, '### Constants')
			expect(constants).toBeDefined()
			if (constants === undefined) throw new Error('Missing Constants section')
			expect(constants).toContain("`['type', 'lint', 'runtime']`")
			expect(PROBE_STAGES).toStrictEqual(['type', 'lint', 'runtime'])
			expect(constants).toContain("`['claimant', 'workspace', 'instrument']`")
			expect(core.PROBE_PARTIES).toStrictEqual(['claimant', 'workspace', 'instrument'])
			expect(constants).toContain("`'probe'`")
			expect(RECEIPT_PREFIX).toBe('probe')
			expect(constants).toContain("`':'`")
			expect(RECEIPT_SEPARATOR).toBe(':')
		})

		// The failure table is the guide's own copy of the ownership and condition axes, so it is read
		// against the tuples the package publishes rather than against a memory of them. Each declared
		// value appears in the column that carries it, and no row invents a value neither tuple declares.
		it('names every declared party and condition in the failure table', () => {
			const section = extractProbeSection(GUIDE, '## Failures')
			expect(section).toBeDefined()
			if (section === undefined) throw new Error('Missing Failures section')
			const failures = [...section.matchAll(/^\| `([^`]+)` +\| `([^`]+)`/gm)]
			expect(failures.length).toBeGreaterThan(0)
			const parties = new Set(failures.map((failure) => failure[1] ?? ''))
			const codes = new Set(failures.map((failure) => failure[2] ?? ''))
			expect([...parties].sort()).toStrictEqual([...core.PROBE_PARTIES].sort())
			expect([...codes].sort()).toStrictEqual([...core.PROBE_ERROR_CODES].sort())
		})

		// The guide states what `verdict.digest` covers. `prove` computes it with `computeDigest` over
		// the case and the control, read against the workspace, so these assertions read the same
		// function through the same inputs and would break if either sentence went false again.
		it('digests the reason and the workspace the guide says it digests', () => {
			const body = { case: CLAIM.case, control: CLAIM.control }
			const reworded = {
				case: CLAIM.case,
				control: { ...CLAIM.control, reason: 'the falsifier, restated in other words' },
			}
			// A claim carrying an absolute string, which is the member the workspace rewrite reaches.
			const anchored = {
				case: {
					files: [],
					test: { path: 'tmp/probe/anchored.test.ts', text: '/srv/checkout/src/core/greeting.ts' },
				},
				control: CLAIM.control,
			}

			// The instrument reproduces the token the flagship fence documents, so the assertions below
			// are read against the digest the package really ships.
			expect(computeDigest(ROOT, body)).toBe(DIGEST)
			// Two claims differing only in the reason's prose are two claims.
			expect(computeDigest(ROOT, reworded)).not.toBe(DIGEST)
			// The flagship claim carries no absolute string, so its digest is the same in any workspace.
			expect(computeDigest('/srv/checkout', body)).toBe(DIGEST)
			// A claim that carries one is read against the workspace it runs in.
			expect(computeDigest('/srv/checkout', anchored)).not.toBe(
				computeDigest('/opt/other', anchored),
			)
		})

		it(
			'runs the documented claim case through RuntimeStage alone',
			{ timeout: 60_000 },
			async () => {
				const runtime = new RuntimeStage(ROOT)
				try {
					const check = await runtime.inspect(CLAIM.case)
					expect(check.stage).toBe('runtime')
					expect(check.issues).toStrictEqual([])
					expect(GUIDE).toContain(
						'This runs no type or lint stage and does not issue a `Probe` receipt.',
					)
					expect(GUIDE).toContain('const runtime = new RuntimeStage(process.cwd())')
					expect(GUIDE).toContain('const check = await runtime.inspect(claim.case)')
					expect(GUIDE).toContain("check.stage // 'runtime'")
					expect(GUIDE).toContain('check.issues // []')
				} finally {
					await runtime.destroy()
				}
			},
		)

		it('earns the receipt the guide documents', { timeout: 300_000 }, async () => {
			// `tmp` is ignored by version control, so a fresh clone of a consumer's repository holds no
			// `tmp/probe`, and the flagship claim declares its test there. The deletion belongs before
			// construction rather than before `prove`: arming creates that directory for its own controls
			// and tidies it away again, so the claim below runs against exactly what a consumer's first
			// claim runs against.
			rmSync(WORKBENCH, { force: true, recursive: true })
			expect(existsSync(WORKBENCH)).toBe(false)
			const probe = new Probe({ workspace: ROOT, deadline: 120_000 })
			try {
				const verdict = await probe.prove(CLAIM)
				expect(verdict.receipt).toBeDefined()
				expect(verdict.digest).toBe(DIGEST)
				expect(verdict.reason).toBe(CLAIM.control.reason)
				const receipt = verdict.receipt ?? ''
				// The guide's parsing rule, applied to the token the run returned: the prefix, the digest,
				// the stage, and a field per tool, then a remainder carrying the project path and its digest.
				const fields = receipt.split(RECEIPT_SEPARATOR)
				const remainder = fields.slice(6).join(RECEIPT_SEPARATOR)
				const boundary = remainder.lastIndexOf('@')
				expect(fields.slice(0, 3)).toStrictEqual([RECEIPT_PREFIX, DIGEST, 'type'])
				// Read against the workspace's installed manifests rather than against the verdict's own
				// toolchain member, so a token built from the wrong versions cannot agree with itself.
				for (const name of ['typescript', 'oxlint', 'vitest'] as const) {
					const installed = readWorkspaceManifest(ROOT, name).contents.version
					expect(fields).toContain(`${name}@${String(installed)}`)
				}
				expect(remainder.slice(0, boundary)).toBe('configs/src/tsconfig.core.json')
				expect(remainder.slice(boundary + 1)).toMatch(/^[0-9a-f]{32}$/)
				expect(GUIDE).toContain(`verdict.digest // '${DIGEST}'`)
				expect(GUIDE).toContain(`verdict.receipt // '${receipt}'`)
			} finally {
				await probe.destroy()
			}
		})
	})
})
