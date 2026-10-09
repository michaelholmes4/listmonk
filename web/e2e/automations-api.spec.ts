import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'

// The automation API and /api/track, driven end to end against the real backend. No screen yet
// (that is the builder's job); this pins the contract the builder will use.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over untyped JSON
async function data<T = any>(res: APIResponse): Promise<T> {
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()).data as T
}

// The message log's entry for an automation's (only) email. Logging is batched, so it is polled.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON
async function logEntry(request: APIRequestContext, automationId: number): Promise<any> {
  let id = 0
  await expect
    .poll(async () => {
      const page = await data(await request.get(`/api/message-log?automation_id=${automationId}`))
      id = page.results[0]?.id ?? 0
      return page.total
    }, { timeout: 15_000 })
    .toBe(1)
  return data(await request.get(`/api/message-log/${id}`))
}

test('an event starts an automation: track, enroll, send step, stats, subscriber views', async ({ request }) => {
  // An older backend binary has no such routes.
  test.skip((await request.get('/api/automations')).status() === 404, 'backend without automations')

  const stamp = Date.now()
  const email = `e2e-auto-${stamp}@example.com`
  const event = `e2e_signed_up_${stamp}`
  const list = await data(await request.post('/api/lists', { data: { name: `E2E topic ${stamp}`, type: 'private', optin: 'single' } }))
  let automationId = 0
  let subscriberId = 0
  try {
    const { campaign_id } = await data(
      await request.post('/api/automations/emails', {
        data: { name: `E2E welcome ${stamp}`, subject: 'Hi {{ .Event.Properties.plan }}', list_id: list.id, content_type: 'html', body: '<p>Hello {{ .Subscriber.Name }}</p>' },
      }),
    )

    // The step's content is hidden from the campaign list.
    const campaigns = await data(await request.get('/api/campaigns?per_page=all'))
    expect(campaigns.results.map((c: { id: number }) => c.id)).not.toContain(campaign_id)

    const automation = await data(await request.post('/api/automations', { data: { name: `E2E flow ${stamp}`, settings: {} } }))
    automationId = automation.id
    expect(automation.status).toBe('draft')

    // Publishing an empty draft names what is missing.
    const empty = await request.post(`/api/automations/${automationId}/publish`, { data: {} })
    expect(empty.status()).toBe(400)
    expect((await empty.json()).data.problems.length).toBeGreaterThan(0)

    const graph = {
      triggers: [{ id: 't1', type: 'event', config: { event } }],
      root: 'mail',
      nodes: [{ id: 'mail', type: 'send_email', config: { message_type: 'marketing', list_id: list.id, campaign_id } }],
      edges: [],
    }
    const saved = await data(await request.put(`/api/automations/${automationId}/draft`, { data: graph }))
    expect(saved.problems).toEqual([])
    const published = await data(await request.post(`/api/automations/${automationId}/publish`, { data: {} }))
    expect(published.automation.status).toBe('active')

    // A step can't borrow an ordinary campaign.
    const regular = await data(await request.get('/api/campaigns?per_page=1'))
    if (regular.results.length) {
      const bad = { ...graph, nodes: [{ ...graph.nodes[0], config: { ...graph.nodes[0].config, campaign_id: regular.results[0].id } }] }
      const res = await request.put(`/api/automations/${automationId}/draft`, { data: bad })
      expect(res.ok() ? (await res.json()).data.problems.length : 1).toBeGreaterThan(0)
    }

    // The event creates the subscriber, merges attributes, and starts the automation. A retry with
    // the same key records nothing more.
    const body = { subscriber: { email }, name: event, properties: { plan: 'pro' }, upsert_attribs: { company: 'Acme' } }
    const first = await data(await request.post('/api/track', { data: body, headers: { 'Idempotency-Key': `k-${stamp}` } }))
    expect(first.duplicate).toBe(false)
    subscriberId = first.subscriber_id
    const again = await data(await request.post('/api/track', { data: body, headers: { 'Idempotency-Key': `k-${stamp}` } }))
    expect(again.duplicate).toBe(true)

    await expect
      .poll(async () => (await data(await request.get(`/api/automations/${automationId}/enrollments`))).results.map((e: { status: string }) => e.status), { timeout: 15_000 })
      .toEqual(['completed'])

    const stats = await data(await request.get(`/api/automations/${automationId}/stats`))
    expect(stats).toEqual([expect.objectContaining({ node_id: 'mail', entered: 1, done: 1, failed: 0 })])

    const enrollment = (await data(await request.get(`/api/automations/${automationId}/enrollments`))).results[0]
    const steps = await data(await request.get(`/api/automations/${automationId}/enrollments/${enrollment.id}/steps`))
    expect(steps.map((s: { node_id: string; status: string }) => [s.node_id, s.status])).toEqual([['mail', 'done']])

    // A marketing email carries List-Unsubscribe (when the setting is on); a transactional one
    // doesn't (next test).
    const settings = await data(await request.get('/api/settings'))
    if (settings['privacy.unsubscribe_header']) {
      expect((await logEntry(request, automationId)).headers?.['List-Unsubscribe']).toBeTruthy()
    }

    const sub = await data(await request.get(`/api/subscribers/${subscriberId}`))
    expect(sub.attribs.company).toBe('Acme')
    // Sending recorded the subscription, so the unsubscribe link has something to act on.
    expect(sub.lists.map((l: { id: number }) => l.id)).toContain(list.id)

    const events = await data(await request.get(`/api/subscribers/${subscriberId}/events`))
    expect(events.results.map((e: { name: string }) => e.name)).toEqual([event])
    const autos = await data(await request.get(`/api/subscribers/${subscriberId}/automations`))
    expect(autos.map((a: { automation_name: string }) => a.automation_name)).toEqual([`E2E flow ${stamp}`])

    // Bad input is refused.
    expect((await request.post('/api/track', { data: { subscriber: { email }, name: '' } })).status()).toBe(400)
    expect((await request.post('/api/track', { data: { name: event } })).status()).toBe(400)
    expect((await request.get('/api/automations/99999999')).status()).toBe(404)
  } finally {
    if (automationId) {
      await request.post(`/api/automations/${automationId}/archive`)
      await request.delete(`/api/automations/${automationId}`)
    }
    if (subscriberId) await request.delete(`/api/subscribers/${subscriberId}`)
    await request.delete(`/api/lists/${list.id}`)
  }
})

test('a transactional email step: no topic, content updated over the API, no List-Unsubscribe', async ({ request }) => {
  test.skip((await request.get('/api/automations')).status() === 404, 'backend without automations')

  const stamp = Date.now()
  const email = `e2e-tx-${stamp}@example.com`
  const event = `e2e_ordered_${stamp}`
  let automationId = 0
  let subscriberId = 0
  try {
    // No list: a transactional email has no topic.
    const { campaign_id } = await data(
      await request.post('/api/automations/emails', { data: { name: `E2E receipt ${stamp}`, content_type: 'html', body: '<p>draft</p>' } }),
    )

    // Its content is updated without `lists`, which PUT /api/campaigns/:id would insist on.
    const updated = await data(
      await request.put(`/api/automations/emails/${campaign_id}`, {
        data: { subject: `Receipt ${stamp}`, content_type: 'html', body: '<p>Order {{ .Event.Properties.order }}</p>' },
      }),
    )
    expect(updated.subject).toBe(`Receipt ${stamp}`)
    expect(updated.lists).toEqual([])
    expect(updated.type).toBe('automation')
    // Only automation emails: not an ordinary campaign, nor a missing one.
    expect((await request.put('/api/automations/emails/99999999', { data: { subject: 'x' } })).ok()).toBeFalsy()
    const regular = await data(await request.get('/api/campaigns?per_page=1'))
    if (regular.results.length) {
      expect((await request.put(`/api/automations/emails/${regular.results[0].id}`, { data: { subject: 'x' } })).status()).toBe(404)
    }

    const automation = await data(await request.post('/api/automations', { data: { name: `E2E tx flow ${stamp}`, settings: {} } }))
    automationId = automation.id
    const graph = {
      triggers: [{ id: 't1', type: 'event', config: { event } }],
      root: 'mail',
      nodes: [{ id: 'mail', type: 'send_email', config: { message_type: 'transactional', campaign_id } }],
      edges: [],
    }
    expect((await data(await request.put(`/api/automations/${automationId}/draft`, { data: graph }))).problems).toEqual([])
    await data(await request.post(`/api/automations/${automationId}/publish`, { data: {} }))

    const tracked = await data(await request.post('/api/track', { data: { subscriber: { email }, name: event, properties: { order: `A-${stamp}` } } }))
    subscriberId = tracked.subscriber_id
    await expect
      .poll(async () => (await data(await request.get(`/api/automations/${automationId}/enrollments`))).results.map((e: { status: string }) => e.status), { timeout: 15_000 })
      .toEqual(['completed'])

    // The message log has the email as it went out: the updated content, and no List-Unsubscribe.
    // (Checked before cleanup: deleting the subscriber deletes their log.)
    const entry = await logEntry(request, automationId)
    expect(entry.subject).toBe(`Receipt ${stamp}`)
    expect(await (await request.get(`/api/message-log/${entry.id}/preview`)).text()).toContain(`Order A-${stamp}`)
    expect(entry.headers?.['List-Unsubscribe']).toBeUndefined()
  } finally {
    if (automationId) {
      await request.post(`/api/automations/${automationId}/archive`)
      await request.delete(`/api/automations/${automationId}`)
    }
    if (subscriberId) await request.delete(`/api/subscribers/${subscriberId}`)
  }
})

test('pausing and resuming; a live automation cannot be deleted', async ({ request }) => {
  test.skip((await request.get('/api/automations')).status() === 404, 'backend without automations')

  const a = await data(await request.post('/api/automations', { data: { name: `E2E lifecycle ${Date.now()}`, settings: {} } }))
  try {
    expect((await request.post(`/api/automations/${a.id}/pause`)).ok()).toBeFalsy() // a draft isn't running
    const list = await data(await request.post('/api/lists', { data: { name: `E2E lc ${Date.now()}`, type: 'private', optin: 'single' } }))
    try {
      const graph = {
        triggers: [{ id: 't', type: 'list_joined', config: { list_id: list.id } }],
        root: 'd',
        nodes: [{ id: 'd', type: 'delay', config: { duration: '1h' } }],
        edges: [],
      }
      await data(await request.put(`/api/automations/${a.id}/draft`, { data: graph }))
      await data(await request.post(`/api/automations/${a.id}/publish`, { data: {} }))
      expect((await data(await request.post(`/api/automations/${a.id}/pause`))).status).toBe('paused')
      expect((await data(await request.post(`/api/automations/${a.id}/resume`))).status).toBe('active')
      expect((await request.delete(`/api/automations/${a.id}`)).status()).toBe(409)
      expect((await data(await request.post(`/api/automations/${a.id}/archive`))).status).toBe('archived')
    } finally {
      await request.delete(`/api/lists/${list.id}`)
    }
  } finally {
    await request.post(`/api/automations/${a.id}/archive`)
    await request.delete(`/api/automations/${a.id}`)
  }
})

test('a wait for an event: the event takes its path, a restart event does not', async ({ request }) => {
  test.skip((await request.get('/api/automations')).status() === 404, 'backend without automations')

  const stamp = Date.now()
  const email = `e2e-wait-${stamp}@example.com`
  const started = `e2e_checkout_started_${stamp}`
  const completed = `e2e_order_completed_${stamp}`
  let automationId = 0
  let subscriberId = 0
  try {
    const { campaign_id } = await data(
      await request.post('/api/automations/emails', { data: { name: `E2E thanks ${stamp}`, subject: `Thanks ${stamp}`, content_type: 'html', body: '<p>Thanks</p>' } }),
    )
    const automation = await data(await request.post('/api/automations', { data: { name: `E2E wait ${stamp}`, settings: {} } }))
    automationId = automation.id
    const graph = {
      triggers: [{ id: 't1', type: 'event', config: { event: started } }],
      root: 'w',
      nodes: [
        {
          id: 'w',
          type: 'wait_for_event',
          config: { timeout: '1h', events: [{ id: 'e1', name: completed }, { id: 'e2', name: started, restart: true }] },
        },
        { id: 'thanks', type: 'send_email', config: { message_type: 'transactional', campaign_id } },
      ],
      edges: [{ from: 'w', to: 'thanks', handle: 'e1' }],
    }
    expect((await data(await request.put(`/api/automations/${automationId}/draft`, { data: graph }))).problems).toEqual([])
    await data(await request.post(`/api/automations/${automationId}/publish`, { data: {} }))

    // A restart event has no path of its own.
    const bad = { ...graph, edges: [{ from: 'w', to: 'thanks', handle: 'e2' }] }
    expect((await data(await request.put(`/api/automations/${automationId}/draft`, { data: bad }))).problems.length).toBeGreaterThan(0)

    const tracked = await data(await request.post('/api/track', { data: { subscriber: { email }, name: started, properties: {} } }))
    subscriberId = tracked.subscriber_id
    const enrollments = () => request.get(`/api/automations/${automationId}/enrollments`).then(data)
    await expect.poll(async () => (await enrollments()).results.map((e: { status: string }) => e.status), { timeout: 15_000 }).toEqual(['waiting'])

    await data(await request.post('/api/track', { data: { subscriber: { email }, name: completed, properties: {} } }))
    await expect.poll(async () => (await enrollments()).results.map((e: { status: string }) => e.status), { timeout: 15_000 }).toEqual(['completed'])

    const enrollment = (await enrollments()).results[0]
    const steps = await data(await request.get(`/api/automations/${automationId}/enrollments/${enrollment.id}/steps`))
    const wait = steps.find((s: { node_id: string }) => s.node_id === 'w')
    expect(wait.status).toBe('done')
    expect(wait.result).toMatchObject({ branch: 'e1', event: completed })
    expect(steps.map((s: { node_id: string; status: string }) => [s.node_id, s.status])).toContainEqual(['thanks', 'done'])
    expect((await logEntry(request, automationId)).subject).toBe(`Thanks ${stamp}`)
  } finally {
    if (automationId) {
      await request.post(`/api/automations/${automationId}/archive`)
      await request.delete(`/api/automations/${automationId}`)
    }
    if (subscriberId) await request.delete(`/api/subscribers/${subscriberId}`)
  }
})
