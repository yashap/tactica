import { InputValidationError } from '@tactica/errors'
import { Base64 } from 'js-base64'
import { z } from 'zod'
import { DEFAULT_MAX_LIMIT } from './constants.js'
import { type OrderDirection, OrderDirectionSchema } from './orderDirection.js'

const CursorSchema = z.object({
  limit: z.number().min(1).max(DEFAULT_MAX_LIMIT).describe('Number of items to fetch'),
  orderBy: z.string().describe('Field to order by'),
  orderDirection: OrderDirectionSchema.describe('Order direction'),
  lastOrderValueSeen: z.unknown().describe('Last order value seen'),
  lastIdSeen: z.string().describe('Last id seen'),
})

export interface Pagination<K extends string> {
  limit: number
  orderBy: K
  orderDirection: OrderDirection
}

export interface Cursor<K extends string, V> extends Pagination<K> {
  lastOrderValueSeen: V
  lastIdSeen: string
}

export type ParseOrdering<K extends string, V> = (ordering: { orderBy: unknown; lastOrderValueSeen: unknown }) => {
  orderBy: K
  lastOrderValueSeen: V
}

const parseCursor = <K extends string, V>(cursor: unknown, parseOrdering: ParseOrdering<K, V>): Cursor<K, V> => {
  const { orderBy, lastOrderValueSeen, ...parsedCursor } = CursorSchema.parse(cursor)
  return {
    ...parsedCursor,
    ...parseOrdering({ orderBy, lastOrderValueSeen }),
  }
}

export const encodeCursor = <K extends string, V>(cursor: Cursor<K, V>): string => Base64.encode(JSON.stringify(cursor))

export const decodeCursor = <K extends string, V>(cursor: string, parseOrdering: ParseOrdering<K, V>): Cursor<K, V> => {
  try {
    const cursorObject: unknown = JSON.parse(Base64.decode(cursor))
    return parseCursor(cursorObject, parseOrdering)
  } catch (error) {
    throw new InputValidationError('Invalid cursor', { cause: error })
  }
}
