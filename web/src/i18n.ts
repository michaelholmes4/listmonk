import { createI18n } from 'vue-i18n'
import { getLanguagePack } from '@/api/config'
import type { LanguagePack } from '@/api/types'
import webEn from '@/locales/en.json'

// New-UI-only strings live in `web.*` keys, bundled here; everything else comes from the
// server's language pack (`/api/lang/:lang`, the same i18n/*.json files the old UI uses), so
// existing translations carry over. Languages without a `web.*` pack fall back to English.
const webPacks: Record<string, LanguagePack> = { en: webEn }

/**
 * listmonk's packs are flat maps ("globals.terms.lists": "Lists"). vue-i18n's `flatJson` mode
 * would nest them, which can't represent a key that is both a leaf and a prefix of another
 * (e.g. "x.type" and "x.type.y") and silently drops one. Looking keys up as-is avoids that.
 */
export const flatResolver = (obj: unknown, path: string) => (obj as Record<string, string>)[path] ?? null

/**
 * listmonk messages use only `{name}` placeholders and `a | b` plurals, but they also contain
 * literal text vue-i18n would parse as syntax (Go template snippets like `{{ .Campaign }}`,
 * "@", "$"). Keep real placeholders and turn everything else into literal interpolations.
 */
export const escapeMessage = (msg: string) =>
  msg.replace(/\{[A-Za-z_]\w*\}|[{}@$]/g, (m) => (m.length > 1 ? m : `{'${m}'}`))

export const escapePack = (pack: LanguagePack): LanguagePack =>
  Object.fromEntries(Object.entries(pack).map(([k, v]) => [k, escapeMessage(v)]))

export const i18n = createI18n<[LanguagePack], string, false>({
  legacy: false,
  messageResolver: flatResolver,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en: webEn },
  missingWarn: false,
  fallbackWarn: false,
})

export async function loadLocale(lang: string, pack?: LanguagePack) {
  const server = pack ?? (await getLanguagePack(lang))
  i18n.global.setLocaleMessage(lang, { ...webEn, ...webPacks[lang], ...escapePack(server) })
  i18n.global.locale.value = lang
  document.documentElement.lang = lang
}
