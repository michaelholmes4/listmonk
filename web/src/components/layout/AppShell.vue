<script setup lang="ts">
import { FilePlus, ListPlus, Moon, Rocket, Sun, UserPlus } from '@lucide/vue'
import { onScopeDispose } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { usePermission } from '@/composables/usePermission'
import { useTheme } from '@/composables/useTheme'
import { registerCommandProvider } from '@/lib/commands'
import { navigation } from '@/nav'
import AppSidebar from './AppSidebar.vue'
import CommandPalette from './CommandPalette.vue'
import GlobalNotices from './GlobalNotices.vue'
import PageHeader from './PageHeader.vue'

const { t } = useI18n()
const router = useRouter()
const { can } = usePermission()
const theme = useTheme()

// Navigation commands: one per visible nav entry (the palette respects the same permissions).
onScopeDispose(
  registerCommandProvider('navigation', () =>
    navigation
      .flatMap((s) => s.items)
      .filter((leaf) => can(...(leaf.perms ?? [])))
      .map((leaf) => ({
        id: `nav:${leaf.key}`,
        group: t('web.commands.navigation'),
        label: t(leaf.label),
        icon: leaf.icon,
        run: () => router.push(leaf.to),
      })),
  ),
)

// "Create" commands: actions live here and in page headers, not in the sidebar.
const creates = [
  { id: 'campaign', label: 'campaigns.newCampaign', icon: Rocket, perm: 'campaigns:manage', route: 'campaign-new' },
  { id: 'subscriber', label: 'subscribers.newSubscriber', icon: UserPlus, perm: 'subscribers:manage', route: 'subscriber-new' },
  { id: 'list', label: 'lists.newList', icon: ListPlus, perm: 'lists:manage_all', route: 'list-new' },
  { id: 'template', label: 'templates.newTemplate', icon: FilePlus, perm: 'templates:manage', route: 'template-new' },
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
  <!-- bg-canvas is the gutter behind the floating content panel. -->
  <SidebarProvider class="has-data-[variant=inset]:bg-canvas">
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
