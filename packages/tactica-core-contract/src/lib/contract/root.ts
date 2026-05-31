import { initContract } from '@ts-rest/core'
import { sessionContract } from './session.js'
import { todoContract } from './todo.js'

const c = initContract()

export const tacticaCoreContract = c.router(
  {
    session: sessionContract,
    todos: todoContract,
  },
  {
    pathPrefix: '/tactica-core',
  },
)
