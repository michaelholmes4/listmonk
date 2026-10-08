import '@fontsource-variable/geist'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import './assets/main.css'
import { configQuery } from './composables/queries/useConfig'
import { profileQuery } from './composables/queries/useProfile'
import { i18n, loadLocale } from './i18n'
import { queryClient } from './lib/query-client'
import { router } from './router'

// The shell needs the user's permissions and language pack to render anything meaningful, so
// those two load first (a failure on 401 redirects to login). Everything after this is
// per-component loading with skeletons.
async function bootstrap() {
  const [config] = await Promise.all([queryClient.fetchQuery(configQuery()), queryClient.fetchQuery(profileQuery())])
  await loadLocale(config.lang ?? 'en')

  const app = createApp(App).use(createPinia()).use(VueQueryPlugin, { queryClient }).use(i18n).use(router)
  // Resolve the initial route first so the shell never renders with an empty route.
  await router.isReady()
  app.mount('#app')
}

bootstrap().catch((err) => {
  // Errors that aren't a redirect to login (e.g. API down): show something instead of a blank page.
  document.getElementById('app')!.textContent = `Failed to load: ${err instanceof Error ? err.message : err}`
})
