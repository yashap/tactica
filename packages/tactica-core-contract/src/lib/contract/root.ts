import { initContract } from '@ts-rest/core'
import { gameContract } from './game.js'
import { gameAccountContract } from './gameAccount.js'
import { puzzleContract } from './puzzle.js'
import { sessionContract } from './session.js'

const c = initContract()

export const tacticaCoreContract = c.router(
  {
    session: sessionContract,
    gameAccounts: gameAccountContract,
    games: gameContract,
    puzzles: puzzleContract,
  },
  {
    pathPrefix: '/tactica-core',
  },
)
