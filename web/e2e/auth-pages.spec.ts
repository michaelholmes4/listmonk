import { expect, test } from '@playwright/test'

// These pages are server-rendered by the Go backend (the security boundary for login, 2FA,
// reset and OIDC). The new UI only themes them; see static/public/static/librelist-auth.css.
test.use({ storageState: { cookies: [], origins: [] } })

const font = (page: import('@playwright/test').Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily)

test('login page uses the new theme and shows errors inline', async ({ page }) => {
  await page.goto('/admin/login?next=/app/')
  expect(await font(page, 'body')).toContain('Geist')

  await page.fill('input[name=username]', 'admin')
  await page.fill('input[name=password]', 'definitely-wrong-password')
  await page.click('button[type=submit]')
  await expect(page.locator('.error')).toBeVisible()
  // `next` survives a failed attempt, so a successful retry still lands in the new UI.
  await expect(page.locator('input[name=next]')).toHaveValue(/^\/app\/?$/)
})

test('forgot password page is themed too', async ({ page }) => {
  await page.goto('/admin/forgot')
  expect(await font(page, 'body')).toContain('Geist')
})

test('public subscriber pages are left alone', async ({ page }) => {
  await page.goto('/subscription/form')
  expect(await font(page, 'body')).not.toContain('Geist')
})

test('unauthenticated /app redirects to login and returns after', async ({ page }) => {
  await page.goto('/app/')
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fapp%2F/)
})
