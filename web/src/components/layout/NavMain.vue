<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { usePermission } from '@/composables/usePermission'
import { navigation, type NavLeaf } from '@/nav'

const { t } = useI18n()
const route = useRoute()
const { can } = usePermission()
const { setOpen, state } = useSidebar()

const visibleChildren = (children: NavLeaf[]) => children.filter((c) => can(...(c.perms ?? [])))

const isActive = (leaf: NavLeaf) => typeof leaf.to === 'object' && 'name' in leaf.to && route.name === leaf.to.name

// Clicking a group in the icon rail expands the sidebar so its children are reachable.
const onGroupClick = () => {
  if (state.value === 'collapsed') setOpen(true)
}
</script>

<template>
  <SidebarGroup>
    <SidebarMenu>
      <template v-for="group in navigation" :key="group.key">
        <template v-if="can(...(group.perms ?? []))">
          <!-- Single link -->
          <SidebarMenuItem v-if="group.leaf">
            <SidebarMenuButton as-child :tooltip="t(group.label)" :is-active="isActive(group.leaf)">
              <RouterLink :to="group.leaf.to">
                <component :is="group.leaf.icon" />
                <span>{{ t(group.leaf.label) }}</span>
              </RouterLink>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <!-- Group with children -->
          <Collapsible
            v-else-if="group.children && visibleChildren(group.children).length"
            as-child
            class="group/collapsible"
            :default-open="group.children.some(isActive)"
          >
            <SidebarMenuItem>
              <CollapsibleTrigger as-child>
                <SidebarMenuButton :tooltip="t(group.label)" @click="onGroupClick">
                  <component :is="group.icon" />
                  <span>{{ t(group.label) }}</span>
                  <ChevronRight
                    class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                  />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  <SidebarMenuSubItem v-for="leaf in visibleChildren(group.children)" :key="leaf.key">
                    <SidebarMenuSubButton as-child :is-active="isActive(leaf)">
                      <RouterLink :to="leaf.to">
                        <span>{{ t(leaf.label) }}</span>
                      </RouterLink>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </template>
      </template>
    </SidebarMenu>
  </SidebarGroup>
</template>
