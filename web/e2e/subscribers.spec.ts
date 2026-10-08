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

  await page.goto('/app/subscribers')
  await expect(page.getByRole('heading', { name: /^Subscribers/ })).toBeVisible()
  // First load shows skeleton rows inside the table only, then real rows.
  await expect(page.locator('[data-slot=skeleton]')).toHaveCount(0)

  // Create
  await page.getByRole('button', { name: 'New' }).click()
  await expect(page).toHaveURL(/\/subscribers\/new$/)
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('E-mail').fill(email)
  await sheet.getByLabel('Name').fill('E2E Person')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()

  // Search (debounced) finds exactly the new subscriber
  await page.getByPlaceholder('E-mail or name').fill(email)
  const row = page.getByRole('row', { name: new RegExp(email) })
  await expect(row).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(2) // header + 1

  // Edit via deep link keeps the table behind the sheet
  await row.getByRole('button', { name: email }).click()
  await expect(page).toHaveURL(/\/subscribers\/\d+$/)
  await expect(sheet.getByLabel('E-mail')).toHaveValue(email)
  await sheet.getByLabel('Name').fill('E2E Renamed')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
  await expect(row).toContainText('E2E Renamed')

  // Delete from the row menu
  await row.getByRole('button', { name: 'Actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('row', { name: new RegExp(email) })).toHaveCount(0)
})

test('subscribers: sorting and invalid attribute JSON', async ({ page }) => {
  await page.goto('/app/subscribers')
  await expect(page.locator('[data-slot=skeleton]')).toHaveCount(0)

  const sorted = page.waitForRequest((r) => r.url().includes('/api/subscribers?') && r.url().includes('order_by=email'))
  await page.getByRole('button', { name: 'E-mail' }).click()
  await sorted

  await page.getByRole('button', { name: 'New' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('E-mail').fill('bad-json@example.com')
  await sheet.getByLabel('Attributes').fill('[1,2]')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByText('Invalid JSON in attributes.')).toBeVisible()
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

  await page.goto('/app/subscribers')
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
