import { expect, test } from './fixtures/preflight'

const uniqueEmail = (): string => `tactica-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`

test('signup, see chess board, make one move, board freezes', async ({ page }) => {
  const email = uniqueEmail()
  const password = 'StrongPassword123!'

  // Land on root, expect redirect to log in
  await page.goto('/')
  await expect(page.getByTestId('logInScreen')).toBeVisible()

  // Sign up as a new user
  await page.getByTestId('goToSignUp').click()
  await expect(page.getByTestId('signUpScreen')).toBeVisible()
  await page.getByTestId('signUpEmailInput').fill(email)
  await page.getByTestId('signUpPasswordInput').fill(password)
  await page.getByTestId('submitSignUp').click()

  // After signup we land on /play with the chess board in the initial position
  await expect(page.getByTestId('playScreen')).toBeVisible()
  await expect(page.getByTestId('chessBoard')).toBeVisible()

  // White pawn starts on e2, e4 is empty
  await expect(page.getByTestId('piece-wP-e2')).toBeVisible()
  await expect(page.getByTestId('piece-wP-e4')).toHaveCount(0)

  // No move summary yet
  await expect(page.getByTestId('moveSummary')).toHaveCount(0)

  // Make the move: tap e2 (selects), tap e4 (commits)
  await page.getByTestId('square-e2').click()
  await page.getByTestId('square-e4').click()

  // Pawn is now on e4, gone from e2
  await expect(page.getByTestId('piece-wP-e4')).toBeVisible()
  await expect(page.getByTestId('piece-wP-e2')).toHaveCount(0)

  // Move summary shows the SAN
  await expect(page.getByTestId('moveSummary')).toContainText('e4')

  // Board is frozen — d2 pawn is still in place, d4 is still empty, and squares are disabled
  await expect(page.getByTestId('piece-wP-d2')).toBeVisible()
  await expect(page.getByTestId('piece-wP-d4')).toHaveCount(0)
  await expect(page.getByTestId('square-d2')).toBeDisabled()
})
