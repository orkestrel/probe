import type { ScratchInterface } from '@orkestrel/test/server'
import { spawn } from 'node:child_process'
import { statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { attempt } from '@orkestrel/contract'
import { waitForCondition } from '@orkestrel/test'
import { createScratch, supportsDirectoryLinks } from '@orkestrel/test/server'

/**
 * Reads the process id announced by a fixture server.
 *
 * @param scratch - The fixture workspace carrying `server.pid`.
 * @returns The announced process id.
 * @throws An `Error` when the fixture server has not announced itself.
 */
export function readFixtureServer(scratch: ScratchInterface): number {
	const announced = scratch.read('server.pid')
	if (announced === undefined) throw new Error('The fixture server never announced its process id')
	return Number.parseInt(announced, 10)
}

/**
 * Waits for a fixture server to announce its process id.
 *
 * @param scratch - The fixture workspace that receives `server.pid`.
 * @returns The announced process id.
 * @throws An `Error` when the fixture server does not announce itself within 10 seconds.
 */
export async function waitForFixtureServer(scratch: ScratchInterface): Promise<number> {
	await waitForCondition(
		'the fixture server to announce its process id',
		() => scratch.read('server.pid') !== undefined,
		{ budget: 10_000, interval: 50 },
	)
	return readFixtureServer(scratch)
}

/**
 * Kills the process announced by a fixture server.
 *
 * @param scratch - The fixture workspace carrying `server.pid`.
 * @returns Nothing.
 */
export function killFixtureServer(scratch: ScratchInterface): void {
	process.kill(readFixtureServer(scratch), 'SIGKILL')
}

/**
 * Checks whether a process id is live on this host.
 *
 * @param id - The process id to inspect.
 * @returns True if signal zero reaches the process; false otherwise.
 */
export function isProcessLive(id: number): boolean {
	try {
		process.kill(id, 0)
		return true
	} catch {
		return false
	}
}

/**
 * Reads how this host reports a signal delivered to a real child.
 *
 * @param signal - The signal to deliver after the child announces readiness.
 * @param program - The child program that announces readiness on standard output.
 * @returns The child's exit code and ending signal.
 */
export async function readSignalEnding(
	signal: NodeJS.Signals,
	program: string,
): Promise<{ readonly code: number | null; readonly signal: string | null }> {
	const child = spawn(process.execPath, ['-e', program], { stdio: ['ignore', 'pipe', 'ignore'] })
	const ended = new Promise<{ code: number | null; signal: string | null }>((settle) => {
		child.once('exit', (code, ending) => settle({ code, signal: ending }))
	})
	await new Promise<void>((armed) => {
		child.stdout.once('data', () => armed())
	})
	child.kill(signal)
	return await ended
}

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

/**
 * Whether this host creates a directory link the workspace walker reads as a symbolic link.
 *
 * @remarks `supportsDirectoryLinks` creates one junction, which is the call that lands on a host
 * withholding the privilege a plain symbolic link needs, and answers true only when the link reports
 * as a symbolic link, resolves to a directory, and reaches the destination's contents. The walker's
 * own reading is `lstatSync().isSymbolicLink()`, and every proof gated here also traverses the link,
 * so the stricter answer is the one they need. A host answering false cannot build the linked path
 * those proofs are about, so each is inapplicable there rather than failing.
 */
export const DIRECTORY_LINKS: boolean = supportsDirectoryLinks()
