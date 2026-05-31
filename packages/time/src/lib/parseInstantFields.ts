import { Temporal } from '@js-temporal/polyfill'
import { InputValidationError } from '@tactica/errors'

const pick = <T extends Record<string, unknown>, F extends keyof T>(obj: T, keys: F[]): Partial<Pick<T, F>> => {
  const result: Partial<Pick<T, F>> = {}
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = obj[key]
    }
  }
  return result
}

/**
 * Pick a set of fields off `obj` and parse each into a `Temporal.Instant`. Accepts either an
 * ISO 8601 string with a time offset, or a `Date`. Throws via `ErrorConstructor` if a field is
 * missing or has an unsupported type.
 */
export const parseInstantFields = <T extends Record<string, unknown>, F extends keyof T>(
  obj: T,
  fieldNames: F[],
  ErrorConstructor: new (message: string) => Error = InputValidationError,
): Record<F, Temporal.Instant> => {
  const fields = pick(obj, fieldNames)
  const entries = Object.entries(fields)
  if (entries.length !== fieldNames.length) {
    const actualFieldNames = new Set(entries.map(([key]) => key))
    const missing = fieldNames.filter((fieldName) => !actualFieldNames.has(fieldName as string))
    throw new ErrorConstructor(`Missing field names: ${missing.join(', ')}`)
  }
  return Object.fromEntries(
    entries.map(([key, value]) => {
      if (typeof value === 'string') {
        try {
          return [key, Temporal.Instant.from(value)]
        } catch {
          throw new ErrorConstructor(`Value of field ${key} must be an ISO 8601 timestamp string with a time offset`)
        }
      }
      if (value instanceof Date) {
        return [key, Temporal.Instant.fromEpochMilliseconds(value.valueOf())]
      }
      throw new ErrorConstructor(
        `Value of field ${key} must be an ISO 8601 timestamp string with a time offset, or a Date`,
      )
    }),
  ) as unknown as Record<F, Temporal.Instant>
}
