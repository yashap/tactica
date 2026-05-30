import { describe, expect, it } from 'vitest'
import { Logger } from '../index.js'

describe('Logger', () => {
  it('constructs with default options', () => {
    const logger = new Logger({ level: 'off' })
    expect(() => logger.info('hello')).not.toThrow()
    expect(() => logger.error('oops', { code: 'E1' })).not.toThrow()
  })
})
