/**
 * Vitest environment setup. These tests build real Fastify apps, which log request completions and
 * handled errors — silence them so a passing run stays readable.
 */
process.env['LOG_LEVEL'] = process.env['LOG_LEVEL'] ?? 'off'
