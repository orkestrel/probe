import type { Claim } from '@src/core'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as core from '@src/core'
import * as server from '@src/server'
import { PROBE_STAGES, RECEIPT_PREFIX, RECEIPT_SEPARATOR } from '@src/core'
import { Probe, readWorkspaceManifest } from '@src/server'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

// Names this package publishes from a source file and deliberately keeps out of its barrels. A
// class reaches this list when no published signature accepts it, so a consumer can construct one
// and hand it to nothing. `Overlay` is interned because each inspection mints its own to force a
// resident tool to re-read the paths it holds; one supplied from outside would be reused across
// inspections and report a stale answer as a fresh one.
const INTERNAL: readonly string[] = ['Overlay', 'OverlayInterface']

// The claim the guide tells a reader to run verbatim. The same literal appears in
// `guides/probe.md`, in the `Claim` contract's own `@example`, and here; the parity test below
// reads all three out of their files and refuses any difference, so this transcription cannot
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

// Reads the names one contract file exports, in declaration order.
function extractTypes(source: string): readonly string[] {
	return [...source.matchAll(/^export (?:interface|type) ([A-Za-z_][A-Za-z0-9_]*)/gm)].map(
		(match) => match[1] ?? '',
	)
}

// Reads the call-signature members one interface declares in its own body, ignoring the members it
// inherits and the readonly data properties that belong in the guide's surface tables.
function extractMembers(source: string, symbol: string): readonly string[] {
	const opening = new RegExp(`^export interface ${symbol}\\b[^\\n]*\\{$`, 'm')
	const start = opening.exec(source)
	if (start?.index === undefined) return []
	const body = source.slice(start.index).split('\n')
	const end = body.findIndex((line, index) => index > 0 && line === '}')
	return body
		.slice(1, end === -1 ? undefined : end)
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

describe('guides parity', () => {
	it('documents every public export, and publishes every documented name', () => {
		const published = [
			...Object.keys(core),
			...Object.keys(server),
			...extractTypes(CORE_TYPES),
			...extractTypes(SERVER_TYPES),
		].filter((name) => !INTERNAL.includes(name))
		const documented = extractRows(extractSection(GUIDE, '## Surface'))
		expect([...new Set(documented)].sort()).toStrictEqual([...new Set(published)].sort())
	})

	it('documents exactly the members each behavioral interface declares', () => {
		const interfaces = [
			'ProbeInterface',
			'StageInterface',
			'TypeStageInterface',
			'ProbeServerInterface',
		]
		const methods = extractSection(GUIDE, '## Methods')
		for (const name of interfaces) {
			const source = name === 'ProbeInterface' ? CORE_TYPES : SERVER_TYPES
			expect([...extractRows(extractSection(methods, `#### \`${name}\``))].sort()).toStrictEqual(
				[...extractMembers(source, name)].sort(),
			)
		}
	})

	it('keeps every interned symbol out of the barrels and out of the guide', () => {
		for (const name of INTERNAL) {
			expect(Object.keys(core)).not.toContain(name)
			expect(Object.keys(server)).not.toContain(name)
			expect(GUIDE).not.toContain(`\`${name}\``)
		}
	})

	it('carries a documented example for every barrelled export', () => {
		const modules = [
			...extractModules(readWorkspaceText('src/core/index.ts'), 'src/core'),
			...extractModules(readWorkspaceText('src/server/index.ts'), 'src/server'),
		]
		expect(modules.length).toBeGreaterThan(0)
		const missing: string[] = []
		for (const path of modules) {
			for (const [name, comment] of extractDocumented(readWorkspaceText(path))) {
				if (INTERNAL.includes(name)) continue
				if (!comment.includes('@example')) missing.push(`${path} ${name}`)
			}
		}
		expect(missing).toStrictEqual([])
	})

	it('names the guard the tool actually applies to an arriving claim', () => {
		const remarks = extractComment(readWorkspaceText('src/core/shapers.ts'), 'CLAIM_SHAPE')
		const named = /admits a call with\s+`([^`]+)`/.exec(remarks)?.[1]
		expect(named).toBe('isClaim')
		expect(readWorkspaceText('src/server/factories.ts')).toContain(`if (!${String(named)}(input))`)
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
		expect(constants).toContain("`['code', 'instrument']`")
		expect(core.FINDING_ORIGINS).toStrictEqual(['code', 'instrument'])
		expect(constants).toContain("`'probe'`")
		expect(RECEIPT_PREFIX).toBe('probe')
		expect(constants).toContain("`':'`")
		expect(RECEIPT_SEPARATOR).toBe(':')
	})

	it('earns the receipt the guide documents', { timeout: 300_000 }, async () => {
		const probe = new Probe({ workspace: ROOT, deadline: 120_000 })
		try {
			const verdict = await probe.prove(CLAIM)
			expect(verdict.receipt).toBeDefined()
			expect(verdict.digest).toBe(DIGEST)
			const receipt = verdict.receipt ?? ''
			// The guide's parsing rule, applied to the token the run returned: six leading fields,
			// then a remainder that carries the project path and its digest.
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
