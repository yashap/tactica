import { BaseError } from './BaseError.js'

export interface ServerErrorDto<T = unknown> {
  message: string
  code: string
  metadata?: T
}

export interface ErrorOptions<T = unknown> {
  cause?: unknown
  internalMessage?: string
  metadata?: T
}

export interface WrapErrorOptions<T = unknown> extends Omit<ErrorOptions<T>, 'cause'> {
  message?: string
}

export abstract class ServerError<T = unknown> extends BaseError {
  public readonly isTacticaServerError: true = true as const
  public readonly code: string
  public readonly internalMessage?: string
  public readonly metadata?: T

  constructor(
    public readonly httpStatusCode: number,
    message: string,
    options: ErrorOptions<T> = {},
  ) {
    super(message, options.cause)
    const { internalMessage, metadata } = options
    this.code = this.constructor.name
    this.internalMessage = internalMessage
    this.metadata = metadata
  }

  public toDto(): ServerErrorDto<T> {
    return {
      message: this.message,
      code: this.code,
      ...(this.metadata ? { metadata: this.metadata } : {}),
    }
  }

  public static isServerErrorDto(error: unknown): error is ServerErrorDto {
    if (!error || typeof error !== 'object') return false
    const candidate = error as Partial<ServerErrorDto>
    return typeof candidate.message === 'string' && typeof candidate.code === 'string'
  }

  protected static buildOptionsForWrappedError<A = unknown>(
    error: Error,
    options: WrapErrorOptions<A> = {},
  ): { message: string; options: ErrorOptions<A> } {
    const maybeServerError = error as Partial<ServerError>
    const defaultOptions: ErrorOptions<A> = {
      internalMessage: maybeServerError.internalMessage,
      cause: maybeServerError.cause,
    }
    const { message, ...optionOverrides } = options
    return { message: message ?? error.message, options: { ...defaultOptions, ...optionOverrides } }
  }
}
