import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// The UI is served by the Go backend at /admin/*, with its assets under /admin/static. The
// server-rendered pages under /admin (login, password reset) and the custom appearance files must
// reach the backend; every other /admin path is this app's.
const backend = process.env.LISTMONK_URL ?? 'http://localhost:9000'

export default defineConfig({
  base: '/admin/',
  plugins: [
    vue(),
    tailwindcss(),
    // The backend sends logins (and other redirects) to "/admin", which Vite's dev server answers
    // with a "did you mean /admin/?" 404 because of `base`. Send it on to "/admin/".
    {
      name: 'admin-trailing-slash',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const [p, q] = (req.url ?? '').split('?', 2)
          if (p !== '/admin') return next()
          res.statusCode = 302
          res.setHeader('Location', '/admin/' + (q ? `?${q}` : ''))
          res.end()
        })
      },
    },
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  build: {
    assetsDir: 'static',
  },
  server: {
    host: true,
    port: 5173,
    proxy: Object.fromEntries(
      [
        '/api',
        '/uploads',
        '/public',
        '/subscription',
        '/link',
        '/campaign',
        '/webhooks',
        '^/admin/(login|forgot|reset|custom\\.(css|js))',
      ].map((p) => [p, { target: backend, changeOrigin: false }]),
    ),
  },
})
