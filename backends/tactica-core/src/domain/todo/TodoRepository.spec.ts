import { NotFoundError } from '@tactica/errors'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db/client.js'
import { todoTable } from '../../db/schema.js'
import { TodoRepository } from './TodoRepository.js'

const newUserId = (): string => crypto.randomUUID()

describe('TodoRepository (integration)', () => {
  const repo = new TodoRepository(db)
  let userId: string

  beforeEach(async () => {
    await db.delete(todoTable)
    userId = newUserId()
  })

  afterAll(async () => {
    await sql.end()
  })

  it('creates and lists todos for the owning user', async () => {
    const created = await repo.create(userId, 'Study the Sicilian Defense')
    expect(created.userId).toBe(userId)
    expect(created.title).toBe('Study the Sicilian Defense')
    expect(created.done).toBe(false)
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)

    const list = await repo.list(userId)
    expect(list).toEqual([created])
  })

  it('returns todos in descending createdAt order', async () => {
    const first = await repo.create(userId, 'oldest')
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await repo.create(userId, 'middle')
    await new Promise((resolve) => setTimeout(resolve, 5))
    const third = await repo.create(userId, 'newest')

    const list = await repo.list(userId)
    expect(list.map((t) => t.id)).toEqual([third.id, second.id, first.id])
  })

  it('isolates todos by user', async () => {
    const otherUser = newUserId()
    await repo.create(userId, 'mine')
    await repo.create(otherUser, 'theirs')

    expect(await repo.list(userId)).toHaveLength(1)
    expect(await repo.list(otherUser)).toHaveLength(1)
  })

  it('finds by id within the owning user', async () => {
    const created = await repo.create(userId, 'find me')
    const found = await repo.findById(userId, created.id)
    expect(found?.id).toBe(created.id)
  })

  it('returns undefined when fetching another user’s todo by id', async () => {
    const created = await repo.create(userId, 'mine')
    expect(await repo.findById(newUserId(), created.id)).toBeUndefined()
  })

  it('updates title and done independently', async () => {
    const created = await repo.create(userId, 'first title')
    const renamed = await repo.update(userId, created.id, { title: 'second title' })
    expect(renamed.title).toBe('second title')
    expect(renamed.done).toBe(false)
    expect(renamed.updatedAt.valueOf()).toBeGreaterThanOrEqual(created.updatedAt.valueOf())

    const marked = await repo.update(userId, created.id, { done: true })
    expect(marked.title).toBe('second title')
    expect(marked.done).toBe(true)
  })

  it('throws NotFoundError when updating a missing todo', async () => {
    await expect(repo.update(userId, newUserId(), { title: 'nope' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws NotFoundError when another user tries to update a todo', async () => {
    const created = await repo.create(userId, 'mine')
    await expect(repo.update(newUserId(), created.id, { title: 'hijack' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('deletes a todo and rejects deleting a missing one', async () => {
    const created = await repo.create(userId, 'doomed')
    await repo.delete(userId, created.id)
    expect(await repo.list(userId)).toHaveLength(0)
    await expect(repo.delete(userId, created.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('prevents cross-user deletes', async () => {
    const created = await repo.create(userId, 'mine')
    await expect(repo.delete(newUserId(), created.id)).rejects.toBeInstanceOf(NotFoundError)
    expect(await repo.findById(userId, created.id)).toBeDefined()
  })
})
