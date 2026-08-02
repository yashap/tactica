import { type Page } from '@playwright/test'
import { FIXTURE_PLAYER } from './fixtures/chesscomFixtureServer.js'
import { expect, test } from './fixtures/preflight.js'

const uniqueEmail = (): string => `tactica-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`

// Sign up as a fresh user, then open the Settings tab
const signUpAndGoToSettings = async (page: Page): Promise<void> => {
  await page.goto('/')
  await expect(page.getByTestId('logInScreen')).toBeVisible()

  await page.getByTestId('goToSignUp').click()
  await expect(page.getByTestId('signUpScreen')).toBeVisible()
  await page.getByTestId('signUpEmailInput').fill(uniqueEmail())
  await page.getByTestId('signUpPasswordInput').fill('StrongPassword123!')
  await page.getByTestId('submitSignUp').click()
  await expect(page.getByTestId('playScreen')).toBeVisible()

  await page.getByTestId('settingsTab').click()
  await expect(page.getByTestId('settingsScreen')).toBeVisible()
}

test('link a chess.com account and watch games import', async ({ page }) => {
  await signUpAndGoToSettings(page)

  await page.getByTestId('chesscomUsernameInput').fill(FIXTURE_PLAYER)
  await page.getByTestId('linkChesscomButton').click()

  // The linked-account card replaces the form
  await expect(page.getByTestId('linkedUsername')).toContainText(FIXTURE_PLAYER)

  // The import runs in the background; the screen polls until it completes and a positive game
  // count appears. (Against the CI fixture server this is the fixture's game count; against real
  // chess.com it's however many games the player has.)
  await expect(page.getByTestId('syncIdleIndicator')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByTestId('gamesImportedText')).toHaveText(/[1-9]\d* games? imported/)
})

test('linking a nonexistent chess.com username shows a validation error', async ({ page }) => {
  await signUpAndGoToSettings(page)

  await page.getByTestId('chesscomUsernameInput').fill('tactica-e2e-no-such-user-8f3a1')
  await page.getByTestId('linkChesscomButton').click()

  await expect(page.getByTestId('linkError')).toContainText(/no chesscom user/i)
  // Still on the link form — nothing was created
  await expect(page.getByTestId('chesscomUsernameInput')).toBeVisible()
})

test('unlinking removes the account and offers the link form again', async ({ page }) => {
  await signUpAndGoToSettings(page)

  await page.getByTestId('chesscomUsernameInput').fill(FIXTURE_PLAYER)
  await page.getByTestId('linkChesscomButton').click()
  await expect(page.getByTestId('linkedUsername')).toContainText(FIXTURE_PLAYER)

  await page.getByTestId('unlinkButton').click()
  await expect(page.getByTestId('chesscomUsernameInput')).toBeVisible()
})
