import { expect, test, type Page } from '@playwright/test'

test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
  page.on('console', (m) => {
    if (m.type() === 'error') throw new Error(m.text())
  })
})

/** A throwaway list to send to, and a cleanup that removes campaigns made with `prefix` too. */
async function withList(page: Page) {
  const res = await page.request.post('/api/lists', { data: { name: `E2E camp list ${Date.now()}`, type: 'private', optin: 'single' } })
  const list = (await res.json()).data as { id: number; name: string }
  return list
}
async function cleanup(page: Page, prefix: string, listId: number) {
  const res = await page.request.get(`/api/campaigns?query=${encodeURIComponent(prefix)}&per_page=all&no_body=true`)
  for (const c of (await res.json()).data.results as { id: number; name: string }[]) {
    if (c.name.startsWith(prefix)) await page.request.delete(`/api/campaigns/${c.id}`)
  }
  await page.request.delete(`/api/lists/${listId}`)
}

async function pick(page: Page, trigger: ReturnType<Page['locator']>, option: string | RegExp) {
  await trigger.click()
  await page.getByRole('option', { name: option }).click()
}

test('campaigns: create, write HTML, save, preview, convert, delete', async ({ page }) => {
  const list = await withList(page)
  const name = `E2E camp ${Date.now()}`
  try {
    await page.goto('/app/campaigns')
    await expect(page.getByRole('heading', { name: /^Campaigns/ })).toBeVisible()
    await expect(page.locator('[data-slot=skeleton]')).toHaveCount(0)

    // Create: settings first, content after "Continue"
    await page.getByRole('button', { name: 'New' }).click()
    await expect(page).toHaveURL(/\/campaigns\/new$/)
    await expect(page.getByRole('heading', { name: 'New campaign' })).toBeVisible()
    await page.getByLabel('Name', { exact: true }).fill(name)
    await page.getByLabel('Subject').fill('Hello {{ .Subscriber.FirstName }}')
    await page.locator('[data-cy=campaign-picker], [role=combobox]').filter({ hasText: /lists/i }).first().click()
    await page.getByRole('option', { name: list.name }).click()
    await page.keyboard.press('Escape')
    await pick(page, page.locator('[data-cy=format]'), 'Raw HTML')
    await page.locator('[data-cy=btn-continue]').click()

    // Edit page, content tab: the body is empty until we write one
    await expect(page).toHaveURL(/\/campaigns\/\d+\?tab=content/)
    await expect(page.getByRole('navigation', { name: 'breadcrumb' }).getByText(name)).toBeVisible()
    await page.locator('.cm-content').fill('<h1>Big news</h1><p>Hello there</p>')
    await page.locator('[data-cy=btn-save]').click()
    await expect(page.getByText(`"${name}" updated`)).toBeVisible()

    // Preview shows the unsaved/saved body inside the chosen template
    await page.locator('[data-cy=btn-preview]').click()
    await expect(page.frameLocator('[data-cy=preview-frame]').getByText('Big news')).toBeVisible()
    await page.keyboard.press('Escape')

    // Switching format asks first, then converts
    await pick(page, page.locator('[data-cy=format]'), 'Markdown')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
    await expect(page.locator('.cm-content')).toContainText('Big news')
    await expect(page.locator('.cm-content')).not.toContainText('<h1>')

    // The list shows it, as a draft, with its list
    await page.goto('/app/campaigns')
    const row = page.getByRole('row', { name: new RegExp(name) })
    await expect(row).toContainText('Draft')
    await expect(row).toContainText(list.name)
  } finally {
    await cleanup(page, name, list.id)
  }
})

test('campaigns: schedule, unschedule, and the unsaved-changes guard', async ({ page }) => {
  const list = await withList(page)
  const name = `E2E sched ${Date.now()}`
  const created = await page.request.post('/api/campaigns', {
    data: { name, subject: 'S', lists: [list.id], content_type: 'html', body: '<p>x</p>', type: 'regular', messenger: 'email' },
  })
  const id = (await created.json()).data.id
  try {
    await page.goto(`/app/campaigns/${id}`)
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(name)

    // Unsaved edits: leaving asks, "cancel" stays put
    await page.getByLabel('Name', { exact: true }).fill(`${name} edited`)
    await page.getByRole('link', { name: 'Campaigns' }).first().click()
    await expect(page.getByRole('alertdialog')).toContainText('Discard')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(new RegExp(`/campaigns/${id}`))
    await page.getByLabel('Name', { exact: true }).fill(name)

    // Schedule: needs "send later" and a time; Start turns into Schedule
    await expect(page.locator('[data-cy=btn-start]')).toBeVisible()
    await page.locator('[data-cy=btn-send-later]').click()
    const future = new Date(Date.now() + 3 * 86400_000)
    const local = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}T10:00`
    await page.locator('[data-cy=send_at]').fill(local)
    await expect(page.locator('[data-cy=btn-schedule]')).toBeVisible()
    await page.locator('[data-cy=btn-schedule]').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Schedule campaign' }).click()
    await expect(page).toHaveURL(/\/app\/campaigns$/)
    const row = page.getByRole('row', { name: new RegExp(name) })
    await expect(row).toContainText('Scheduled')

    // Back on the edit page the content is locked-ish (scheduled is editable) and can be unscheduled
    await page.goto(`/app/campaigns/${id}`)
    await page.locator('[data-cy=btn-unschedule]').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible()
  } finally {
    await cleanup(page, name, list.id)
  }
})

test('campaigns: clone from the list, and analytics for it', async ({ page }) => {
  const list = await withList(page)
  const name = `E2E clone ${Date.now()}`
  const created = await page.request.post('/api/campaigns', {
    data: { name, subject: 'S', lists: [list.id], content_type: 'html', body: '<p>keep me</p>', type: 'regular', messenger: 'email', tags: ['e2e'] },
  })
  const id = (await created.json()).data.id
  try {
    await page.goto(`/app/campaigns?q=${encodeURIComponent(name)}`)
    const row = page.getByRole('row', { name: new RegExp(name) })
    await row.getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Clone' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Clone' }).click()

    // The clone opens on its own edit page with the body copied over
    await expect(page).toHaveURL(/\/campaigns\/\d+$/)
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(`Copy of ${name}`)
    await page.getByRole('tab', { name: 'Content' }).click()
    await expect(page.locator('.cm-content')).toContainText('keep me')

    // Analytics from the row menu: the campaign is preselected, cards render without errors
    await page.goto(`/app/campaigns?q=${encodeURIComponent(name)}`)
    // The clone sorts first and also matches the name; pick the original.
    await page.getByRole('row').filter({ hasText: name }).filter({ hasNotText: 'Copy of' }).getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Analytics' }).click()
    await expect(page).toHaveURL(/\/campaigns\/analytics\?id=/)
    await expect(page.getByText(`#${id}: ${name}`).first()).toBeVisible()
    await expect(page.locator('[data-cy="metric-Views"]')).toBeVisible()
    await expect(page.locator('[data-slot=skeleton]')).toHaveCount(0)
    await expect(page.locator('[data-cy="metric-links"]')).toBeVisible()
  } finally {
    await cleanup(page, name, list.id)
    await cleanup(page, `Copy of ${name}`, list.id).catch(() => {})
  }
})

test('campaigns: a test message carries the unsaved form, and arrives when SMTP is the dev catcher', async ({ page, request }) => {
  const list = await withList(page)
  const name = `E2E test-send ${Date.now()}`
  const to = `e2e-${Date.now()}@example.com`
  // The server only sends tests to existing subscribers.
  const sub = await page.request.post('/api/subscribers', { data: { email: to, name: 'E2E', status: 'enabled', lists: [] } })
  const subId = (await sub.json()).data.id
  const created = await page.request.post('/api/campaigns', {
    data: { name, subject: 'Saved subject', lists: [list.id], content_type: 'html', body: '<p>saved body</p>', type: 'regular', messenger: 'email' },
  })
  const id = (await created.json()).data.id
  try {
    await page.goto(`/app/campaigns/${id}`)
    // Edit without saving: the test message must carry what is in the form, not what is stored.
    const unsaved = `Unsaved subject ${Date.now()}`
    await page.getByLabel('Subject').fill(unsaved)

    const emails = page.getByLabel('E-mails')
    await emails.fill('not-an-email')
    await emails.press('Enter')
    await expect(page.getByText('Invalid email').first()).toBeVisible()
    await emails.fill(to)
    await emails.press('Enter')

    const sent = page.waitForRequest((r) => r.url().endsWith(`/api/campaigns/${id}/test`) && r.method() === 'POST')
    await page.locator('[data-cy=btn-test]').click()
    const body = (await sent).postDataJSON()
    expect(body.subject).toBe(unsaved)
    expect(body.subscribers).toEqual([to])
    await expect(page.getByText('Test message sent')).toBeVisible()
    // It was a send, not a save: the stored subject is untouched.
    expect((await (await page.request.get(`/api/campaigns/${id}`)).json()).data.subject).toBe('Saved subject')

    // Only when the app's SMTP is the dev catcher can delivery be observed.
    const smtp = (await (await page.request.get('/api/settings')).json()).data.smtp as { host: string; enabled: boolean }[]
    const mailpit = process.env.MAILPIT_URL ?? 'http://mailpit:8025'
    if (smtp.some((x) => x.enabled && x.host.includes('mailpit'))) {
      await expect
        .poll(
          async () => {
            const r = await request.get(`${mailpit}/api/v1/search`, { params: { query: `to:${to}` } })
            return r.ok() ? ((await r.json()).messages ?? []).map((m: { Subject: string }) => m.Subject) : []
          },
          { timeout: 20_000 },
        )
        .toContain(unsaved)
    }
  } finally {
    await page.request.delete(`/api/subscribers/${subId}`)
    await cleanup(page, name, list.id)
  }
})
