<script setup lang="ts">
import { FilePlus, ListPlus, Moon, Rocket, Sun, Upload, UserPlus } from '@lucide/vue'
import { onScopeDispose } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { usePermission } from '@/composables/usePermission'
import { useTheme } from '@/composables/useTheme'
import { registerCommandProvider } from '@/lib/commands'
import { navigation, tabPages, type NavPage } from '@/nav'
import AppSidebar from './AppSidebar.vue'
import CommandPalette from './CommandPalette.vue'
import GlobalNotices from './GlobalNotices.vue'
import PageHeader from './PageHeader.vue'

const { t } = useI18n()
const router = useRouter()
const { can } = usePermission()
const theme = useTheme()

// Navigation commands: one per page the user may open, tabs and spaces included (the palette is
// the way to any page without a sidebar row of its own). A space's pages get its own group.
const toCommand = (group: string) => (page: NavPage) => ({
  id: `nav:${page.key}`,
  group,
  label: t(page.label),
  icon: page.icon,
  run: () => router.push(page.to),
})
onScopeDispose(
  registerCommandProvider('navigation', () => {
    const entries = navigation.flatMap((s) => s.items)
    const allowed = (p: NavPage) => can(...(p.perms ?? []))
    return [
      ...entries.flatMap(tabPages).filter(allowed).map(toCommand(t('web.commands.navigation'))),
      ...entries.flatMap((e) =>
        (e.space ?? [])
          .flatMap((s) => s.items)
          .filter(allowed)
          .map(toCommand(t(e.label))),
      ),
    ]
  }),
)

// "Create" commands: actions live here and in page headers, not in the sidebar.
const creates = [
  { id: 'campaign', label: 'campaigns.newCampaign', icon: Rocket, perm: 'campaigns:manage', route: 'campaign-new' },
  { id: 'subscriber', label: 'subscribers.newSubscriber', icon: UserPlus, perm: 'subscribers:manage', route: 'subscriber-new' },
  { id: 'list', label: 'lists.newList', icon: ListPlus, perm: 'lists:manage_all', route: 'list-new' },
  { id: 'template', label: 'templates.newTemplate', icon: FilePlus, perm: 'templates:manage', route: 'template-new' },
  { id: 'import', label: 'import.title', icon: Upload, perm: 'subscribers:import', route: 'import' },
]
onScopeDispose(
  registerCommandProvider('create', () =>
    creates
      .filter((c) => can(c.perm))
      .map((c) => ({
        id: `new:${c.id}`,
        group: t('web.commands.create'),
        label: t(c.label),
        icon: c.icon,
        keywords: ['new', 'create', 'add'],
        run: () => router.push({ name: c.route }),
      })),
  ),
)

onScopeDispose(
  registerCommandProvider('preferences', () => [
    {
      id: 'theme:toggle',
      group: t('web.commands.preferences'),
      label: t('web.user.theme'),
      icon: theme.value === 'dark' ? Sun : Moon,
      keywords: ['dark', 'light', 'mode'],
      run: () => (theme.value = theme.value === 'dark' ? 'light' : 'dark'),
    },
  ]),
)
</script>

<template>
  <!-- bg-canvas is the gutter behind the floating content panel. The shell is viewport-high so
       <main> scrolls inside the panel (and Page's header can stick), not the whole document. -->
  <SidebarProvider class="h-svh has-data-[variant=inset]:bg-canvas">
    <AppSidebar />
    <SidebarInset class="overflow-hidden">
      <PageHeader />
      <GlobalNotices />
      <main class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <slot />
      </main>
    </SidebarInset>
  </SidebarProvider>
  <CommandPalette />
  <Toaster position="top-right" />
</template>
