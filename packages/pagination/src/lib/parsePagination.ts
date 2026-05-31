import { InputValidationError } from '@tactica/errors'
import { DEFAULT_LIMIT, DEFAULT_ORDER_BY, DEFAULT_ORDER_DIRECTION } from './constants.js'
import { type Cursor, decodeCursor, type Pagination, type ParseOrdering } from './Cursor.js'
import { type PaginationRequestDto } from './paginationDto.js'

export const parsePagination = <K extends string, V>(
  dto: PaginationRequestDto,
  parseOrdering: ParseOrdering<K, V>,
): Pagination<K> | Cursor<K, V> => {
  const { limit = DEFAULT_LIMIT, orderBy = DEFAULT_ORDER_BY, orderDirection = DEFAULT_ORDER_DIRECTION, cursor } = dto

  if (cursor) {
    if (dto.limit || dto.orderBy || dto.orderDirection) {
      throw new InputValidationError(
        'When providing a cursor, you cannot provide the limit, orderBy or orderDirection params. Those params are ' +
          'only for getting the first page.',
      )
    }
    return decodeCursor<K, V>(cursor, parseOrdering)
  }

  return {
    limit,
    orderBy: orderBy as K,
    orderDirection,
  }
}
