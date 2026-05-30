import { ContractBuilder } from '@tactica/api-client-utils'
import { initContract } from '@ts-rest/core'
import { z } from 'zod'

const c = initContract()

export const TodoSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  title: z.string().min(1).max(500),
  done: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Todo = z.infer<typeof TodoSchema>

export const CreateTodoRequestSchema = z.object({
  title: z.string().min(1).max(500),
})
export type CreateTodoRequest = z.infer<typeof CreateTodoRequestSchema>

export const UpdateTodoRequestSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    done: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' })
export type UpdateTodoRequest = z.infer<typeof UpdateTodoRequestSchema>

export const ListTodosResponseSchema = z.object({
  todos: z.array(TodoSchema),
})

export const todoContract = c.router({
  list: {
    method: 'GET',
    path: '/todos',
    responses: ContractBuilder.buildListResponses(ListTodosResponseSchema),
    summary: 'List the authenticated user’s todos',
  },
  get: {
    method: 'GET',
    path: '/todos/:id',
    pathParams: z.object({ id: z.string().uuid() }),
    responses: ContractBuilder.buildGetResponses(TodoSchema),
    summary: 'Get a single todo by id',
  },
  create: {
    method: 'POST',
    path: '/todos',
    body: CreateTodoRequestSchema,
    responses: ContractBuilder.buildPostResponses(TodoSchema),
    summary: 'Create a todo',
  },
  update: {
    method: 'PATCH',
    path: '/todos/:id',
    pathParams: z.object({ id: z.string().uuid() }),
    body: UpdateTodoRequestSchema,
    responses: ContractBuilder.buildPatchResponses(TodoSchema),
    summary: 'Update a todo',
  },
  delete: {
    method: 'DELETE',
    path: '/todos/:id',
    pathParams: z.object({ id: z.string().uuid() }),
    responses: ContractBuilder.buildDeleteResponses(),
    summary: 'Delete a todo',
  },
})
