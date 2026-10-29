import type { Party, ProbeErrorCode, ProbeErrorContext, ProbeErrorOptions } from './types.js'
import {
	INTRINSICS,
	holds,
	isError,
	isFunction,
	isNumber,
	isObject,
	isString,
} from '@orkestrel/contract'
import { PROBE_ERROR_CODES, PROBE_PARTIES } from './constants.js'

/**
 * Reports one probe failure under stable ownership and condition axes.
 *
 * @remarks
 * Every failure raised while serving a claim arrives as one of these, so a consumer catching from
 * `prove`, from a stage, or from a workspace leaf branches on {@link Party} and
 * {@link ProbeErrorCode} rather than on message text. Narrow a caught value with
 * {@link isProbeError} before reading either member. A pure leaf called directly with a value
 * `isClaim` would refuse raises the host's own fault unchanged, because those leaves are written to
 * be total over a validated claim rather than over every value.
 *
 * @example
 * ```ts
 * const error = new ProbeError('Path escapes the workspace: ../secrets.env', {
 * 	origin: 'claimant',
 * 	code: 'refused',
 * 	context: { path: '../secrets.env' },
 * })
 * error.origin // 'claimant'
 * error.code // 'refused'
 * error.context?.path // '../secrets.env'
 * ```
 */
export class ProbeError extends Error {
	override readonly name = 'ProbeError'
	readonly origin: Party
	readonly code: ProbeErrorCode
	readonly context?: ProbeErrorContext

	/**
	 * Creates one classified probe failure.
	 *
	 * @param message - Human-readable description of what failed
	 * @param options - The ownership, condition, optional structured context, and optional cause
	 */
	constructor(message: string, options: ProbeErrorOptions) {
		const cause = options.cause
		super(message, cause === undefined ? undefined : { cause })
		Object.defineProperty(this, Symbol.for('@orkestrel/probe.error'), { value: this })
		this.origin = options.origin
		this.code = options.code
		if (options.context !== undefined) this.context = options.context
	}
}

/**
 * Checks whether an unknown value is a {@link ProbeError}.
 *
 * @remarks
 * Recognition requires the native `Error` base, a non-base prototype, an own global brand holding
 * the error itself, a declared party and condition, and context members of their declared types.
 * The brand carries recognition across duplicate installations and module formats. A subclass may
 * replace `name`. A transparent proxy, a plain `Error`, a property-only lookalike, and an error with
 * invalid members stay outside the type.
 *
 * @param value - The value to inspect
 * @returns True if the value is a `ProbeError` instance; false otherwise
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
		if (INTRINSICS.prototype(value) === Error.prototype) return false
		const descriptor = INTRINSICS.describe(value, Symbol.for('@orkestrel/probe.error'))
		if (descriptor?.value !== value) return false
		const origin: unknown = INTRINSICS.reflect.read(value, 'origin')
		const code: unknown = INTRINSICS.reflect.read(value, 'code')
		const context: unknown = INTRINSICS.reflect.read(value, 'context')
		if (context !== undefined) {
			if (!isObject(context) && !isFunction(context)) return false
			const stage: unknown = INTRINSICS.reflect.read(context, 'stage')
			if (stage !== undefined && stage !== 'type' && stage !== 'lint' && stage !== 'runtime')
				return false
			for (const key of ['path', 'project', 'name']) {
				const member: unknown = INTRINSICS.reflect.read(context, key)
				if (member !== undefined && !isString(member)) return false
			}
			const deadline: unknown = INTRINSICS.reflect.read(context, 'deadline')
			if (deadline !== undefined && !isNumber(deadline)) return false
		}
		return (
			PROBE_PARTIES.some((declared) => declared === origin) &&
			PROBE_ERROR_CODES.some((declared) => declared === code)
		)
	})
}

/**
 * Creates the failure raised when an instrument is used after it was torn down.
 *
 * @remarks
 * Every resident entity in this package refuses this way, so the subject names which one in the
 * message and the condition is the same for all of them. A caller that meets this builds a
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
	return new ProbeError(`The ${subject} has been destroyed`, {
		origin: 'claimant',
		code: 'destroyed',
	})
}
