import { describe, expect, it } from 'vitest'
import { renderFormHTML } from './html'

const t = (k: string) => ({ 'public.sub': 'Subscribe', 'subscribers.email': 'E-mail', 'public.subName': 'Name' })[k] ?? k
const config = { root_url: 'https://lists.example.com', public_subscription: { enabled: true } }
const lists = [{ uuid: 'abcdef12-0000', name: 'News <b>&</b>', description: 'Say "hi"' }]

describe('renderFormHTML', () => {
  it('posts to the public form and lists each selected list by uuid', () => {
    const h = renderFormHTML({ lists, redirectURL: '', config, t })
    expect(h).toContain('action="https://lists.example.com/subscription/form"')
    expect(h).toContain('value="abcdef12-0000"')
    expect(h).toContain('id="abcde"')
  })

  it('escapes list names, descriptions and the redirect URL', () => {
    const h = renderFormHTML({ lists, redirectURL: 'https://x.test/?a="1"', config, t })
    expect(h).toContain('News &lt;b&gt;&amp;&lt;/b&gt;')
    expect(h).toContain('Say &quot;hi&quot;')
    expect(h).toContain('value="https://x.test/?a=&quot;1&quot;"')
    expect(h).not.toContain('<b>')
  })

  it('omits the redirect field when none is chosen', () => {
    expect(renderFormHTML({ lists, redirectURL: '', config, t })).not.toContain('name="next"')
  })

  it('adds the captcha widget for the configured provider', () => {
    const altcha = renderFormHTML({
      lists,
      redirectURL: '',
      config: { ...config, public_subscription: { enabled: true, captcha_enabled: true, captcha_provider: 'altcha' } },
      t,
    })
    expect(altcha).toContain('<altcha-widget challengeurl="https://lists.example.com/api/public/captcha/altcha">')
    const hc = renderFormHTML({
      lists,
      redirectURL: '',
      config: { ...config, public_subscription: { enabled: true, captcha_enabled: true, captcha_provider: 'hcaptcha', captcha_key: 'K' } },
      t,
    })
    expect(hc).toContain('data-sitekey="K"')
  })
})
