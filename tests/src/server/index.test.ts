import * as entry from '@src/server'
import { describe, expect, it } from 'vitest'

describe('src server entry', () => {
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
})
