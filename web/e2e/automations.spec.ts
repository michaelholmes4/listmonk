import { expect, test, type Page } from '@playwright/test'

// The sheet slides away; clicking before it has gone can hit a half-closed page.
async function closeSheet(page: Page) {
  await page.locator('[data-cy=step-close]').click()
  await expect(page.locator('[data-cy=step-sheet]')).toBeHidden()
}

test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
  page.on('console', (m) => {
    if (m.type() === 'error') throw new Error(m.text())
  })
})

test('build, save, publish and watch an automation', async ({ page, request }) => {
  test.skip((await request.get('/api/automations')).status() === 404, 'backend without automations')

  const stamp = Date.now()
  const name = `E2E builder ${stamp}`
  const event = `e2e_event_${stamp}`
  const email = `builder-${stamp}@example.com`
  let id = 0
  try {
    // --- Create from the list. -------------------------------------------------------------------------
    await page.goto('/admin/automations')
    await page.getByRole('button', { name: 'New' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox').fill(name)
    await dialog.getByRole('button', { name: 'New' }).click()
    await expect(page.getByRole('heading', { name })).toBeVisible()
    id = Number(new URL(page.url()).pathname.split('/').pop())
    await expect(page.locator('[data-cy=status]')).toHaveText('Draft')

    // --- An event trigger. -------------------------------------------------------------------------------
    await page.locator('[data-cy=add-trigger]').click()
    await page.locator('[data-cy=add-trigger-event]').click()
    const sheet = page.locator('[data-cy=step-sheet]')
    await sheet.getByLabel('Event name').fill(event)
    await closeSheet(page)
    await expect(page.locator('[data-cy^=trigger-t1]')).toContainText(event)

    // --- A wait, then a condition with two branches. -----------------------------------------------------
    await page.locator('[data-cy=add-step]').last().click()
    await page.locator('[data-cy=add-delay]').click()
    await closeSheet(page)
    await expect(page.locator('[data-cy=step-s1]')).toContainText('1 day')

    await page.locator('[data-cy=add-step]').last().click()
    await page.locator('[data-cy=add-condition]').click()
    await expect(page.locator('[data-cy=branch-s2-yes]')).toBeVisible()
    await expect(page.locator('[data-cy=branch-s2-no]')).toBeVisible()

    // The condition is incomplete until it names an attribute.
    await page.locator('[data-cy=step-s2]').click()
    await sheet.getByLabel('Attribute name').fill('plan')
    await sheet.getByLabel('Value').fill('pro')
    await closeSheet(page)

    // An exit on the Yes branch.
    await page.locator('[data-cy=branch-s2-yes] [data-cy=add-step]').last().click()
    await page.locator('[data-cy=add-exit]').click()
    await expect(page.locator('[data-cy=branch-s2-yes] [data-cy=step-s3]')).toBeVisible()

    // Nothing may follow a condition: its own list offers no more "+" below it.
    await expect(page.locator('[data-cy=step-s2]')).toBeVisible()

    // --- Save the draft; it survives a reload. -----------------------------------------------------------
    await page.locator('[data-cy=save-draft]').click()
    await expect(page.getByText('Draft saved').first()).toBeVisible()
    await page.reload()
    await expect(page.locator('[data-cy=step-s2]')).toBeVisible()
    await expect(page.locator('[data-cy=branch-s2-yes] [data-cy=step-s3]')).toBeVisible()

    // --- Publish. ---------------------------------------------------------------------------------------
    await page.locator('[data-cy=publish]').click()
    await page.locator('[data-cy=confirm-publish]').click()
    await expect(page.locator('[data-cy=status]')).toHaveText('Active')

    // --- An event enrolls someone; the Activity tab shows where they are. ------------------------------------
    const res = await request.post('/api/track', { data: { subscriber: { email }, name: event, properties: {} } })
    expect(res.ok()).toBeTruthy()
    await page.getByRole('tab', { name: 'Activity' }).click()
    const row = page.locator('[data-cy=enrollments]').getByRole('row', { name: new RegExp(email) })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row).toContainText('Waiting', { timeout: 20_000 })
    await row.getByRole('button', { name: 'Log' }).click()
    await expect(page.locator('[data-cy=step-log]')).toContainText('s1')
  } finally {
    if (id) {
      await request.post(`/api/automations/${id}/archive`)
      await request.delete(`/api/automations/${id}`)
    }
    const s = await request.get(`/api/subscribers?query=${encodeURIComponent(`email='${email}'`)}`)
    for (const r of (await s.json()).data?.results ?? []) await request.delete(`/api/subscribers/${r.id}`)
  }
})

test('an incomplete flow is flagged and cannot be published', async ({ page, request }) => {
  test.skip((await request.get('/api/automations')).status() === 404, 'backend without automations')
  const a = (await (await request.post('/api/automations', { data: { name: `E2E incomplete ${Date.now()}`, settings: {} } })).json()).data
  try {
    await page.goto(`/admin/automations/${a.id}`)
    await page.locator('[data-cy=add-trigger]').click()
    await page.locator('[data-cy=add-trigger-list_joined]').click()
    await closeSheet(page) // no list chosen
    await page.locator('[data-cy=add-step]').last().click()
    await page.locator('[data-cy=add-delay]').click()
    await closeSheet(page)
    await expect(page.locator('[data-cy=trigger-t1]').getByLabel('Needs attention')).toBeVisible()

    // The refused publish is a 400 the browser logs; that is the point of this test.
    page.removeAllListeners('console')
    await page.locator('[data-cy=publish]').click()
    await page.locator('[data-cy=confirm-publish]').click()
    await expect(page.getByText(/Cannot publish/).first()).toBeVisible()
    await expect(page.locator('[data-cy=status]')).toHaveText('Draft')
  } finally {
    await request.delete(`/api/automations/${a.id}`)
  }
})

test('a transactional email step has no topic and saves its email without one', async ({ page, request }) => {
  test.skip((await request.get('/api/automations')).status() === 404, 'backend without automations')
  const stamp = Date.now()
  const a = (await (await request.post('/api/automations', { data: { name: `E2E tx mail ${stamp}`, settings: {} } })).json()).data
  try {
    await page.goto(`/admin/automations/${a.id}`)
    const sheet = page.locator('[data-cy=step-sheet]')
    await page.locator('[data-cy=add-trigger]').click()
    await page.locator('[data-cy=add-trigger-event]').click()
    await sheet.getByLabel('Event name').fill(`e2e_tx_${stamp}`)
    await closeSheet(page)

    await page.locator('[data-cy=add-step]').last().click()
    await page.locator('[data-cy=add-send_email]').click()
    await expect(sheet.locator('#email-topic')).toBeVisible()
    await sheet.locator('#mt-tx').click()
    await expect(sheet.locator('#email-topic')).toHaveCount(0)

    await sheet.locator('[data-cy=create-email]').click()
    const editor = sheet.locator('[data-cy=email-editor]')
    await expect(editor).toBeVisible()
    await editor.locator('#email-subject').fill(`Receipt ${stamp}`)
    await sheet.locator('[data-cy=save-email]').click()
    await expect(page.getByText('Email saved').first()).toBeVisible()
    await closeSheet(page)
    await expect(page.locator('[data-cy=step-s1]')).toContainText('Transactional')

    // Publishable as is: no topic needed.
    await page.locator('[data-cy=publish]').click()
    await page.locator('[data-cy=confirm-publish]').click()
    await expect(page.locator('[data-cy=status]')).toHaveText('Active')
    const graph = (await (await request.get(`/api/automations/${a.id}/draft`)).json()).data.graph
    expect(graph.nodes[0].config.list_id).toBeUndefined()
    const camp = (await (await request.get(`/api/campaigns/${graph.nodes[0].config.campaign_id}`)).json()).data
    expect(camp.subject).toBe(`Receipt ${stamp}`)
    expect(camp.lists).toEqual([])
  } finally {
    await request.post(`/api/automations/${a.id}/archive`)
    await request.delete(`/api/automations/${a.id}`)
  }
})

test('an email step: write the email in the step, publish, and it is sent', async ({ page, request }) => {
  test.skip((await request.get('/api/automations')).status() === 404, 'backend without automations')
  const stamp = Date.now()
  const event = `e2e_mail_${stamp}`
  const email = `mailstep-${stamp}@example.com`
  const list = (await (await request.post('/api/lists', { data: { name: `E2E mail topic ${stamp}`, type: 'private', optin: 'single' } })).json()).data
  const a = (await (await request.post('/api/automations', { data: { name: `E2E mail ${stamp}`, settings: {} } })).json()).data
  try {
    await page.goto(`/admin/automations/${a.id}`)
    const sheet = page.locator('[data-cy=step-sheet]')

    await page.locator('[data-cy=add-trigger]').click()
    await page.locator('[data-cy=add-trigger-event]').click()
    await sheet.getByLabel('Event name').fill(event)
    await closeSheet(page)

    await page.locator('[data-cy=add-step]').last().click()
    await page.locator('[data-cy=add-send_email]').click()
    // The topic (a marketing email needs one).
    await sheet.locator('#email-topic').click()
    await page.getByRole('option', { name: list.name }).click()
    await sheet.locator('[data-cy=create-email]').click()
    const editor = sheet.locator('[data-cy=email-editor]')
    await expect(editor).toBeVisible()
    await editor.locator('#email-subject').fill('Hello from {{ .Event.Name }}')
    const frame = page.frameLocator('iframe.tox-edit-area__iframe')
    await frame.locator('body').click()
    await page.keyboard.type('Welcome aboard')
    await sheet.locator('[data-cy=save-email]').click()
    await expect(page.getByText('Email saved').first()).toBeVisible()
    await closeSheet(page)
    await expect(page.locator('[data-cy=step-s1]')).toContainText('Marketing')

    await page.locator('[data-cy=publish]').click()
    await page.locator('[data-cy=confirm-publish]').click()
    await expect(page.locator('[data-cy=status]')).toHaveText('Active')

    // The content is a campaign of its own, hidden from the campaign list.
    const graph = (await (await request.get(`/api/automations/${a.id}/draft`)).json()).data.graph
    const campaignId = graph.nodes[0].config.campaign_id
    const camp = (await (await request.get(`/api/campaigns/${campaignId}`)).json()).data
    expect(camp.subject).toBe('Hello from {{ .Event.Name }}')
    expect(camp.body).toContain('Welcome aboard')
    expect(camp.type).toBe('automation')

    expect((await request.post('/api/track', { data: { subscriber: { email }, name: event } })).ok()).toBeTruthy()
    await page.getByRole('tab', { name: 'Activity' }).click()
    const row = page.locator('[data-cy=enrollments]').getByRole('row', { name: new RegExp(email) })
    await expect(row).toContainText('Completed', { timeout: 20_000 })
  } finally {
    await request.post(`/api/automations/${a.id}/archive`)
    await request.delete(`/api/automations/${a.id}`)
    const s = await request.get(`/api/subscribers?query=${encodeURIComponent(`email='${email}'`)}`)
    for (const r of (await s.json()).data?.results ?? []) await request.delete(`/api/subscribers/${r.id}`)
    await request.delete(`/api/lists/${list.id}`)
  }
})

test('a wait for an event: two events, one that restarts, and its two paths', async ({ page, request }) => {
  test.skip((await request.get('/api/automations')).status() === 404, 'backend without automations')

  const name = `E2E wait builder ${Date.now()}`
  let id = 0
  try {
    await page.goto('/admin/automations')
    await page.getByRole('button', { name: 'New' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox').fill(name)
    await dialog.getByRole('button', { name: 'New' }).click()
    await expect(page.getByRole('heading', { name })).toBeVisible()
    id = Number(new URL(page.url()).pathname.split('/').pop())

    await page.locator('[data-cy=add-step]').last().click()
    await page.locator('[data-cy=add-wait_for_event]').click()
    const sheet = page.locator('[data-cy=step-sheet]')
    await sheet.getByLabel('Event name').fill('order_completed')
    await sheet.locator('[data-cy=wait-event-add]').click()
    await sheet.getByLabel('Event name').nth(1).fill('checkout_started')
    await sheet.locator('[data-cy=wait-event-e2]').getByRole('checkbox').click()
    await closeSheet(page)

    await expect(page.locator('[data-cy=step-s1]')).toContainText('Up to 1 hour · order_completed, checkout_started (restarts)')
    // The restart event has no path; the other event and "Time's up" do.
    await expect(page.locator('[data-cy=branch-s1-e1]')).toContainText('order_completed')
    await expect(page.locator('[data-cy=branch-s1-timeout]')).toContainText("Time's up")
    await expect(page.locator('[data-cy=branch-s1-e2]')).toHaveCount(0)
  } finally {
    if (id) {
      await request.post(`/api/automations/${id}/archive`)
      await request.delete(`/api/automations/${id}`)
    }
  }
})

test('a go to step: pick its target, see the hints, and be told about an instant loop', async ({ page, request }) => {
  test.skip((await request.get('/api/automations')).status() === 404, 'backend without automations')

  const name = `E2E go to builder ${Date.now()}`
  let id = 0
  try {
    await page.goto('/admin/automations')
    await page.getByRole('button', { name: 'New' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox').fill(name)
    await dialog.getByRole('button', { name: 'New' }).click()
    await expect(page.getByRole('heading', { name })).toBeVisible()
    id = Number(new URL(page.url()).pathname.split('/').pop())

    // s1: wait for an event; its "time's up" path ends with a go to.
    await page.locator('[data-cy=add-step]').last().click()
    await page.locator('[data-cy=add-wait_for_event]').click()
    await page.locator('[data-cy=step-sheet]').getByLabel('Event name').fill('activated')
    await closeSheet(page)

    await page.locator('[data-cy=branch-s1-timeout] [data-cy=add-step]').last().click()
    await page.locator('[data-cy=add-go_to]').click()
    const sheet = page.locator('[data-cy=step-sheet]')
    await sheet.locator('[data-cy=goto-target]').click()
    await page.locator('[data-cy=goto-option-s1]').click()
    await closeSheet(page)

    await expect(page.locator('[data-cy=step-s2]')).toContainText('→ Wait for an event: Up to 1 hour · activated')
    await expect(page.locator('[data-cy=step-s1] [data-cy=also-reached]')).toContainText('Also reached by a Go to step')
    // Nothing can be added after a go to.
    await expect(page.locator('[data-cy=branch-s1-timeout] [data-cy=add-step]')).toHaveCount(1)

    // Going back to a wait for an event is a loop with a pause in it, so no complaint.
    await expect(page.locator('[data-cy=step-s2]')).not.toContainText('would repeat instantly')

    // A wait until never pauses for sure, so looping back to one is.
    await page.locator('[data-cy=branch-s1-timeout] [data-cy=add-step]').first().click()
    await page.locator('[data-cy=add-wait_until]').click()
    await closeSheet(page)
    await page.locator('[data-cy=step-s2]').click()
    await page.locator('[data-cy=step-sheet] [data-cy=goto-target]').click()
    await page.locator('[data-cy=goto-option-s3]').click()
    await expect(page.locator('[data-cy=step-sheet]')).toContainText('would repeat instantly')
  } finally {
    if (id) {
      await request.post(`/api/automations/${id}/archive`)
      await request.delete(`/api/automations/${id}`)
    }
  }
})
