import { expect, test } from '@playwright/test'

// Any console error or uncaught exception during a test is a failure.
test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
  page.on('console', (m) => {
    if (m.type() === 'error') throw new Error(m.text())
  })
})

test('subscribers: create, search, edit, delete', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`

  await page.goto('/admin/subscribers')
  await expect(page.getByRole('heading', { name: /^Subscribers/ })).toBeVisible()
  // First load shows skeleton rows inside the table only, then real rows.
  await expect(page.locator('[data-slot=skeleton]')).toHaveCount(0)

  // Create
  await page.getByRole('button', { name: 'New' }).click()
  await expect(page).toHaveURL(/\/subscribers\/new$/)
  await expect(page.getByRole('heading', { name: 'New subscriber' })).toBeVisible()
  await page.getByLabel('E-mail', { exact: true }).fill(email)
  await page.getByLabel('Name', { exact: true }).fill('E2E Person')
  await page.getByRole('button', { name: 'Save' }).click()
  // Saving goes back to the table.
  await expect(page).toHaveURL(/\/admin\/subscribers$/)

  // Search (debounced) finds exactly the new subscriber
  await page.getByPlaceholder('E-mail or name').fill(email)
  const row = page.getByRole('row', { name: new RegExp(email) })
  await expect(row).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(2) // header + 1

  // Edit page: breadcrumb names the subscriber, and going back keeps the search
  await row.getByRole('button', { name: email }).click()
  await expect(page).toHaveURL(/\/subscribers\/\d+$/)
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue(email)
  await expect(page.getByRole('navigation', { name: 'breadcrumb' }).getByText(email)).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill('E2E Renamed')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/admin\/subscribers\?q=/)
  await expect(page.getByPlaceholder('E-mail or name')).toHaveValue(email)
  await expect(row).toContainText('E2E Renamed')

  // Delete from the row menu
  await row.getByRole('button', { name: 'Actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('row', { name: new RegExp(email) })).toHaveCount(0)
})

test('subscribers: sorting and invalid attribute JSON', async ({ page }) => {
  await page.goto('/admin/subscribers')
  await expect(page.locator('[data-slot=skeleton]')).toHaveCount(0)

  const sorted = page.waitForRequest((r) => r.url().includes('/api/subscribers?') && r.url().includes('order_by=email'))
  await page.getByRole('button', { name: 'E-mail' }).click()
  await sorted

  await page.getByRole('button', { name: 'New' }).click()
  await page.getByLabel('E-mail', { exact: true }).fill('bad-json@example.com')
  await page.getByLabel('Attributes').fill('[1,2]')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Invalid JSON in attributes.')).toBeVisible()
  await expect(page).toHaveURL(/\/subscribers\/new$/)
})

test('subscribers: bulk blocklist then delete the selection', async ({ page }) => {
  const tag = `bulk${Date.now()}`
  for (const i of [1, 2]) {
    const res = await page.request.post('/api/subscribers', {
      data: { email: `${tag}-${i}@example.com`, name: tag, status: 'enabled', lists: [] },
    })
    expect(res.ok()).toBeTruthy()
  }

  await page.goto('/admin/subscribers')
  await page.getByPlaceholder('E-mail or name').fill(tag)
  await expect(page.getByRole('row')).toHaveCount(3) // header + 2

  await page.getByRole('checkbox', { name: /select all/i }).first().click()
  await expect(page.getByText('2 selected')).toBeVisible()

  // Blocklist
  await page.getByRole('button', { name: 'Blocklisted' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('alertdialog')).toBeHidden()
  await expect(page.getByText('Blocklisted', { exact: true })).toHaveCount(2)

  // Delete
  await page.getByRole('checkbox', { name: /select all/i }).first().click()
  await page.getByRole('button', { name: 'Delete' }).first().click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('row')).toHaveCount(2) // header + empty-state row
  await expect(page.getByText('Nothing to show.')).toBeVisible()
})

test('subscribers: sort order really flips (server accepts lowercase asc/desc only)', async ({ page }) => {
  const tag = `sort${Date.now()}`
  for (const p of ['aaa', 'zzz']) {
    const res = await page.request.post('/api/subscribers', {
      data: { email: `${p}-${tag}@example.com`, name: tag, status: 'enabled', lists: [] },
    })
    expect(res.ok()).toBeTruthy()
  }

  try {
    await page.goto(`/admin/subscribers?q=${tag}`)
    const emails = page.getByRole('row').getByRole('button', { name: /@example\.com$/ })
    await expect(emails).toHaveCount(2)

    await page.getByRole('button', { name: 'E-mail' }).click() // first click: ascending
    await expect(page).toHaveURL(/sort=email:asc/)
    await expect(emails.first()).toContainText('aaa-')

    await page.getByRole('button', { name: 'E-mail' }).click() // second click: descending
    await expect(page).toHaveURL(/sort=email:desc/)
    await expect(emails.first()).toContainText('zzz-')
  } finally {
    const res = await page.request.get(`/api/subscribers?search=${tag}&per_page=all`)
    const ids: number[] = (await res.json()).data.results.map((s: { id: number }) => s.id)
    if (ids.length) await page.request.delete(`/api/subscribers?${ids.map((i) => `id=${i}`).join('&')}`)
  }
})

test('subscribers: "select all N" acts on every match, not just the visible page', async ({ page }) => {
  const tag = `byquery${Date.now()}`
  for (const i of [1, 2, 3]) {
    const res = await page.request.post('/api/subscribers', { data: { email: `${tag}-${i}@example.com`, name: tag, status: 'enabled', lists: [] } })
    expect(res.ok()).toBeTruthy()
  }
  const matching = async () => (await (await page.request.get(`/api/subscribers?query=${encodeURIComponent(`subscribers.name='${tag}'`)}&per_page=all`)).json()).data.results as { status: string }[]

  // Two rows a page, three matches: the third is only reached by "select all".
  await page.goto(`/admin/subscribers?q=${tag}&size=2`)
  await expect(page.getByRole('row')).toHaveCount(3)
  await page.getByRole('checkbox', { name: /select all/i }).first().click()
  await expect(page.getByText('2 selected')).toBeVisible()
  await page.getByRole('button', { name: /select all 3/i }).click()
  await expect(page.getByText('3 selected')).toBeVisible()

  await page.getByRole('button', { name: 'Blocklisted' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('alertdialog')).toBeHidden()
  await expect.poll(async () => (await matching()).map((s) => s.status)).toEqual(['blocklisted', 'blocklisted', 'blocklisted'])

  await page.getByRole('checkbox', { name: /select all/i }).first().click()
  await page.getByRole('button', { name: /select all 3/i }).click()
  await page.getByRole('button', { name: 'Delete' }).first().click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
  await expect.poll(async () => (await matching()).length).toBe(0)
})
