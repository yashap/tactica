import { type Page } from '@playwright/test'
import { FIXTURE_PLAYER } from './fixtures/chesscomFixtureServer.js'
import { expect, test } from './fixtures/preflight.js'

const uniqueEmail = (): string => `tactica-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`

/**
 * The full loop: sign up, link the fixture account, wait for the pipeline to produce puzzles, then
 * open one. The fixture includes a game where the player hangs his queen on move 3, so there is
 * always at least one puzzle whose answer is known here (`Bc4`, from the same position).
 */
const signUpLinkAndOpenAPuzzle = async (page: Page): Promise<void> => {
  await page.goto('/')
  await expect(page.getByTestId('logInScreen')).toBeVisible()
  await page.getByTestId('goToSignUp').click()
  await page.getByTestId('signUpEmailInput').fill(uniqueEmail())
  await page.getByTestId('signUpPasswordInput').fill('StrongPassword123!')
  await page.getByTestId('submitSignUp').click()
  await expect(page.getByTestId('playScreen')).toBeVisible()

  await page.getByTestId('settingsTab').click()
  await page.getByTestId('chesscomUsernameInput').fill(FIXTURE_PLAYER)
  await page.getByTestId('linkChesscomButton').click()
  await expect(page.getByTestId('puzzleCountText')).toHaveText(/[1-9]\d* puzzles? found/, { timeout: 180_000 })
  // Wait for *every* game to finish analysing, not just the first one to yield a puzzle: the games
  // are analysed one at a time and the hanging-queen fixture is last, so the count above can go
  // positive while the puzzle this test needs doesn't exist yet.
  await expect(page.getByTestId('analysisActiveIndicator')).toHaveCount(0, { timeout: 180_000 })

  await page.getByTestId('puzzlesTab').click()
  await expect(page.getByTestId('puzzlesScreen')).toBeVisible()
}

/** The hanging-queen puzzle: white to move, having just been about to play Qxf7+. Bc4 is the answer. */
const openHangingQueenPuzzle = async (page: Page): Promise<void> => {
  const puzzle = page.getByTestId('puzzleRow-blunder_bait')
  await expect(puzzle).toBeVisible({ timeout: 30_000 })
  await puzzle.click()
  await expect(page.getByTestId('puzzleScreen')).toBeVisible()
  await expect(page.getByTestId('chessBoard')).toBeVisible()
}

/**
 * Tap from-square then to-square, scoped to the puzzle screen.
 *
 * The scoping matters: tab screens all stay mounted, so the Play tab's board is also in the DOM with
 * the same `square-*` testIDs. An unscoped locator resolves to that one, which sits behind the
 * puzzle screen and silently swallows the click.
 */
const move = async (page: Page, from: string, to: string): Promise<void> => {
  const board = page.getByTestId('puzzleScreen')
  await board.getByTestId(`square-${from}`).click()
  await board.getByTestId(`square-${to}`).click()
}

test('solving a puzzle with the best move shows the success state', async ({ page }) => {
  await signUpLinkAndOpenAPuzzle(page)
  await openHangingQueenPuzzle(page)

  // Bc4 — the move the engine prefers over hanging the queen with Qxf7+
  await move(page, 'f1', 'c4')

  await expect(page.getByTestId('puzzleSuccess')).toBeVisible()
  await expect(page.getByTestId('puzzlePrompt')).toContainText('Correct!')
})

test('playing the wrong move shows the failure state and allows a retry', async ({ page }) => {
  await signUpLinkAndOpenAPuzzle(page)
  await openHangingQueenPuzzle(page)

  // Qxf7+ is exactly the blunder that created this puzzle
  await move(page, 'h5', 'f7')

  await expect(page.getByTestId('puzzleFailure')).toBeVisible()
  await expect(page.getByTestId('puzzleFailure')).toContainText('Qxf7+')

  // Retrying puts the original position back, ready for another go
  await page.getByTestId('puzzleRetryButton').click()
  await expect(page.getByTestId('puzzleFailure')).toHaveCount(0)
  await expect(page.getByTestId('puzzlePrompt')).toContainText('Find the better move')

  await move(page, 'f1', 'c4')
  await expect(page.getByTestId('puzzleSuccess')).toBeVisible()
})

test('a solved puzzle is badged as solved in the list', async ({ page }) => {
  await signUpLinkAndOpenAPuzzle(page)
  await openHangingQueenPuzzle(page)
  await move(page, 'f1', 'c4')
  await expect(page.getByTestId('puzzleSuccess')).toBeVisible()

  await page.getByTestId('puzzlesTab').click()
  await expect(page.getByTestId('puzzlesScreen')).toBeVisible()
  // The badge comes from the server's own grading of the attempt, not the client's
  await expect(page.getByText('✓ Solved').first()).toBeVisible({ timeout: 30_000 })
})
