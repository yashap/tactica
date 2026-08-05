import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { FastifyAppBuilder } from './FastifyAppBuilder.js'

/**
 * Covers the `internal` kind only. `userFacing` can't be built in-process without calling
 * `SuperTokens.init()` against a reachable core — that path is exercised end-to-end by the Playwright
 * suite, which drives real signup/login through tactica-core.
 *
 * The point of these tests is that `kind` turns off session verification, so a future refactor that
 * silently registered (or skipped) the wrong plugins should fail here.
 */
describe('FastifyAppBuilder — internal', () => {
  let app: FastifyInstance | undefined

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  const buildInternalApp = async (): Promise<FastifyInstance> => {
    app = await FastifyAppBuilder.build({
      kind: 'internal',
      registerRoutes: (instance) => {
        instance.get('/ping', async () => ({ pong: true }))
      },
    })
    return app
  }

  it('serves registered routes', async () => {
    const instance = await buildInternalApp()
    const response = await instance.inject({ method: 'GET', url: '/ping' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ pong: true })
  })

  it('does not register CORS', async () => {
    const instance = await buildInternalApp()
    const response = await instance.inject({
      method: 'GET',
      url: '/ping',
      headers: { origin: 'https://evil.example.com' },
    })
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('does not register SuperTokens auth routes', async () => {
    const instance = await buildInternalApp()
    // SuperTokens owns /auth/* on user-facing services; an internal service must not expose it
    const response = await instance.inject({ method: 'POST', url: '/auth/signin' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ message: 'Endpoint not found', code: 'EndpointNotFoundError' })
  })

  it('uses the shared 404 DTO for unknown paths', async () => {
    const instance = await buildInternalApp()
    const response = await instance.inject({ method: 'GET', url: '/nope' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ message: 'Endpoint not found', code: 'EndpointNotFoundError' })
  })

  it('echoes an inbound correlation id, so a call chain stays followable', async () => {
    const instance = await buildInternalApp()
    const response = await instance.inject({
      method: 'GET',
      url: '/ping',
      headers: { 'x-correlation-id': 'trace-me-123' },
    })
    expect(response.headers['x-correlation-id']).toBe('trace-me-123')
  })

  it('serializes thrown ServerErrors through the shared error handler', async () => {
    const { NotFoundError } = await import('@tactica/errors')
    app = await FastifyAppBuilder.build({
      kind: 'internal',
      registerRoutes: (instance) => {
        instance.get('/boom', async () => {
          throw new NotFoundError('nope')
        })
      },
    })
    const response = await app.inject({ method: 'GET', url: '/boom' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ message: 'nope', code: 'NotFoundError' })
  })
})
