import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { type Cursor, decodeCursor, encodeCursor } from './Cursor.js'

describe('Cursor encode/decode', () => {
  type UserCursor = Cursor<'age', number>
  const parseOrdering = (ordering: {
    orderBy: unknown
    lastOrderValueSeen: unknown
  }): Pick<UserCursor, 'orderBy' | 'lastOrderValueSeen'> =>
    z.object({ orderBy: z.literal('age'), lastOrderValueSeen: z.number() }).parse(ordering)

  it('round-trips a cursor through base64 + JSON', () => {
    const original: UserCursor = {
      limit: 10,
      orderBy: 'age',
      orderDirection: 'asc',
      lastOrderValueSeen: 42,
      lastIdSeen: 'abc',
    }
    const encoded = encodeCursor(original)
    expect(typeof encoded).toBe('string')
    expect(decodeCursor(encoded, parseOrdering)).toEqual(original)
  })

  it('rejects an invalid cursor', () => {
    expect(() => decodeCursor('not-a-real-cursor', parseOrdering)).toThrow(/Invalid cursor/)
  })
})
