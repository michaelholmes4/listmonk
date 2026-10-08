import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import webEn from '@/locales/en.json'
import { escapePack, flatResolver } from '@/i18n'

// The server's language packs (i18n/*.json, shared with the classic UI) must compile under
// vue-i18n, or the page would render raw keys / throw. Checked for every shipped language.
const dir = resolve(import.meta.dirname, '../../i18n')
const packs = readdirSync(dir).filter((f) => f.endsWith('.json'))

describe('language packs compile under vue-i18n', () => {
  for (const file of packs) {
    it(file, () => {
      const raw = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as Record<string, string>
      const pack = escapePack(raw)
      const errors: string[] = []
      const i18n = createI18n({
        legacy: false,
        messageResolver: flatResolver,
        locale: 'x',
        messages: { x: pack },
        missingWarn: false,
        onError: (e: Error) => errors.push(e.message),
      })
      // A key that fails to resolve returns the key itself, so check the value, not just "no throw".
      const unresolved = Object.keys(pack).filter((key) => {
        const out = i18n.global.t(key, { n: 1, count: 1 })
        // Plain messages (no placeholder, no plural) must come out exactly as written.
        const plain = !/\{[A-Za-z_]\w*\}|\|/.test(raw[key])
        return plain ? out !== raw[key] : out === key
      })
      expect(unresolved).toEqual([])
      expect(errors).toEqual([])
    })
  }
})

describe('web.* strings', () => {
  it('are all namespaced and compile', () => {
    const errors: string[] = []
    const i18n = createI18n({
      legacy: false,
      messageResolver: flatResolver,
      locale: 'en',
      messages: { en: webEn },
      onError: (e: Error) => errors.push(e.message),
    })
    for (const key of Object.keys(webEn)) {
      expect(key.startsWith('web.')).toBe(true)
      expect(i18n.global.t(key)).not.toBe(key)
    }
    expect(errors).toEqual([])
  })
})
