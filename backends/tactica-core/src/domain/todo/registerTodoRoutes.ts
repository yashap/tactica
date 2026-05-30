import { getSessionUserId, requireSession } from '@tactica/fastify-utils'
import { tacticaCoreContract, type Todo } from '@tactica/tactica-core-contract'
import { initServer } from '@ts-rest/fastify'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { type TodoRow } from '../../db/schema.js'
import { TodoRepository } from './TodoRepository.js'

const toDto = (row: TodoRow): Todo => ({
  id: row.id,
  userId: row.userId,
  title: row.title,
  done: row.done,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export const registerTodoRoutes = async (app: FastifyInstance): Promise<void> => {
  const repo = new TodoRepository(db)
  const s = initServer()

  const router = s.router(tacticaCoreContract.todos, {
    list: async ({ request }) => {
      const userId = getSessionUserId(request)
      const rows = await repo.list(userId)
      return { status: 200, body: { todos: rows.map(toDto) } }
    },
    get: async ({ params, request }) => {
      const userId = getSessionUserId(request)
      const row = await repo.findById(userId, params.id)
      if (!row) {
        return { status: 404, body: { message: 'Todo not found', code: 'NotFoundError' } }
      }
      return { status: 200, body: toDto(row) }
    },
    create: async ({ body, request }) => {
      const userId = getSessionUserId(request)
      const row = await repo.create(userId, body.title)
      return { status: 201, body: toDto(row) }
    },
    update: async ({ params, body, request }) => {
      const userId = getSessionUserId(request)
      const row = await repo.update(userId, params.id, body)
      return { status: 200, body: toDto(row) }
    },
    delete: async ({ params, request }) => {
      const userId = getSessionUserId(request)
      await repo.delete(userId, params.id)
      return { status: 204, body: undefined }
    },
  })

  // Auth: gate every /tactica-core/todos request with requireSession via a Fastify preHandler hook
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/tactica-core/todos')) {
      await requireSession(req, reply)
    }
  })

  await app.register(s.plugin(router))
}
