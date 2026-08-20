import type { ProbeInterface, ProbeOptions } from '@src/core'
import type { ProbeServerInterface } from './types.js'
import { Probe } from './Probe.js'
import { ProbeServer } from './ProbeServer.js'

/**
 * Creates a resident probe for one target workspace.
 *
 * @remarks
 * `options.on` installs initial event listeners. `options.error` receives listener throws.
 * `options.workspace` selects the target root and defaults to the current working directory.
 * `options.deadline` limits one runtime stage in milliseconds and defaults to 30,000.
 *
 * @param options - Initial listeners, listener error handler, workspace, and runtime deadline
 * @returns A probe that begins warming at construction
 *
 * @example
 * ```ts
 * const probe = createProbe({
 * 	workspace: process.cwd(),
 * 	deadline: 30_000,
 * 	on: { arm: (toolchain) => console.log(toolchain.typescript) },
 * 	error: (error) => console.error(error),
 * })
 * console.log(probe.toolchain.vitest)
 * await probe.destroy()
 * ```
 */
export function createProbe(options?: ProbeOptions): ProbeInterface {
	return new Probe(options)
}

/**
 * Creates the Model Context Protocol stdio server for one probe of its own.
 *
 * @remarks
 * The server creates the probe it serves, because it takes this process's standard input and
 * output unconditionally: a host that starts one has given the process to it, and there is no
 * second probe for it to serve. Every option configures that probe and reaches it unchanged.
 *
 * @param options - Initial listeners, listener error handler, workspace, and runtime deadline for
 * the probe the server creates
 * @returns A stdio server ready to start
 *
 * @example
 * ```ts
 * const server = createProbeServer({ workspace: process.cwd() })
 * server.start()
 * await server.destroy()
 * ```
 */
export function createProbeServer(options?: ProbeOptions): ProbeServerInterface {
	return new ProbeServer(options)
}
