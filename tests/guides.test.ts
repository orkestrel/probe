// The consumer-side guides-parity drop-in: runs `@orkestrel/guide`'s checks against
// this repo's own `guides/README.md` manifest. The constants that follow are this
// package's own, as is the executed section that closes the file.

import type { Claim } from '@src/core'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
	computeSymbolKey,
	createGuide,
	createSource,
	createSourceManager,
	extractFenceImports,
	findDrift,
	findMissing,
	findMissingSymbols,
	findUnexampled,
	findUnlisted,
	isExternalLink,
	parseManifest,
	resolveLink,
} from '@orkestrel/guide'
import { requireValue } from '@orkestrel/test'
import { readInventory } from '@orkestrel/test/server'
import { isConstructor } from '@orkestrel/contract'
import * as core from '@src/core'
import * as server from '@src/server'
import { PROBE_STAGES, RECEIPT_PREFIX, RECEIPT_SEPARATOR } from '@src/core'
import { computeDigest, Probe, readWorkspaceManifest } from '@src/server'

/** Every fence language this package's guides are allowed to use. */
const FENCE_LANGUAGES = Object.freeze(['json', 'text', 'ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
/** The one guide this package sources, whose tagline the README pitch equals. */
const GUIDE_SPEC = 'guides/probe.md'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({
	'@orkestrel/probe': 'src/core',
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

/** Root-level files these checks read. `readInventory` walks directories only. */
const ROOT_FILES = Object.freeze(['AGENTS.md', 'README.md', 'package.json'])

const root = new URL('../', import.meta.url)
const files: Record<string, string> = {
	...readInventory(root, ['src', 'guides', 'tests'], { extensions: ['.ts', '.md'] }),
}
for (const name of ROOT_FILES) files[name] = readFileSync(new URL(name, root), 'utf8')
const manifest = parseManifest(
	requireValue(files['guides/README.md'], 'Missing file: guides/README.md'),
	'guides',
)
const sources = createSourceManager({ files, modules: MODULES })
const own = requireValue(
	manifest.find((entry) => entry.spec === GUIDE_SPEC),
	`Missing manifest row: ${GUIDE_SPEC}`,
)

it('manifest lists at least one guide', () => {
	expect(manifest.length).toBeGreaterThan(0)
})

// The example half of the equality case is silent over an empty population: with no
// title on both sides `findDrift` compares no pair and the case passes on the summaries
// alone. This pins the population this repository's own guide contributes, so removing
// every `@example` title reddens the suite instead of quietly retiring half the gate.
// The failure names both title sets, because a pin reporting only its own emptiness
// leaves the reader to work out which side dropped the title.
it('pairs at least one example title across the guide and the source', () => {
	const guide = createGuide(requireValue(files[GUIDE_SPEC], `Missing file: ${GUIDE_SPEC}`))
	const source = createSource({ files, module: own.source })
	const declared = source
		.examples()
		.map((example) => example.title)
		.filter((title) => title !== undefined)
	const titled = new Set(declared)
	const headings: string[] = []
	const paired: string[] = []
	for (const fence of guide.fences()) {
		if (fence.title === undefined) continue
		headings.push(fence.title)
		if (titled.has(fence.title)) paired.push(fence.title)
	}
	const unpaired =
		paired.length > 0
			? []
			: [
					`${GUIDE_SPEC} pairs: guide ${JSON.stringify(headings)} source ${JSON.stringify(declared)}`,
				]
	expect(unpaired).toEqual([])
})

// The README's pitch and the guide's tagline are one text, each read as the blockquote
// under its file's H1. `README.md` is outside the concept index, so the reader is
// applied to it directly rather than through a manifest row. Each side is guarded
// against `undefined` first, so a file that lost its blockquote reports that rather
// than reporting two absences as agreement.
it('opens the README with the guide tagline', () => {
	const pitch = createGuide(requireValue(files['README.md'], 'Missing file: README.md')).tagline()
	const tagline = createGuide(
		requireValue(files[GUIDE_SPEC], `Missing file: ${GUIDE_SPEC}`),
	).tagline()

	expect(pitch).not.toBeUndefined()
	expect(tagline).not.toBeUndefined()
	expect(pitch).toBe(tagline)
})

for (const entry of manifest) {
	const guide = createGuide(requireValue(files[entry.spec], `Missing file: ${entry.spec}`))
	const source = createSource({ files, module: entry.source })

	describe(`${entry.concept}`, () => {
		it('uses only listed fence languages', () => {
			expect(findUnlisted(guide.fences(), FENCE_LANGUAGES)).toEqual([])
		})

		it('extracts a non-empty documented surface', () => {
			expect(guide.surface().length).toBeGreaterThan(0)
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

		for (const group of guide.methods()) {
			const members = source.methods(group.interface).map((method) => method.name)
			const documented = group.methods.map((method) => method.name)
			const entity = group.interface.replace(/Interface$/, '')
			describe(`${group.interface}`, () => {
				it('documents at least one method', () => {
					expect(group.methods.length).toBeGreaterThan(0)
				})
				it('documents every interface method', () => {
					expect(findMissing(members, documented)).toEqual([])
				})
				it('documents no phantom method', () => {
					expect(findMissing(documented, members)).toEqual([])
				})
				it(`${entity} exposes no undocumented method`, () => {
					const extra =
						entity === group.interface
							? []
							: findMissing(
									source.methods(entity).map((method) => method.name),
									documented,
								)
					expect(extra).toEqual([])
				})
			})
		}

		// The equality gate: a `Summary` cell against its export's description paragraph, a
		// titled fence against the `@example` of that title. `findDrift` owns the comparison
		// and names both sides; converge the two sides with `npm run docs`, never by
		// weakening this assertion. `findDrift` pairs an example only where a title is
		// present on both sides, so an untitled `@example` block is outside this case. Each
		// collected line is the spec, the key, and each side's text or `absent` — the same
		// worklist `npm run docs` prints, so a failure here is read the way that command's
		// output is.
		it('keeps every compared summary and example equal to its source', () => {
			const disagreeing: string[] = []
			for (const drift of findDrift(guide, source)) {
				const left = drift.guide === undefined ? 'absent' : JSON.stringify(drift.guide)
				const right = drift.source === undefined ? 'absent' : JSON.stringify(drift.source)
				disagreeing.push(`${entry.spec} ${drift.key}: guide ${left} source ${right}`)
			}
			expect(disagreeing).toEqual([])
		})

		it('documents an example for every Surface function', () => {
			const fences = guide
				.fences()
				.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
				.map((fence) => fence.code)
			const names = guide
				.surface()
				.filter((symbol) => symbol.keyword === 'function')
				.map((symbol) => symbol.name)
			expect(
				findUnexampled(
					names,
					fences,
					source.examples().map((example) => example.name),
				),
			).toEqual([])
		})

		for (const group of guide.methods()) {
			const entity = group.interface.replace(/Interface$/, '')
			const documented = group.methods.map((method) => method.name)
			const examples =
				entity === group.interface
					? source.examples(group.interface).map((example) => example.name)
					: source
							.examples(group.interface)
							.map((example) => example.name)
							.concat(source.examples(entity).map((example) => example.name))
			describe(`${group.interface} examples`, () => {
				it('documents an example for every method', () => {
					const fences = guide
						.fences()
						.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
						.map((fence) => fence.code)
					expect(findUnexampled(documented, fences, examples)).toEqual([])
				})
			})
		}

		it('imports only real exports in every ```ts fence', () => {
			const fences = guide.fences().filter((fence) => fence.language === EXAMPLE_LANGUAGE)
			for (const fence of fences) {
				for (const { specifier, names } of extractFenceImports(fence.code)) {
					const imported = sources.source(specifier)
					if (imported === undefined) continue
					const surface = imported.surface().map((symbol) => symbol.name)
					expect(findMissing(names, surface)).toEqual([])
				}
			}
		})

		it('resolves every relative link', () => {
			const broken = guide
				.links()
				.filter((href) => !isExternalLink(href))
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(broken).toEqual([])
		})
		it('links only to test files that exist', () => {
			const missing = guide
				.tests()
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(missing).toEqual([])
		})
	})
}

// This package's own section. Every check before it reads a name — from the guide text or
// from the barrel — and a name that resolves proves nothing about the sentence beside it,
// so a fence whose comment claims a value the code contradicts passes all of them. The
// cases here read what the barrels resolve at runtime, what each implementation publishes,
// and the values the flagship fences claim. Change a fence, change the transcription
// beside it.

const ROOT = fileURLToPath(root)
const WORKBENCH = fileURLToPath(new URL('../tmp/probe', import.meta.url))

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
	['TypeStage', ['StageInterface', 'TypeStageInterface']],
	['LintStage', ['StageInterface']],
	['RuntimeStage', ['StageInterface']],
	['Overlay', ['OverlayInterface']],
]

/** Reads one inventoried file's text, in the same root-relative spelling the readers key on. */
function readWorkspaceText(path: string): string {
	return requireValue(files[path], `Missing file: ${path}`)
}

// Takes an object literal out of a document, from the line that opens it to the first later line
// that is a lone `}`. Every copy of the flagship claim sits at the left margin of its own document,
// which is what makes the terminator unambiguous without parsing the language around it.
function extractLiteral(text: string, opening: string): string {
	const lines = text.split('\n')
	const start = lines.findIndex((line) => line === opening)
	if (start === -1) return ''
	const end = lines.findIndex((line, index) => index > start && line === '}')
	if (end === -1) return ''
	return lines.slice(start, end + 1).join('\n')
}

// Strips the TSDoc gutter from a comment block, so a documented example can be compared against the
// same text written as ordinary source.
function stripComment(text: string): string {
	return text
		.split('\n')
		.map((line) => line.replace(/^\s*\* ?/, ''))
		.join('\n')
}

// Reads the documentation comment declared for one exported symbol. The body pattern refuses a
// comment terminator, so the match starts at the comment attached to the declaration rather than at
// the first comment in the file.
function extractComment(source: string, symbol: string): string {
	const declaration = new RegExp(
		`/\\*\\*((?:[^*]|\\*(?!/))*)\\*/\\s*export\\s+(?:declare\\s+)?(?:abstract\\s+)?(?:async\\s+)?(?:function|const|class|interface|type)\\s+${symbol}\\b`,
	)
	const block = declaration.exec(source)?.[1]
	return block === undefined ? '' : stripComment(block)
}

// Takes the lines of one interface's own body, from its opening line to its closing brace.
function extractBody(source: string, symbol: string): readonly string[] {
	const opening = new RegExp(`^export interface ${symbol}\\b[^\\n]*\\{$`, 'm')
	const start = opening.exec(source)
	if (start?.index === undefined) return []
	const body = source.slice(start.index).split('\n')
	const end = body.findIndex((line, index) => index > 0 && line === '}')
	return body.slice(1, end === -1 ? undefined : end)
}

// Reads the readonly data properties one interface declares in its own body. These belong in the
// guide's surface row rather than in its method table, and they still reach a class prototype as
// getters, so the implementation sweep counts them.
function extractProperties(source: string, symbol: string): readonly string[] {
	return extractBody(source, symbol)
		.map((line) => /^\treadonly ([A-Za-z_][A-Za-z0-9_]*)[?]?:/.exec(line)?.[1])
		.filter((name): name is string => name !== undefined)
}

// Reads the call-signature members one interface declares in its own body, ignoring the members it
// inherits and the readonly data properties that belong in the guide's surface tables.
function extractMembers(source: string, symbol: string): readonly string[] {
	return extractBody(source, symbol)
		.map((line) => /^\t([A-Za-z_][A-Za-z0-9_]*)\(/.exec(line)?.[1])
		.filter((name): name is string => name !== undefined)
}

// Takes one heading's slice of a document, up to the next heading at the same or a higher level.
function extractSection(text: string, heading: string): string {
	const level = heading.split(' ')[0]?.length ?? 2
	const start = text.indexOf(`${heading}\n`)
	if (start === -1) return ''
	const rest = text.slice(start + heading.length)
	const next = new RegExp(`\\n#{1,${level}} `).exec(rest)
	return next === null ? rest : rest.slice(0, next.index)
}

const GUIDE = readWorkspaceText(GUIDE_SPEC)
const CORE_TYPES = readWorkspaceText('src/core/types.ts')
const SERVER_TYPES = readWorkspaceText('src/server/types.ts')
const MANIFEST: unknown = JSON.parse(readWorkspaceText('package.json'))
const reflected = createSource({ files, module: own.source })

// Returns whichever contract file declares one interface. The package splits its contracts across
// its environments, and a lookup that guessed would compare a class against an empty body.
function readContract(symbol: string): string {
	return extractBody(CORE_TYPES, symbol).length > 0 ? CORE_TYPES : SERVER_TYPES
}

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
		const resolved = new Map<string, unknown>([...Object.entries(core), ...Object.entries(server)])
		expect(IMPLEMENTATIONS.length).toBeGreaterThan(0)
		for (const [name, contracts] of IMPLEMENTATIONS) {
			const implementation = resolved.get(name)
			expect(isConstructor(implementation), `${name} did not resolve to a class`).toBe(true)
			if (!isConstructor(implementation)) continue
			const declared = contracts.flatMap((contract) => {
				const source = readContract(contract)
				return [...extractMembers(source, contract), ...extractProperties(source, contract)]
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
		const remarks = extractComment(readWorkspaceText('src/core/shapers.ts'), 'CLAIM_SHAPE')
		const named = /admits a call with\s+`([^`]+)`/.exec(remarks)?.[1]
		expect(named).toBe('isClaim')
		expect(readWorkspaceText('src/server/ProbeServer.ts')).toContain(
			`if (!${String(named)}(input))`,
		)
	})

	it('ships registry metadata and a README that are not the scaffold default', () => {
		expect(MANIFEST).toMatchObject({
			name: '@orkestrel/probe',
			description: expect.not.stringContaining(DEFAULT_DESCRIPTION),
			keywords: expect.arrayContaining([expect.any(String)]),
		})
		const readme = readWorkspaceText('README.md')
		expect(readme).toContain('dist/bin/main.js')
		expect(readme).toContain('prove')
		expect(readme).toContain('receipt')
	})
})

describe('guides fences', () => {
	it('states the same claim in the guide, the contract, and this proof', () => {
		const transcribed = extractLiteral(
			readWorkspaceText('tests/guides.test.ts'),
			`${OPENING.replace('claim', 'CLAIM')}`,
		)
		expect(transcribed).not.toBe('')
		const documented = extractLiteral(GUIDE, OPENING)
		const contract = extractLiteral(extractComment(CORE_TYPES, 'Claim'), OPENING)
		expect(documented).toBe(contract)
		expect(documented).toBe(transcribed.replace('const CLAIM: Claim = {', OPENING))
	})

	it('states the constants at the values it publishes', () => {
		const constants = extractSection(GUIDE, '### Constants')
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
		const rows = [...extractSection(GUIDE, '## Failures').matchAll(/^\| `([^`]+)` +\| `([^`]+)`/gm)]
		expect(rows.length).toBeGreaterThan(0)
		const parties = new Set(rows.map((row) => row[1] ?? ''))
		const codes = new Set(rows.map((row) => row[2] ?? ''))
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
		expect(computeDigest('/srv/checkout', anchored)).not.toBe(computeDigest('/opt/other', anchored))
	})

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
