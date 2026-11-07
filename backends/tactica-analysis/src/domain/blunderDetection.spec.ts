import { describe, expect, it } from 'vitest'
import {
  classifySeverity,
  isPuzzleWorthy,
  negateEvaluation,
  terminalEvaluation,
  toPlayerRelative,
  toWhiteRelative,
  winProbFromCp,
  winProbFromEvaluation,
} from './blunderDetection.js'

describe('winProbFromCp', () => {
  it('is a half at a dead-even evaluation', () => {
    expect(winProbFromCp(0)).toBeCloseTo(0.5, 10)
  })

  it('is symmetric about zero', () => {
    expect(winProbFromCp(250) + winProbFromCp(-250)).toBeCloseTo(1, 10)
  })

  it('matches hand-computed values of the lichess logistic', () => {
    // 1 / (1 + e^(-0.00368208 * cp))
    expect(winProbFromCp(100)).toBeCloseTo(0.591_025_9, 6)
    expect(winProbFromCp(-100)).toBeCloseTo(0.408_974_1, 6)
    expect(winProbFromCp(300)).toBeCloseTo(0.751_125_5, 6)
  })

  it('saturates rather than exploding at extreme scores', () => {
    expect(winProbFromCp(100_000)).toBe(1)
    // Underflows towards zero rather than reaching it exactly, which is fine — what matters is that
    // it stays a number instead of becoming NaN or Infinity
    expect(winProbFromCp(-100_000)).toBeLessThan(1e-100)
    expect(winProbFromCp(-100_000)).toBeGreaterThanOrEqual(0)
    expect(Number.isNaN(winProbFromCp(-100_000))).toBe(false)
  })

  it('is monotonically increasing', () => {
    const samples = [-900, -300, -50, 0, 50, 300, 900]
    const probs = samples.map(winProbFromCp)
    expect(probs).toEqual([...probs].sort((a, b) => a - b))
  })
})

describe('winProbFromEvaluation', () => {
  it('treats any forced mate as a certainty, regardless of distance', () => {
    expect(winProbFromEvaluation({ mate: 1 })).toBe(1)
    expect(winProbFromEvaluation({ mate: 9 })).toBe(1)
    expect(winProbFromEvaluation({ mate: -1 })).toBe(0)
    expect(winProbFromEvaluation({ mate: -9 })).toBe(0)
  })

  it('prefers mate over cp when both are somehow present', () => {
    expect(winProbFromEvaluation({ cp: -500, mate: 2 })).toBe(1)
  })

  it('throws on an evaluation carrying neither score', () => {
    expect(() => winProbFromEvaluation({})).toThrow(/neither cp nor mate/)
  })
})

describe('perspective conversion', () => {
  it('negates both score kinds', () => {
    expect(negateEvaluation({ cp: 120 })).toEqual({ cp: -120 })
    expect(negateEvaluation({ mate: 3 })).toEqual({ mate: -3 })
    expect(negateEvaluation({ cp: -7 })).toEqual({ cp: 7 })
  })

  it('leaves a white-to-move engine score alone and flips a black-to-move one', () => {
    // The classic bug: UCI is side-to-move-relative, so "+150 with black to move" means black is
    // winning, i.e. -150 for white.
    expect(toWhiteRelative({ cp: 150 }, 'white')).toEqual({ cp: 150 })
    expect(toWhiteRelative({ cp: 150 }, 'black')).toEqual({ cp: -150 })
    expect(toWhiteRelative({ mate: 2 }, 'black')).toEqual({ mate: -2 })
  })

  it('round-trips white-relative back to the player and reads correct win probabilities', () => {
    const whiteWinning = { cp: 300 }
    expect(winProbFromEvaluation(toPlayerRelative(whiteWinning, 'white'))).toBeCloseTo(0.751_125_5, 6)
    expect(winProbFromEvaluation(toPlayerRelative(whiteWinning, 'black'))).toBeCloseTo(0.248_874_5, 6)
  })

  it('composes: an engine score for black, converted to white then back to black, is unchanged', () => {
    const engineScoreForBlackToMove = { cp: 88 }
    const white = toWhiteRelative(engineScoreForBlackToMove, 'black')
    expect(toPlayerRelative(white, 'black')).toEqual(engineScoreForBlackToMove)
  })
})

describe('terminalEvaluation', () => {
  it('credits the mate to whoever is not to move', () => {
    // White to move and mated => black delivered it => negative (black-favouring) white-relative score
    expect(winProbFromEvaluation(toPlayerRelative(terminalEvaluation({ isCheckmate: true }, 'white'), 'white'))).toBe(0)
    expect(winProbFromEvaluation(toPlayerRelative(terminalEvaluation({ isCheckmate: true }, 'white'), 'black'))).toBe(1)
    expect(winProbFromEvaluation(toPlayerRelative(terminalEvaluation({ isCheckmate: true }, 'black'), 'black'))).toBe(0)
    expect(winProbFromEvaluation(toPlayerRelative(terminalEvaluation({ isCheckmate: true }, 'black'), 'white'))).toBe(1)
  })

  it('survives perspective flipping — the reason it never uses mate: 0', () => {
    const mated = terminalEvaluation({ isCheckmate: true }, 'white')
    expect(mated.mate).not.toBe(0)
    expect(negateEvaluation(mated).mate).toBe(-(mated.mate ?? 0))
  })

  it('scores a draw as dead even for both sides', () => {
    const drawn = terminalEvaluation({ isCheckmate: false }, 'white')
    expect(winProbFromEvaluation(toPlayerRelative(drawn, 'white'))).toBe(0.5)
    expect(winProbFromEvaluation(toPlayerRelative(drawn, 'black'))).toBe(0.5)
  })
})

describe('classifySeverity', () => {
  it('applies the lichess tiers at their boundaries', () => {
    expect(classifySeverity(0.3)).toBe('blunder')
    expect(classifySeverity(0.45)).toBe('blunder')
    expect(classifySeverity(0.2)).toBe('mistake')
    expect(classifySeverity(0.299)).toBe('mistake')
    expect(classifySeverity(0.1)).toBe('inaccuracy')
    expect(classifySeverity(0.199)).toBe('inaccuracy')
  })

  it('ignores moves that barely move the needle', () => {
    expect(classifySeverity(0.099)).toBeUndefined()
    expect(classifySeverity(0)).toBeUndefined()
    // An *improving* move (negative drop) is obviously not a mistake
    expect(classifySeverity(-0.4)).toBeUndefined()
  })

  it('does not flag a cosmetic swing in an already-won position', () => {
    // +900 -> +600 is 300 centipawns lost but barely any win probability, which is the whole reason
    // this thresholds on win probability instead of centipawn loss.
    const drop = winProbFromCp(900) - winProbFromCp(600)
    expect(drop).toBeLessThan(0.1)
    expect(classifySeverity(drop)).toBeUndefined()
  })

  it('does flag the same centipawn loss when it happens near equality', () => {
    // 0 -> -300 is the same 300 centipawns, but it hands away the game
    const drop = winProbFromCp(0) - winProbFromCp(-300)
    expect(drop).toBeGreaterThan(0.2)
    expect(classifySeverity(drop)).toBe('mistake')
  })

  it('treats hanging a winning position as a blunder', () => {
    const drop = winProbFromEvaluation({ cp: 200 }) - winProbFromEvaluation({ mate: -3 })
    expect(classifySeverity(drop)).toBe('blunder')
  })
})

describe('isPuzzleWorthy', () => {
  it('promotes mistakes and blunders but not inaccuracies', () => {
    expect(isPuzzleWorthy('blunder')).toBe(true)
    expect(isPuzzleWorthy('mistake')).toBe(true)
    expect(isPuzzleWorthy('inaccuracy')).toBe(false)
  })
})
