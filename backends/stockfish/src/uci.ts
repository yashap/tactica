/**
 * Parsing of the UCI protocol's engine-to-us messages. Pure functions only — all of this service's
 * protocol knowledge lives here (and in the command strings `UciEngine` sends), so nothing
 * downstream ever has to understand UCI.
 */

export interface EngineLine {
  /** 1-based principal-variation rank; 1 is the engine's preferred line. */
  multipv: number
  /** Search depth the line was reported at. */
  depth: number
  /** The line's moves in UCI notation (e.g. `['e2e4', 'e7e5']`); the first is the move to play. */
  pvUci: string[]
  /**
   * Centipawn score **from the perspective of the side to move in the evaluated position** — that
   * is what UCI reports, and it is deliberately not normalized here. Absent when `mate` is set.
   */
  cp?: number
  /** Moves until mate, side-to-move-relative: positive = delivering mate, negative = being mated. */
  mate?: number
}

const toInt = (token: string | undefined): number | undefined => {
  if (token === undefined) return undefined
  const parsed = Number(token)
  return Number.isInteger(parsed) ? parsed : undefined
}

/**
 * Parse an `info` line into a usable engine line, or `undefined` when the line carries no complete
 * evaluation. Stockfish emits plenty of the latter — `info string ...` banners, `info currmove ...`
 * progress reports, and periodic node-count updates — and all of them are ignored.
 */
export const parseInfoLine = (line: string): EngineLine | undefined => {
  const tokens = line.trim().split(/\s+/)
  if (tokens[0] !== 'info') return undefined

  let depth: number | undefined
  let multipv = 1
  let cp: number | undefined
  let mate: number | undefined
  let pvUci: string[] | undefined

  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index]
    if (token === 'depth') {
      depth = toInt(tokens[index + 1])
      index += 1
    } else if (token === 'multipv') {
      multipv = toInt(tokens[index + 1]) ?? 1
      index += 1
    } else if (token === 'score') {
      // `score cp 45` / `score mate -3`, optionally followed by `upperbound`/`lowerbound`, which we
      // don't need to inspect: bounded scores get superseded by the exact line at the same depth.
      const kind = tokens[index + 1]
      const value = toInt(tokens[index + 2])
      if (kind === 'cp') cp = value
      else if (kind === 'mate') mate = value
      index += 2
    } else if (token === 'pv') {
      // `pv` is always last — everything after it is the line's moves
      pvUci = tokens.slice(index + 1).filter((move) => move.length > 0)
      break
    }
  }

  if (depth === undefined || pvUci === undefined || pvUci.length === 0) return undefined
  if (cp === undefined && mate === undefined) return undefined
  return {
    multipv,
    depth,
    pvUci,
    ...(cp === undefined ? {} : { cp }),
    ...(mate === undefined ? {} : { mate }),
  }
}

/**
 * Parse a `bestmove` line. Returns `undefined` if this isn't one, or `null` when the engine reports
 * no move — which is what it does for an already-terminal position (checkmate or stalemate).
 */
export const parseBestMoveLine = (line: string): string | null | undefined => {
  const tokens = line.trim().split(/\s+/)
  if (tokens[0] !== 'bestmove') return undefined
  const move = tokens[1]
  if (move === undefined || move === '(none)' || move === '0000') return null
  return move
}

/**
 * Reduce every `info` line of one search to the final line per PV rank, ordered best-first.
 *
 * The engine re-reports each PV at every depth, so we keep the deepest report for each rank; among
 * reports at the same depth the last one wins, which is what discards aspiration-window
 * `upperbound`/`lowerbound` estimates in favour of the exact score that follows them.
 */
export const selectBestLines = (lines: EngineLine[]): EngineLine[] => {
  const deepestByRank = new Map<number, EngineLine>()
  for (const line of lines) {
    const existing = deepestByRank.get(line.multipv)
    if (existing === undefined || line.depth >= existing.depth) {
      deepestByRank.set(line.multipv, line)
    }
  }
  return [...deepestByRank.values()].sort((a, b) => a.multipv - b.multipv)
}
