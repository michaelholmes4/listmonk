import { expect, test, type Page } from '@playwright/test'

const doc = (text: string) => ({
  root: { type: 'EmailLayout', data: { childrenIds: ['b1'] } },
  b1: { type: 'Heading', data: { props: { text, level: 'h1' }, style: { padding: { top: 16, bottom: 16, right: 24, left: 24 } } } },
})

async function setup(page: Page, data: Record<string, unknown>) {
  const l = await page.request.post('/api/lists', { data: { name: `E2E vis list ${Date.now()}`, type: 'private', optin: 'single' } })
  const list = (await l.json()).data
  const c = await page.request.post('/api/campaigns', {
    data: { name: `E2E visual ${Date.now()}`, subject: 'S', lists: [list.id], type: 'regular', messenger: 'email', ...data },
  })
  return { list, id: (await c.json()).data.id as number }
}
const get = async (page: Page, id: number) => (await (await page.request.get(`/api/campaigns/${id}`)).json()).data
const builder = (page: Page) => page.frameLocator('[data-cy=visual-editor] iframe')

test('visual: markdown converts to blocks, saves source+HTML, and reopens clean', async ({ page }) => {
  const { list, id } = await setup(page, { content_type: 'markdown', body: '# Hello visual\n\nsome text' })
  try {
    await page.goto(`/admin/campaigns/${id}?tab=content`)
    await page.locator('[data-cy=format]').click()
    await page.locator('[data-cy=check-visual]').click()
    await page.getByRole('button', { name: 'Confirm' }).click()
    await expect(builder(page).getByText('Hello visual').first()).toBeVisible({ timeout: 20_000 })

    await page.locator('[data-cy=btn-save]').click()
    await expect(page.getByText(/updated/).first()).toBeVisible()
    const c = await get(page, id)
    expect(c.content_type).toBe('visual')
    expect(c.body_source).toContain('Hello visual')
    expect(c.body).toContain('Hello visual')

    // Reopening shows the saved document, and merely opening it is not an edit.
    await page.reload()
    await expect(builder(page).getByText('Hello visual').first()).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1500)
    await expect(page.locator('[data-cy=btn-save]')).toBeDisabled()
  } finally {
    await page.request.delete(`/api/campaigns/${id}`)
    await page.request.delete(`/api/lists/${list.id}`)
  }
})

test('visual: import a visual template replaces the content', async ({ page }) => {
  const name = `E2E visual tpl ${Date.now()}`
  const tpl = (
    await (
      await page.request.post('/api/templates', {
        data: { name, type: 'campaign_visual', subject: '', body: '<h1>Imported heading</h1>', body_source: JSON.stringify(doc('Imported heading')) },
      })
    ).json()
  ).data
  const { list, id } = await setup(page, { content_type: 'visual', body: '<p>old</p>', body_source: JSON.stringify(doc('Old heading')) })
  try {
    await page.goto(`/admin/campaigns/${id}?tab=content`)
    await expect(builder(page).getByText('Old heading').first()).toBeVisible({ timeout: 20_000 })

    await page.locator('[data-cy=btn-select-visual-tpl]').click()
    await page.locator('[data-cy=import-visual-tpl] [role=combobox]').click()
    await page.getByRole('option', { name }).click()
    await page.locator('[data-cy=btn-save-visual-tpl]').click()
    await page.getByRole('button', { name: 'Confirm' }).click()
    await expect(builder(page).getByText('Imported heading').first()).toBeVisible({ timeout: 20_000 })

    await page.locator('[data-cy=btn-save]').click()
    await expect(page.getByText(/updated/).first()).toBeVisible()
    expect((await get(page, id)).body_source).toContain('Imported heading')
  } finally {
    await page.request.delete(`/api/campaigns/${id}`)
    await page.request.delete(`/api/lists/${list.id}`)
    await page.request.delete(`/api/templates/${tpl.id}`)
  }
})

test('visual templates: edit in the builder page, preview, and saving keeps the document', async ({ page }) => {
  const name = `E2E visual edit ${Date.now()}`
  const tpl = (
    await (
      await page.request.post('/api/templates', {
        data: { name, type: 'campaign_visual', subject: '', body: '<h1>Tpl heading</h1>', body_source: JSON.stringify(doc('Tpl heading')) },
      })
    ).json()
  ).data
  try {
    await page.goto(`/admin/campaigns/templates/${tpl.id}`)
    await expect(builder(page).getByText('Tpl heading').first()).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: /Preview/ }).click()
    await expect(page.frameLocator('[data-cy=preview-frame]').getByText('Tpl heading').first()).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByLabel('Name', { exact: true }).fill(`${name} renamed`)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(/\/campaigns\/templates$/)
    const saved = (await (await page.request.get(`/api/templates/${tpl.id}`)).json()).data
    expect(saved.name).toBe(`${name} renamed`)
    expect(saved.body_source).toContain('Tpl heading')
    expect(saved.body).toContain('Tpl heading')
  } finally {
    await page.request.delete(`/api/templates/${tpl.id}`)
  }
})

test('visual templates: a new one starts from the builder', async ({ page }) => {
  await page.goto('/admin/campaigns/templates/new')
  await page.getByLabel('Type').click()
  await page.getByRole('option', { name: /visual/i }).click()
  await expect(page.locator('[data-cy=visual-editor] iframe')).toBeVisible()
  await expect(builder(page).locator('#visual-editor-container *').first()).toBeAttached({ timeout: 20_000 })
})
