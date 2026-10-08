import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// The new UI is served by the Go backend at /app/*, with its assets under /app/static.
const backend = process.env.LISTMONK_URL ?? 'http://localhost:9000'

export default defineConfig({
  base: '/app/',
  plugins: [vue(), tailwindcss()],
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
      ['/api', '/uploads', '/public', '/subscription', '/link', '/campaign', '/webhooks', '/admin'].map((p) => [
        p,
        { target: backend, changeOrigin: false },
      ]),
    ),
  },
})
