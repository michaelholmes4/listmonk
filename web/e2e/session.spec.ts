import { expect, test } from '@playwright/test'

// The API answers a missing/expired session with 403 "invalid session" (not 401). The app must
// treat that as "log in again", not show a load error.
test('an invalid session sends the user to the login page', async ({ page }) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'invalid session' }),
    }),
  )
  await page.goto('/admin/')
  await expect(page).toHaveURL(/\/admin\/login\?next=/)
})

test('a real permission error is not mistaken for a lost session', async ({ page }) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'permission denied: settings:get' }),
    }),
  )
  await page.goto('/admin/')
  await expect(page.getByText('Failed to load: permission denied')).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/?$/)
})
