import { getLogger } from '@tactica/logging'
import { type EngineLine, type EvaluateRequest, type EvaluateResponse } from '@tactica/stockfish-contract'
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import { EngineError, EngineTimeoutError } from './errors.js'
import { parseBestMoveLine, parseInfoLine, selectBestLines } from './uci.js'

export interface UciEngineOptions {
  binaryPath: string
  threads: number
  hashMb: number
  handshakeTimeoutMs: number
  searchGraceMs: number
  shutdownTimeoutMs: number
}

/**
 * One long-lived Stockfish process, driven over UCI.
 *
 * The process is started once and kept warm — the UCI handshake and NNUE load cost far more than a
 * short search, so re-spawning per request would dominate the time budget. A single engine can only
 * search one position at a time, so searches are serialized through a promise queue.
 *
 * Failure handling is deliberately lazy: a crashed or hung engine is not immediately restarted,
 * it's just forgotten, and the next request spawns a fresh one. That avoids a restart loop if the
 * binary is broken, while keeping the service available as soon as it can be.
 */
export class UciEngine {
  private child: ChildProcessWithoutNullStreams | undefined
  private reader: Interface | undefined
  /** Receives every engine output line while a command is in flight. */
  private onLine: ((line: string) => void) | undefined
  /** Fails the in-flight command if the process dies underneath it. */
  private onProcessLoss: ((error: EngineError) => void) | undefined
  /** Tracks the engine's current MultiPV so we only re-send `setoption` when it changes. */
  private multiPvSetting: number | undefined
  private queue: Promise<unknown> = Promise.resolve()
  private shuttingDown = false

  public constructor(private readonly options: UciEngineOptions) {}

  public get isRunning(): boolean {
    return this.child !== undefined
  }

  /** Start (and hand-shake with) the engine up front, so the first request isn't slow. */
  public async start(): Promise<void> {
    await this.enqueue(() => this.ensureStarted())
  }

  public async evaluate(request: EvaluateRequest): Promise<EvaluateResponse> {
    return this.enqueue(() => this.runEvaluate(request))
  }

  /** Ask the engine to exit cleanly, escalating to SIGKILL if it doesn't. */
  public async stop(): Promise<void> {
    this.shuttingDown = true
    const child = this.child
    if (child === undefined) return
    this.write('quit')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        getLogger().warn('stockfish did not exit in time, killing it')
        child.kill('SIGKILL')
        resolve()
      }, this.options.shutdownTimeoutMs)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  /**
   * Run `task` after everything already queued. A failed task must not poison the queue, so the
   * chain continues from a swallowed rejection either way.
   */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task)
    this.queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async runEvaluate(request: EvaluateRequest): Promise<EvaluateResponse> {
    await this.ensureStarted()
    if (this.multiPvSetting !== request.multiPv) {
      this.write(`setoption name MultiPV value ${request.multiPv}`)
      this.multiPvSetting = request.multiPv
    }
    // `fen` is validated by the contract's schema; notably it cannot contain a newline, so it can't
    // smuggle in extra UCI commands here.
    this.write(`position fen ${request.fen}`)
    return this.search(request.movetimeMs)
  }

  private async search(movetimeMs: number): Promise<EvaluateResponse> {
    const infoLines: EngineLine[] = []
    const bestMoveUci = await this.command<string | null>({
      command: `go movetime ${movetimeMs}`,
      timeoutMs: movetimeMs + this.options.searchGraceMs,
      timeoutMessage: `Engine search exceeded ${movetimeMs + this.options.searchGraceMs}ms`,
      onLine: (line, resolve) => {
        const info = parseInfoLine(line)
        if (info !== undefined) {
          infoLines.push(info)
          return
        }
        const bestMove = parseBestMoveLine(line)
        if (bestMove !== undefined) resolve(bestMove)
      },
    })
    return { bestMoveUci, lines: selectBestLines(infoLines) }
  }

  private async ensureStarted(): Promise<void> {
    if (this.child !== undefined) return

    const logger = getLogger()
    logger.info('Starting stockfish', { binaryPath: this.options.binaryPath })
    const child = spawn(this.options.binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    this.multiPvSetting = undefined
    this.reader = createInterface({ input: child.stdout })
    this.reader.on('line', (line: string) => this.onLine?.(line))
    child.stderr.on('data', (chunk: Buffer) => {
      const output = chunk.toString().trim()
      if (output.length > 0) logger.warn('stockfish stderr', { output })
    })
    child.on('error', (error: Error) => this.handleProcessLoss(`could not be started (${error.message})`))
    child.on('exit', (code, signal) => this.handleProcessLoss(`exited (code=${code}, signal=${signal})`))

    await this.command<void>({
      command: 'uci',
      timeoutMs: this.options.handshakeTimeoutMs,
      timeoutMessage: 'Engine did not answer the UCI handshake',
      onLine: (line, resolve) => {
        if (line.trim() === 'uciok') resolve(undefined)
      },
    })
    this.write(`setoption name Threads value ${this.options.threads}`)
    this.write(`setoption name Hash value ${this.options.hashMb}`)
    await this.command<void>({
      command: 'isready',
      timeoutMs: this.options.handshakeTimeoutMs,
      timeoutMessage: 'Engine did not become ready',
      onLine: (line, resolve) => {
        if (line.trim() === 'readyok') resolve(undefined)
      },
    })
    logger.info('stockfish ready', { threads: this.options.threads, hashMb: this.options.hashMb })
  }

  /**
   * Send one command and consume engine output until `onLine` resolves. Rejects if the engine dies
   * mid-command, or if it goes quiet for longer than `timeoutMs` — in which case the process is
   * killed, since an engine that missed its deadline is wedged and would block every later request.
   */
  private command<T>(spec: {
    command: string
    timeoutMs: number
    timeoutMessage: string
    onLine: (line: string, resolve: (value: T) => void) => void
  }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const settle = (finish: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.onLine = undefined
        this.onProcessLoss = undefined
        finish()
      }

      const timer = setTimeout(() => {
        settle(() => {
          getLogger().error('stockfish timed out, killing it', { command: spec.command })
          this.child?.kill('SIGKILL')
          reject(new EngineTimeoutError(spec.timeoutMessage))
        })
      }, spec.timeoutMs)

      this.onLine = (line: string) => {
        spec.onLine(line, (value: T) => settle(() => resolve(value)))
      }
      this.onProcessLoss = (error: EngineError) => settle(() => reject(error))

      try {
        this.write(spec.command)
      } catch (error) {
        settle(() => reject(new EngineError(`Failed to send '${spec.command}': ${(error as Error).message}`)))
      }
    })
  }

  private handleProcessLoss(reason: string): void {
    this.child = undefined
    this.reader?.close()
    this.reader = undefined
    this.multiPvSetting = undefined
    const onProcessLoss = this.onProcessLoss
    this.onLine = undefined
    this.onProcessLoss = undefined

    if (this.shuttingDown) {
      getLogger().info('stockfish stopped', { reason })
      return
    }
    getLogger().error('stockfish ended unexpectedly; the next request will start a fresh engine', { reason })
    onProcessLoss?.(new EngineError(`Engine ${reason}`))
  }

  private write(command: string): void {
    const child = this.child
    if (child === undefined) throw new EngineError('Engine is not running')
    child.stdin.write(`${command}\n`)
  }
}
