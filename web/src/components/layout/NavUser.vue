<script setup lang="ts">
import { Check, ChevronsUpDown, LogOut, Monitor, Moon, PanelLeft, Sun, UserRound } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { useLogout, useProfile } from '@/composables/queries/useProfile'
import { useTheme } from '@/composables/useTheme'

const { t } = useI18n()
const { isMobile } = useSidebar()
const { data: profile, isPending } = useProfile()
const logout = useLogout()
const theme = useTheme()

const initials = computed(() =>
  (profile.value?.name || profile.value?.username || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join(''),
)

const themes = [
  { value: 'light', label: 'web.user.themeLight', icon: Sun },
  { value: 'dark', label: 'web.user.themeDark', icon: Moon },
  { value: 'auto', label: 'web.user.themeSystem', icon: Monitor },
] as const
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <!-- Loading is local to this block; the rest of the shell is already usable. -->
      <div v-if="isPending" class="flex items-center gap-2 p-2">
        <Skeleton class="size-8 rounded-lg" />
        <div class="grid flex-1 gap-1 group-data-[collapsible=icon]:hidden">
          <Skeleton class="h-3 w-24" />
          <Skeleton class="h-3 w-32" />
        </div>
      </div>
      <DropdownMenu v-else>
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton size="lg" class="data-[state=open]:bg-sidebar-accent">
            <Avatar class="size-8 rounded-lg">
              <AvatarImage v-if="profile?.avatar" :src="profile.avatar" :alt="profile.name" />
              <AvatarFallback class="rounded-lg">{{ initials }}</AvatarFallback>
            </Avatar>
            <div class="grid flex-1 text-left text-sm leading-tight">
              <span class="truncate font-medium">{{ profile?.name || profile?.username }}</span>
              <span class="truncate text-xs text-muted-foreground">{{ profile?.email }}</span>
            </div>
            <ChevronsUpDown class="ml-auto size-4" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          class="w-(--reka-dropdown-menu-trigger-width) min-w-56 rounded-lg"
          :side="isMobile ? 'bottom' : 'right'"
          align="end"
          :side-offset="4"
        >
          <DropdownMenuLabel class="text-xs text-muted-foreground">{{ t('web.user.theme') }}</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem v-for="th in themes" :key="th.value" @select.prevent="theme = th.value">
              <component :is="th.icon" />
              {{ t(th.label) }}
              <Check v-if="theme === th.value" class="ml-auto" />
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem as-child>
              <RouterLink :to="{ name: 'profile' }"><UserRound />{{ t('users.profile') }}</RouterLink>
            </DropdownMenuItem>
            <DropdownMenuItem as-child>
              <a href="/admin/"><PanelLeft />{{ t('web.user.classicAdmin') }}</a>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem :disabled="logout.isPending.value" @select="logout.mutate()">
            <LogOut />
            {{ t('users.logout') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
