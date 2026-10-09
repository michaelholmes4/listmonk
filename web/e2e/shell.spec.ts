import { expect, test, type Page } from '@playwright/test'

// Any console error or uncaught exception during a test is a failure.
test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
  page.on('console', (m) => {
    if (m.type() === 'error') throw new Error(m.text())
  })
})

const ready = (page: Page) => page.locator('[data-sidebar=sidebar]').first().waitFor()

test('dashboard shows counts and the shell renders', async ({ page }) => {
  await page.goto('/admin/')

  // Tiles load independently; once loaded the skeleton is gone and a number is shown.
  const subscribers = page.locator('[data-slot=card]', { hasText: 'Subscribers' }).first()
  await expect(subscribers.locator('[data-slot=skeleton]')).toHaveCount(0)
  await expect(subscribers).toContainText(/\d/)

  await expect(page.getByRole('navigation').or(page.locator('[data-sidebar=sidebar]')).first()).toBeVisible()
  await expect(page).toHaveTitle(/Dashboard · /)
})

test('dashboard breakdowns and charts load independently', async ({ page }) => {
  await page.goto('/admin/')
  for (const chart of ['views', 'clicks']) {
    const card = page.locator(`[data-cy=chart-${chart}]`)
    await expect(card.locator('[data-slot=skeleton]')).toHaveCount(0)
    // Either a chart (when the last 30 days have data) or the empty state, never a blank card.
    await expect(card.locator('svg').or(card.getByText('No data in the last 30 days.')).first()).toBeVisible()
  }
  await expect(page.locator('[data-cy=lists]')).toContainText('Public')
})

test('every sidebar entry is a screen of this app, none hands off to the classic admin', async ({ page }) => {
  await page.goto('/admin/')
  await ready(page)
  // Every destination is visible at once: no collapsed groups to open first.
  for (const section of ['Audience', 'Messaging', 'Administration']) {
    await expect(page.locator('[data-sidebar=group-label]', { hasText: section })).toBeVisible()
  }
  const links = await page.locator('[data-sidebar=sidebar] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  expect(links.length).toBeGreaterThan(10)
  expect(links.filter((h) => !h?.startsWith('/admin/'))).toEqual([])
})

test('the sidebar entry stays highlighted on detail and create pages', async ({ page }) => {
  await page.goto('/admin/campaigns/new')
  await ready(page)
  await expect(page.locator('[data-cy=nav-campaigns]')).toHaveAttribute('data-active', 'true')
  await page.goto('/admin/lists/new')
  await expect(page.locator('[data-cy=nav-lists]')).toHaveAttribute('data-active', 'true')
  await expect(page.locator('[data-cy=nav-campaigns]')).not.toHaveAttribute('data-active', 'true')
})

test('command palette opens with ctrl+k and navigates', async ({ page }) => {
  await page.goto('/admin/')
  await ready(page)
  await page.keyboard.press('Control+k')
  const input = page.getByPlaceholder('Type a command or search…')
  await expect(input).toBeVisible()
  await input.fill('dashboard')
  await page.keyboard.press('Enter')
  await expect(input).toBeHidden()
})

test('theme toggles the .dark class and persists', async ({ page }) => {
  await page.goto('/admin/')
  await ready(page)
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Type a command or search…').fill('theme')
  await page.keyboard.press('Enter')
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  await page.reload()
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(isDark)
})

test('unknown routes render the in-app 404 (not a server error)', async ({ page }) => {
  await page.goto('/admin/nope/nothing')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

test('the refresh button refetches what the page shows', async ({ page }) => {
  await page.goto('/admin/')
  await expect(page.getByRole('link', { name: 'Dashboard' }).first()).toBeVisible()
  const counts = page.waitForRequest((r) => r.url().includes('/api/dashboard/counts'), { timeout: 15_000 })
  await page.locator('[data-cy=btn-refresh]').click()
  await counts
})
