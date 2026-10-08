import { expect, test } from '@playwright/test'

test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
  page.on('console', (m) => {
    // The server goes away while it reloads after a save; that and the SMTP test failing are expected.
    if (m.type() === 'error' && !/status of (4\d\d|5\d\d)|ERR_|Failed to load resource/.test(m.text())) throw new Error(m.text())
  })
})

test('settings: validation stays on the page and finds the tab with the problem', async ({ page }) => {
  await page.goto('/app/settings')
  await page.locator('[data-cy=tab-smtp]').click()
  await page.getByLabel('Idle timeout').first().fill('soon')

  let puts = 0
  page.on('request', (r) => r.method() === 'PUT' && r.url().includes('/api/settings') && puts++)

  await page.locator('[data-cy=tab-general]').click()
  await page.locator('[data-cy=btn-save]').click()

  // It jumps to the offending tab and says what is wrong.
  await expect(page.locator('[data-cy=tab-smtp]')).toHaveAttribute('data-state', 'active')
  await expect(page.getByText('Invalid fields: idle_timeout').first()).toBeVisible()
  expect(puts).toBe(0)
})

test('settings: leaving with unsaved edits asks first', async ({ page }) => {
  await page.goto('/app/settings')
  await page.getByLabel('Site name').fill('unsaved change')
  await page.getByRole('link', { name: 'Logs' }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(/\/app\/settings/)
  await page.getByRole('link', { name: 'Logs' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: /Discard/ }).click()
  await expect(page).toHaveURL(/\/app\/settings\/logs$/)
})

test('settings: a half-edited secret is refused before anything is sent', async ({ page }) => {
  await page.goto('/app/settings?tab=smtp')
  const pwd = page.locator('[data-cy=smtp-0]').getByLabel('Password')
  await expect(pwd).toBeVisible()

  let puts = 0
  page.on('request', (r) => r.method() === 'PUT' && r.url().includes('/api/settings') && puts++)
  // Part of the masked value kept, part typed: neither "unchanged" nor a whole new password.
  await pwd.fill('••x')
  await page.locator('[data-cy=btn-save]').click()
  await expect(page.getByText(/Clear and re-enter the full password/)).toBeVisible()
  expect(puts).toBe(0)
})

test('settings: the SMTP test reports a connection that fails', async ({ page }) => {
  await page.goto('/app/settings?tab=smtp')
  const card = page.locator('[data-cy=smtp-0]')
  await card.getByLabel('Host', { exact: true }).fill('localhost')
  await card.getByLabel('Port', { exact: true }).fill('1')
  await card.locator('[data-cy="smtp[0].auth_protocol"]').click()
  await page.getByRole('option', { name: 'None' }).click()
  await card.locator('[data-cy="smtp[0].tls_type"]').click()
  await page.getByRole('option', { name: 'Off' }).click()

  await page.locator('[data-cy=smtp-test-0]').click()
  await card.getByLabel(/To e-?mail/i).fill('e2e-test@example.com')
  await page.locator('[data-cy=smtp-send-test-0]').click()
  await expect(page.locator('[data-cy=smtp-test-error]')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-cy=smtp-test-error]')).toContainText(/refused|connect/i)
})

test('settings: blocks can be added and removed without saving', async ({ page }) => {
  await page.goto('/app/settings?tab=smtp')
  await expect(page.locator('[data-cy=smtp-0]')).toBeVisible()
  const before = await page.locator('section[data-cy^=smtp-]').count()
  await page.locator('[data-cy=smtp-add]').click()
  await expect(page.locator('section[data-cy^=smtp-]')).toHaveCount(before + 1)
  await expect(page.locator('[data-cy=btn-save]')).toBeEnabled()
  await page.locator(`[data-cy=smtp-delete-${before}]`).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.locator('section[data-cy^=smtp-]')).toHaveCount(before)
  await expect(page.locator('[data-cy=btn-save]')).toBeDisabled()

  await page.locator('[data-cy=tab-messengers]').click()
  const m = await page.locator('section[data-cy^=messenger-]').count()
  await page.locator('[data-cy=messenger-add]').click()
  await expect(page.locator('section[data-cy^=messenger-]')).toHaveCount(m + 1)
})

test('logs: shows the server log', async ({ page }) => {
  await page.goto('/app/settings/logs')
  await expect(page.getByRole('heading', { name: 'Logs' })).toBeVisible()
  await expect(page.locator('[data-cy=log]')).toContainText(/\w/, { timeout: 15_000 })
})

test('maintenance: dated cleanups send the right request, exports download', async ({ page }) => {
  await page.goto('/app/settings/maintenance')
  await expect(page.getByRole('heading', { name: 'Maintenance' })).toBeVisible()

  // Cleaning a date from before anything existed is safe against real data.
  await page.locator('#gc-analytics-date').fill('2000-01-01')
  const del = page.waitForRequest((r) => r.method() === 'DELETE' && r.url().includes('/api/maintenance/analytics/all'))
  await page.locator('[data-cy=gc-analytics]').getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  const req = await del
  expect(new URL(req.url()).searchParams.get('before_date')).toMatch(/^2000-01-01T|^1999-12-31T/)
  await expect(page.getByText('Done').first()).toBeVisible()

  // Unconfirmed subscriptions report how many went.
  await page.locator('#gc-subscriptions-date').fill('2000-01-01')
  await page.locator('[data-cy=gc-subscriptions]').getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(/Subscriptions \(0\) deleted/)).toBeVisible()

  // The export link is a real CSV for the chosen kind and date.
  await page.locator('#export-date').fill('2020-01-01')
  const href = await page.locator('[data-cy=export-link]').getAttribute('href')
  expect(href).toMatch(/\/api\/maintenance\/analytics\/views\/export\?since=2020-01-01T|since=2019-12-31T/)
  const csv = await page.request.get(href!)
  expect(csv.status()).toBe(200)
  expect(csv.headers()['content-type']).toContain('text/csv')
})

test('maintenance: orphan and blocklisted cleanups are confirmed and report the count (mocked)', async ({ page }) => {
  // Deleting subscribers is destructive to real data, so the API is stubbed.
  const calls: string[] = []
  await page.route(
    (url) => url.pathname.startsWith('/api/maintenance/subscribers/'),
    async (route) => {
      calls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
      await route.fulfill({ json: { data: { count: 7 } } })
    },
  )
  await page.goto('/app/settings/maintenance')
  const card = page.locator('[data-cy=gc-subscribers]')
  await card.getByRole('button', { name: 'Delete' }).click()
  // Nothing happens until confirmed.
  expect(calls).toEqual([])
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(/Subscribers \(7\) deleted/)).toBeVisible()
  expect(calls).toEqual(['DELETE /api/maintenance/subscribers/orphan'])

  await card.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Blocklisted' }).click()
  await card.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect.poll(() => calls.length).toBe(2)
  expect(calls[1]).toBe('DELETE /api/maintenance/subscribers/blocklisted')
})

test('maintenance: the vacuum schedule is checked before saving', async ({ page }) => {
  await page.goto('/app/settings/maintenance')
  const vac = page.locator('[data-cy=vacuum]')
  await expect(vac.getByLabel('Cron interval')).toBeVisible()
  await vac.locator('#vacuum').click()
  await vac.getByLabel('Cron interval').fill('whenever')
  let puts = 0
  page.on('request', (r) => r.method() === 'PUT' && r.url().includes('/api/settings') && puts++)
  await vac.getByRole('button', { name: 'Save' }).click()
  await expect(vac.getByText(/Invalid fields/)).toBeVisible()
  expect(puts).toBe(0)
})

test('notices: a pending restart, a new release and project messages show above the page', async ({ page }) => {
  // Reloading the real server is not something to do for a banner test: stub config and reload.
  await page.route(
    (url) => url.pathname === '/api/config',
    async (route) => {
      const res = await route.fetch()
      const body = await res.json()
      body.data.needs_restart = true
      body.data.has_legacy_user = true
      body.data.update = {
        update: { release_version: 'v99.0.0', release_date: '2030-01-02T00:00:00Z', url: 'https://example.com/release', is_new: true },
        messages: [{ title: 'Heads up', description: 'Something to know', url: 'https://example.com/m', priority: 'high' }],
      }
      await route.fulfill({ response: res, json: body })
    },
  )
  const reloads: string[] = []
  await page.route(
    (url) => url.pathname === '/api/admin/reload',
    async (route) => {
      reloads.push(route.request().method())
      await route.fulfill({ json: { data: true } })
    },
  )

  await page.goto('/app/')
  const restart = page.locator('[data-cy=notice-restart]')
  await expect(restart).toContainText('Pause all running campaigns and restart the app')
  await expect(page.locator('[data-cy=notice-update]')).toContainText('v99.0.0')
  await expect(page.locator('[data-cy=notice-update]').getByRole('link', { name: 'View' })).toHaveAttribute('href', 'https://example.com/release')
  await expect(page.getByText('Heads up')).toBeVisible()
  await expect(page.locator('[data-cy=notice-legacy]')).toContainText('admin_username')

  // Restarting asks first.
  await restart.getByRole('button', { name: 'Restart' }).click()
  expect(reloads).toEqual([])
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restart' }).click()
  await expect.poll(() => reloads).toEqual(['POST'])
})

test('notices: nothing shows when there is nothing to say', async ({ page }) => {
  await page.goto('/app/')
  await expect(page.getByRole('link', { name: 'Dashboard' }).first()).toBeVisible()
  await expect(page.locator('[data-cy=notice-restart]')).toHaveCount(0)
})
