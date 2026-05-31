import { test as base } from '@playwright/test'
import { cleanupDatabase } from './db'

const TACTICA_CORE_URL = process.env['TACTICA_CORE_URL'] ?? 'http://localhost:3501'
const SUPERTOKENS_CORE_URL = process.env['SUPERTOKENS_CORE_URL'] ?? 'http://localhost:3567'
const EXPO_WEB_URL = process.env['TACTICA_WEB_URL'] ?? 'http://localhost:8081'

const checkReachable = async (label: string, url: string): Promise<void> => {
  try {
    const response = await fetch(url)
    // Any HTTP response is fine — we just need the service to be answering
    void response
  } catch (error) {
    throw new Error(
      `[e2e] ${label} is not reachable at ${url}. Make sure you started it manually before running the e2e tests. ` +
        `See e2e-tests-web/README.md for the prerequisite commands. Underlying error: ${(error as Error).message}`,
    )
  }
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await checkReachable('Expo Web', EXPO_WEB_URL)
    await checkReachable('tactica-core', TACTICA_CORE_URL)
    await checkReachable('SuperTokens core', `${SUPERTOKENS_CORE_URL}/hello`)
    await cleanupDatabase()
    await use(page)
  },
})

export { expect } from '@playwright/test'
