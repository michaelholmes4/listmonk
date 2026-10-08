import { expect, test, type Page } from '@playwright/test'

// Specs that save settings. The server reloads itself after a save, so these run on their own,
// after every other spec (see the `restarts` project in playwright.config.ts).

test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
  page.on('console', (m) => {
    // The server goes away while it reloads after a save.
    if (m.type() === 'error' && !/status of (4\d\d|5\d\d)|ERR_|Failed to load resource/.test(m.text())) throw new Error(m.text())
  })
})

type Settings = Record<string, unknown>
const getSettings = async (page: Page) => (await (await page.request.get('/api/settings')).json()).data as Settings
const tryGetSettings = async (page: Page): Promise<Settings> => getSettings(page).catch(() => ({}))

/** The API hands secrets back masked; sending '' means "keep", which is what a restore must do. */
function unmask(s: Settings): Settings {
  const out = structuredClone(s) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const blank = (o: Record<string, any>, k: string) => { if (o[k] && /^•+$/.test(o[k])) o[k] = '' } // eslint-disable-line @typescript-eslint/no-explicit-any
  out.smtp.forEach((x: any) => blank(x, 'password')) // eslint-disable-line @typescript-eslint/no-explicit-any
  out.messengers.forEach((x: any) => blank(x, 'password')) // eslint-disable-line @typescript-eslint/no-explicit-any
  out['bounce.mailboxes'].forEach((x: any) => blank(x, 'password')) // eslint-disable-line @typescript-eslint/no-explicit-any
  blank(out, 'upload.s3.aws_secret_access_key')
  blank(out, 'bounce.sendgrid_key')
  blank(out['bounce.azure'], 'shared_secret')
  blank(out['bounce.postmark'], 'password')
  blank(out['bounce.forwardemail'], 'key')
  blank(out['bounce.lettermint'], 'key')
  blank(out['security.captcha'].hcaptcha, 'secret')
  blank(out['security.oidc'], 'client_secret')
  return out
}

/** After a save the server reloads; wait until it answers again with the expected value. */
async function untilSaved(page: Page, key: string, want: unknown) {
  await expect
    .poll(async () => (await tryGetSettings(page))[key], { timeout: 45_000, intervals: [500, 1000] })
    .toEqual(want)
  // ...and until the page itself has finished its own wait-and-refetch.
  await expect(page.locator('[data-cy=btn-save]')).toBeDisabled({ timeout: 45_000 })
}

test('settings: one save across tabs changes only what was edited', async ({ page }) => {
  const before = await getSettings(page)
  const marker = `E2E ${Date.now()}`
  const concurrency = (before['app.concurrency'] as number) + 1
  const notify = [...(before['app.notify_emails'] as string[]), 'e2e-notify@example.com']
  const ip = !before['privacy.record_optin_ip']
  let saved = false

  try {
    await page.goto('/app/settings')
    await expect(page.getByRole('heading', { name: /^Settings/ })).toBeVisible()
    await expect(page.locator('[data-cy=btn-save]')).toBeDisabled()
    await expect(page.getByLabel('Site name')).toHaveValue(before['app.site_name'] as string)

    await page.getByLabel('Site name').fill(marker)
    await page.getByRole('textbox', { name: /notification/i }).fill('e2e-notify@example.com')
    await page.getByRole('textbox', { name: /notification/i }).press('Enter')

    await page.locator('[data-cy=tab-performance]').click()
    await expect(page).toHaveURL(/tab=performance/)
    await page.getByLabel('Concurrency').fill(String(concurrency))

    await page.locator('[data-cy=tab-privacy]').click()
    await page.locator('#sw-privacy-record-optin-ip').click()

    await expect(page.locator('[data-cy=btn-save]')).toBeEnabled()
    await page.locator('[data-cy=btn-save]').click()
    saved = true
    await untilSaved(page, 'app.site_name', marker)

    // Everything else is exactly as it was, secrets included (they stay masked and untouched).
    await expect.poll(() => tryGetSettings(page), { timeout: 20_000, intervals: [500, 1000] }).toEqual({
      ...before,
      'app.site_name': marker,
      'app.concurrency': concurrency,
      'app.notify_emails': notify,
      'privacy.record_optin_ip': ip,
    })

    // The page shows the saved values on a fresh load.
    await page.goto('/app/settings')
    await expect(page.getByLabel('Site name')).toHaveValue(marker)
  } finally {
    if (saved) {
      // The server may still be reloading from the save above; keep trying until it takes the restore.
      await expect
        .poll(async () => (await page.request.put('/api/settings', { data: unmask(before) }).catch(() => null))?.ok() ?? false, { timeout: 45_000, intervals: [1000] })
        .toBe(true)
      await untilSaved(page, 'app.site_name', before['app.site_name'])
    }
  }
})


test('maintenance: the vacuum schedule saves through the key endpoint and nothing else changes', async ({ page }) => {
  const before = await getSettings(page)
  const was = before['maintenance.db'] as { vacuum: boolean; vacuum_cron_interval: string }
  let saved = false
  try {
    await page.goto('/app/settings/maintenance')
    const vac = page.locator('[data-cy=vacuum]')
    await expect(vac.getByLabel('Cron interval')).toHaveValue(was.vacuum_cron_interval || '0 2 * * *')
    await vac.locator('#vacuum').click()
    await vac.getByLabel('Cron interval').fill('30 3 * * *')
    await vac.getByRole('button', { name: 'Save' }).click()
    saved = true
    await expect
      .poll(async () => ((await tryGetSettings(page))['maintenance.db'] as { vacuum_cron_interval?: string } | undefined)?.vacuum_cron_interval, {
        timeout: 45_000,
        intervals: [500, 1000],
      })
      .toBe('30 3 * * *')
    await expect
      .poll(() => tryGetSettings(page), { timeout: 20_000 })
      .toEqual({ ...before, 'maintenance.db': { vacuum: !was.vacuum, vacuum_cron_interval: '30 3 * * *' } })
  } finally {
    if (saved) {
      await expect
        .poll(async () => (await page.request.put('/api/settings/maintenance.db', { data: was }).catch(() => null))?.ok() ?? false, {
          timeout: 45_000,
          intervals: [1000],
        })
        .toBe(true)
      await expect
        .poll(async () => ((await tryGetSettings(page))['maintenance.db'] as { vacuum_cron_interval?: string } | undefined)?.vacuum_cron_interval, {
          timeout: 45_000,
          intervals: [500, 1000],
        })
        .toBe(was.vacuum_cron_interval)
    }
  }
})
