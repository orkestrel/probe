import * as entry from '@src/core'
import { describe, expect, it } from 'vitest'

describe('src core entry', () => {
	// The population is stated before anything is drawn from it, because an entry that exported
	// nothing would satisfy a loop of membership assertions exactly as a complete one does.
	it('publishes the contract, its guards, its shapes, and its pure leaves', () => {
		expect(Object.keys(entry).sort()).toStrictEqual([
			'CASE_SHAPE',
			'CLAIM_SHAPE',
			'CONTROL_SHAPE',
			'FINDING_ORIGINS',
			'PROBE_STAGES',
			'RECEIPT_PREFIX',
			'RECEIPT_SEPARATOR',
			'SOURCE_SHAPE',
			'computeReceipt',
			'formatCheck',
			'formatFinding',
			'formatVerdict',
			'isCase',
			'isCheck',
			'isClaim',
			'isControl',
			'isFinding',
			'isOrigin',
			'isProject',
			'isSource',
			'isStage',
			'isToolchain',
			'isVerdict',
		])
	})

	it('exports no value the barrel cannot resolve', () => {
		for (const [name, value] of Object.entries(entry)) {
			expect(value, `${name} resolved to undefined`).toBeDefined()
		}
	})
})
