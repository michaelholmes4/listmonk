import { expect, test as setup } from '@playwright/test'

// Logs in through the server-rendered login page (the new UI has none yet) and saves the session.
setup('log in', async ({ page }) => {
  const user = process.env.LISTMONK_ADMIN_USER
  const password = process.env.LISTMONK_ADMIN_PASSWORD
  if (!user || !password) throw new Error('set LISTMONK_ADMIN_USER and LISTMONK_ADMIN_PASSWORD')

  await page.goto('/admin/login?next=/admin/')
  await page.fill('input[name=username]', user)
  await page.fill('input[name=password]', password)
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/admin\/?$/)

  await page.context().storageState({ path: 'e2e/.auth/state.json' })
})
