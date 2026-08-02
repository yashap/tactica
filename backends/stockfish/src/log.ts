type Level = 'info' | 'warn' | 'error'

/**
 * Minimal structured logger. Writes straight to stdout rather than using `console.*` (which the
 * shared eslint config restricts) or `@tactica/logging` (a workspace dependency we deliberately
 * avoid so the container needs no npm install).
 */
const write = (level: Level, message: string, fields?: Record<string, unknown>): void => {
  const entry = { level, message, time: new Date().toISOString(), ...fields }
  process.stdout.write(`${JSON.stringify(entry)}\n`)
}

export const log = {
  info: (message: string, fields?: Record<string, unknown>): void => write('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>): void => write('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>): void => write('error', message, fields),
}
