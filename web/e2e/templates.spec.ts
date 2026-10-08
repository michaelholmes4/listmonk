import { expect, test } from '@playwright/test'

test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
  page.on('console', (m) => {
    // The 400 from saving a template without the placeholder is the expected path of one test.
    if (m.type() === 'error' && !m.text().includes('status of 400')) throw new Error(m.text())
  })
})

const BODY = '<div class="wrap">{{ template "content" . }}</div>'

async function cleanup(page: import('@playwright/test').Page, prefix: string) {
  const res = await page.request.get('/api/templates?no_body=true')
  for (const t of (await res.json()).data as { id: number; name: string; is_default: boolean }[]) {
    if (t.name.startsWith(prefix) && !t.is_default) await page.request.delete(`/api/templates/${t.id}`)
  }
}

test('templates: create, validate, preview, clone, delete', async ({ page }) => {
  const name = `E2E tpl ${Date.now()}`
  try {
    await page.goto('/admin/campaigns/templates')
    await expect(page.getByRole('heading', { name: /^Templates/ })).toBeVisible()
    await expect(page.locator('[data-slot=skeleton]')).toHaveCount(0)

    await page.getByRole('button', { name: 'New' }).click()
    await expect(page).toHaveURL(/\/templates\/new$/)
    await page.getByLabel('Name', { exact: true }).fill(name)

    // A campaign template without the placeholder is rejected by the server and we stay put.
    await page.locator('.cm-content').fill('<p>no placeholder</p>')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(/should appear exactly once/).first()).toBeVisible()
    await expect(page).toHaveURL(/\/templates\/new$/)

    await page.locator('.cm-content').fill(BODY)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(/\/campaigns\/templates$/)

    const row = page.getByRole('row', { name: new RegExp(name) })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Campaign / HTML')

    // Preview renders the template around dummy content, in a sandboxed frame
    await row.getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Preview' }).click()
    const frame = page.frameLocator('[data-cy=preview-frame]')
    await expect(frame.locator('.wrap')).toContainText('Hi there')
    await page.keyboard.press('Escape')

    // Clone through the prompt
    await row.getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Clone' }).click()
    await page.getByLabel('Name', { exact: true }).fill(`${name} copy`)
    await page.getByRole('dialog').getByRole('button', { name: 'Clone' }).click()
    await expect(page.getByRole('row', { name: new RegExp(`${name} copy`) })).toBeVisible()

    // Edit page: breadcrumb names it, the body is loaded, the type can't be changed
    await page.getByRole('link', { name, exact: true }).click()
    await expect(page.getByRole('navigation', { name: 'breadcrumb' }).getByText(name)).toBeVisible()
    await expect(page.locator('.cm-content')).toContainText('{{ template "content" . }}')
    await expect(page.getByRole('combobox').first()).toBeDisabled()
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Delete the clone
    const copy = page.getByRole('row', { name: new RegExp(`${name} copy`) })
    await copy.getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(copy).toHaveCount(0)
  } finally {
    await cleanup(page, name)
  }
})

test('templates: the default template cannot be deleted, and "set default" moves the badge', async ({ page }) => {
  const list = await (await page.request.get('/api/templates?no_body=true')).json()
  const original = (list.data as { id: number; type: string; is_default: boolean }[]).find((t) => t.is_default)!
  const name = `E2E default ${Date.now()}`
  const created = await page.request.post('/api/templates', { data: { name, type: 'campaign', body: BODY } })
  const id = (await created.json()).data.id

  try {
    await page.goto('/admin/campaigns/templates')
    const defaultRow = page.getByRole('row').filter({ hasText: 'Default' }).first()
    await defaultRow.getByRole('button', { name: 'Actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0)
    await page.keyboard.press('Escape')

    const row = page.getByRole('row', { name: new RegExp(name) })
    await row.getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Set default' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
    await expect(row).toContainText('Default')
  } finally {
    // Put the original default back before deleting ours.
    await page.request.put(`/api/templates/${original.id}/default`)
    await page.request.delete(`/api/templates/${id}`)
  }
})
