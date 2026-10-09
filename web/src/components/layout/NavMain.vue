<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { usePermission } from '@/composables/usePermission'
import { cn } from '@/lib/utils'
import { entryPages, isNavActive, type NavSection } from '@/nav'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{ sections: NavSection[] }>()

const { t } = useI18n()
const route = useRoute()
const { can } = usePermission()
const { navAlerts } = storeToRefs(useUiStore())

// Sections the user can see anything in. An entry shows if the user may open any of its pages
// and links to the first of those (e.g. Settings opens Users for someone who can only see users).
const visible = computed(() =>
  props.sections
    .map((s) => ({
      ...s,
      items: s.items.flatMap((item) => {
        const first = entryPages(item).find((p) => can(...(p.perms ?? [])))
        return first ? [{ ...item, to: first.to }] : []
      }),
    }))
    .filter((s) => s.items.length),
)
</script>

<template>
  <SidebarGroup v-for="section in visible" :key="section.key" :class="cn('py-1', section.bottom && 'mt-auto')">
    <SidebarGroupLabel v-if="section.label">{{ t(section.label) }}</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem v-for="item in section.items" :key="item.key">
          <SidebarMenuButton as-child :tooltip="t(item.label)" :is-active="isNavActive(item, route)">
            <RouterLink :to="item.to" :data-cy="`nav-${item.key}`">
              <component :is="item.icon" />
              <span>{{ t(item.label) }}</span>
            </RouterLink>
          </SidebarMenuButton>
          <SidebarMenuBadge v-if="navAlerts[item.key]">
            <span class="size-1.5 rounded-full bg-destructive" />
            <span class="sr-only">{{ navAlerts[item.key] }}</span>
          </SidebarMenuBadge>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</template>
