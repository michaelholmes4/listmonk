import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import webEn from '@/locales/en.json'

// Every literal t('some.key') in src/ must exist, either in listmonk's language pack (the server
// serves i18n/en.json) or in our web.* strings. Keys built at runtime (template literals) can't be
// checked statically and are skipped.
const serverEn = JSON.parse(readFileSync(join(__dirname, '../../i18n/en.json'), 'utf8')) as Record<string, string>
const known = new Set([...Object.keys(serverEn), ...Object.keys(webEn)])

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === 'ui' || f === 'locales' ? [] : files(p)
    return /\.(vue|ts)$/.test(f) && !/\.test\.ts$/.test(f) && f !== 'schema.d.ts' ? [p] : []
  })
}

describe('translation keys', () => {
  it('every literal key used with t() exists', () => {
    const missing: string[] = []
    for (const file of files(join(__dirname))) {
      const src = readFileSync(file, 'utf8')
      // t('x.y'), $t("x.y"), and `title: 'x.y'` style route meta / nav labels (keys start with a known prefix).
      for (const m of src.matchAll(/\bt\(\s*(['"])([A-Za-z][\w]*(?:\.[\w]+)+)\1/g)) {
        if (!known.has(m[2])) missing.push(`${file.replace(__dirname + '/', '')}: ${m[2]}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('web.* strings are only defined under the web. namespace', () => {
    expect(Object.keys(webEn).filter((k) => !k.startsWith('web.'))).toEqual([])
  })
})
