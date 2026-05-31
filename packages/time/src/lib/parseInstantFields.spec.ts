import { Temporal } from '@js-temporal/polyfill'
import { InputValidationError } from '@tactica/errors'
import { describe, expect, it } from 'vitest'
import { formatInstantFields } from './formatInstantFields.js'
import { parseInstantFields } from './parseInstantFields.js'

describe('parseInstantFields', () => {
  it('parses ISO 8601 strings into Temporal.Instants', () => {
    const result = parseInstantFields({ createdAt: '2026-01-15T10:00:00Z', updatedAt: '2026-01-15T11:00:00Z' }, [
      'createdAt',
      'updatedAt',
    ])
    expect(result.createdAt).toBeInstanceOf(Temporal.Instant)
    expect(result.createdAt.toString()).toBe('2026-01-15T10:00:00Z')
  })

  it('accepts Date instances', () => {
    const d = new Date('2026-01-15T10:00:00Z')
    const result = parseInstantFields({ createdAt: d }, ['createdAt'])
    expect(result.createdAt.toString()).toBe('2026-01-15T10:00:00Z')
  })

  it('throws InputValidationError on missing fields', () => {
    expect(() => parseInstantFields({} as Record<string, unknown>, ['createdAt'])).toThrow(InputValidationError)
  })
})

describe('formatInstantFields', () => {
  it('serializes Temporal.Instants to ISO strings', () => {
    const result = formatInstantFields({ createdAt: Temporal.Instant.from('2026-01-15T10:00:00Z') }, ['createdAt'])
    expect(result.createdAt).toBe('2026-01-15T10:00:00Z')
  })
})
