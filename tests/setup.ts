import type { StageResult, Draft, Issue, Project, Stage, Toolchain } from '@src/core'
import { PROBE_STAGES, isProbeError } from '@src/core'
import { resolveRoot } from '@orkestrel/test'

export const WORKSPACE_ROOT = resolveRoot(import.meta)

/** Holds the latest observation made by the callbacks of one test. */
export class ProbeObservation<T> {
	#value: T

	constructor(value: T) {
		this.#value = value
	}

	get value(): T {
		return this.#value
	}

	set value(value: T) {
		this.#value = value
	}
}

/** Builds every stage of a control with issues assigned to its selected stage. */
export function buildControl(stage: Stage, issues: readonly Issue[]): readonly StageResult[] {
	return PROBE_STAGES.map((name) => ({
		stage: name,
		elapsed: 1,
		issues: name === stage ? issues : [],
	}))
}

/** Removes comments before inspecting failure construction syntax. */
export function stripComments(source: string): string {
	return source
		.replaceAll(/\/\*[\s\S]*?\*\//g, '')
		.split(/\r\n|\n/)
		.filter((line) => !line.trimStart().startsWith('//'))
		.join('\n')
}

/** Names source failure constructions outside the package error contract. */
export function findBareErrors(source: string, path: string): readonly string[] {
	const text = stripComments(source)
	// The MCP handshake answers in the protocol's error type.
	const factory =
		path === '../../../src/server/errors.ts'
			? /^export function createHandshakeError\(error: ProbeError\): MCPError \{\s*return (new\s+MCPError\s*\()/m.exec(
					text,
				)
			: null
	const sanctioned =
		factory === null || factory[1] === undefined
			? undefined
			: factory.index + factory[0].length - factory[1].length
	return [...text.matchAll(/\b(throw\s+)?new\s+([A-Za-z_][\w]*)\s*\(/g)]
		.filter((match) =>
			match[2] === 'MCPError'
				? match.index !== sanctioned
				: match[1] !== undefined && match[2] !== 'ProbeError',
		)
		.map((match) => `${path} ${match[2] ?? ''}`)
}

/** Describes the ownership and condition of a caught probe failure. */
export function describeFailure(value: unknown): string {
	if (!isProbeError(value)) return `unclassified ${String(value)}`
	return `${value.origin}/${value.code}`
}

/** Varies a draft by a comment without changing its executable behavior. */
export function varyDraft(draft: Draft): Draft {
	return { path: draft.path, text: `${draft.text}// the control, one comment apart\n` }
}

export const PROBE_EXAMPLE_TOOLCHAIN: Toolchain = {
	typescript: '6.0.3',
	oxlint: '1.79.0',
	vitest: '4.1.11',
}
export const PROBE_EXAMPLE_PROJECT: Project = {
	path: 'configs/src/tsconfig.core.json',
	digest: 'd61f11b52460b1c6707cfac2c6078d59',
}
// The token the package documents, reproduced here as a literal rather than rebuilt from the
// constants the source joins: a token assembled the way `computeReceipt` assembles it would match
// whatever `computeReceipt` returned.
export const PROBE_EXAMPLE_TOKEN =
	'probe:6ca20c3bff623031d3955b9d1a76d71d:type:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@d61f11b52460b1c6707cfac2c6078d59'

export const PROBE_EXAMPLE_ISSUE: Issue = {
	origin: 'claimant',
	path: 'src/core/greeting.ts',
	message: 'not assignable',
}
