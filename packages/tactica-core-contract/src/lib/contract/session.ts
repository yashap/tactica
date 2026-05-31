import { ContractBuilder } from '@tactica/api-client-utils'
import { initContract } from '@ts-rest/core'
import { z } from 'zod'

const c = initContract()

export const SessionInfoSchema = z.object({
  userId: z.string(),
})
export type SessionInfo = z.infer<typeof SessionInfoSchema>

export const sessionContract = c.router({
  get: {
    method: 'GET',
    path: '/session',
    responses: ContractBuilder.buildGetResponses(SessionInfoSchema),
    summary: 'Returns the authenticated user’s session info (or 401 if not logged in)',
  },
})
