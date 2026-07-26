import { startChessComFixtureServer } from './chesscomFixtureServer.js'

/**
 * Starts the chess.com fixture server for the duration of the test run. Harmless when unused
 * (i.e. when the backend wasn't started with CHESSCOM_API_URL pointing at it).
 */
const globalSetup = async (): Promise<() => Promise<void>> => {
  const server = await startChessComFixtureServer()
  return async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  }
}

export default globalSetup
