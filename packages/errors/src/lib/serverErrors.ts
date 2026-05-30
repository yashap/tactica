import { type ErrorOptions, ServerError, type ServerErrorDto, type WrapErrorOptions } from './ServerError.js'

/**
 * 4xx errors
 */

export class InputValidationError<T = unknown> extends ServerError<T> {
  constructor(message: string, options: ErrorOptions<T> = {}) {
    super(400, message, options)
  }

  public static wrap<A = unknown>(error: Error, optionOverrides: WrapErrorOptions<A> = {}): InputValidationError<A> {
    const { message, options } = this.buildOptionsForWrappedError(error, optionOverrides)
    return new InputValidationError(message, options)
  }
}

export class UnauthorizedError<T = unknown> extends ServerError<T> {
  constructor(message: string, options: ErrorOptions<T> = {}) {
    super(401, message, options)
  }

  public static wrap<A = unknown>(error: Error, optionOverrides: WrapErrorOptions<A> = {}): UnauthorizedError<A> {
    const { message, options } = this.buildOptionsForWrappedError(error, optionOverrides)
    return new UnauthorizedError(message, options)
  }
}

export class ForbiddenError<T = unknown> extends ServerError<T> {
  constructor(message: string, options: ErrorOptions<T> = {}) {
    super(403, message, options)
  }

  public static wrap<A = unknown>(error: Error, optionOverrides: WrapErrorOptions<A> = {}): ForbiddenError<A> {
    const { message, options } = this.buildOptionsForWrappedError(error, optionOverrides)
    return new ForbiddenError(message, options)
  }
}

export class NotFoundError<T = unknown> extends ServerError<T> {
  constructor(message: string, options: ErrorOptions<T> = {}) {
    super(404, message, options)
  }

  public static wrap<A = unknown>(error: Error, optionOverrides: WrapErrorOptions<A> = {}): NotFoundError<A> {
    const { message, options } = this.buildOptionsForWrappedError(error, optionOverrides)
    return new NotFoundError(message, options)
  }
}

export class EndpointNotFoundError<T = unknown> extends ServerError<T> {
  constructor(message: string, options: ErrorOptions<T> = {}) {
    super(404, message, options)
  }

  public static wrap<A = unknown>(error: Error, optionOverrides: WrapErrorOptions<A> = {}): EndpointNotFoundError<A> {
    const { message, options } = this.buildOptionsForWrappedError(error, optionOverrides)
    return new EndpointNotFoundError(message, options)
  }
}

/**
 * 5xx errors
 */

export class InternalServerError<T = unknown> extends ServerError<T> {
  constructor(message: string, options: ErrorOptions<T> = {}) {
    super(500, message, options)
  }

  public static wrap<A = unknown>(error: Error, optionOverrides: WrapErrorOptions<A> = {}): InternalServerError<A> {
    const { message, options } = this.buildOptionsForWrappedError(error, optionOverrides)
    return new InternalServerError(message, options)
  }
}

export class ResponseValidationError<T = unknown> extends ServerError<T> {
  constructor(message: string, options: ErrorOptions<T> = {}) {
    super(500, message, options)
  }

  public static wrap<A = unknown>(error: Error, optionOverrides: WrapErrorOptions<A> = {}): ResponseValidationError<A> {
    const { message, options } = this.buildOptionsForWrappedError(error, optionOverrides)
    return new ResponseValidationError(message, options)
  }
}

export class UnknownError<T = unknown> extends ServerError<T> {
  constructor(message: string, httpStatusCode = 500, options: ErrorOptions<T> = {}) {
    super(httpStatusCode, message, options)
  }

  public static wrap<A = unknown>(
    error: Error,
    httpStatusCode = 500,
    optionOverrides: WrapErrorOptions<A> = {},
  ): UnknownError<A> {
    const { message, options } = this.buildOptionsForWrappedError(error, optionOverrides)
    return new UnknownError(message, httpStatusCode, options)
  }
}

const isEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return true
  if (typeof value === 'string' || Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return false
}

export const buildServerErrorFromDto = (dto: unknown, statusCode: number): ServerError => {
  if (isEmpty(dto) && statusCode === 404) {
    return new EndpointNotFoundError('Endpoint not found')
  }
  if (ServerError.isServerErrorDto(dto)) {
    const typedDto = dto as ServerErrorDto
    const options = { cause: typedDto as unknown as Error, metadata: typedDto.metadata }
    if (statusCode === 400 && typedDto.code === InputValidationError.name) {
      return new InputValidationError(typedDto.message, options)
    } else if (statusCode === 401 && typedDto.code === UnauthorizedError.name) {
      return new UnauthorizedError(typedDto.message, options)
    } else if (statusCode === 403 && typedDto.code === ForbiddenError.name) {
      return new ForbiddenError(typedDto.message, options)
    } else if (statusCode === 404 && typedDto.code === NotFoundError.name) {
      return new NotFoundError(typedDto.message, options)
    } else if (statusCode === 404 && typedDto.code === EndpointNotFoundError.name) {
      return new EndpointNotFoundError(typedDto.message, options)
    } else if (statusCode === 500 && typedDto.code === InternalServerError.name) {
      return new InternalServerError(typedDto.message, options)
    } else if (statusCode === 500 && typedDto.code === ResponseValidationError.name) {
      return new ResponseValidationError(typedDto.message, options)
    } else if (typedDto.code === UnknownError.name) {
      return new UnknownError(typedDto.message, statusCode, options)
    }
  }
  return new UnknownError('Unexpected response from server', statusCode, {
    cause: dto as unknown as Error,
    metadata: { response: { body: dto } },
  })
}
