import { describe, expect, it } from 'vitest'
import { type EngineLine, parseBestMoveLine, parseInfoLine, selectBestLines } from './uci.js'

describe('parseInfoLine', () => {
  it('parses a single-PV centipawn line', () => {
    const line = parseInfoLine(
      'info depth 20 seldepth 27 multipv 1 score cp 45 nodes 1000000 nps 500000 hashfull 120 tbhits 0 time 2000 pv e2e4 e7e5 g1f3',
    )
    expect(line).toEqual({ multipv: 1, depth: 20, cp: 45, pvUci: ['e2e4', 'e7e5', 'g1f3'] })
  })

  it('parses negative scores and mate scores, keeping the engine sign convention', () => {
    expect(parseInfoLine('info depth 12 multipv 1 score cp -137 time 5 pv d7d5')).toMatchObject({ cp: -137 })
    // Positive mate = the side to move is delivering it
    expect(parseInfoLine('info depth 5 multipv 1 score mate 3 time 5 pv f3f7 e8f7')).toMatchObject({ mate: 3 })
    // Negative mate = the side to move is getting mated
    expect(parseInfoLine('info depth 5 multipv 1 score mate -2 time 5 pv h7h6')).toMatchObject({ mate: -2 })
  })

  it('does not set cp when the score is a mate, and vice versa', () => {
    const mateLine = parseInfoLine('info depth 5 multipv 1 score mate 1 time 1 pv a1a8')
    expect(mateLine?.cp).toBeUndefined()
    const cpLine = parseInfoLine('info depth 5 multipv 1 score cp 10 time 1 pv a1a8')
    expect(cpLine?.mate).toBeUndefined()
  })

  it('defaults multipv to 1 when the engine omits it', () => {
    expect(parseInfoLine('info depth 8 score cp 12 time 3 pv g1f3')).toMatchObject({ multipv: 1 })
  })

  it('keeps higher multipv ranks', () => {
    expect(parseInfoLine('info depth 14 multipv 3 score cp -8 time 40 pv b1c3 g8f6')).toMatchObject({
      multipv: 3,
      cp: -8,
    })
  })

  it('reads bounded scores, ignoring the bound marker', () => {
    // Aspiration-window reports carry upperbound/lowerbound right after the score
    expect(parseInfoLine('info depth 17 multipv 1 score cp 62 upperbound nodes 900 time 30 pv e2e4')).toMatchObject({
      cp: 62,
      depth: 17,
    })
    expect(parseInfoLine('info depth 17 multipv 1 score cp 20 lowerbound time 30 pv d2d4')).toMatchObject({ cp: 20 })
  })

  it('ignores info lines that carry no usable evaluation', () => {
    expect(parseInfoLine('info string NNUE evaluation using nn-5af11540bbfe.nnue enabled')).toBeUndefined()
    expect(parseInfoLine('info depth 20 currmove e2e4 currmovenumber 1')).toBeUndefined()
    expect(parseInfoLine('info nodes 1200000 nps 480000 hashfull 300 tbhits 0 time 2500')).toBeUndefined()
    // A score with no pv is not actionable
    expect(parseInfoLine('info depth 3 multipv 1 score cp 15 time 1')).toBeUndefined()
    // ...and neither is a pv with no depth
    expect(parseInfoLine('info multipv 1 score cp 15 time 1 pv e2e4')).toBeUndefined()
  })

  it('ignores lines that are not info lines at all', () => {
    expect(parseInfoLine('bestmove e2e4 ponder e7e5')).toBeUndefined()
    expect(parseInfoLine('readyok')).toBeUndefined()
    expect(parseInfoLine('')).toBeUndefined()
  })

  it('tolerates extra whitespace', () => {
    expect(parseInfoLine('  info   depth 9   multipv 1  score cp 7   pv  e2e4   e7e5  ')).toEqual({
      multipv: 1,
      depth: 9,
      cp: 7,
      pvUci: ['e2e4', 'e7e5'],
    })
  })
})

describe('parseBestMoveLine', () => {
  it('extracts the move, ignoring any ponder move', () => {
    expect(parseBestMoveLine('bestmove e2e4 ponder e7e5')).toBe('e2e4')
    expect(parseBestMoveLine('bestmove a1a8')).toBe('a1a8')
    expect(parseBestMoveLine('bestmove e7e8q')).toBe('e7e8q')
  })

  it('returns null when the engine reports no move (terminal position)', () => {
    expect(parseBestMoveLine('bestmove (none)')).toBeNull()
    expect(parseBestMoveLine('bestmove 0000')).toBeNull()
    expect(parseBestMoveLine('bestmove')).toBeNull()
  })

  it('returns undefined for other lines', () => {
    expect(parseBestMoveLine('info depth 1 multipv 1 score cp 5 pv e2e4')).toBeUndefined()
    expect(parseBestMoveLine('uciok')).toBeUndefined()
  })
})

describe('selectBestLines', () => {
  const line = (multipv: number, depth: number, cp: number): EngineLine => ({
    multipv,
    depth,
    cp,
    pvUci: [`m${multipv}d${depth}`],
  })

  it('keeps the deepest report per PV rank, ordered best-first', () => {
    const selected = selectBestLines([
      line(1, 1, 10),
      line(2, 1, 5),
      line(1, 2, 12),
      line(2, 2, 6),
      line(1, 3, 15),
      line(2, 3, 7),
    ])
    expect(selected.map((l) => [l.multipv, l.depth, l.cp])).toEqual([
      [1, 3, 15],
      [2, 3, 7],
    ])
  })

  it('lets a later report at the same depth win, so exact scores replace bounded ones', () => {
    const selected = selectBestLines([line(1, 17, 62), line(1, 17, 48)])
    expect(selected).toEqual([{ multipv: 1, depth: 17, cp: 48, pvUci: ['m1d17'] }])
  })

  it('never lets a shallower report overwrite a deeper one', () => {
    // Ranks are re-reported from depth 1 each iteration in some search states
    const selected = selectBestLines([line(1, 20, 30), line(1, 4, -100)])
    expect(selected).toEqual([{ multipv: 1, depth: 20, cp: 30, pvUci: ['m1d20'] }])
  })

  it('sorts ranks even when reported out of order', () => {
    const selected = selectBestLines([line(3, 9, 1), line(1, 9, 30), line(2, 9, 20)])
    expect(selected.map((l) => l.multipv)).toEqual([1, 2, 3])
  })

  it('returns nothing for an empty search', () => {
    expect(selectBestLines([])).toEqual([])
  })

  it('reduces a full recorded search to its final lines', () => {
    // Real shape of a `go movetime` search with MultiPV 2, including noise lines
    const output = [
      'info string NNUE evaluation using nn-5af11540bbfe.nnue enabled',
      'info depth 1 seldepth 1 multipv 1 score cp 32 nodes 40 nps 40000 time 1 pv e2e4',
      'info depth 1 seldepth 1 multipv 2 score cp 28 nodes 40 nps 40000 time 1 pv d2d4',
      'info depth 2 seldepth 2 multipv 1 score cp 45 upperbound nodes 200 time 2 pv e2e4 e7e5',
      'info depth 2 seldepth 2 multipv 1 score cp 38 nodes 260 time 2 pv e2e4 c7c5',
      'info depth 2 seldepth 2 multipv 2 score cp 30 nodes 260 time 2 pv d2d4 d7d5',
      'info depth 2 currmove g1f3 currmovenumber 3',
      'info nodes 260 nps 130000 time 2',
    ]
    const parsed = output.flatMap((l) => parseInfoLine(l) ?? [])
    expect(selectBestLines(parsed)).toEqual([
      { multipv: 1, depth: 2, cp: 38, pvUci: ['e2e4', 'c7c5'] },
      { multipv: 2, depth: 2, cp: 30, pvUci: ['d2d4', 'd7d5'] },
    ])
  })
})
