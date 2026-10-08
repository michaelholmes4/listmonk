// Compares the /api routes registered in cmd/handlers.go with docs/swagger/collections.yaml
// and prints the routes the spec doesn't document. Run: pnpm spec:coverage
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

const root = new URL('../../', import.meta.url)
const handlers = readFileSync(new URL('cmd/handlers.go', root), 'utf8')
const spec = parse(readFileSync(new URL('docs/swagger/collections.yaml', root), 'utf8'))

const norm = (p) => p.replace(/\{[^}]+\}/g, ':p').replace(/:[A-Za-z_]+/g, ':p')

const documented = new Set()
for (const [path, item] of Object.entries(spec.paths)) {
  for (const method of Object.keys(item)) {
    if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
      documented.add(`${method.toUpperCase()} ${norm('/api' + path)}`)
    }
  }
}

const routes = new Set()
for (const m of handlers.matchAll(/g\.(GET|POST|PUT|PATCH|DELETE)\("(\/api\/[^"]*)"/g)) {
  routes.add(`${m[1]} ${norm(m[2])}`)
}

// Not part of the admin API surface the SPA calls.
const ignore = [/^GET \/api\/events$/, /^GET \/api\/health$/, /\/api\/public\//]
const missing = [...routes].filter((r) => !documented.has(r) && !ignore.some((re) => re.test(r))).sort()

console.log(`${routes.size - missing.length}/${routes.size} routes documented`)
if (missing.length) {
  console.log('\nUndocumented:')
  for (const r of missing) console.log('  ' + r)
  if (process.argv.includes('--strict')) process.exit(1)
}
