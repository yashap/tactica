import { describe, expect, it } from 'vitest'
import { InputValidationError, NotFoundError, ServerError, buildServerErrorFromDto } from '../index.js'

describe('ServerError', () => {
  it('exposes the constructor name as the error code', () => {
    const err = new InputValidationError('bad input')
    expect(err.code).toBe('InputValidationError')
    expect(err.httpStatusCode).toBe(400)
    expect(err.message).toBe('bad input')
  })

  it('serializes to a DTO without internal-only fields', () => {
    const err = new NotFoundError('nope', { internalMessage: 'secret', metadata: { id: 'abc' } })
    expect(err.toDto()).toEqual({ message: 'nope', code: 'NotFoundError', metadata: { id: 'abc' } })
  })

  it('round-trips through buildServerErrorFromDto', () => {
    const original = new InputValidationError('bad input')
    const rebuilt = buildServerErrorFromDto(original.toDto(), 400)
    expect(rebuilt).toBeInstanceOf(InputValidationError)
    expect(rebuilt.message).toBe('bad input')
  })

  it('detects ServerError DTOs', () => {
    expect(ServerError.isServerErrorDto({ message: 'x', code: 'y' })).toBe(true)
    expect(ServerError.isServerErrorDto({ foo: 'bar' })).toBe(false)
    expect(ServerError.isServerErrorDto(null)).toBe(false)
  })
})
