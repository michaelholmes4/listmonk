import { expect, test } from '@playwright/test'

test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
  page.on('console', (m) => {
    if (m.type() === 'error') throw new Error(m.text())
  })
})

// 1x1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

test('media: upload several files, search, delete', async ({ page }) => {
  const tag = `e2emedia${Date.now()}`
  await page.goto('/admin/campaigns/media')
  await expect(page.getByRole('heading', { name: /^Media/ })).toBeVisible()
  await expect(page.locator('[data-slot=skeleton]')).toHaveCount(0)

  if (!(await page.locator('[data-cy=upload]').isVisible())) await page.getByRole('button', { name: 'Upload' }).click()
  await page.locator('input[type=file]').setInputFiles([
    { name: `${tag}-a.png`, mimeType: 'image/png', buffer: PNG },
    { name: `${tag}-b.png`, mimeType: 'image/png', buffer: PNG },
  ])
  await expect(page.getByText(`${tag}-a.png`)).toBeVisible()
  await page.locator('[data-cy=upload]').getByRole('button', { name: 'Upload' }).click()

  // Search narrows the gallery to exactly the two uploads (and shows thumbnails)
  await page.getByLabel('Media', { exact: true }).fill(tag)
  await page.getByLabel('Media', { exact: true }).press('Enter')
  await expect(page).toHaveURL(new RegExp(`q=${tag}`))
  const items = page.locator('[data-cy=media-item]')
  await expect(items).toHaveCount(2)
  await expect(items.first().locator('img')).toBeVisible()

  // Delete each from the gallery
  for (let left = 2; left > 0; left--) {
    await items.first().hover()
    await items.first().getByRole('button', { name: /Delete/ }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(items).toHaveCount(left - 1)
  }
})
