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

test('lists: create, edit, archive, delete', async ({ page }) => {
  const name = `E2E list ${Date.now()}`

  await page.goto('/app/lists')
  await expect(page.getByRole('heading', { name: /^Lists/ })).toBeVisible()
  await expect(page.locator('[data-slot=skeleton]')).toHaveCount(0)

  // Create a public double opt-in list with a tag
  await page.getByRole('button', { name: 'New' }).click()
  await expect(page).toHaveURL(/\/lists\/new$/)
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Name').fill(name)
  await sheet.getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'Public' }).click()
  await sheet.getByRole('combobox').nth(1).click()
  await page.getByRole('option', { name: 'Double opt-in' }).click()
  await sheet.getByPlaceholder('Tags').fill('e2e')
  await sheet.getByPlaceholder('Tags').press('Enter')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()

  // Search finds it, with its badges and the opt-in campaign shortcut
  await page.getByLabel('Name', { exact: true }).fill(name.replace(/\d+$/, ''))
  await page.getByLabel('Name', { exact: true }).press('Enter')
  const row = page.getByRole('row', { name: new RegExp(name) })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Public')
  await expect(row).toContainText('Double opt-in')
  await expect(row).toContainText('e2e')
  await expect(row.getByRole('button', { name: 'Send opt-in campaign' })).toBeVisible()

  // Edit deep link
  await row.getByRole('button', { name }).click()
  await expect(page).toHaveURL(/\/lists\/\d+$/)
  await expect(sheet.getByLabel('Name')).toHaveValue(name)

  // Archive: it leaves the active view and shows in the archived one
  await sheet.getByRole('switch').click()
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0)

  await page.getByRole('link', { name: /view archived/i }).click()
  await expect(page).toHaveURL(/status=archived/)
  const archived = page.getByRole('row', { name: new RegExp(name) })
  await expect(archived).toBeVisible()

  // Delete from the row menu
  await archived.getByRole('button', { name: 'Actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0)
})

test('lists: bulk delete only removes the selected lists', async ({ page }) => {
  const tag = `bulklist${Date.now()}`
  const ids: number[] = []
  for (const i of [1, 2]) {
    const res = await page.request.post('/api/lists', { data: { name: `${tag} ${i}`, type: 'private', optin: 'single' } })
    expect(res.ok()).toBeTruthy()
    ids.push((await res.json()).data.id)
  }
  const keep = await page.request.post('/api/lists', { data: { name: `${tag} keep`, type: 'private', optin: 'single' } })
  const keepId = (await keep.json()).data.id

  await page.goto('/app/lists')
  await page.getByLabel('Name', { exact: true }).fill(tag)
  await page.getByLabel('Name', { exact: true }).press('Enter')
  await expect(page.getByRole('row')).toHaveCount(4) // header + 3

  // Tick just the first two
  const rows = page.getByRole('row')
  await rows.nth(1).getByRole('checkbox').click()
  await rows.nth(2).getByRole('checkbox').click()
  await expect(page.getByText('2 selected')).toBeVisible()
  await page.getByRole('button', { name: 'Delete' }).first().click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('alertdialog')).toBeHidden()
  await expect(page.getByRole('row')).toHaveCount(2) // header + the one we kept

  // Clean up the survivor
  const del = await page.request.delete(`/api/lists/${keepId}`)
  expect(del.ok()).toBeTruthy()
})
