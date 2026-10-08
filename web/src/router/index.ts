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
  // Vite `base` is /admin/; the backend serves the SPA for every /admin/* path.
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
      path: '/automations',
      name: 'automations',
      component: () => import('@/views/automations/AutomationList.vue'),
      meta: { title: 'web.automations.title', perms: ['automations:get'] },
    },
    {
      path: '/automations/:id(\\d+)',
      name: 'automation',
      component: () => import('@/views/automations/AutomationEdit.vue'),
      meta: {
        title: 'web.automations.automation',
        parents: [{ title: 'web.automations.title', to: { name: 'automations' } }],
        perms: ['automations:get'],
      },
    },
    {
      path: '/campaigns',
      name: 'campaigns',
      component: () => import('@/views/campaigns/CampaignList.vue'),
      meta: { title: 'globals.terms.campaigns', perms: ['campaigns:get_all', 'campaigns:get'] },
    },
    {
      path: '/campaigns/new',
      name: 'campaign-new',
      component: () => import('@/views/campaigns/CampaignCreate.vue'),
      meta: {
        title: 'campaigns.newCampaign',
        parents: [{ title: 'globals.terms.campaigns', to: { name: 'campaigns' } }],
        perms: ['campaigns:manage'],
      },
    },
    {
      path: '/campaigns/:id(\\d+)',
      name: 'campaign',
      component: () => import('@/views/campaigns/CampaignEdit.vue'),
      meta: {
        title: 'globals.terms.campaign',
        parents: [{ title: 'globals.terms.campaigns', to: { name: 'campaigns' } }],
        perms: ['campaigns:get_all', 'campaigns:get'],
      },
    },
    {
      path: '/campaigns/analytics',
      name: 'campaign-analytics',
      component: () => import('@/views/campaigns/CampaignAnalytics.vue'),
      meta: {
        title: 'globals.terms.analytics',
        parents: [{ title: 'globals.terms.campaigns', to: { name: 'campaigns' } }],
        perms: ['campaigns:get_analytics'],
      },
    },
    {
      path: '/campaigns/media',
      name: 'media',
      component: () => import('@/views/media/MediaList.vue'),
      meta: { title: 'media.title', perms: ['media:get'] },
    },
    {
      path: '/campaigns/templates',
      name: 'templates',
      component: () => import('@/views/templates/TemplateList.vue'),
      meta: { title: 'globals.terms.templates', perms: ['templates:get'] },
    },
    {
      path: '/campaigns/templates/new',
      name: 'template-new',
      component: () => import('@/views/templates/TemplateCreate.vue'),
      meta: {
        title: 'templates.newTemplate',
        parents: [{ title: 'globals.terms.templates', to: { name: 'templates' } }],
        perms: ['templates:manage'],
      },
    },
    {
      path: '/campaigns/templates/:id(\\d+)',
      name: 'template',
      component: () => import('@/views/templates/TemplateEdit.vue'),
      meta: {
        title: 'globals.terms.template',
        parents: [{ title: 'globals.terms.templates', to: { name: 'templates' } }],
        perms: ['templates:get'],
      },
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
      path: '/user/profile',
      name: 'profile',
      component: () => import('@/views/profile/ProfileView.vue'),
      meta: { title: 'users.profile' },
    },
    {
      path: '/users',
      name: 'users',
      component: () => import('@/views/users/UserList.vue'),
      meta: { title: 'globals.terms.users', perms: ['users:get'] },
    },
    {
      path: '/users/new',
      name: 'user-new',
      component: () => import('@/views/users/UserCreate.vue'),
      meta: { title: 'users.newUser', parents: [{ title: 'globals.terms.users', to: { name: 'users' } }], perms: ['users:manage'] },
    },
    {
      path: '/users/:id(\\d+)',
      name: 'user',
      component: () => import('@/views/users/UserEdit.vue'),
      meta: { title: 'globals.terms.user', parents: [{ title: 'globals.terms.users', to: { name: 'users' } }], perms: ['users:get'] },
    },
    {
      path: '/users/roles/users',
      name: 'user-roles',
      component: () => import('@/views/roles/RoleList.vue'),
      props: { kind: 'user' },
      meta: { title: 'users.userRoles', perms: ['roles:get'] },
    },
    {
      path: '/users/roles/users/new',
      name: 'user-role-new',
      component: () => import('@/views/roles/RoleCreate.vue'),
      props: { kind: 'user' },
      meta: {
        title: 'users.newUserRole',
        parents: [{ title: 'users.userRoles', to: { name: 'user-roles' } }],
        perms: ['roles:manage'],
      },
    },
    {
      path: '/users/roles/users/:id(\\d+)',
      name: 'user-role',
      component: () => import('@/views/roles/RoleEdit.vue'),
      props: { kind: 'user' },
      meta: {
        title: 'users.role',
        parents: [{ title: 'users.userRoles', to: { name: 'user-roles' } }],
        perms: ['roles:get'],
      },
    },
    {
      path: '/users/roles/lists',
      name: 'list-roles',
      component: () => import('@/views/roles/RoleList.vue'),
      props: { kind: 'list' },
      meta: { title: 'users.listRoles', perms: ['roles:get'] },
    },
    {
      path: '/users/roles/lists/new',
      name: 'list-role-new',
      component: () => import('@/views/roles/RoleCreate.vue'),
      props: { kind: 'list' },
      meta: {
        title: 'users.newListRole',
        parents: [{ title: 'users.listRoles', to: { name: 'list-roles' } }],
        perms: ['roles:manage'],
      },
    },
    {
      path: '/users/roles/lists/:id(\\d+)',
      name: 'list-role',
      component: () => import('@/views/roles/RoleEdit.vue'),
      props: { kind: 'list' },
      meta: {
        title: 'users.role',
        parents: [{ title: 'users.listRoles', to: { name: 'list-roles' } }],
        perms: ['roles:get'],
      },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/settings/SettingsView.vue'),
      meta: { title: 'globals.terms.settings', perms: ['settings:get'] },
    },
    {
      path: '/settings/maintenance',
      name: 'maintenance',
      component: () => import('@/views/maintenance/MaintenanceView.vue'),
      meta: { title: 'maintenance.title', parents: [{ title: 'globals.terms.settings', to: { name: 'settings' } }], perms: ['settings:maintain'] },
    },
    {
      path: '/settings/logs',
      name: 'logs',
      component: () => import('@/views/logs/LogsView.vue'),
      meta: { title: 'logs.title', parents: [{ title: 'globals.terms.settings', to: { name: 'settings' } }], perms: ['settings:get'] },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/settings/SettingsView.vue'),
      meta: { title: 'globals.terms.settings', perms: ['settings:get'] },
    },
    {
      path: '/settings/maintenance',
      name: 'maintenance',
      component: () => import('@/views/maintenance/MaintenanceView.vue'),
      meta: { title: 'maintenance.title', parents: [{ title: 'globals.terms.settings', to: { name: 'settings' } }], perms: ['settings:maintain'] },
    },
    {
      path: '/settings/logs',
      name: 'logs',
      component: () => import('@/views/logs/LogsView.vue'),
      meta: { title: 'logs.title', parents: [{ title: 'globals.terms.settings', to: { name: 'settings' } }], perms: ['settings:get'] },
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
