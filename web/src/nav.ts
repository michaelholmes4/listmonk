import {
  ChartBar,
  FileText,
  Image,
  LayoutDashboard,
  List,
  MailX,
  Newspaper,
  Plus,
  Rocket,
  ScrollText,
  Settings,
  ShieldUser,
  Upload,
  Users,
  Wrench,
} from '@lucide/vue'
import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

export interface NavLeaf {
  key: string
  /** i18n key. */
  label: string
  icon: Component
  /** Hidden unless the user has ANY of these (supports `group:*`). */
  perms?: string[]
  /** Route in the new UI. Present once the screen is ported. */
  to?: RouteLocationRaw
  /** Path in the classic admin, used until the screen is ported (see PARITY.md). */
  legacy?: string
}

export interface NavGroup {
  key: string
  label: string
  icon: Component
  perms?: string[]
  /** A group with a single leaf and no children renders as a plain link. */
  leaf?: NavLeaf
  children?: NavLeaf[]
}

/**
 * Mirrors the classic admin's menu (frontend/src/components/Navigation.vue), including its
 * permission gates. When a screen is ported, replace its `legacy` path with a `to` route.
 */
export const navigation: NavGroup[] = [
  {
    key: 'dashboard',
    label: 'menu.dashboard',
    icon: LayoutDashboard,
    leaf: { key: 'dashboard', label: 'menu.dashboard', icon: LayoutDashboard, to: { name: 'dashboard' } },
  },
  {
    key: 'lists',
    label: 'globals.terms.lists',
    icon: List,
    children: [
      { key: 'lists', label: 'menu.allLists', icon: List, to: { name: 'lists' } },
      { key: 'forms', label: 'menu.forms', icon: Newspaper, to: { name: 'forms' } },
    ],
  },
  {
    key: 'subscribers',
    label: 'globals.terms.subscribers',
    icon: Users,
    perms: ['subscribers:*'],
    children: [
      {
        key: 'all-subscribers',
        label: 'menu.allSubscribers',
        icon: Users,
        perms: ['subscribers:get_all', 'subscribers:get'],
        to: { name: 'subscribers' },
      },
      {
        key: 'import',
        label: 'menu.import',
        icon: Upload,
        perms: ['subscribers:import'],
        to: { name: 'import' },
      },
      {
        key: 'bounces',
        label: 'globals.terms.bounces',
        icon: MailX,
        perms: ['bounces:get'],
        to: { name: 'bounces' },
      },
    ],
  },
  {
    key: 'campaigns',
    label: 'globals.terms.campaigns',
    icon: Rocket,
    perms: ['campaigns:*'],
    children: [
      {
        key: 'all-campaigns',
        label: 'menu.allCampaigns',
        icon: Rocket,
        perms: ['campaigns:get'],
        legacy: '/admin/campaigns',
      },
      {
        key: 'new-campaign',
        label: 'menu.newCampaign',
        icon: Plus,
        perms: ['campaigns:manage'],
        legacy: '/admin/campaigns/new',
      },
      { key: 'media', label: 'menu.media', icon: Image, perms: ['media:*'], to: { name: 'media' } },
      {
        key: 'templates',
        label: 'globals.terms.templates',
        icon: FileText,
        perms: ['templates:get'],
        to: { name: 'templates' },
      },
      {
        key: 'analytics',
        label: 'globals.terms.analytics',
        icon: ChartBar,
        perms: ['campaigns:get_analytics'],
        legacy: '/admin/campaigns/analytics',
      },
    ],
  },
  {
    key: 'users',
    label: 'globals.terms.users',
    icon: ShieldUser,
    perms: ['users:*', 'roles:*'],
    children: [
      { key: 'all-users', label: 'globals.terms.users', icon: Users, perms: ['users:get'], legacy: '/admin/users' },
      {
        key: 'user-roles',
        label: 'users.userRoles',
        icon: ShieldUser,
        perms: ['roles:get'],
        legacy: '/admin/users/roles/users',
      },
      {
        key: 'list-roles',
        label: 'users.listRoles',
        icon: List,
        perms: ['roles:get'],
        legacy: '/admin/users/roles/lists',
      },
    ],
  },
  {
    key: 'settings',
    label: 'menu.settings',
    icon: Settings,
    perms: ['settings:*'],
    children: [
      {
        key: 'all-settings',
        label: 'menu.settings',
        icon: Settings,
        perms: ['settings:get'],
        legacy: '/admin/settings',
      },
      {
        key: 'maintenance',
        label: 'menu.maintenance',
        icon: Wrench,
        perms: ['settings:maintain'],
        legacy: '/admin/settings/maintenance',
      },
      { key: 'logs', label: 'menu.logs', icon: ScrollText, perms: ['settings:get'], legacy: '/admin/settings/logs' },
    ],
  },
]
