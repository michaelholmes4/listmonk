import {
  ChartBar,
  FileText,
  Image,
  LayoutDashboard,
  List,
  ListChecks,
  MailX,
  Newspaper,
  Rocket,
  ScrollText,
  Settings,
  ShieldUser,
  Upload,
  Workflow,
  Users,
  UserCog,
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
  to: { name: string } & RouteLocationRaw
  /** Other route names under this entry (detail and create pages): the entry stays highlighted there. */
  match?: string[]
}

export interface NavSection {
  key: string
  /** i18n key of the section heading; none for the top section. */
  label?: string
  items: NavLeaf[]
}

/**
 * The sidebar: destinations only (no actions), grouped by job and all visible (see web/UX.md).
 * Permission gates mirror the classic admin's menu.
 */
export const navigation: NavSection[] = [
  {
    key: 'home',
    items: [{ key: 'dashboard', label: 'menu.dashboard', icon: LayoutDashboard, to: { name: 'dashboard' } }],
  },
  {
    key: 'audience',
    label: 'web.nav.audience',
    items: [
      {
        key: 'subscribers',
        label: 'globals.terms.subscribers',
        icon: Users,
        perms: ['subscribers:get_all', 'subscribers:get'],
        to: { name: 'subscribers' },
        match: ['subscribers-list', 'subscriber', 'subscriber-new'],
      },
      { key: 'lists', label: 'globals.terms.lists', icon: List, to: { name: 'lists' }, match: ['list', 'list-new'] },
      { key: 'import', label: 'menu.import', icon: Upload, perms: ['subscribers:import'], to: { name: 'import' } },
      { key: 'bounces', label: 'globals.terms.bounces', icon: MailX, perms: ['bounces:get'], to: { name: 'bounces' } },
      { key: 'forms', label: 'menu.forms', icon: Newspaper, to: { name: 'forms' } },
    ],
  },
  {
    key: 'messaging',
    label: 'web.nav.messaging',
    items: [
      {
        key: 'campaigns',
        label: 'globals.terms.campaigns',
        icon: Rocket,
        perms: ['campaigns:get_all', 'campaigns:get'],
        to: { name: 'campaigns' },
        match: ['campaign', 'campaign-new'],
      },
      {
        key: 'automations',
        label: 'web.automations.title',
        icon: Workflow,
        perms: ['automations:get'],
        to: { name: 'automations' },
        match: ['automation'],
      },
      {
        key: 'templates',
        label: 'globals.terms.templates',
        icon: FileText,
        perms: ['templates:get'],
        to: { name: 'templates' },
        match: ['template', 'template-new'],
      },
      { key: 'media', label: 'menu.media', icon: Image, perms: ['media:*'], to: { name: 'media' } },
      {
        key: 'analytics',
        label: 'globals.terms.analytics',
        icon: ChartBar,
        perms: ['campaigns:get_analytics'],
        to: { name: 'campaign-analytics' },
      },
    ],
  },
  {
    key: 'admin',
    label: 'web.nav.admin',
    items: [
      { key: 'users', label: 'globals.terms.users', icon: UserCog, perms: ['users:get'], to: { name: 'users' }, match: ['user', 'user-new'] },
      {
        key: 'user-roles',
        label: 'users.userRoles',
        icon: ShieldUser,
        perms: ['roles:get'],
        to: { name: 'user-roles' },
        match: ['user-role', 'user-role-new'],
      },
      {
        key: 'list-roles',
        label: 'users.listRoles',
        icon: ListChecks,
        perms: ['roles:get'],
        to: { name: 'list-roles' },
        match: ['list-role', 'list-role-new'],
      },
      { key: 'settings', label: 'menu.settings', icon: Settings, perms: ['settings:get'], to: { name: 'settings' } },
      { key: 'maintenance', label: 'menu.maintenance', icon: Wrench, perms: ['settings:maintain'], to: { name: 'maintenance' } },
      { key: 'logs', label: 'menu.logs', icon: ScrollText, perms: ['settings:get'], to: { name: 'logs' } },
    ],
  },
]

/** Whether `leaf` is the nav entry for the route named `routeName`. */
export const isNavActive = (leaf: NavLeaf, routeName: unknown) =>
  leaf.to.name === routeName || (leaf.match ?? []).includes(routeName as string)
