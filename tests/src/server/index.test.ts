import * as entry from '@src/server'
import { describe, expect, it } from 'vitest'

describe('src server entry', () => {
	// The population is stated before anything is drawn from it, because an entry that exported
	// nothing would satisfy a loop of membership assertions exactly as a complete one does.
	it('publishes the coordinator, stages, factories, and server leaves', () => {
		expect(Object.keys(entry).sort()).toStrictEqual([
			'LintStage',
			'Probe',
			'RuntimeStage',
			'TypeStage',
			'createProbe',
			'createProbeServer',
			'createRevisionFile',
			'inferDocumentLanguage',
			'inferTestProject',
			'inferTypeProject',
			'matchesWorkspaceModule',
			'messageFromUnknown',
			'parseContentLength',
			'readWorkspaceManifest',
			'relativeWorkspaceFile',
			'resolveWorkspaceBinary',
			'resolveWorkspaceFile',
			'resolveWorkspaceModule',
		])
	})

	it('exports no value the barrel cannot resolve', () => {
		for (const [name, value] of Object.entries(entry)) {
			expect(value, `${name} resolved to undefined`).toBeDefined()
		}
	})
})
