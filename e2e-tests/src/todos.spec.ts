import { expect, test } from './fixtures/preflight'

const uniqueEmail = (): string => `tactica-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`

test('signup, log out, log in, todo CRUD round trip', async ({ page }) => {
  const email = uniqueEmail()
  const password = 'StrongPassword123!'

  // Land on root, expect redirect to log in
  await page.goto('/')
  await expect(page.getByTestId('logInScreen')).toBeVisible()

  // Navigate to signup
  await page.getByTestId('goToSignUp').click()
  await expect(page.getByTestId('signUpScreen')).toBeVisible()

  await page.getByTestId('signUpEmailInput').fill(email)
  await page.getByTestId('signUpPasswordInput').fill(password)
  await page.getByTestId('submitSignUp').click()

  // After signup we land on /todos with an empty state
  await expect(page.getByTestId('todosScreen')).toBeVisible()
  await expect(page.getByTestId('emptyState')).toBeVisible()

  // Add a todo
  await page.getByTestId('newTodoInput').fill('Learn the Sicilian Defense')
  await page.getByTestId('addTodoButton').click()
  await expect(page.getByText('Learn the Sicilian Defense')).toBeVisible()

  // Edit it
  const titleLocator = page.getByText('Learn the Sicilian Defense')
  await expect(titleLocator).toBeVisible()
  const row = page.locator('[data-testid^="todoRow-"]').first()
  const todoId = await row.getAttribute('data-testid').then((v) => v!.replace('todoRow-', ''))
  await page.getByTestId(`editTodo-${todoId}`).click()
  await page.getByTestId(`editTodoInput-${todoId}`).fill('Study the Najdorf')
  await page.getByTestId(`saveTodo-${todoId}`).click()
  await expect(page.getByText('Study the Najdorf')).toBeVisible()

  // Reload — todo should still be there (proves DB persistence + session)
  await page.reload()
  await expect(page.getByText('Study the Najdorf')).toBeVisible()

  // Log out
  await page.getByTestId('logOutButton').click()
  await expect(page.getByTestId('logInScreen')).toBeVisible()

  // Log back in with same credentials
  await page.getByTestId('logInEmailInput').fill(email)
  await page.getByTestId('logInPasswordInput').fill(password)
  await page.getByTestId('submitLogIn').click()
  await expect(page.getByTestId('todosScreen')).toBeVisible()
  await expect(page.getByText('Study the Najdorf')).toBeVisible()

  // Delete the todo
  const persistedRow = page.locator('[data-testid^="todoRow-"]').first()
  const persistedId = await persistedRow.getAttribute('data-testid').then((v) => v!.replace('todoRow-', ''))
  await page.getByTestId(`deleteTodo-${persistedId}`).click()
  await expect(page.getByTestId('emptyState')).toBeVisible()
})
