import { Temporal } from '@js-temporal/polyfill'
import { IllegalInputError } from '@tactica/errors'

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
 * Pick a set of fields off `obj` and serialise each `Temporal.Instant` to an ISO 8601 string.
 * Throws via `ErrorConstructor` if any field is missing or isn't an Instant.
 */
export const formatInstantFields = <T extends Record<string, unknown>, F extends keyof T>(
  obj: T,
  fieldNames: F[],
  ErrorConstructor: new (message: string) => Error = IllegalInputError,
): Record<F, string> => {
  const fields = pick(obj, fieldNames)
  const entries = Object.entries(fields)
  if (entries.length !== fieldNames.length) {
    const actualFieldNames = new Set(entries.map(([key]) => key))
    const missing = fieldNames.filter((fieldName) => !actualFieldNames.has(fieldName as string))
    throw new ErrorConstructor(`Missing field names: ${missing.join(', ')}`)
  }
  return Object.fromEntries(
    entries.map(([key, value]) => {
      if (value instanceof Temporal.Instant) {
        return [key, value.toString()]
      }
      throw new ErrorConstructor(`${key} was not an Instant`)
    }),
  ) as Record<F, string>
}
