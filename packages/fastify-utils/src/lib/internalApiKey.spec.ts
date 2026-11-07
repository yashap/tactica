import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { FastifyAppBuilder } from './FastifyAppBuilder.js'
import { buildRequireInternalApiKey, INTERNAL_API_KEY_HEADER } from './internalApiKey.js'

describe('buildRequireInternalApiKey', () => {
  let app: FastifyInstance | undefined

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  /** The pattern internal services use: open health route, gated routes in an encapsulated plugin. */
  const buildApp = async (): Promise<FastifyInstance> => {
    app = await FastifyAppBuilder.build({
      kind: 'internal',
      registerRoutes: async (instance) => {
        instance.get('/health', async () => ({ status: 'ok' }))
        await instance.register(async (gated) => {
          gated.addHook('preHandler', buildRequireInternalApiKey('the-key'))
          gated.get('/internal/things/:id', async () => ({ secret: true }))
          gated.post('/internal/things', async () => ({ created: true }))
        })
      },
    })
    return app
  }

  it('lets requests with the right key through', async () => {
    const instance = await buildApp()
    const response = await instance.inject({
      method: 'GET',
      url: '/internal/things/1',
      headers: { [INTERNAL_API_KEY_HEADER]: 'the-key' },
    })
    expect(response.statusCode).toBe(200)
  })

  it.each([
    ['no key', {}],
    ['a wrong key', { [INTERNAL_API_KEY_HEADER]: 'nope' }],
    ['a key that only shares a prefix', { [INTERNAL_API_KEY_HEADER]: 'the-key-plus' }],
  ])('rejects requests with %s', async (_label, headers) => {
    const instance = await buildApp()
    const response = await instance.inject({ method: 'GET', url: '/internal/things/1', headers })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'UnauthorizedError' })
  })

  // Regression: the gate used to string-match the raw URL, which is still percent-encoded, while the
  // router matches the decoded path — so these reached the handler without a key.
  it.each(['/%69nternal/things/1', '/internal%2Fthings/1', '/INTERNAL/things/1', '/internal/things/1?x=1'])(
    'cannot be bypassed via %s',
    async (url) => {
      const instance = await buildApp()
      const response = await instance.inject({ method: 'GET', url })
      expect(response.statusCode).not.toBe(200)
    },
  )

  it('cannot be bypassed on writes either', async () => {
    const instance = await buildApp()
    const response = await instance.inject({ method: 'POST', url: '/%69nternal/things', payload: {} })
    expect(response.statusCode).toBe(401)
  })

  it('leaves routes outside the gated plugin open', async () => {
    const instance = await buildApp()
    const response = await instance.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
  })
})
