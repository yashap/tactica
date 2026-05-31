import { CorrelationIdPropagator } from '@tactica/correlation-id-propagator'
import { describe, expect, it } from 'vitest'
import { Logger, LogLevel } from './Logger.js'

describe('Logger', () => {
  it('constructs and emits at every level without throwing', () => {
    const logger = new Logger('test')
    expect(() => logger.info('hello')).not.toThrow()
    expect(() => logger.error('oops', { code: 'E1' })).not.toThrow()
    expect(() => logger.http('GET / 200', { duration: 4 })).not.toThrow()
  })

  it('exposes isLevelEnabled honoring LOG_LEVEL', () => {
    const logger = new Logger('test')
    // info is the default level; warn and error should be enabled, debug/trace should be disabled
    expect(logger.isLevelEnabled(LogLevel.Error)).toBe(true)
    expect(logger.isLevelEnabled(LogLevel.Warn)).toBe(true)
    expect(logger.isLevelEnabled(LogLevel.Info)).toBe(true)
    expect(logger.isLevelEnabled(LogLevel.Debug)).toBe(false)
    expect(logger.isLevelEnabled(LogLevel.Trace)).toBe(false)
  })

  it('child() inherits and overrides default metadata', () => {
    const root = new Logger('root', { service: 'tactica-core' })
    const child = root.child('todo', { component: 'TodoRepository' })
    expect(() => child.info('ran')).not.toThrow()
  })

  it('pulls correlationId from CorrelationIdPropagator', () => {
    const logger = new Logger('test')
    CorrelationIdPropagator.runWithContext('abc-123', () => {
      expect(() => logger.info('with correlation')).not.toThrow()
    })
  })
})
