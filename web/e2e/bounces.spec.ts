import { expect, test, type Page, type Request } from '@playwright/test'

// There's no way to create bounce records in the dev stack without enabling bounce webhooks, so
// these tests mock the bounces API. What they pin down: filters, and that bulk actions always
// go out by explicit ID. The server's delete-all / blocklist-all ignore filters entirely.

test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
  page.on('console', (m) => {
    if (m.type() === 'error') throw new Error(m.text())
  })
})

const bounce = (id: number, sub: number, email: string, extra = {}) => ({
  id,
  type: 'hard',
  source: 'api',
  meta: { reason: `r${id}` },
  created_at: '2026-10-01T10:00:00Z',
  email,
  subscriber_id: sub,
  subscriber_status: 'enabled',
  campaign: null,
  ...extra,
})

const ROWS = [
  bounce(101, 7, 'one@example.com', { campaign: { id: 5, name: 'Autumn sale' } }),
  bounce(102, 8, 'two@example.com', { type: 'soft', source: 'ses' }),
  bounce(103, 9, 'three@example.com'),
]

/** Serves ROWS (2 per page, or all with per_page=all) and records every mutating request. */
async function mockBounces(page: Page) {
  const writes: Request[] = []
  await page.route((u) => u.pathname.startsWith('/api/bounces'), async (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      const u = new URL(req.url())
      const all = u.searchParams.get('per_page') === 'all'
      const src = u.searchParams.get('source')
      const rows = ROWS.filter((r) => !src || r.source === src)
      const results = all ? rows : rows.slice(0, 2)
      return route.fulfill({ json: { data: { results, total: rows.length, page: 1, per_page: 20 } } })
    }
    writes.push(req)
    return route.fulfill({ json: { data: true } })
  })
  await page.route((u) => u.pathname === '/api/subscribers/blocklist', async (route) => {
    writes.push(route.request())
    return route.fulfill({ json: { data: true } })
  })
  return writes
}

test('bounces: rows, details and filter chips', async ({ page }) => {
  await mockBounces(page)
  await page.goto('/admin/subscribers/bounces')
  await expect(page.getByRole('heading', { name: /^Bounces/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'one@example.com' })).toHaveAttribute('href', /\/admin\/subscribers\/7$/)

  // Details dialog shows the raw meta
  await page.getByRole('row', { name: /one@example.com/ }).getByRole('button', { name: 'Actions' }).click()
  await page.getByRole('menuitem', { name: 'Details' }).click()
  await expect(page.locator('[data-cy=bounce-meta]')).toContainText('"reason": "r101"')
  await page.keyboard.press('Escape')

  // Clicking a source filters by it (in the URL, so it survives reload) and shows a removable chip
  const filtered = page.waitForRequest((r) => r.url().includes('source=ses'))
  await page.getByRole('row', { name: /two@example.com/ }).getByRole('button', { name: 'ses' }).click()
  await filtered
  await expect(page).toHaveURL(/source=ses/)
  await expect(page.getByText('Source: ses')).toBeVisible()
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(page).not.toHaveURL(/source=/)
})

test('bounces: delete and blocklist go out by explicit IDs', async ({ page }) => {
  const writes = await mockBounces(page)
  await page.goto('/admin/subscribers/bounces')
  await page.getByRole('checkbox', { name: /select all/i }).first().click()
  await expect(page.getByText('2 selected')).toBeVisible()

  await page.getByRole('button', { name: 'Blocklist' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Blocklist' }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].method()).toBe('PUT')
  expect(writes[0].url()).toMatch(/\/api\/subscribers\/blocklist$/)
  expect(writes[0].postDataJSON()).toEqual({ ids: [7, 8] })

  await page.getByRole('checkbox', { name: /select all/i }).first().click()
  await page.getByRole('button', { name: 'Delete' }).first().click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect.poll(() => writes.length).toBe(2)
  expect(writes[1].method()).toBe('DELETE')
  expect(writes[1].url()).toContain('id=101')
  expect(writes[1].url()).toContain('id=102')
  expect(writes[1].url()).not.toContain('all=')
})

test('bounces: "select all N" resolves the filtered IDs instead of using delete-all', async ({ page }) => {
  const writes = await mockBounces(page)
  await page.goto('/admin/subscribers/bounces')
  await page.getByRole('checkbox', { name: /select all/i }).first().click()
  await page.getByRole('button', { name: 'Select all 3' }).click()
  await expect(page.getByText('3 selected')).toBeVisible()

  await page.getByRole('button', { name: 'Delete' }).first().click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect.poll(() => writes.length).toBe(1)
  const url = writes[0].url()
  for (const id of [101, 102, 103]) expect(url).toContain(`id=${id}`)
  expect(url).not.toContain('all=')
})
