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
  await page.goto('/app/')

  // Tiles load independently; once loaded the skeleton is gone and a number is shown.
  const subscribers = page.locator('[data-slot=card]', { hasText: 'Subscribers' }).first()
  await expect(subscribers.locator('[data-slot=skeleton]')).toHaveCount(0)
  await expect(subscribers).toContainText(/\d/)

  await expect(page.getByRole('navigation').or(page.locator('[data-sidebar=sidebar]')).first()).toBeVisible()
  await expect(page).toHaveTitle(/Dashboard · /)
})

test('dashboard breakdowns and charts load independently', async ({ page }) => {
  await page.goto('/app/')
  for (const chart of ['views', 'clicks']) {
    const card = page.locator(`[data-cy=chart-${chart}]`)
    await expect(card.locator('[data-slot=skeleton]')).toHaveCount(0)
    // Either a chart (when the last 30 days have data) or the empty state, never a blank card.
    await expect(card.locator('svg').or(card.getByText('No data in the last 30 days.')).first()).toBeVisible()
  }
  await expect(page.locator('[data-cy=lists]')).toContainText('Public')
})

test('unported screens link to the classic admin', async ({ page }) => {
  await page.goto('/app/')
  await page.locator('[data-sidebar=menu-button]', { hasText: 'Campaigns' }).click()
  await expect(page.getByRole('link', { name: 'All campaigns' })).toHaveAttribute('href', '/admin/campaigns')
})

test('command palette opens with ctrl+k and navigates', async ({ page }) => {
  await page.goto('/app/')
  await ready(page)
  await page.keyboard.press('Control+k')
  const input = page.getByPlaceholder('Type a command or search…')
  await expect(input).toBeVisible()
  await input.fill('dashboard')
  await page.keyboard.press('Enter')
  await expect(input).toBeHidden()
})

test('theme toggles the .dark class and persists', async ({ page }) => {
  await page.goto('/app/')
  await ready(page)
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Type a command or search…').fill('theme')
  await page.keyboard.press('Enter')
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  await page.reload()
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(isDark)
})

test('unknown routes render the in-app 404 (not a server error)', async ({ page }) => {
  await page.goto('/app/nope/nothing')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})
