<script setup lang="ts">
import { CircleHelp } from '@lucide/vue'
import { useIntersectionObserver } from '@vueuse/core'
import { computed, ref, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { usePermission } from '@/composables/usePermission'
import { cn } from '@/lib/utils'
import { isPageActive, tabbedEntry, tabPages } from '@/nav'
import PageTabs from './PageTabs.vue'

/**
 * The frame of every page (see web/UX.md): a header with the title on the left and the page's
 * actions on the right, then the content.
 *
 * - The header sticks to the top while the page scrolls, so Save / Publish stay in reach.
 * - `actions` slot, or `<Teleport defer to="#page-actions">` from a child (forms put their Save
 *   button there, see FormActions).
 * - `help` slot: a rail beside the content on wide screens, a "?" popover in the header otherwise.
 * - `width`: `full` for tables and builders, `form` caps the content at a readable width.
 * - Record tabs: a view's `RecordTabs` render along the bottom of the header (`#page-tabs`).
 * - Tabs: on the pages of a sidebar entry with secondary pages (nav.ts `pages`), the header is the
 *   entry's (its name, then tabs) and identical on every tab, so the tabs never move. The page's
 *   description, badges and meta open the content instead; its count is left to the table's pager.
 */
const props = withDefaults(
  defineProps<{
    title: string
    /** Shown muted after the title, e.g. the number of rows. */
    count?: number
    description?: string
    width?: 'full' | 'form'
  }>(),
  { count: undefined, description: undefined, width: 'full' },
)

const { t, n } = useI18n()
const slots = useSlots()

// A hairline under the header once content scrolls beneath it.
const sentinel = ref<HTMLElement>()
const stuck = ref(false)
useIntersectionObserver(sentinel, ([e]) => (stuck.value = !e?.isIntersecting))

const hasHelp = computed(() => !!slots.help)

// The entry's pages this user may open; a lone tab is no navigation, so it isn't shown.
const route = useRoute()
const { can } = usePermission()
const tabEntry = computed(() => tabbedEntry(route))
const tabs = computed(() => (tabEntry.value ? tabPages(tabEntry.value).filter((p) => can(...(p.perms ?? []))) : []))
const tabbed = computed(() => tabs.value.length > 1)
const activeTab = computed(() => tabs.value.find((p) => isPageActive(p, route))?.key)
const hasIntro = computed(() => !!(props.description || slots.meta || slots.badges))
</script>

<template>
  <div class="group/page flex min-h-full flex-col">
    <div ref="sentinel" class="h-px" aria-hidden="true" />
    <header
      :class="
        cn(
          'sticky top-0 z-20 -mt-px bg-background px-4 pt-5 transition-shadow sm:px-6',
          tabbed ? 'pb-0' : 'pb-4 has-data-[slot=page-tabs]:pb-0',
          stuck && 'shadow-xs',
          stuck && !tabbed && 'border-b has-data-[slot=page-tabs]:border-b-0',
        )
      "
      data-cy="page-header"
    >
      <div :class="cn('flex flex-wrap justify-between gap-x-4 gap-y-3', tabbed ? 'min-h-8 items-center' : 'items-start')">
        <div class="min-w-0 space-y-1">
          <h1 v-if="tabbed && tabEntry" class="text-xl font-semibold">{{ t(tabEntry.label) }}</h1>
          <template v-else>
            <h1 class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xl font-semibold">
              <span class="min-w-0 break-words">{{ title }}</span>
              <span v-if="props.count !== undefined" class="font-normal text-muted-foreground tabular-nums">{{ n(props.count) }}</span>
              <slot name="badges" />
            </h1>
            <p v-if="description" class="max-w-2xl text-sm text-muted-foreground">{{ description }}</p>
            <div v-if="$slots.meta" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><slot name="meta" /></div>
          </template>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <slot name="actions" />
          <div id="page-actions" class="contents" />
          <Popover v-if="hasHelp">
            <PopoverTrigger as-child>
              <Button variant="ghost" size="icon-sm" class="xl:hidden" :aria-label="t('web.common.help')" :title="t('web.common.help')">
                <CircleHelp />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" class="w-80 space-y-3 text-sm text-muted-foreground"><slot name="help" /></PopoverContent>
          </Popover>
        </div>
      </div>
      <PageTabs v-if="tabbed && tabEntry" :label="t(tabEntry.label)" :pages="tabs" :active="activeTab" />
      <!-- A record page's own tabs (RecordTabs) render here. -->
      <div id="page-tabs" class="contents" />
    </header>

    <div
      :class="
        cn(
          'flex-1 px-4 pb-8 sm:px-6',
          tabbed ? 'pt-5' : 'pt-1 group-has-data-[slot=page-tabs]/page:pt-6',
          hasHelp && 'xl:grid xl:grid-cols-[minmax(0,1fr)_16rem] xl:gap-12',
        )
      "
    >
      <!-- A size container, so FormSections lay out by the room they actually have. -->
      <div :class="cn('@container min-w-0 space-y-4', width === 'form' && 'max-w-4xl')">
        <!-- With tabs, what describes this one page opens its content, below the shared header. -->
        <div v-if="tabbed && hasIntro" class="space-y-1">
          <div v-if="$slots.badges" class="flex flex-wrap items-center gap-2"><slot name="badges" /></div>
          <p v-if="description" class="max-w-2xl text-sm text-muted-foreground">{{ description }}</p>
          <div v-if="$slots.meta" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><slot name="meta" /></div>
        </div>
        <slot />
      </div>
      <aside v-if="hasHelp" class="hidden xl:block">
        <div class="sticky top-24 space-y-3 border-l pl-6 text-sm text-muted-foreground"><slot name="help" /></div>
      </aside>
    </div>
  </div>
</template>
