import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { db, sql } from './db/client.js'
import { analysisTable } from './db/schema.js'
import { AnalysisRepository } from './domain/AnalysisRepository.js'
import { type RunAnalysisPayload } from './jobs/jobQueue.js'

const KEY = 'test-internal-key'
const PGN = '1. e4 e5 2. Nf3 Nc6 1/2-1/2'
const auth = { 'x-internal-api-key': KEY }

/** Records what got queued; can be told to fail, to exercise the enqueue-error path. */
class FakeJobQueue {
  public enqueued: RunAnalysisPayload[] = []
  public failNext = false

  public enqueueRunAnalysis(payload: RunAnalysisPayload): Promise<string | null> {
    if (this.failNext) {
      this.failNext = false
      return Promise.reject(new Error('pg-boss unavailable'))
    }
    this.enqueued.push(payload)
    return Promise.resolve(crypto.randomUUID())
  }
}

describe('tactica-analysis HTTP API (integration)', () => {
  const analysisRepository = new AnalysisRepository(db)
  let jobQueue: FakeJobQueue
  let app: FastifyInstance

  beforeEach(async () => {
    await db.delete(analysisTable)
    jobQueue = new FakeJobQueue()
    app = await buildApp({ analysisRepository, jobQueue, internalApiKey: KEY })
  })

  afterEach(async () => {
    await app.close()
  })

  afterAll(async () => {
    await sql.end()
  })

  const submit = (body: object, headers: Record<string, string> = auth, url = '/tactica-analysis/analyses') =>
    app.inject({ method: 'POST', url, headers, payload: body })

  describe('internal key gate', () => {
    it('serves /health without a key', async () => {
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200)
    })

    it('rejects a submission without a key', async () => {
      const response = await submit({ pgn: PGN, playerColor: 'white' }, {})
      expect(response.statusCode).toBe(401)
    })

    // Regression: these were routed to the handler but slipped past a raw-URL prefix check
    it.each(['/%74actica-analysis/analyses', '/tactica%2Danalysis/analyses'])(
      'rejects a percent-encoded path (%s) without a key',
      async (url) => {
        const response = await submit({ pgn: PGN, playerColor: 'white' }, {}, url)
        expect(response.statusCode).toBe(401)
        expect(jobQueue.enqueued).toHaveLength(0)
        expect(await db.select().from(analysisTable)).toHaveLength(0)
      },
    )

    it('rejects a percent-encoded read without a key', async () => {
      const created = (await submit({ pgn: PGN, playerColor: 'white' })).json<{ id: string }>()
      const response = await app.inject({ method: 'GET', url: `/%74actica-analysis/analyses/${created.id}` })
      expect(response.statusCode).toBe(401)
    })
  })

  describe('POST /analyses', () => {
    it('queues a new analysis, carrying the request correlation id to the job', async () => {
      const response = await submit({ pgn: PGN, playerColor: 'white' }, { ...auth, 'x-correlation-id': 'trace-1' })
      expect(response.statusCode).toBe(201)
      expect(response.json()).toMatchObject({ status: 'queued' })
      expect(jobQueue.enqueued).toEqual([{ analysisId: response.json<{ id: string }>().id, correlationId: 'trace-1' }])
    })

    it('rejects an unparseable PGN with a 400 instead of queuing it', async () => {
      const response = await submit({ pgn: '1. e4 e5 2. Ke3 Ke6 3. Qxh7', playerColor: 'white' })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'InputValidationError' })
      expect(jobQueue.enqueued).toHaveLength(0)
    })

    it('returns the same analysis for a repeated idempotency key, without queuing it twice', async () => {
      const first = await submit({ pgn: PGN, playerColor: 'white', idempotencyKey: 'game-1' })
      const second = await submit({ pgn: PGN, playerColor: 'white', idempotencyKey: 'game-1' })
      expect(second.json<{ id: string }>().id).toBe(first.json<{ id: string }>().id)
      expect(jobQueue.enqueued).toHaveLength(1)
    })

    it('re-queues a finally-failed analysis when it is resubmitted', async () => {
      const first = (await submit({ pgn: PGN, playerColor: 'white', idempotencyKey: 'game-1' })).json<{ id: string }>()
      await analysisRepository.markFailed(first.id, 'gave up')

      const resubmitted = await submit({ pgn: PGN, playerColor: 'white', idempotencyKey: 'game-1' })
      expect(resubmitted.json()).toMatchObject({ id: first.id, status: 'queued', error: null })
      expect(jobQueue.enqueued).toHaveLength(2)
    })

    it('marks the analysis failed when it cannot be queued, so nothing waits on a job that never ran', async () => {
      jobQueue.failNext = true
      const response = await submit({ pgn: PGN, playerColor: 'white', idempotencyKey: 'game-1' })
      expect(response.statusCode).toBe(500)

      const [row] = await db.select().from(analysisTable)
      expect(row?.status).toBe('failed')
      expect(row?.error).toContain('Could not queue analysis')

      // ...and the caller's retry with the same key recovers it
      const retried = await submit({ pgn: PGN, playerColor: 'white', idempotencyKey: 'game-1' })
      expect(retried.json()).toMatchObject({ id: row?.id, status: 'queued' })
    })
  })
})
