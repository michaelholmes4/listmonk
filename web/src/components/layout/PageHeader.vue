<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import { useIsFetching, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { dynamicTitle } from '@/lib/page-title'

const { t } = useI18n()
const route = useRoute()

// Crumbs come from route meta, so a view never builds its own header.
const parents = computed(() => route.meta.parents ?? [])

// Refetch everything on the page. Editing screens refetch fine too: forms with unsaved edits keep them.
const qc = useQueryClient()
const fetching = useIsFetching()
const refresh = () => qc.invalidateQueries({ type: 'active' })
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
    <SidebarTrigger class="-ml-1" :title="t('web.nav.toggle')" />
    <Separator
      orientation="vertical"
      class="mr-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
    />
    <Breadcrumb>
      <BreadcrumbList>
        <template v-for="p in parents" :key="p.title">
          <BreadcrumbItem class="hidden md:block">
            <BreadcrumbLink as-child>
              <RouterLink :to="p.to">{{ t(p.title) }}</RouterLink>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator class="hidden md:block" />
        </template>
        <BreadcrumbItem>
          <BreadcrumbPage>{{ dynamicTitle ?? (route.meta.title ? t(route.meta.title) : '') }}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
    <!-- Views can put page-level actions here via <Teleport to="#page-actions">. -->
    <div id="page-actions" class="ml-auto flex items-center gap-2" />
    <Button variant="ghost" size="icon-sm" :title="t('globals.buttons.refresh')" :aria-label="t('globals.buttons.refresh')" data-cy="btn-refresh" @click="refresh">
      <RefreshCw :class="fetching > 0 && 'animate-spin'" />
    </Button>
  </header>
</template>
