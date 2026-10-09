import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'

// Enrolling people by hand: only a live automation with the "manual" trigger takes them, through
// the API or the subscribers page.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over untyped JSON
async function data<T = any>(res: APIResponse): Promise<T> {
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()).data as T
}

async function publish(request: APIRequestContext, name: string, trigger: object): Promise<number> {
  const a = await data(await request.post('/api/automations', { data: { name, settings: {} } }))
  const graph = { triggers: [{ id: 't1', ...trigger }], root: 'd', nodes: [{ id: 'd', type: 'delay', config: { duration: '1d' } }], edges: [] }
  expect((await data(await request.put(`/api/automations/${a.id}/draft`, { data: graph }))).problems).toEqual([])
  await data(await request.post(`/api/automations/${a.id}/publish`, { data: {} }))
  return a.id
}

test('manual enrollment: the API needs the manual trigger, the subscribers page adds the selection', async ({ page }) => {
  const request = page.request
  const stamp = Date.now()
  const tag = `enroll${stamp}`
  const ids: number[] = []
  const automations: number[] = []
  const list = await data(await request.post('/api/lists', { data: { name: `E2E enroll ${stamp}`, type: 'private', optin: 'single' } }))
  try {
    for (const i of [1, 2]) {
      const s = await data(await request.post('/api/subscribers', { data: { email: `${tag}-${i}@example.com`, name: tag, status: 'enabled', lists: [] } }))
      ids.push(s.id)
    }
    const byHand = await publish(request, `E2E by hand ${stamp}`, { type: 'manual' })
    const onList = await publish(request, `E2E on list ${stamp}`, { type: 'list_joined', config: { list_id: list.id } })
    automations.push(byHand, onList)

    // Only the automation with the manual trigger is offered, and only it takes people.
    const offered = await data(await request.get('/api/automations?status=active&manual=true&per_page=all'))
    const offeredIds = offered.results.map((a: { id: number }) => a.id)
    expect(offeredIds).toContain(byHand)
    expect(offeredIds).not.toContain(onList)
    const refused = await request.post(`/api/automations/${onList}/enroll`, { data: { subscriber_ids: [ids[0]] } })
    expect(refused.status()).toBe(409)

    // The subscribers page: select both, add them to the automation.
    await page.goto('/admin/subscribers')
    await page.getByPlaceholder('E-mail or name').fill(tag)
    await expect(page.getByRole('row')).toHaveCount(3) // header + 2
    await page.getByRole('checkbox', { name: /select all/i }).first().click()
    await page.locator('[data-cy=btn-enroll]').click()
    const dialog = page.locator('[data-cy=enroll-dialog]')
    await dialog.locator('[data-cy=enroll-automation]').click()
    await expect(page.getByRole('option', { name: `E2E on list ${stamp}` })).toHaveCount(0)
    await page.getByRole('option', { name: `E2E by hand ${stamp}` }).click()
    await dialog.locator('[data-cy=enroll-submit]').click()
    await expect(page.getByText(`Added 2 of 2 to E2E by hand ${stamp}`)).toBeVisible()
    await expect(dialog).toBeHidden()

    const enrolled = await data(await request.get(`/api/automations/${byHand}/enrollments?per_page=all`))
    expect(enrolled.total).toBe(2)

    // Again through the API: both are inside already, so nobody new.
    expect((await data(await request.post(`/api/automations/${byHand}/enroll`, { data: { subscriber_ids: ids } }))).enrolled).toBe(0)
  } finally {
    for (const id of automations) {
      await request.post(`/api/automations/${id}/archive`)
      await request.delete(`/api/automations/${id}`)
    }
    for (const id of ids) await request.delete(`/api/subscribers/${id}`)
    await request.delete(`/api/lists/${list.id}`)
  }
})
