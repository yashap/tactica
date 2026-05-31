import { ContextPropagator } from '@tactica/context-propagation'

/**
 * Process-wide singleton for propagating a correlation ID across an async call stack. Set at the
 * request boundary (e.g. in a Fastify hook) and read by the logger so every log line emitted
 * during a request automatically carries the same ID.
 */
export const CorrelationIdPropagator = new ContextPropagator<string>()
