import {
  ChartBar,
  FileText,
  Gauge,
  Image,
  ImageUp,
  LayoutDashboard,
  List,
  ListChecks,
  MailX,
  MessageSquare,
  Newspaper,
  Palette,
  Rocket,
  ScrollText,
  Send,
  Server,
  Settings,
  ShieldCheck,
  ShieldUser,
  SlidersHorizontal,
  UserCog,
  UserLock,
  UserRound,
  Users,
  Workflow,
  Wrench,
} from '@lucide/vue'
import type { Component } from 'vue'
import type { RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router'
import { tabLabels, tabOfQuery, tabs as settingsTabs, type SettingsTab } from '@/features/settings/tabIds'

export interface NavPage {
  key: string
  /** i18n key. */
  label: string
  icon: Component
  /** Hidden unless the user has ANY of these (supports `group:*`). */
  perms?: string[]
  to: { name: string } & RouteLocationRaw
  /** Other route names under this page (detail and create pages): its nav entry stays highlighted there. */
  match?: string[]
  /** For pages a route name can't tell apart (Settings sections share one route). Replaces `to`/`match`. */
  isActive?: (route: RouteLocationNormalizedLoaded) => boolean
}

export interface NavLeaf extends NavPage {
  /**
   * Secondary pages of this entry. They aren't in the sidebar: the entry's page and each of these
   * show them all as tabs (`PageTabs`). The command palette still lists them.
   */
  pages?: NavPage[]
  /** The entry's own page as a tab, when that differs from the entry's name (Reports → Analytics). */
  tabLabel?: string
  /** Opens a space of its own (Settings): on its pages the sidebar shows these sections, with a way back. */
  space?: NavSection[]
}

export interface NavSection {
  key: string
  /** i18n key of the section heading; none for the top and bottom sections. */
  label?: string
  /** Pinned to the foot of the sidebar, away from the daily work. */
  bottom?: boolean
  items: NavLeaf[]
}

const settingsIcons: Record<SettingsTab, Component> = {
  general: SlidersHorizontal,
  performance: Gauge,
  privacy: UserLock,
  security: ShieldCheck,
  media: ImageUp,
  smtp: Server,
  bounces: MailX,
  messengers: MessageSquare,
  appearance: Palette,
}

/**
 * Settings and administration: a space of its own, like Linear's or Stripe's settings, so none of
 * it takes room in the everyday sidebar. The form's sections are links here (`?tab=`).
 */
const settingsSpace: NavSection[] = [
  {
    key: 'settings',
    label: 'web.nav.workspace',
    items: settingsTabs.map((id) => ({
      key: `settings-${id}`,
      label: tabLabels[id],
      icon: settingsIcons[id],
      perms: ['settings:get'],
      to: { name: 'settings', query: { tab: id } },
      isActive: (r) => r.name === 'settings' && tabOfQuery(r.query.tab) === id,
    })),
  },
  {
    key: 'team',
    label: 'web.nav.team',
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
    ],
  },
  {
    key: 'system',
    label: 'web.nav.system',
    items: [
      { key: 'maintenance', label: 'menu.maintenance', icon: Wrench, perms: ['settings:maintain'], to: { name: 'maintenance' } },
      { key: 'logs', label: 'menu.logs', icon: ScrollText, perms: ['settings:get'], to: { name: 'logs' } },
    ],
  },
  {
    key: 'account',
    label: 'web.nav.account',
    items: [{ key: 'profile', label: 'users.profile', icon: UserRound, to: { name: 'profile' } }],
  },
]

/**
 * The sidebar: the few destinations used day to day, grouped by job and all visible (see web/UX.md).
 * Less frequent pages hang off an entry as `pages` (tabs on that entry's page) instead of adding
 * rows; administration lives in the Settings space. Permission gates mirror the classic admin's menu.
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
        // Import is an action (the header's Import button and the palette), so it's no tab.
        match: ['subscribers-list', 'subscriber', 'subscriber-new', 'import'],
      },
      {
        key: 'lists',
        label: 'globals.terms.lists',
        icon: List,
        to: { name: 'lists' },
        match: ['list', 'list-new'],
        pages: [{ key: 'forms', label: 'menu.forms', icon: Newspaper, to: { name: 'forms' } }],
      },
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
        match: ['automation', 'automation-email'],
      },
      {
        key: 'templates',
        label: 'globals.terms.templates',
        icon: FileText,
        perms: ['templates:get'],
        to: { name: 'templates' },
        match: ['template', 'template-new'],
        pages: [{ key: 'media', label: 'menu.media', icon: Image, perms: ['media:*'], to: { name: 'media' } }],
      },
      {
        // How sending went: campaign performance, every outgoing email, and what bounced.
        key: 'reports',
        label: 'web.nav.reports',
        tabLabel: 'globals.terms.analytics',
        icon: ChartBar,
        perms: ['campaigns:get_analytics'],
        to: { name: 'campaign-analytics' },
        pages: [
          { key: 'messages', label: 'web.messages.title', icon: Send, perms: ['message_log:get'], to: { name: 'messages' }, match: ['message'] },
          { key: 'bounces', label: 'globals.terms.bounces', icon: MailX, perms: ['bounces:get'], to: { name: 'bounces' } },
        ],
      },
    ],
  },
  {
    key: 'admin',
    bottom: true,
    items: [{ key: 'settings', label: 'menu.settings', icon: Settings, perms: ['settings:get'], to: { name: 'settings' }, space: settingsSpace }],
  },
]

/** The entry's tabs: its own page (under its tab label) followed by its secondary pages. */
export const tabPages = (leaf: NavLeaf): NavPage[] => [{ ...leaf, label: leaf.tabLabel ?? leaf.label }, ...(leaf.pages ?? [])]

/** Every page an entry leads to: its tabs and its space's pages. */
export const entryPages = (leaf: NavLeaf): NavPage[] => [...tabPages(leaf), ...(leaf.space ?? []).flatMap((s) => s.items)]

/** Whether `page` is the page shown at `route` (or one of its detail pages). */
export const isPageActive = (page: NavPage, route: RouteLocationNormalizedLoaded) =>
  page.isActive ? page.isActive(route) : page.to.name === route.name || (page.match ?? []).includes(route.name as string)

/** Whether `leaf` is the nav entry for `route`: its own routes, a tab's, or its space's. */
export const isNavActive = (leaf: NavLeaf, route: RouteLocationNormalizedLoaded) => entryPages(leaf).some((p) => isPageActive(p, route))

const entries = () => navigation.flatMap((s) => s.items)

/** The entry whose tabs `route` shows: only on the tabbed pages themselves, not their detail pages. */
export const tabbedEntry = (route: RouteLocationNormalizedLoaded) =>
  entries().find((leaf) => leaf.pages && tabPages(leaf).some((p) => p.to.name === route.name))

/** The entry whose space `route` is in, if any: the sidebar then shows that space. */
export const spaceEntry = (route: RouteLocationNormalizedLoaded) =>
  entries().find((leaf) => leaf.space?.some((s) => s.items.some((p) => isPageActive(p, route))))
