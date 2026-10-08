import { expect, test } from '@playwright/test'

// Import state is global on the server; start every test from a clean slate.
test.beforeEach(async ({ page }) => {
  await page.request.delete('/api/import/subscribers')
  page.on('pageerror', (e) => {
    throw e
  })
  page.on('console', (m) => {
    if (m.type() === 'error') throw new Error(m.text())
  })
})

test('import: CSV into a preselected list, progress, then done', async ({ page }) => {
  const tag = `imp${Date.now()}`
  const res = await page.request.post('/api/lists', { data: { name: `Import ${tag}`, type: 'private', optin: 'single' } })
  const listId = (await res.json()).data.id

  try {
    // "Import" on a list row passes ?list_id=; the list is preselected.
    await page.goto(`/admin/subscribers/import?list_id=${listId}`)
    await expect(page.getByRole('heading', { name: 'Import subscribers' })).toBeVisible()
    await expect(page.getByText(`Import ${tag}`)).toBeVisible()

    const upload = page.getByRole('button', { name: 'Upload' })
    await expect(upload).toBeDisabled() // no file yet

    const csv = `email,name,attributes\n${tag}-a@example.com,"A","{""n"": 1}"\n${tag}-b@example.com,"B","{}"\n`
    await page.locator('input[type=file]').setInputFiles({ name: 'subs.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await expect(page.getByText('subs.csv')).toBeVisible()
    await upload.click()

    const status = page.locator('[data-cy=import-status]')
    await expect(status).toContainText(/finished/i)
    await expect(status).toContainText('2 / 2')
    await expect(status.locator('[data-cy=log]')).not.toBeEmpty()

    const subs = await page.request.get(`/api/subscribers?list_id=${listId}&per_page=all`)
    expect((await subs.json()).data.results).toHaveLength(2)

    // "Done" clears the finished import and brings the form back.
    await status.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('button', { name: 'Upload' })).toBeVisible()
  } finally {
    const subs = await page.request.get(`/api/subscribers?list_id=${listId}&per_page=all`)
    const ids: number[] = (await subs.json()).data.results.map((s: { id: number }) => s.id)
    if (ids.length) await page.request.delete(`/api/subscribers?${ids.map((i) => `id=${i}`).join('&')}`)
    await page.request.delete(`/api/lists/${listId}`)
  }
})

test('import: subscribe mode needs a list, blocklist mode does not', async ({ page }) => {
  await page.goto('/admin/subscribers/import')
  const csv = { name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from('email\na@example.com\n') }
  await page.locator('input[type=file]').setInputFiles(csv)
  await expect(page.getByRole('button', { name: 'Upload' })).toBeDisabled()

  await page.getByLabel('Blocklist').check()
  await expect(page.getByRole('button', { name: 'Upload' })).toBeEnabled()
  // Blocklist imports can only unsubscribe, and the list picker is gone.
  await expect(page.getByLabel('Unsubscribed')).toBeChecked()
  await expect(page.getByText('Lists to subscribe to.')).toHaveCount(0)
})
