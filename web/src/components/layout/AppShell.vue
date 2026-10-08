<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'
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

// Navigation commands: one per visible nav leaf (the palette respects the same permissions).
onScopeDispose(
  registerCommandProvider('navigation', () =>
    navigation
      .filter((g) => can(...(g.perms ?? [])))
      .flatMap((g) => (g.leaf ? [g.leaf] : (g.children ?? []).filter((c) => can(...(c.perms ?? [])))))
      .map((leaf) => ({
        id: `nav:${leaf.key}`,
        group: t('web.commands.navigation'),
        label: t(leaf.label),
        icon: leaf.icon,
        run: () => router.push(leaf.to),
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
