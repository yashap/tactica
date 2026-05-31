import { CorrelationIdPropagator } from '@tactica/correlation-id-propagator'
import winston from 'winston'

export enum LogLevel {
  Off = 'off',
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Http = 'http',
  Debug = 'debug',
  Trace = 'trace',
}

const levels: Record<LogLevel, number> = {
  [LogLevel.Off]: 0,
  [LogLevel.Error]: 1,
  [LogLevel.Warn]: 2,
  [LogLevel.Info]: 3,
  [LogLevel.Http]: 4,
  [LogLevel.Debug]: 5,
  [LogLevel.Trace]: 6,
}

const colors: Record<LogLevel, string> = {
  [LogLevel.Off]: 'gray',
  [LogLevel.Error]: 'red',
  [LogLevel.Warn]: 'yellow',
  [LogLevel.Info]: 'green',
  [LogLevel.Http]: 'magenta',
  [LogLevel.Debug]: 'cyan',
  [LogLevel.Trace]: 'blue',
}

const AnsiYellow = '[33m'
const AnsiCyan = '[36m'

const isLogLevel = (value: string): value is LogLevel => Object.values(LogLevel).includes(value as LogLevel)

const HTTP_SUMMARY_KEYS = ['method', 'url', 'statusCode', 'durationMs', 'remoteAddress', 'userAgent'] as const

const formatDuration = (durationMs: number): string =>
  durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${Math.round(durationMs)}ms`

const formatHttpOrFallback = (
  message: unknown,
  metadata: Record<string, unknown>,
): { displayMessage: string; displayMetadata: Record<string, unknown> } => {
  const method = metadata['method']
  const url = metadata['url']
  const statusCode = metadata['statusCode']
  const isHttp = typeof method === 'string' && typeof url === 'string' && typeof statusCode === 'number'
  if (!isHttp) {
    return { displayMessage: String(message), displayMetadata: metadata }
  }
  const durationMs = metadata['durationMs']
  const durationPart = typeof durationMs === 'number' ? ` ${formatDuration(durationMs)}` : ''
  const displayMessage = `${method} ${url} ${statusCode}${durationPart}`
  const displayMetadata: Record<string, unknown> = { ...metadata }
  for (const key of HTTP_SUMMARY_KEYS) delete displayMetadata[key]
  return { displayMessage, displayMetadata }
}

const getLevel = (): LogLevel => {
  const raw = (process.env['LOG_LEVEL'] ?? LogLevel.Info).toLowerCase()
  return isLogLevel(raw) ? raw : LogLevel.Info
}

const getFormat = (): winston.Logform.Format => {
  if ((process.env['JSON_LOGS'] ?? '').toLowerCase() === 'true') {
    return winston.format.combine(winston.format.timestamp(), winston.format.json())
  }
  return winston.format.combine(
    winston.format.colorize({ colors }),
    winston.format.timestamp({ format: 'hh:mm:ss' }),
    winston.format.align(),
    winston.format.printf((log) => {
      const { timestamp, level, name, message, error, ...metadata } = log as Record<string, unknown>

      // Special-case HTTP completion logs. The httpLoggingPlugin emits payloads with
      // `method` + `url` + `statusCode` (+ optional `durationMs`, `remoteAddress`, `userAgent`).
      // Render them as a compact access-log line and strip those keys from the metadata blob,
      // so the remaining payload (correlationId, etc.) stays useful instead of getting buried.
      const { displayMessage, displayMetadata } = formatHttpOrFallback(message, metadata)

      const metadataKeys = Object.keys(displayMetadata)
      const metadataString =
        metadataKeys.length > 0 ? ` ${AnsiCyan}${JSON.stringify(displayMetadata)}${AnsiYellow}` : ''
      const errorString = error ? `\n  ${(error as Error).stack ?? String(error)}` : ''
      const namePart = name ? ` [${String(name)}]` : ''
      return `${String(timestamp)} ${String(level)}${namePart}: ${displayMessage}${metadataString}${errorString}`
    }),
  )
}

export interface Payload {
  error?: unknown
  [key: string]: unknown
}

export class Logger {
  private readonly underlyingLogger: winston.Logger
  private readonly enabledLevelValue: number

  constructor(
    private readonly name: string,
    private readonly defaultMetadata?: Payload,
  ) {
    const level = getLevel()
    this.underlyingLogger = winston.createLogger({
      levels,
      level,
      format: getFormat(),
      defaultMeta: defaultMetadata,
      transports: [new winston.transports.Console()],
    })
    this.enabledLevelValue = levels[level]
  }

  public error(message: string, payload?: Payload): void {
    this.log(LogLevel.Error, message, payload)
  }

  public warn(message: string, payload?: Payload): void {
    this.log(LogLevel.Warn, message, payload)
  }

  public info(message: string, payload?: Payload): void {
    this.log(LogLevel.Info, message, payload)
  }

  public http(message: string, payload?: Payload): void {
    this.log(LogLevel.Http, message, payload)
  }

  public debug(message: string, payload?: Payload): void {
    this.log(LogLevel.Debug, message, payload)
  }

  public trace(message: string, payload?: Payload): void {
    this.log(LogLevel.Trace, message, payload)
  }

  /**
   * Create a child logger that inherits this logger's default metadata, optionally overriding/adding fields.
   */
  public child(name: string, defaultMetadataOverrides?: Payload): Logger {
    return new Logger(name, { ...this.defaultMetadata, ...defaultMetadataOverrides })
  }

  /**
   * Check whether a level is enabled. Useful when building the payload is expensive.
   */
  public isLevelEnabled(level: LogLevel): boolean {
    return levels[level] <= this.enabledLevelValue
  }

  private log(level: LogLevel, message: string, payload?: Payload): void {
    const { error, ...metadata } = payload ?? {}
    const errorMetadata = error && error instanceof Error ? (error as { metadata?: unknown }).metadata : undefined
    const correlationId = CorrelationIdPropagator.getContext()
    this.underlyingLogger.log({
      level,
      message,
      name: this.name,
      ...(correlationId ? { correlationId } : {}),
      ...this.defaultMetadata,
      ...metadata,
      ...(error === undefined ? {} : { error, ...(errorMetadata ? { errorMetadata } : {}) }),
    })
  }
}

let defaultLogger: Logger | undefined

export const getLogger = (): Logger => {
  if (!defaultLogger) {
    defaultLogger = new Logger('app')
  }
  return defaultLogger
}

export const setLogger = (logger: Logger): void => {
  defaultLogger = logger
}
