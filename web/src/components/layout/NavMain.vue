<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { usePermission } from '@/composables/usePermission'
import { isNavActive, navigation } from '@/nav'

const { t } = useI18n()
const route = useRoute()
const { can } = usePermission()

// Sections the user can see anything in, with only the entries they may open.
const sections = computed(() =>
  navigation
    .map((s) => ({ ...s, items: s.items.filter((i) => can(...(i.perms ?? []))) }))
    .filter((s) => s.items.length),
)
</script>

<template>
  <SidebarGroup v-for="section in sections" :key="section.key" class="py-1">
    <SidebarGroupLabel v-if="section.label">{{ t(section.label) }}</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem v-for="item in section.items" :key="item.key">
          <SidebarMenuButton as-child :tooltip="t(item.label)" :is-active="isNavActive(item, route.name)">
            <RouterLink :to="item.to" :data-cy="`nav-${item.key}`">
              <component :is="item.icon" />
              <span>{{ t(item.label) }}</span>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</template>
