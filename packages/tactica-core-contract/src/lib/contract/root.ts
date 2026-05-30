import { initContract } from '@ts-rest/core'
import { todoContract } from './todo.js'

const c = initContract()

export const tacticaCoreContract = c.router(
  {
    todos: todoContract,
  },
  {
    pathPrefix: '/tactica-core',
  },
)
