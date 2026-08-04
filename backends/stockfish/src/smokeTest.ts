import { getLogger } from '@tactica/logging'
import { type EvaluateResponse } from '@tactica/stockfish-contract'
import assert from 'node:assert/strict'

const log = getLogger()

/**
 * End-to-end check against a *running* service (normally the Docker container, started by
 * `tools/scripts/stockfish_smoke_test.sh`). This is what proves the real engine is wired up
 * correctly — the Vitest suite only covers the pure parsing layer.
 */

const baseUrl = process.env['STOCKFISH_URL'] ?? 'http://localhost:3503'

/**
 * Back-rank mate: white plays Ra8#. Chosen because the answer is forced and found instantly, so the
 * assertions hold at any search depth and the test can't flake on a slow machine.
 */
const MATE_IN_ONE_FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'

const evaluate = async (body: unknown): Promise<{ status: number; json: unknown }> => {
  const response = await fetch(`${baseUrl}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, json: await response.json() }
}

const checkHealth = async (): Promise<void> => {
  const response = await fetch(`${baseUrl}/health`)
  assert.equal(response.status, 200, 'GET /health should return 200')
  assert.deepEqual(await response.json(), { status: 'ok', engineRunning: true })
  log.info('✓ /health reports a running engine')
}

const checkFindsForcedMate = async (): Promise<void> => {
  const { status, json } = await evaluate({ fen: MATE_IN_ONE_FEN, movetimeMs: 200 })
  assert.equal(status, 200, `POST /evaluate should return 200, got ${status}: ${JSON.stringify(json)}`)
  const result = json as EvaluateResponse
  assert.equal(result.bestMoveUci, 'a1a8', 'engine should find the back-rank mate Ra8#')
  const [best] = result.lines
  assert.ok(best !== undefined, 'expected at least one engine line')
  assert.equal(best.mate, 1, `expected a mate-in-1 score, got ${JSON.stringify(best)}`)
  assert.equal(best.pvUci[0], 'a1a8', 'the top line should start with the mating move')
  assert.equal(best.multipv, 1)
  log.info('✓ /evaluate finds the forced mate', { bestMoveUci: result.bestMoveUci, mate: best.mate })
}

const checkMultiPv = async (): Promise<void> => {
  const { status, json } = await evaluate({ fen: MATE_IN_ONE_FEN, movetimeMs: 300, multiPv: 3 })
  assert.equal(status, 200, `POST /evaluate with multiPv should return 200, got ${status}`)
  const result = json as EvaluateResponse
  assert.ok(result.lines.length >= 2, `expected multiple lines, got ${result.lines.length}`)
  assert.deepEqual(
    result.lines.map((line) => line.multipv),
    result.lines.map((_line, index) => index + 1),
    'lines should be ranked 1..N in order',
  )
  for (const line of result.lines) {
    assert.ok(line.pvUci.length > 0, 'every line should have at least one move')
    assert.ok(line.cp !== undefined || line.mate !== undefined, 'every line should carry a score')
  }
  // Rank 1 is still the mate; the alternatives are worse
  assert.equal(result.lines[0]?.mate, 1)
  log.info('✓ /evaluate honours multiPv', { lines: result.lines.length })
}

const checkTerminalPosition = async (): Promise<void> => {
  // Black is already checkmated here, so the engine has no move to make
  const { status, json } = await evaluate({ fen: 'R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', movetimeMs: 100 })
  assert.equal(status, 200, `terminal positions should still return 200, got ${status}`)
  assert.equal((json as EvaluateResponse).bestMoveUci, null, 'a mated position should report no best move')
  log.info('✓ /evaluate reports no best move for a terminal position')
}

const checkRejectsBadInput = async (): Promise<void> => {
  const invalidFen = await evaluate({ fen: 'not-a-fen' })
  assert.equal(invalidFen.status, 400, 'an invalid FEN should be rejected')
  assert.equal((invalidFen.json as { code: string }).code, 'InputValidationError')

  // The security-relevant case: a newline would otherwise smuggle in extra UCI commands
  const injection = await evaluate({ fen: `${MATE_IN_ONE_FEN}\nquit` })
  assert.equal(injection.status, 400, 'a FEN containing a newline should be rejected')

  const outOfRange = await evaluate({ fen: MATE_IN_ONE_FEN, multiPv: 99 })
  assert.equal(outOfRange.status, 400, 'an out-of-range multiPv should be rejected')

  const notFound = await fetch(`${baseUrl}/nope`)
  assert.equal(notFound.status, 404)
  log.info('✓ invalid requests are rejected')
}

const checkStillHealthyAfterInjectionAttempt = async (): Promise<void> => {
  // Proves the rejected `\nquit` never reached the engine
  const { status, json } = await evaluate({ fen: MATE_IN_ONE_FEN, movetimeMs: 100 })
  assert.equal(status, 200, 'engine should still be alive after a rejected injection attempt')
  assert.equal((json as EvaluateResponse).bestMoveUci, 'a1a8')
  log.info('✓ engine still healthy after the rejected injection attempt')
}

const run = async (): Promise<void> => {
  log.info('running stockfish smoke test', { baseUrl })
  await checkHealth()
  await checkFindsForcedMate()
  await checkMultiPv()
  await checkTerminalPosition()
  await checkRejectsBadInput()
  await checkStillHealthyAfterInjectionAttempt()
  log.info('stockfish smoke test passed')
}

run().catch((error: unknown) => {
  log.error('stockfish smoke test FAILED', { err: (error as Error).message })
  process.exit(1)
})
