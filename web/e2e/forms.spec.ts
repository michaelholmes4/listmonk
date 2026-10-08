import { expect, test } from '@playwright/test'

test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
  page.on('console', (m) => {
    if (m.type() === 'error') throw new Error(m.text())
  })
})

test('forms: ticking a public list generates its embed HTML', async ({ page }) => {
  const name = `Form list <${Date.now()}>`
  const res = await page.request.post('/api/lists', { data: { name, type: 'public', optin: 'single' } })
  expect(res.ok()).toBeTruthy()
  const { id, uuid } = (await res.json()).data

  try {
    await page.goto('/admin/lists/forms')
    await expect(page.getByRole('heading', { name: 'Forms' })).toBeVisible()
    await expect(page.locator('[data-slot=skeleton]')).toHaveCount(0)

    // Nothing is generated until a list is ticked.
    await expect(page.locator('[data-cy=form] .cm-editor')).toHaveCount(0)
    await page.getByLabel(name).check()

    const editor = page.locator('[data-cy=form] .cm-content')
    await expect(editor).toContainText('<form method="post"')
    await expect(editor).toContainText(`value="${uuid}"`)
    // The name is HTML-escaped in the generated markup.
    await expect(editor).toContainText(name.replace('<', '&lt;').replace('>', '&gt;'))

    await page.getByLabel(name).uncheck()
    await expect(page.locator('[data-cy=form] .cm-editor')).toHaveCount(0)
  } finally {
    await page.request.delete(`/api/lists/${id}`)
  }
})
