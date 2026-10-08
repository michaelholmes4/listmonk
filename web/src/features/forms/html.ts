import type { List, ServerConfig } from '@/api/types'

type T = (key: string) => string

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export interface FormOptions {
  lists: Pick<List, 'uuid' | 'name' | 'description'>[]
  redirectURL: string
  config: Pick<ServerConfig, 'root_url' | 'public_subscription'>
  t: T
}

/**
 * The embeddable subscription form. Same markup as the classic generator, except that list names
 * and descriptions are escaped (the classic one pasted them in raw).
 */
export function renderFormHTML({ lists, redirectURL, config, t }: FormOptions): string {
  const root = config.root_url ?? ''
  const sub = config.public_subscription
  const script = (attrs: string) => `<${'script'} ${attrs} async defer></${'script'}>`

  let h =
    `<form method="post" action="${root}/subscription/form" class="listmonk-form">\n` +
    '  <div>\n' +
    `    <h3>${t('public.sub')}</h3>\n` +
    '    <input type="hidden" name="nonce" />\n'

  if (redirectURL) h += `    <input type="hidden" name="next" value="${esc(redirectURL)}" />\n`

  h +=
    '\n' +
    `    <p><input type="email" name="email" required placeholder="${esc(t('subscribers.email'))}" /></p>\n` +
    `    <p><input type="text" name="name" placeholder="${esc(t('public.subName'))}" /></p>\n\n`

  for (const l of lists) {
    const id = (l.uuid ?? '').slice(0, 5)
    h +=
      '    <p>\n' +
      `      <input id="${id}" type="checkbox" name="l" checked value="${l.uuid}" />\n` +
      `      <label for="${id}">${esc(l.name ?? '')}</label>\n`
    if (l.description) h += '      <br />\n' + `      <span>${esc(l.description)}</span>\n`
    h += '    </p>\n'
  }

  if (sub?.captcha_enabled) {
    if (sub.captcha_provider === 'altcha') {
      h +=
        '\n' +
        `    <altcha-widget challengeurl="${root}/api/public/captcha/altcha"></altcha-widget>\n` +
        `    ${script(`type="module" src="${root}/public/static/altcha.umd.js"`)}\n`
    } else if (sub.captcha_provider === 'hcaptcha') {
      h +=
        '\n' +
        `    <div class="h-captcha" data-sitekey="${esc(sub.captcha_key ?? '')}"></div>\n` +
        `    ${script('src="https://js.hcaptcha.com/1/api.js"')}\n`
    }
  }

  return h + '\n' + `    <input type="submit" value="${esc(t('public.sub'))}" />\n` + '  </div>\n' + '</form>'
}
