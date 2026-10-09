<script setup lang="ts">
import { ArrowLeft, Search } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { Kbd } from '@/components/ui/kbd'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { navigation, spaceEntry } from '@/nav'
import { useUiStore } from '@/stores/ui'
import AppLogo from './AppLogo.vue'
import NavMain from './NavMain.vue'
import NavUser from './NavUser.vue'

const { t } = useI18n()
const route = useRoute()
const ui = useUiStore()
const modKey = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl+'

// Inside a space (Settings) the sidebar lists the space, with a way back to where you were.
const space = computed(() => spaceEntry(route))
const backTo = ref('/')
watch(
  () => route.fullPath,
  () => !space.value && (backTo.value = route.fullPath),
  { immediate: true },
)
</script>

<template>
  <Sidebar variant="inset" collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child>
            <RouterLink :to="{ name: 'dashboard' }">
              <!-- The menu button sizes every svg to size-4, so the logo sizes are forced. -->
              <AppLogo class="ml-1 h-5! w-auto! group-data-[collapsible=icon]:hidden" />
              <div class="hidden size-8 items-center justify-center group-data-[collapsible=icon]:flex">
                <AppLogo mark class="size-5!" />
              </div>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem v-if="space">
          <SidebarMenuButton as-child :tooltip="t('web.nav.back')">
            <RouterLink :to="backTo" data-cy="nav-back">
              <ArrowLeft />
              <span>{{ t('web.nav.back') }}</span>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <!-- Its own menu so the header's gap separates it from the logo. -->
      <SidebarMenu v-if="!space" class="group-data-[collapsible=icon]:hidden">
        <SidebarMenuItem>
          <SidebarMenuButton
            variant="outline"
            class="text-muted-foreground"
            data-cy="nav-search"
            @click="ui.commandPaletteOpen = true"
          >
            <Search />
            <span>{{ t('web.commands.search') }}</span>
            <Kbd class="ml-auto">{{ modKey }}K</Kbd>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <NavMain :sections="space?.space ?? navigation" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser />
    </SidebarFooter>
  </Sidebar>
</template>
