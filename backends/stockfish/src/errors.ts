import { type ErrorOptions, ServerError } from '@tactica/errors'

/**
 * The engine process failed us — it crashed, wouldn't start, or died mid-search. A 500 because it's
 * our side that's broken, not the caller's request.
 */
export class EngineError<T = unknown> extends ServerError<T> {
  constructor(message: string, options: ErrorOptions<T> = {}) {
    super(500, message, options)
  }
}

/**
 * The engine blew past its search deadline and had to be killed. 504 rather than 500 so callers can
 * distinguish "the engine is wedged, retrying may work" from "the engine is broken".
 */
export class EngineTimeoutError<T = unknown> extends ServerError<T> {
  constructor(message: string, options: ErrorOptions<T> = {}) {
    super(504, message, options)
  }
}
