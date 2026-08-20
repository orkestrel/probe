import type { Claim } from '@src/core'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as core from '@src/core'
import * as server from '@src/server'
import { PROBE_STAGES, RECEIPT_PREFIX, RECEIPT_SEPARATOR } from '@src/core'
import { computeDigest, normalizePath, Probe, readWorkspaceManifest } from '@src/server'
import { describe, expect, it } from 'vitest'
import { isConstructor } from '@orkestrel/contract'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const WORKBENCH = fileURLToPath(new URL('../tmp/probe', import.meta.url))

// Names this package declares in a source file and deliberately keeps out of its barrels. Interning
// is for a declaration a consumer cannot construct from values they already hold, and this package
// has none: every class here takes either nothing or a workspace path. The empty list is the
// healthy state, and the sweep below refuses both a stranded declaration missing from it and a name
// in it that the barrels already publish.
const INTERNAL: readonly string[] = Object.freeze([])

// The claim the guide tells a reader to run verbatim. The same literal appears in
// `guides/probe.md`, in the `Claim` contract's own `@example`, and here; the parity test below
// reads each of them out of their files and refuses any difference, so this transcription cannot
// drift away from what a consumer copies.
const CLAIM: Claim = {
	project: 'configs/src/tsconfig.core.json',
	case: {
		files: [{ path: 'src/core/greeting.ts', text: "export const GREETING = 'hi'\n" }],
		test: {
			path: 'tmp/probe/greeting.test.ts',
			text: "import { expect, test } from 'vitest'\nimport { GREETING } from '../../src/core/greeting.js'\ntest('greets', () => expect(GREETING).toBe('hi'))\n",
		},
	},
	control: {
		files: [{ path: 'src/core/greeting.ts', text: "export const GREETING: number = 'hi'\n" }],
		test: {
			path: 'tmp/probe/greeting.test.ts',
			text: "import { expect, test } from 'vitest'\nimport { GREETING } from '../../src/core/greeting.js'\ntest('greets', () => expect(GREETING).toBe('hi'))\n",
		},
		stage: 'type',
		reason: 'a string literal assigned to a number must not compile',
	},
}

const OPENING = 'const claim: Claim = {'
const DIGEST = '0806fb30f428edb8ea85adfb4b355441'
const DEFAULT_DESCRIPTION = 'The @orkestrel/probe package.'

function readWorkspaceText(path: string): string {
	return readFileSync(new URL(path, new URL('../', import.meta.url)), 'utf8')
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

// Reads every TypeScript file one source directory carries, barrels excluded, in the same
// workspace-relative spelling a barrel row resolves to.
function extractSources(directory: string): readonly string[] {
	const entries = readdirSync(new URL(directory, new URL('../', import.meta.url)), {
		recursive: true,
	})
	return entries
		.map((entry) => `${directory}/${normalizePath(String(entry))}`)
		.filter((path) => path.endsWith('.ts') && !path.endsWith('/index.ts'))
}

// Reads the module paths one barrel re-exports, so a new source file joins the documentation
// sweeps below by being exported rather than by being listed here.
function extractModules(barrel: string, directory: string): readonly string[] {
	return [...barrel.matchAll(/export \* from '\.\/(.+)\.js'/g)].map(
		(match) => `${directory}/${match[1] ?? ''}.ts`,
	)
}

// Reads every symbol a source file exports with a documentation comment, paired with that comment.
function extractDocumented(source: string): ReadonlyMap<string, string> {
	const documented = new Map<string, string>()
	const declarations =
		/\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z_][A-Za-z0-9_]*)/g
	for (const match of source.matchAll(declarations)) {
		documented.set(match[2] ?? '', match[1] ?? '')
	}
	return documented
}

// Reads every symbol one source file exports at the left margin, documented or not. Both parity
// directions draw their population from here rather than from a barrel's runtime keys, because a
// type-only export never appears among those keys and an undocumented export of any kind never
// appears among the documented ones.
function extractExports(source: string): readonly string[] {
	const declarations =
		/^export (?:declare )?(?:abstract )?(?:async )?(?:function|const|class|interface|type) ([A-Za-z_][A-Za-z0-9_]*)/gm
	return [...source.matchAll(declarations)].map((match) => match[1] ?? '')
}

// Reads the readonly data properties one interface declares in its own body. These belong in the
// guide's surface row rather than in its method table, and they still reach a class prototype as
// getters, so the implementation sweep counts them.
function extractProperties(source: string, symbol: string): readonly string[] {
	return extractBody(source, symbol)
		.map((line) => /^\treadonly ([A-Za-z_][A-Za-z0-9_]*)[?]?:/.exec(line)?.[1])
		.filter((name): name is string => name !== undefined)
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

// Reads the call-signature members one interface declares in its own body, ignoring the members it
// inherits and the readonly data properties that belong in the guide's surface tables.
function extractMembers(source: string, symbol: string): readonly string[] {
	return extractBody(source, symbol)
		.map((line) => /^\t([A-Za-z_][A-Za-z0-9_]*)\(/.exec(line)?.[1])
		.filter((name): name is string => name !== undefined)
}

// Reads the first backticked cell of every table row in one slice of the guide.
function extractRows(section: string): readonly string[] {
	return [...section.matchAll(/^\| `([^`]+)`\s*\|/gm)].map((match) => match[1] ?? '')
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

const GUIDE = readWorkspaceText('guides/probe.md')
const CORE_TYPES = readWorkspaceText('src/core/types.ts')
const SERVER_TYPES = readWorkspaceText('src/server/types.ts')
const MANIFEST: unknown = JSON.parse(readWorkspaceText('package.json'))

// Returns whichever contract file declares one interface. The package splits its contracts across
// its environments, and a lookup that guessed would compare a class against an empty body.
function readContract(symbol: string): string {
	return extractBody(CORE_TYPES, symbol).length > 0 ? CORE_TYPES : SERVER_TYPES
}

// Every source module the barrels re-export, so a new file joins the sweeps below by being
// barrelled rather than by being listed here.
const MODULES: readonly string[] = [
	...extractModules(readWorkspaceText('src/core/index.ts'), 'src/core'),
	...extractModules(readWorkspaceText('src/server/index.ts'), 'src/server'),
]

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

// Every source file the published environments carry, discovered rather than listed, so the
// sweep below compares the barrels against what the tree holds instead of against a memory of it.
const SOURCES: readonly string[] = [...extractSources('src/core'), ...extractSources('src/server')]

describe('guides parity', () => {
	it('documents every public export, and publishes every documented name', () => {
		expect(MODULES.length).toBeGreaterThan(0)
		const published = MODULES.flatMap((path) => extractExports(readWorkspaceText(path))).filter(
			(name) => !INTERNAL.includes(name),
		)
		expect(published.length).toBeGreaterThan(0)
		const documented = extractRows(extractSection(GUIDE, '## Surface'))
		expect([...new Set(documented)].sort()).toStrictEqual([...new Set(published)].sort())
	})

	// The scan above is the population of record, and these are the values behind it. Every name a
	// barrel resolves at runtime is one the scan found, and every one of them resolves to a value,
	// so a barrel row that names a module the scan never read fails here rather than shipping.
	it('resolves every value the barrels publish', () => {
		const published = MODULES.flatMap((path) => extractExports(readWorkspaceText(path)))
		for (const entry of [core, server]) {
			for (const [name, value] of Object.entries(entry)) {
				expect(value, `${name} resolved to undefined`).toBeDefined()
				expect(published, `${name} is published by no scanned module`).toContain(name)
			}
		}
	})

	it('documents exactly the members each behavioral interface declares', () => {
		const interfaces = [
			'ProbeInterface',
			'OverlayInterface',
			'StageInterface',
			'TypeStageInterface',
			'ProbeServerInterface',
		]
		const methods = extractSection(GUIDE, '## Methods')
		for (const name of interfaces) {
			const source = readContract(name)
			expect([...extractRows(extractSection(methods, `#### \`${name}\``))].sort()).toStrictEqual(
				[...extractMembers(source, name)].sort(),
			)
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

	// Both directions, because either alone rots. A declaration in a file no barrel row names is
	// stranded and must be named interned; a name declared interned that the barrels already reach
	// is a false claim, and the parity population above drops it on that false premise.
	it('strands no declaration outside a barrel, and interns nothing the barrels publish', () => {
		expect(SOURCES.length).toBeGreaterThan(0)
		expect(MODULES.filter((path) => !SOURCES.includes(path))).toStrictEqual([])
		const stranded = SOURCES.filter((path) => !MODULES.includes(path)).flatMap((path) =>
			extractExports(readWorkspaceText(path)),
		)
		expect(stranded.filter((name) => !INTERNAL.includes(name))).toStrictEqual([])
		expect(INTERNAL.filter((name) => !stranded.includes(name))).toStrictEqual([])
	})

	it('carries a documented example for every barrelled export', () => {
		expect(MODULES.length).toBeGreaterThan(0)
		const missing: string[] = []
		for (const path of MODULES) {
			const source = readWorkspaceText(path)
			const documented = extractDocumented(source)
			for (const name of new Set(extractExports(source))) {
				if (INTERNAL.includes(name)) continue
				if (!(documented.get(name) ?? '').includes('@example')) missing.push(`${path} ${name}`)
			}
		}
		expect(missing).toStrictEqual([])
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
		expect(core.ORIGINS).toStrictEqual(['claimant', 'workspace', 'instrument'])
		expect(constants).toContain("`'probe'`")
		expect(RECEIPT_PREFIX).toBe('probe')
		expect(constants).toContain("`':'`")
		expect(RECEIPT_SEPARATOR).toBe(':')
	})

	// The failure table is the guide's own copy of the ownership and condition axes, so it is read
	// against the tuples the package publishes rather than against a memory of them. Each declared
	// value appears in the column that carries it, and no row invents a value neither tuple declares.
	it('names every declared origin and condition in the failure table', () => {
		const rows = [...extractSection(GUIDE, '## Failures').matchAll(/^\| `([^`]+)` +\| `([^`]+)`/gm)]
		expect(rows.length).toBeGreaterThan(0)
		const origins = new Set(rows.map((row) => row[1] ?? ''))
		const codes = new Set(rows.map((row) => row[2] ?? ''))
		expect([...origins].sort()).toStrictEqual([...core.ORIGINS].sort())
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
