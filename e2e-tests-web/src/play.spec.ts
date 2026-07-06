import { type Page } from '@playwright/test'
import { expect, test } from './fixtures/preflight'

const uniqueEmail = (): string => `tactica-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`

// Sign up as a fresh user and land on /play with the board visible
const signUpAndGoToPlay = async (page: Page): Promise<void> => {
  await page.goto('/')
  await expect(page.getByTestId('logInScreen')).toBeVisible()

  await page.getByTestId('goToSignUp').click()
  await expect(page.getByTestId('signUpScreen')).toBeVisible()
  await page.getByTestId('signUpEmailInput').fill(uniqueEmail())
  await page.getByTestId('signUpPasswordInput').fill('StrongPassword123!')
  await page.getByTestId('submitSignUp').click()

  await expect(page.getByTestId('playScreen')).toBeVisible()
  await expect(page.getByTestId('chessBoard')).toBeVisible()
}

// Tap from-square then to-square to make a move
const move = async (page: Page, from: string, to: string): Promise<void> => {
  await page.getByTestId(`square-${from}`).click()
  await page.getByTestId(`square-${to}`).click()
}

test('signup, see chess board, play alternating moves including a capture', async ({ page }) => {
  await signUpAndGoToPlay(page)

  // White pawn starts on e2, e4 is empty
  await expect(page.getByTestId('piece-wP-e2')).toBeVisible()
  await expect(page.getByTestId('piece-wP-e4')).toHaveCount(0)

  // No move summary yet, white to move
  await expect(page.getByTestId('moveSummary')).toHaveCount(0)
  await expect(page.getByTestId('turnIndicator')).toContainText('White to move')

  // White plays e4: tap e2 (selects), tap e4 (commits)
  await move(page, 'e2', 'e4')

  // Pawn is now on e4, gone from e2; summary shows the SAN and it's black's turn
  await expect(page.getByTestId('piece-wP-e4')).toBeVisible()
  await expect(page.getByTestId('piece-wP-e2')).toHaveCount(0)
  await expect(page.getByTestId('moveSummary')).toContainText('e4')
  await expect(page.getByTestId('turnIndicator')).toContainText('Black to move')

  // It's black's turn — trying to move another white pawn does nothing
  await move(page, 'd2', 'd4')
  await expect(page.getByTestId('piece-wP-d2')).toBeVisible()
  await expect(page.getByTestId('piece-wP-d4')).toHaveCount(0)

  // Black plays d5
  await move(page, 'd7', 'd5')
  await expect(page.getByTestId('piece-bP-d5')).toBeVisible()
  await expect(page.getByTestId('moveSummary')).toContainText('d5')
  await expect(page.getByTestId('turnIndicator')).toContainText('White to move')

  // White captures: exd5 — the captured black pawn shows up in white's tray
  await move(page, 'e4', 'd5')
  await expect(page.getByTestId('piece-wP-d5')).toBeVisible()
  await expect(page.getByTestId('piece-bP-d5')).toHaveCount(0)
  await expect(page.getByTestId('piece-wP-e4')).toHaveCount(0)
  await expect(page.getByTestId('moveSummary')).toContainText('exd5')
  await expect(page.getByTestId('turnIndicator')).toContainText('Black to move')
  await expect(page.getByTestId('capturedByWhite-bP-0')).toBeVisible()
  await expect(page.getByTestId('capturedByBlack-wP-0')).toHaveCount(0)

  // Black recaptures: Qxd5 — the captured white pawn shows up in black's tray
  await move(page, 'd8', 'd5')
  await expect(page.getByTestId('piece-bQ-d5')).toBeVisible()
  await expect(page.getByTestId('piece-wP-d5')).toHaveCount(0)
  await expect(page.getByTestId('moveSummary')).toContainText('Qxd5')
  await expect(page.getByTestId('capturedByBlack-wP-0')).toBeVisible()
})

test('check is indicated on the king square and clears when resolved', async ({ page }) => {
  await signUpAndGoToPlay(page)

  // 1. d4 e6 2. h3 Bb4+ — bishop checks the white king on e1
  await move(page, 'd2', 'd4')
  await move(page, 'e7', 'e6')
  await move(page, 'h2', 'h3')
  await move(page, 'f8', 'b4')

  await expect(page.getByTestId('piece-bB-b4')).toBeVisible()
  await expect(page.getByTestId('check-e1')).toBeVisible()
  await expect(page.getByTestId('turnIndicator')).toContainText('check')

  // 3. c3 blocks the check — the indicator clears
  await move(page, 'c2', 'c3')
  await expect(page.getByTestId('piece-wP-c3')).toBeVisible()
  await expect(page.getByTestId('check-e1')).toHaveCount(0)
  await expect(page.getByTestId('turnIndicator')).toContainText('Black to move')
  await expect(page.getByTestId('turnIndicator')).not.toContainText('check')
})

test("checkmate is indicated on the king square (fool's mate)", async ({ page }) => {
  await signUpAndGoToPlay(page)

  // 1. f3 e5 2. g4 Qh4#
  await move(page, 'f2', 'f3')
  await move(page, 'e7', 'e5')
  await move(page, 'g2', 'g4')
  await move(page, 'd8', 'h4')

  await expect(page.getByTestId('piece-bQ-h4')).toBeVisible()
  await expect(page.getByTestId('checkmate-e1')).toBeVisible()
  await expect(page.getByTestId('turnIndicator')).toContainText('Checkmate')
  await expect(page.getByTestId('turnIndicator')).toContainText('black wins')

  // Game is over — no further moves are possible
  await move(page, 'a2', 'a3')
  await expect(page.getByTestId('piece-wP-a3')).toHaveCount(0)
  await expect(page.getByTestId('piece-wP-a2')).toBeVisible()
})
