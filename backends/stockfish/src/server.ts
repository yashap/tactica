import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { config } from './config.js'
import { parseEvaluateRequest, RequestValidationError } from './evaluateRequest.js'
import { log } from './log.js'
import { EngineTimeoutError, type UciEngine } from './UciEngine.js'

/** Error body shape matches the rest of the stack's `{ message, code }` so clients can branch on code. */
interface ErrorBody {
  message: string
  code: string
}

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

const sendError = (res: ServerResponse, status: number, body: ErrorBody): void => sendJson(res, status, body)

/** Read a JSON body, refusing anything over the configured cap rather than buffering it all. */
const readJsonBody = async (req: IncomingMessage, maxBytes: number): Promise<unknown> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > maxBytes) throw new RequestValidationError(`Request body exceeds ${maxBytes} bytes`)
    chunks.push(buffer)
  }
  if (size === 0) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
  } catch {
    throw new RequestValidationError('Request body is not valid JSON')
  }
}

const handleEvaluate = async (req: IncomingMessage, res: ServerResponse, engine: UciEngine): Promise<void> => {
  const body = await readJsonBody(req, config.evaluateLimits.maxRequestBytes)
  const request = parseEvaluateRequest(body, {
    defaults: config.evaluateDefaults,
    limits: config.evaluateLimits,
  })
  const startedAt = Date.now()
  const result = await engine.evaluate(request)
  log.info('evaluated position', {
    movetimeMs: request.movetimeMs,
    multiPv: request.multiPv,
    elapsedMs: Date.now() - startedAt,
    bestMoveUci: result.bestMoveUci,
    lines: result.lines.length,
  })
  sendJson(res, 200, result)
}

const handle = async (req: IncomingMessage, res: ServerResponse, engine: UciEngine): Promise<void> => {
  // Query strings are irrelevant here, but a bare `req.url` compare would miss `/health?x=1`
  const path = new URL(req.url ?? '/', 'http://localhost').pathname

  if (req.method === 'GET' && path === '/health') {
    sendJson(res, 200, { status: 'ok', engineRunning: engine.isRunning })
    return
  }
  if (req.method === 'POST' && path === '/evaluate') {
    await handleEvaluate(req, res, engine)
    return
  }
  sendError(res, 404, { message: `Cannot ${req.method ?? 'GET'} ${path}`, code: 'EndpointNotFoundError' })
}

export const buildServer = (engine: UciEngine): Server =>
  createServer((req, res) => {
    void handle(req, res, engine).catch((error: unknown) => {
      if (error instanceof RequestValidationError) {
        sendError(res, 400, { message: error.message, code: 'InputValidationError' })
        return
      }
      if (error instanceof EngineTimeoutError) {
        log.error('engine timed out serving a request', { err: error.message })
        sendError(res, 504, { message: error.message, code: 'EngineTimeoutError' })
        return
      }
      log.error('request failed', { err: (error as Error).message, stack: (error as Error).stack })
      sendError(res, 500, { message: (error as Error).message, code: 'EngineError' })
    })
  })
