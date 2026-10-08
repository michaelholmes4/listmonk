import { expect, test, type Page } from '@playwright/test'

test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
  page.on('console', (m) => {
    if (m.type() === 'error') throw new Error(m.text())
  })
})

async function setup(page: Page, body: string) {
  const l = await page.request.post('/api/lists', { data: { name: `E2E rt list ${Date.now()}`, type: 'private', optin: 'single' } })
  const list = (await l.json()).data
  const c = await page.request.post('/api/campaigns', {
    data: { name: `E2E richtext ${Date.now()}`, subject: 'S', lists: [list.id], content_type: 'richtext', body, type: 'regular', messenger: 'email' },
  })
  return { list, id: (await c.json()).data.id as number }
}
async function teardown(page: Page, id: number, listId: number) {
  await page.request.delete(`/api/campaigns/${id}`)
  await page.request.delete(`/api/lists/${listId}`)
}
const saved = async (page: Page, id: number) => (await (await page.request.get(`/api/campaigns/${id}`)).json()).data.body as string

test('richtext: type, save with Ctrl+S inside the editor, edit the source', async ({ page }) => {
  const { list, id } = await setup(page, '<p>hello</p>')
  try {
    await page.goto(`/app/campaigns/${id}?tab=content`)
    const frame = page.frameLocator('iframe.tox-edit-area__iframe')
    await expect(frame.locator('body')).toContainText('hello')

    await frame.locator('body').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' world from tinymce')
    // The shortcut is registered on the editor: the page itself never sees keys typed in the frame.
    await page.keyboard.press('Control+s')
    await expect(page.getByText(/updated/).first()).toBeVisible()
    expect(await saved(page, id)).toContain('world from tinymce')

    // Source dialog edits the HTML and applies it to the editor
    await page.getByRole('button', { name: 'Source code' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('.cm-content').fill('<h2>From source</h2>')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(frame.locator('h2')).toHaveText('From source')
  } finally {
    await teardown(page, id, list.id)
  }
})

test('richtext: a tracked link is stored with the @TrackLink suffix and reads back as tracked', async ({ page }) => {
  const { list, id } = await setup(page, '<p>visit our site</p>')
  try {
    await page.goto(`/app/campaigns/${id}?tab=content`)
    const frame = page.frameLocator('iframe.tox-edit-area__iframe')
    await expect(frame.locator('body')).toContainText('visit our site')
    await frame.locator('body').click()
    await page.keyboard.press('Control+a')

    await page.getByRole('button', { name: 'Insert/edit link' }).click()
    const dlg = page.getByRole('dialog', { name: 'Insert/Edit Link' })
    await dlg.getByLabel('URL').fill('https://example.com/page')
    await dlg.getByText('Track link?').click()
    await dlg.getByRole('button', { name: 'Save' }).click()

    await page.locator('[data-cy=btn-save]').click()
    await expect(page.getByText(/updated/).first()).toBeVisible()
    expect(await saved(page, id)).toMatch(/href="https:\/\/example\.com\/page@TrackLink"/)

    // Reopening the link dialog shows the clean URL with the box ticked.
    await frame.locator('a').click()
    await page.getByRole('button', { name: 'Insert/edit link' }).click()
    const again = page.getByRole('dialog', { name: 'Insert/Edit Link' })
    await expect(again.getByLabel('URL')).toHaveValue('https://example.com/page')
    await expect(again.getByLabel('Track link?')).toBeChecked()
    await again.getByRole('button', { name: 'Cancel' }).click()
  } finally {
    await teardown(page, id, list.id)
  }
})

test('richtext: switching the theme rebuilds the editor with the matching skin', async ({ page }) => {
  const { list, id } = await setup(page, '<p>themed</p>')
  try {
    await page.goto(`/app/campaigns/${id}?tab=content`)
    await expect(page.locator('.tox-tinymce')).toBeVisible()
    const light = await page.evaluate(() => document.getElementById('tinymce-skin')?.textContent?.length ?? 0)

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.evaluate(() => localStorage.setItem('librelist-theme', 'dark'))
    await page.reload()
    await expect(page.locator('.tox-tinymce')).toBeVisible()
    const dark = await page.evaluate(() => document.getElementById('tinymce-skin')?.textContent?.length ?? 0)
    expect(light).toBeGreaterThan(0)
    expect(dark).toBeGreaterThan(0)
    expect(dark).not.toBe(light)
    await page.evaluate(() => localStorage.setItem('librelist-theme', 'light'))
  } finally {
    await teardown(page, id, list.id)
  }
})
