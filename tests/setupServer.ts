import { lstatSync, mkdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { attempt } from '@orkestrel/contract'
import { createScratch } from '@orkestrel/test/server'

// Reads, on the host the suite is running on, whether a create fails because the host refuses a
// name whose final component is longer than the filesystem accepts. The code the failure carries is
// what decides that: `ENAMETOOLONG` and `ERR_INVALID_ARG_VALUE` name the refusal outright, and
// `ENOENT` names it while the parent still stats as a directory, because an ordinary absent file
// beneath an existing directory would have been created instead. Every other code — a denied
// permission, a full disk, a locked path — is a failure of the host rather than a refusal of the
// name, and reading the failure alone would run a proof about a refusal on a host that reported
// none and red it there. A host that creates the file instead refuses no such name, and a proof
// about a refusal is inapplicable there rather than failing.
//
// This reads the codes itself rather than calling `isRefusedName`, so a classifier that stops
// classifying cannot silence the proof that would catch it. The write goes into an owned scratch
// directory, so nothing survives the reading.
function probeRefusedTargets(): boolean {
	const scratch = createScratch({ prefix: 'probe-refused-target-' })
	try {
		const outcome = attempt(() =>
			writeFileSync(resolve(scratch.path, `${'x'.repeat(300)}.test.ts`), '', 'utf8'),
		)
		if (outcome.success) return false
		const error = outcome.error
		if (typeof error !== 'object' || error === null || !('code' in error)) return false
		if (error.code === 'ENAMETOOLONG' || error.code === 'ERR_INVALID_ARG_VALUE') return true
		return error.code === 'ENOENT' && statSync(scratch.path).isDirectory()
	} finally {
		scratch.destroy()
	}
}

/**
 * Whether this host refuses to create a file under a caller-supplied name it will not accept.
 */
export const REFUSED_RUNTIME_TARGETS: boolean = probeRefusedTargets()

// Reads, on the host the suite is running on, whether a directory link the workspace walker reads
// as a symbolic link can be created at all. The walker's reading is `lstatSync().isSymbolicLink()`,
// and two calls satisfy it: a plain symbolic link, which needs a privilege a host can withhold, and
// a directory junction, which stands in where it does. A host that creates neither cannot build the
// condition a proof about a linked path needs, so such a proof is inapplicable there rather than
// failing. The link goes into an owned scratch directory, so nothing survives the reading.
function probeDirectoryLinks(): boolean {
	const scratch = createScratch({ prefix: 'probe-directory-link-' })
	try {
		const target = resolve(scratch.path, 'target')
		mkdirSync(target)
		const link = resolve(scratch.path, 'link')
		if (!attempt(() => symlinkSync(target, link, 'dir')).success) {
			if (!attempt(() => symlinkSync(target, link, 'junction')).success) return false
		}
		return lstatSync(link).isSymbolicLink()
	} finally {
		scratch.destroy()
	}
}

/**
 * Whether this host creates a directory link the workspace walker reads as a symbolic link.
 */
export const DIRECTORY_LINKS: boolean = probeDirectoryLinks()
