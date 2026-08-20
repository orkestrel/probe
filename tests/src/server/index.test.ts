import * as entry from '@src/server'
import { describe, expect, it } from 'vitest'

describe('src server entry', () => {
	// `Overlay` is deliberately absent: no published signature accepts one, and each inspection
	// mints its own so a resident tool re-reads the paths it holds. `tests/guides.test.ts` names it
	// in the parity `INTERNAL` list and fails if it returns to this barrel.
	it('publishes the coordinator, stages, factories, and server leaves', () => {
		expect(Object.keys(entry).sort()).toStrictEqual([
			'LintStage',
			'Probe',
			'RuntimeStage',
			'TypeStage',
			'computeDigest',
			'createProbe',
			'createProbeServer',
			'createRevisionFile',
			'inferDocumentLanguage',
			'inferTestProject',
			'inferTypeProject',
			'loadWorkspaceModule',
			'matchesWorkspaceModule',
			'messageFromUnknown',
			'normalizeValue',
			'parseContentLength',
			'readWorkspaceManifest',
			'relativeWorkspaceFile',
			'resolveWorkspaceBinary',
			'resolveWorkspaceFile',
			'resolveWorkspaceModule',
		])
	})

	// `TypeStage implements TypeStageInterface` is what makes the compiler agree the class is at
	// least the interface. This list is the interface's own members transcribed, so a member the
	// class publishes and no interface declares fails here rather than shipping undeclared.
	it('publishes exactly the members its stage interface declares', () => {
		expect(
			Object.getOwnPropertyNames(entry.TypeStage.prototype)
				.filter((name) => name !== 'constructor')
				.sort(),
		).toStrictEqual(['candidates', 'destroy', 'inspect', 'resolve', 'stage'])
		expect(
			Object.getOwnPropertyNames(entry.LintStage.prototype)
				.filter((name) => name !== 'constructor')
				.sort(),
		).toStrictEqual(['destroy', 'inspect', 'stage'])
	})
})
