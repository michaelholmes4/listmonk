import { createHmac } from 'node:crypto'
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test'

test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
  page.on('console', (m) => {
    // Wrong-password and wrong-code answers are the expected path of the 2FA test.
    if (m.type() === 'error' && !/status of 40[03]/.test(m.text())) throw new Error(m.text())
  })
})

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

async function makeRole(page: Page, name: string, permissions = ['campaigns:get']) {
  return (await (await page.request.post('/api/roles/users', { data: { name, permissions } })).json()).data as { id: number }
}
const rows = async (req: APIRequestContext, path: string) => (await (await req.get(path)).json()).data as { id: number; name: string; username?: string }[]

test('users: create, edit, delete a person', async ({ page }) => {
  const id = stamp()
  const username = `e2e_user_${id}`
  const role = await makeRole(page, `E2E role ${id}`)
  try {
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: /^Users/ })).toBeVisible()
    await page.locator('[data-cy=btn-new]').click()
    await expect(page).toHaveURL(/\/users\/new$/)

    // A person needs a role, then an email.
    await page.getByLabel('Username', { exact: true }).fill(username)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Invalid fields: role')).toBeVisible()
    await page.locator('[data-cy=user-role]').click()
    await page.getByRole('option', { name: `E2E role ${id}` }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Invalid fields: email')).toBeVisible()
    await expect(page).toHaveURL(/\/users\/new$/)

    await page.getByLabel('E-mail').fill(`${username}@example.com`)
    await page.getByLabel('Name', { exact: true }).fill('E2E Person')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(/\/admin\/users$/)

    const row = page.getByRole('row', { name: new RegExp(username) })
    await expect(row).toBeVisible()
    await expect(row).toContainText(`E2E role ${id}`)
    await expect(row).toContainText('E2E Person')

    // Edit: disable the account.
    await row.getByRole('link', { name: username }).click()
    await expect(page.getByRole('heading', { name: 'E2E Person' })).toBeVisible()
    await page.getByRole('combobox').nth(0).click() // status
    await page.getByRole('option', { name: 'Disabled' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(/\/admin\/users$/)
    await expect(page.getByRole('row', { name: new RegExp(username) })).toContainText('Disabled')

    // Delete
    await page.getByRole('row', { name: new RegExp(username) }).getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('row', { name: new RegExp(username) })).toHaveCount(0)
  } finally {
    for (const u of await rows(page.request, '/api/users')) if (u.username === username) await page.request.delete(`/api/users/${u.id}`)
    await page.request.delete(`/api/roles/${role.id}`)
  }
})

test('users: an API user is shown its token once, and the token works', async ({ page, baseURL }) => {
  const id = stamp()
  const username = `e2e_api_${id}`
  const role = await makeRole(page, `E2E api role ${id}`)
  try {
    await page.goto('/admin/users/new')
    await page.getByRole('button', { name: 'API' }).click()
    // API users have no email or password.
    await expect(page.getByLabel('E-mail')).toHaveCount(0)
    await page.getByLabel('Username', { exact: true }).fill(username)
    await page.locator('[data-cy=user-role]').click()
    await page.getByRole('option', { name: `E2E api role ${id}` }).click()
    await page.getByRole('button', { name: 'Save' }).click()

    const box = page.locator('[data-cy=api-token]')
    await expect(box).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0)
    const token = (await box.locator('span').first().innerText()).trim()
    expect(token.length).toBeGreaterThan(10)

    const api = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { Authorization: `token ${username}:${token}` } })
    const me = await api.get('/api/profile')
    expect(me.status()).toBe(200)
    expect((await me.json()).data.username).toBe(username)
    await api.dispose()

    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page).toHaveURL(/\/admin\/users$/)
    await expect(page.getByRole('row', { name: new RegExp(username) })).toContainText('API')
  } finally {
    for (const u of await rows(page.request, '/api/users')) if (u.username === username) await page.request.delete(`/api/users/${u.id}`)
    await page.request.delete(`/api/roles/${role.id}`)
  }
})

test('user roles: create, clone, edit permissions, delete; Super Admin is read-only', async ({ page }) => {
  const name = `E2E urole ${stamp()}`
  try {
    await page.goto('/admin/users/roles/users')
    await expect(page.getByRole('heading', { name: /^User roles/ })).toBeVisible()

    // Super Admin can be opened but not changed or deleted.
    const sa = page.getByRole('row', { name: /Super Admin/ })
    await sa.getByRole('button', { name: 'Actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await sa.getByRole('link').first().click()
    await expect(page.getByLabel('Name', { exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0)
    await page.goBack()

    await page.locator('[data-cy=btn-new]').click()
    await expect(page).toHaveURL(/\/users\/roles\/users\/new$/)
    await page.getByLabel('Name', { exact: true }).fill(name)
    // New roles start with the everyday permissions, never raw SQL.
    await expect(page.getByLabel('campaigns:get', { exact: true })).toBeChecked()
    await expect(page.getByLabel('subscribers:sql_query')).not.toBeChecked()
    // Clear everything, then grant one permission.
    await page.getByRole('button', { name: 'Toggle selection' }).click() // select all
    await page.getByRole('button', { name: 'Toggle selection' }).click() // select none
    await page.getByLabel('templates:get', { exact: true }).check()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(/\/users\/roles\/users$/)

    let role = (await rows(page.request, '/api/roles/users')).find((r) => r.name === name) as unknown as { id: number; permissions: string[] }
    expect(role.permissions).toEqual(['templates:get'])

    // Clone keeps the permissions under a new name
    await page.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Clone' }).click()
    await page.getByRole('dialog').getByRole('textbox').fill(`${name} copy`)
    await page.getByRole('dialog').getByRole('button', { name: 'Clone' }).click()
    await expect(page.getByRole('row', { name: new RegExp(`${name} copy`) })).toBeVisible()
    const copy = (await rows(page.request, '/api/roles/users')).find((r) => r.name === `${name} copy`) as unknown as { permissions: string[] }
    expect(copy.permissions).toEqual(['templates:get'])

    // Edit
    await page.getByRole('row', { name: new RegExp(`^.*${name}( |$)`) }).first().getByRole('link').click()
    await page.getByLabel('templates:manage').check()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(/\/users\/roles\/users$/)
    role = (await rows(page.request, '/api/roles/users')).find((r) => r.name === name) as unknown as typeof role
    expect([...role.permissions].sort()).toEqual(['templates:get', 'templates:manage'])

    // Delete
    await page.getByRole('row', { name: new RegExp(`${name} copy`) }).getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('row', { name: new RegExp(`${name} copy`) })).toHaveCount(0)
  } finally {
    for (const r of await rows(page.request, '/api/roles/users')) if (r.name.startsWith(name)) await page.request.delete(`/api/roles/${r.id}`)
  }
})

test('list roles: pick lists, set view/manage, save', async ({ page }) => {
  const id = stamp()
  const name = `E2E lrole ${id}`
  const list = (await (await page.request.post('/api/lists', { data: { name: `E2E rolelist ${id}`, type: 'private', optin: 'single' } })).json()).data
  try {
    await page.goto('/admin/users/roles/lists')
    await expect(page.getByRole('heading', { name: /^List roles/ })).toBeVisible()
    await page.locator('[data-cy=btn-new]').click()
    await expect(page).toHaveURL(/\/users\/roles\/lists\/new$/)
    await page.getByLabel('Name', { exact: true }).fill(name)

    await page.locator('[data-cy=pick-list]').click()
    await page.getByRole('option', { name: `E2E rolelist ${id}` }).click()
    await page.locator('[data-cy=add-list]').click()
    const row = page.locator(`[data-cy=role-list-${list.id}]`)
    await expect(row).toBeVisible()
    // Both permissions start on; drop "manage".
    await row.getByLabel(/Manage/).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(/\/users\/roles\/lists$/)

    const saved = (await rows(page.request, '/api/roles/lists')).find((r) => r.name === name) as unknown as {
      id: number
      lists: { id: number; permissions: string[] }[]
    }
    expect(saved.lists).toEqual([expect.objectContaining({ id: list.id, permissions: ['list:get'] })])

    // Reopen shows the same, then remove the list.
    await page.getByRole('row', { name: new RegExp(name) }).getByRole('link').click()
    await expect(page.locator(`[data-cy=role-list-${list.id}]`).getByLabel(/View/)).toBeChecked()
    await expect(page.locator(`[data-cy=role-list-${list.id}]`).getByLabel(/Manage/)).not.toBeChecked()
    await page.locator(`[data-cy=role-list-${list.id}]`).getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(/\/users\/roles\/lists$/)
    const after = (await rows(page.request, '/api/roles/lists')).find((r) => r.name === name) as unknown as { lists: unknown[] | null }
    expect(after.lists ?? []).toHaveLength(0)
  } finally {
    for (const r of await rows(page.request, '/api/roles/lists')) if (r.name === name) await page.request.delete(`/api/roles/${r.id}`)
    await page.request.delete(`/api/lists/${list.id}`)
  }
})

test('users: a user can pick a list role', async ({ page }) => {
  const id = stamp()
  const username = `e2e_lr_${id}`
  const role = await makeRole(page, `E2E role ${id}`)
  const lr = (await (await page.request.post('/api/roles/lists', { data: { name: `E2E lr ${id}`, lists: [] } })).json()).data
  try {
    await page.goto('/admin/users/new')
    await page.getByLabel('Username', { exact: true }).fill(username)
    await page.getByLabel('E-mail').fill(`${username}@example.com`)
    await page.locator('[data-cy=user-role]').click()
    await page.getByRole('option', { name: `E2E role ${id}` }).click()
    await page.locator('[data-cy=list-role]').click()
    await page.getByRole('option', { name: `E2E lr ${id}` }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(/\/admin\/users$/)
    await expect(page.getByRole('row', { name: new RegExp(username) })).toContainText(`E2E lr ${id}`)
  } finally {
    for (const u of await rows(page.request, '/api/users')) if (u.username === username) await page.request.delete(`/api/users/${u.id}`)
    await page.request.delete(`/api/roles/${role.id}`)
    await page.request.delete(`/api/roles/${lr.id}`)
  }
})

// RFC 6238, as an authenticator app would.
function totp(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0')
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)))
  const h = createHmac('sha1', key).update(counter).digest()
  const o = h[h.length - 1] & 0xf
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 1_000_000).padStart(6, '0')
}

test('profile: edit details; turn two-factor on with a real code, and off with the password', async ({ page, browser, baseURL }) => {
  const id = stamp()
  const username = `e2e_me_${id}`
  const password = `pw-${id}-xyz`
  const role = await makeRole(page, `E2E me role ${id}`)
  const created = (
    await (
      await page.request.post('/api/users', {
        data: {
          username,
          email: `${username}@example.com`,
          name: 'E2E Me',
          type: 'user',
          status: 'enabled',
          password_login: true,
          password,
          password2: password,
          user_role_id: role.id,
        },
      })
    ).json()
  ).data as { id: number }

  // Sign in as that user in a context of its own, so the admin session isn't touched.
  const ctx = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  const me = await ctx.newPage()
  me.on('pageerror', (e) => {
    throw e
  })
  try {
    await me.goto('/admin/login?next=/admin/user/profile')
    await me.fill('input[name=username]', username)
    await me.fill('input[name=password]', password)
    await me.click('button[type=submit]')
    await expect(me).toHaveURL(/\/admin\/user\/profile$/)
    await expect(me.getByRole('heading', { name: `@${username}` })).toBeVisible()

    // Details
    await me.getByLabel('Name', { exact: true }).fill('E2E Renamed')
    await me.locator('[data-cy=btn-save]').click()
    await expect(me.getByText(/updated/i).first()).toBeVisible()
    expect(((await (await ctx.request.get('/api/profile')).json()).data as { name: string }).name).toBe('E2E Renamed')

    // A short or mismatched password never reaches the server.
    await me.getByLabel('Password', { exact: true }).fill('short')
    await me.locator('[data-cy=btn-save]').click()
    await expect(me.getByText(/Invalid value for password|invalid.*password/i).first()).toBeVisible()
    await me.getByLabel('Password', { exact: true }).fill('')

    // Two-factor: scan (we read the secret), confirm with a code, then it is on.
    await me.locator('[data-cy=twofa-switch]').click()
    await expect(me.getByAltText('QR code')).toBeVisible()
    const secret = (await me.locator('[data-cy=twofa] span.inline-flex').first().innerText()).trim()
    await me.getByLabel('TOTP code').fill('000000')
    await me.locator('[data-cy=twofa-enable]').click()
    await expect(me.getByText(/invalid/i).first()).toBeVisible() // wrong code is refused
    await me.getByLabel('TOTP code').fill(totp(secret))
    await me.locator('[data-cy=twofa-enable]').click()
    await expect(me.getByText('Two-factor authentication is on').first()).toBeVisible()
    expect(((await (await ctx.request.get('/api/profile')).json()).data as { twofa_type: string }).twofa_type).toBe('totp')

    // Off again needs the password.
    await me.locator('[data-cy=twofa-switch]').click()
    await me.getByLabel('Password', { exact: true }).last().fill('wrong-password-1')
    await me.locator('[data-cy=twofa-disable]').click()
    await expect(me.getByText(/Invalid password/i).first()).toBeVisible()
    await me.getByLabel('Password', { exact: true }).last().fill(password)
    await me.locator('[data-cy=twofa-disable]').click()
    await expect(me.locator('[data-cy=twofa-switch]')).toBeVisible()
    expect(((await (await ctx.request.get('/api/profile')).json()).data as { twofa_type: string }).twofa_type).toBe('none')
  } finally {
    await ctx.close()
    await page.request.delete(`/api/users/${created.id}`)
    await page.request.delete(`/api/roles/${role.id}`)
  }
})
