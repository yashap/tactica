import { type Locator, type Page } from '@playwright/test'
import { FIXTURE_PLAYER } from './fixtures/chesscomFixtureServer.js'
import { expect, test } from './fixtures/preflight.js'

// Each test drives the whole pipeline (import, then engine analysis of every fixture game), which
// outlasts Playwright's default per-test timeout. Without this the generous `expect` timeouts below
// would be silently capped by it.
test.describe.configure({ timeout: 240_000 })

const uniqueEmail = (): string => `tactica-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`

/**
 * The full loop: sign up, link the fixture account, and wait for the pipeline to finish. The fixture
 * includes games where the player hangs his queen — as white vs blunder_bait (answer: Bc4 instead of
 * Qxf7+) and as black vs queen_snatcher (Qh4 hangs it to Nxh4) — so puzzles with known answers exist.
 */
const signUpAndLinkTheFixtureAccount = async (page: Page): Promise<void> => {
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
  // Wait for *every* game to finish, not just the first puzzle to appear: games are analysed one at a
  // time, so the count can go positive before the puzzle a test needs exists. The idle indicator only
  // shows once nothing is importing *or* analysing — unlike waiting for the analysing indicator to
  // vanish, which also passes in the moment before the import has handed anything to analysis.
  await expect(page.getByTestId('syncIdleIndicator')).toBeVisible({ timeout: 180_000 })

  await page.getByTestId('puzzlesTab').click()
  await expect(page.getByTestId('puzzlesScreen')).toBeVisible()
}

/** A puzzle's row in the list, by opponent — row testIDs carry the (random) puzzle id. */
const puzzleRow = (page: Page, opponent: string): Locator =>
  page.getByTestId(/^puzzleRow-/).filter({ hasText: `vs ${opponent}` })

const openPuzzleAgainst = async (page: Page, opponent: string): Promise<void> => {
  const row = puzzleRow(page, opponent)
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.getByTestId('puzzleScreen')).toBeVisible()
  // Scoped for the same reason as `board` below: the Play tab's board is still mounted and carries
  // the same testID, so an unscoped locator is a strict-mode violation waiting to happen.
  await expect(page.getByTestId('puzzleScreen').getByTestId('chessBoard')).toBeVisible()
}

/**
 * The puzzle screen, which scopes board locators. The scoping matters: tab screens all stay mounted,
 * so the Play tab's board is also in the DOM with the same `square-*` testIDs. An unscoped locator
 * resolves to that one, which sits behind the puzzle screen and silently swallows the click.
 */
const board = (page: Page): Locator => page.getByTestId('puzzleScreen')

/** Tap from-square then to-square on the puzzle board. */
const move = async (page: Page, from: string, to: string): Promise<void> => {
  await board(page).getByTestId(`square-${from}`).click()
  await board(page).getByTestId(`square-${to}`).click()
}

const backToList = async (page: Page): Promise<void> => {
  await page.getByTestId('puzzleBackButton').click()
  await expect(page.getByTestId('puzzlesScreen')).toBeVisible()
}

test('solving a puzzle with the best move shows the success state', async ({ page }) => {
  await signUpAndLinkTheFixtureAccount(page)
  await openPuzzleAgainst(page, 'blunder_bait')

  // Bc4 — the move the engine prefers over hanging the queen with Qxf7+
  await move(page, 'f1', 'c4')

  await expect(page.getByTestId('puzzleSuccess')).toBeVisible()
  await expect(page.getByTestId('puzzlePrompt')).toContainText('Correct!')
  // Names the move the solver actually played
  await expect(page.getByTestId('puzzleSuccess')).toContainText('Bc4 — much better than Qxf7+')
})

test('the board locks once the puzzle is answered', async ({ page }) => {
  await signUpAndLinkTheFixtureAccount(page)
  await openPuzzleAgainst(page, 'blunder_bait')
  await move(page, 'f1', 'c4')
  await expect(page.getByTestId('puzzleSuccess')).toBeVisible()

  // Let the opponent's reply land, then try an extra move: it must not be played
  await page.waitForTimeout(1_000)
  await move(page, 'b1', 'c3')
  await expect(board(page).getByTestId('piece-wN-b1')).toHaveCount(1)
  await expect(board(page).getByTestId('piece-wN-c3')).toHaveCount(0)
})

test('playing the wrong move shows the failure state and allows a retry', async ({ page }) => {
  await signUpAndLinkTheFixtureAccount(page)
  await openPuzzleAgainst(page, 'blunder_bait')

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

  // A miss revealed the answer first, so it's badged as solved on retry rather than outright
  await backToList(page)
  await expect(puzzleRow(page, 'blunder_bait')).toContainText('Solved on retry', { timeout: 30_000 })
})

test('a puzzle solved first time is badged as solved in the list', async ({ page }) => {
  await signUpAndLinkTheFixtureAccount(page)
  await openPuzzleAgainst(page, 'blunder_bait')
  await move(page, 'f1', 'c4')
  await expect(page.getByTestId('puzzleSuccess')).toBeVisible()

  await backToList(page)
  // The badge comes from the server's own grading of the attempt, not the client's
  await expect(puzzleRow(page, 'blunder_bait')).toContainText('✓ Solved', { timeout: 30_000 })
})

test("a black puzzle shows the board from black's side", async ({ page }) => {
  await signUpAndLinkTheFixtureAccount(page)
  await openPuzzleAgainst(page, 'queen_snatcher')

  // Flipped: a1 sits at the top of the screen and h8 at the bottom
  const a1 = await board(page).getByTestId('square-a1').boundingBox()
  const h8 = await board(page).getByTestId('square-h8').boundingBox()
  expect(a1!.y).toBeLessThan(h8!.y)

  // Qh4 is the blunder that created this puzzle — it hangs the queen to Nxh4
  await move(page, 'd8', 'h4')
  await expect(page.getByTestId('puzzleFailure')).toContainText('Qh4')
})
