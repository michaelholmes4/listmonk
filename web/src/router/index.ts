import { createRouter, createWebHistory } from 'vue-router'
import { toast } from 'vue-sonner'
import { keys } from '@/composables/queries/keys'
import { i18n } from '@/i18n'
import { userCan } from '@/lib/permissions'
import { queryClient } from '@/lib/query-client'
import type { User } from '@/api/types'

declare module 'vue-router' {
  interface RouteMeta {
    /** i18n key of the page title (shown in the header and the tab). */
    title: string
    /** Parent crumbs, outermost first. */
    parents?: { title: string; to: { name: string } }[]
    /** Route is only reachable with ANY of these permissions. */
    perms?: string[]
  }
}

export const router = createRouter({
  // Vite `base` is /app/; the backend serves the SPA for every /app/* path.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { title: 'menu.dashboard' },
    },
    ...[
      { path: '/subscribers', name: 'subscribers' },
      { path: '/subscribers/new', name: 'subscribers-new' },
      { path: '/subscribers/:id(\\d+)', name: 'subscriber' },
      { path: '/subscribers/lists/:listID(\\d+)', name: 'subscribers-list' },
    ].map((r) => ({
      ...r,
      // The edit/new sheet is the same view with the sheet open, so closing it keeps the table state.
      component: () => import('@/views/subscribers/SubscribersView.vue'),
      meta: {
        title: 'globals.terms.subscribers',
        perms: ['subscribers:get_all', 'subscribers:get'],
      },
    })),
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: 'web.errors.notFoundTitle' },
    },
  ],
})

router.beforeEach((to) => {
  // The profile is loaded before the app mounts (see main.ts), so this is a cache read.
  const profile = queryClient.getQueryData<User>(keys.profile)
  if (to.meta.perms && !userCan(profile, ...to.meta.perms)) {
    toast.error(i18n.global.t('globals.messages.permissionDenied', { name: to.fullPath }))
    return { name: 'dashboard' }
  }
})

const baseTitle = document.title
router.afterEach((to) => {
  document.title = `${i18n.global.t(to.meta.title)} · ${baseTitle}`
})
