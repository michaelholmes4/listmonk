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
  await page.goto('/admin/login?next=/admin/')
  expect(await font(page, 'body')).toContain('Geist')

  await page.fill('input[name=username]', 'admin')
  await page.fill('input[name=password]', 'definitely-wrong-password')
  await page.click('button[type=submit]')
  await expect(page.locator('.error')).toBeVisible()
  // `next` survives a failed attempt, so a successful retry still lands in the new UI.
  await expect(page.locator('input[name=next]')).toHaveValue(/^\/admin\/?$/)
})

test('forgot password page is themed too', async ({ page }) => {
  await page.goto('/admin/forgot')
  expect(await font(page, 'body')).toContain('Geist')
})

test('login page follows the light/dark choice saved by the admin UI', async ({ page }) => {
  const bg = () => page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor)
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/admin/login')
  const systemDark = await bg()

  await page.evaluate(() => localStorage.setItem('librelist-theme', 'light'))
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-librelist-theme', 'light')
  expect(await bg()).not.toBe(systemDark)

  await page.emulateMedia({ colorScheme: 'light' })
  await page.evaluate(() => localStorage.setItem('librelist-theme', 'dark'))
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-librelist-theme', 'dark')
  expect(await bg()).toBe(systemDark)
})

test('public subscriber pages are left alone', async ({ page }) => {
  await page.goto('/subscription/form')
  expect(await font(page, 'body')).not.toContain('Geist')
})

test('unauthenticated /admin redirects to login and returns after', async ({ page }) => {
  await page.goto('/admin/')
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2F/)
})

test.describe('signed in', () => {
  test.use({ storageState: 'e2e/.auth/state.json' })

  test('the old /app address redirects to /admin, keeping the path and query', async ({ request }) => {
    const res = await request.get('/app/campaigns?q=x', { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(res.headers().location).toBe('/admin/campaigns?q=x')
  })
})
