import { createRouter, createWebHistory } from 'vue-router'
import { toast } from 'vue-sonner'
import { keys } from '@/composables/queries/keys'
import { i18n } from '@/i18n'
import { userCan } from '@/lib/permissions'
import { baseTitle } from '@/lib/page-title'
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
    {
      path: '/lists/forms',
      name: 'forms',
      component: () => import('@/views/forms/FormsView.vue'),
      meta: { title: 'forms.title', parents: [{ title: 'globals.terms.lists', to: { name: 'lists' } }] },
    },
    {
      path: '/lists',
      name: 'lists',
      component: () => import('@/views/lists/ListList.vue'),
      meta: { title: 'globals.terms.lists' },
    },
    {
      path: '/lists/new',
      name: 'list-new',
      component: () => import('@/views/lists/ListCreate.vue'),
      meta: { title: 'lists.newList', parents: [{ title: 'globals.terms.lists', to: { name: 'lists' } }], perms: ['lists:manage_all'] },
    },
    {
      path: '/lists/:id(\\d+)',
      name: 'list',
      component: () => import('@/views/lists/ListEdit.vue'),
      meta: { title: 'globals.terms.list', parents: [{ title: 'globals.terms.lists', to: { name: 'lists' } }] },
    },
    {
      path: '/subscribers/bounces',
      name: 'bounces',
      component: () => import('@/views/bounces/BounceList.vue'),
      meta: {
        title: 'globals.terms.bounces',
        parents: [{ title: 'globals.terms.subscribers', to: { name: 'subscribers' } }],
        perms: ['bounces:get'],
      },
    },
    {
      path: '/subscribers/import',
      name: 'import',
      component: () => import('@/views/import/ImportView.vue'),
      meta: {
        title: 'import.title',
        parents: [{ title: 'globals.terms.subscribers', to: { name: 'subscribers' } }],
        perms: ['subscribers:import'],
      },
    },
    ...[
      { path: '/subscribers', name: 'subscribers' },
      { path: '/subscribers/lists/:listID(\\d+)', name: 'subscribers-list' },
    ].map((r) => ({
      ...r,
      component: () => import('@/views/subscribers/SubscriberList.vue'),
      meta: { title: 'globals.terms.subscribers', perms: ['subscribers:get_all', 'subscribers:get'] },
    })),
    {
      path: '/subscribers/new',
      name: 'subscriber-new',
      component: () => import('@/views/subscribers/SubscriberCreate.vue'),
      meta: {
        title: 'subscribers.newSubscriber',
        parents: [{ title: 'globals.terms.subscribers', to: { name: 'subscribers' } }],
        perms: ['subscribers:manage'],
      },
    },
    {
      path: '/subscribers/:id(\\d+)',
      name: 'subscriber',
      component: () => import('@/views/subscribers/SubscriberEdit.vue'),
      meta: {
        title: 'globals.terms.subscriber',
        parents: [{ title: 'globals.terms.subscribers', to: { name: 'subscribers' } }],
        perms: ['subscribers:get_all', 'subscribers:get'],
      },
    },
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

router.afterEach((to) => {
  document.title = `${i18n.global.t(to.meta.title)} · ${baseTitle}`
})
