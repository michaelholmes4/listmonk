import { expect, test, type APIResponse } from '@playwright/test'

// The message log, against the real backend: a transactional email goes out through the dev SMTP
// (Mailpit), shows up in Sent messages with its status, and opens with the exact email.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over untyped JSON
async function data<T = any>(res: APIResponse): Promise<T> {
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()).data as T
}

test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
})

test('a sent transactional email is listed, filterable, and opens with its content', async ({ page, request }) => {
  test.skip((await request.get('/api/message-log')).status() === 404, 'backend without the message log')

  const stamp = Date.now()
  const to = `e2e-msg-${stamp}@example.com`
  const tpl = await data(
    await request.post('/api/templates', {
      data: { name: `E2E receipt ${stamp}`, type: 'tx', subject: `Receipt ${stamp}`, body: '<h1>Thanks for order {{ .Tx.Data.order }}</h1>' },
    }),
  )
  try {
    await data(
      await request.post('/api/tx', {
        data: { subscriber_email: to, subscriber_mode: 'external', template_id: tpl.id, data: { order: `A-${stamp}` } },
      }),
    )

    // Logging is asynchronous (batched), so give it a moment.
    await expect
      .poll(async () => (await data(await request.get(`/api/message-log?query=${to}`))).total, { timeout: 15_000 })
      .toBe(1)

    // Search by recipient.
    await page.goto(`/admin/messages?q=${encodeURIComponent(to)}`)
    const row = page.getByRole('row').filter({ hasText: to })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(`Receipt ${stamp}`)
    await expect(row).toContainText('Transactional')
    await expect(row).toContainText('Sent')

    // The status filter narrows it away and back.
    await page.goto(`/admin/messages?q=${encodeURIComponent(to)}&status=failed`)
    await expect(page.getByText('No results')).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page.getByRole('row').filter({ hasText: to })).toHaveCount(1)

    // Open it: the exact email, in a sandboxed frame.
    await page.getByRole('link', { name: `Receipt ${stamp}` }).click()
    await expect(page).toHaveURL(/\/admin\/messages\/\d+$/)
    await expect(page.locator('[data-cy=message-frame]').contentFrame().getByRole('heading', { name: `Thanks for order A-${stamp}` })).toBeVisible()
    await expect(page.locator('[data-cy=message-rerender-note]')).toHaveCount(0)
  } finally {
    await request.delete(`/api/templates/${tpl.id}`)
  }
})

test('a campaign email is rebuilt for the subscriber, and viewing it is not an open', async ({ page, request }) => {
  test.skip((await request.get('/api/message-log')).status() === 404, 'backend without the message log')

  const stamp = Date.now()
  const email = `e2e-camp-${stamp}@example.com`
  const list = await data(await request.post('/api/lists', { data: { name: `E2E msglog ${stamp}`, type: 'private', optin: 'single' } }))
  let campaignId = 0
  let subscriberId = 0
  try {
    const sub = await data(await request.post('/api/subscribers', { data: { email, name: 'Casey', status: 'enabled', lists: [list.id] } }))
    subscriberId = sub.id
    const camp = await data(
      await request.post('/api/campaigns', {
        data: {
          name: `E2E campaign ${stamp}`,
          subject: 'Hello {{ .Subscriber.FirstName }}',
          lists: [list.id],
          type: 'regular',
          content_type: 'richtext',
          body: '<p>Dear {{ .Subscriber.FirstName }}</p>',
          messenger: 'email',
          template_id: 1,
        },
      }),
    )
    campaignId = camp.id
    await data(await request.put(`/api/campaigns/${campaignId}/status`, { data: { status: 'running' } }))

    await expect
      .poll(async () => (await data(await request.get(`/api/message-log?campaign_id=${campaignId}`))).total, { timeout: 30_000 })
      .toBe(1)

    // From the campaign's row menu to its sent messages.
    await page.goto('/admin/campaigns')
    await page.getByRole('row').filter({ hasText: `E2E campaign ${stamp}` }).getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Sent messages' }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/messages\\?campaign_id=${campaignId}`))
    await expect(page.getByRole('row').filter({ hasText: email })).toHaveCount(1)
    await expect(page.locator('[data-cy=filter-campaign_id]')).toBeVisible()

    await page.getByRole('link', { name: 'Hello Casey' }).click()
    await expect(page.locator('[data-cy=message-rerender-note]')).toBeVisible()
    await expect(page.locator('[data-cy=message-frame]').contentFrame().getByText('Dear Casey')).toBeVisible()

    // Looking at the message never registers a view.
    const log = await data(await request.get(`/api/message-log?campaign_id=${campaignId}`))
    expect(log.results[0].opened).toBe(false)
    const views = await data(await request.get(`/api/subscribers/${subscriberId}/activity`))
    expect(views.campaign_views ?? []).toHaveLength(0)

    // And the subscriber's own page lists it.
    await page.goto(`/admin/subscribers/${subscriberId}`)
    await page.getByRole('tab', { name: 'Messages' }).click()
    await expect(page.getByRole('row').filter({ hasText: 'Hello Casey' })).toHaveCount(1)
  } finally {
    if (campaignId) {
      await request.put(`/api/campaigns/${campaignId}/status`, { data: { status: 'cancelled' } })
      await request.delete(`/api/campaigns/${campaignId}`)
    }
    if (subscriberId) await request.delete(`/api/subscribers/${subscriberId}`)
    await request.delete(`/api/lists/${list.id}`)
  }
})
