import winston from 'winston'

export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'debug' | 'off'

export interface LoggerOptions {
  level?: LogLevel
  json?: boolean
  defaultMeta?: Record<string, unknown>
}

const buildWinstonLogger = (options: LoggerOptions): winston.Logger => {
  const level = options.level ?? (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'info'
  const useJson = options.json ?? process.env['JSON_LOGS'] === 'true'
  const silent = level === 'off'

  return winston.createLogger({
    level: silent ? 'error' : level,
    silent,
    defaultMeta: options.defaultMeta,
    format: useJson
      ? winston.format.combine(winston.format.timestamp(), winston.format.json())
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level: logLevel, message, ...meta }) => {
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
            return `${String(timestamp)} ${String(logLevel)}: ${String(message)}${metaStr}`
          }),
        ),
    transports: [new winston.transports.Console()],
  })
}

export class Logger {
  private readonly winston: winston.Logger

  constructor(options: LoggerOptions = {}) {
    this.winston = buildWinstonLogger(options)
  }

  public error(message: string, meta?: Record<string, unknown>): void {
    this.winston.error(message, meta)
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    this.winston.warn(message, meta)
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    this.winston.info(message, meta)
  }

  public http(message: string, meta?: Record<string, unknown>): void {
    this.winston.http(message, meta)
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    this.winston.debug(message, meta)
  }
}

let defaultLogger: Logger | undefined

export const getLogger = (): Logger => {
  if (!defaultLogger) {
    defaultLogger = new Logger()
  }
  return defaultLogger
}

export const setLogger = (logger: Logger): void => {
  defaultLogger = logger
}
