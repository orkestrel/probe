import type { ProbeErrorCode, ProbeErrorContext, ProbeErrorOptions } from './types.js'
import { holds, isError } from '@orkestrel/contract'
import { PROBE_ERROR_CODES } from './constants.js'

/**
 * Reports one probe failure under a stable machine-readable category.
 *
 * @remarks
 * Every failure this package raises arrives as one of these, so a consumer catching from `prove`,
 * from a stage, or from a workspace leaf branches on {@link ProbeErrorCode} rather than on message
 * text. Narrow a caught value with {@link isProbeError} before reading either member.
 *
 * @example
 * ```ts
 * const error = new ProbeError('Path escapes the workspace: ../secrets.env', {
 * 	code: 'invalid',
 * 	context: { path: '../secrets.env' },
 * })
 * error.code // 'invalid'
 * error.context?.path // '../secrets.env'
 * ```
 */
export class ProbeError extends Error {
	override readonly name = 'ProbeError'
	readonly code: ProbeErrorCode
	readonly context?: ProbeErrorContext

	/**
	 * Creates one categorized probe failure.
	 *
	 * @param message - Human-readable description of what failed
	 * @param options - The machine-readable category, optional structured context, and optional cause
	 */
	constructor(message: string, options: ProbeErrorOptions) {
		const cause = options.cause
		super(message, cause === undefined ? undefined : { cause })
		// A global own-property brand rather than the constructor identity, because a consumer that
		// installs this package twice, or loads its ESM and CommonJS builds together, holds two
		// classes and `instanceof` refuses the other one's error.
		Object.defineProperty(this, Symbol.for('@orkestrel/probe.error'), { value: true })
		this.code = options.code
		if (options.context !== undefined) this.context = options.context
	}
}

/**
 * Checks whether an unknown value is a {@link ProbeError}.
 *
 * @remarks
 * Recognition combines the global own-property brand with the native `Error` base, the subclass
 * prototype, the fixed name, and a category {@link PROBE_ERROR_CODES} declares. The brand is what
 * carries recognition across duplicate installations and across an ESM and a CommonJS copy of this
 * package, where the two classes are different values. A plain `Error`, a property-only lookalike,
 * and a branded value carrying an undeclared category all stay outside the type.
 *
 * @param value - The value to inspect
 * @returns True only for a `ProbeError` instance; false otherwise
 *
 * @example
 * ```ts
 * isProbeError(createDestroyedError('probe')) // true
 * isProbeError(new Error('The probe has been destroyed')) // false
 * ```
 */
export function isProbeError(value: unknown): value is ProbeError {
	if (!isError(value)) return false
	return holds(() => {
		if (Object.getPrototypeOf(value) === Error.prototype) return false
		if (value.name !== 'ProbeError' || !('code' in value)) return false
		const descriptor = Object.getOwnPropertyDescriptor(value, Symbol.for('@orkestrel/probe.error'))
		if (descriptor?.value !== true) return false
		const code: unknown = value.code
		return PROBE_ERROR_CODES.some((declared) => declared === code)
	})
}

/**
 * Creates the failure raised when an instrument is used after it was torn down.
 *
 * @remarks
 * Every resident entity in this package refuses this way, so the subject names which one in the
 * message and the category is the same for all of them. A caller that meets this builds a
 * replacement rather than retrying: teardown is permanent.
 *
 * @param subject - The torn-down entity, named as the message names it, such as `type stage`
 * @returns A typed teardown failure
 *
 * @example
 * ```ts
 * createDestroyedError('type stage').message // 'The type stage has been destroyed'
 * createDestroyedError('probe').code // 'destroyed'
 * ```
 */
export function createDestroyedError(subject: string): ProbeError {
	return new ProbeError(`The ${subject} has been destroyed`, { code: 'destroyed' })
}
