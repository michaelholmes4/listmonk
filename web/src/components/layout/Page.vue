<script setup lang="ts">
import { CircleHelp } from '@lucide/vue'
import { useIntersectionObserver } from '@vueuse/core'
import { computed, ref, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * The frame of every page (see web/UX.md): a header with the title on the left and the page's
 * actions on the right, then the content.
 *
 * - The header sticks to the top while the page scrolls, so Save / Publish stay in reach.
 * - `actions` slot, or `<Teleport defer to="#page-actions">` from a child (forms put their Save
 *   button there, see FormActions).
 * - `help` slot: a rail beside the content on wide screens, a "?" popover in the header otherwise.
 * - `width`: `full` for tables and builders, `form` caps the content at a readable width.
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
</script>

<template>
  <div class="flex min-h-full flex-col">
    <div ref="sentinel" class="h-px" aria-hidden="true" />
    <header
      :class="
        cn(
          'sticky top-0 z-20 -mt-px bg-background px-4 pt-5 pb-4 transition-shadow sm:px-6',
          stuck && 'border-b shadow-xs',
        )
      "
      data-cy="page-header"
    >
      <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div class="min-w-0 space-y-1">
          <h1 class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xl font-semibold">
            <span class="min-w-0 break-words">{{ title }}</span>
            <span v-if="props.count !== undefined" class="font-normal text-muted-foreground tabular-nums">{{ n(props.count) }}</span>
            <slot name="badges" />
          </h1>
          <p v-if="description" class="max-w-2xl text-sm text-muted-foreground">{{ description }}</p>
          <div v-if="$slots.meta" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><slot name="meta" /></div>
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
    </header>

    <div
      :class="
        cn(
          'flex-1 px-4 pb-8 sm:px-6',
          hasHelp && 'xl:grid xl:grid-cols-[minmax(0,1fr)_16rem] xl:gap-12',
        )
      "
    >
      <div :class="cn('min-w-0 space-y-4', width === 'form' && 'max-w-3xl')"><slot /></div>
      <aside v-if="hasHelp" class="hidden xl:block">
        <div class="sticky top-24 space-y-3 border-l pl-6 text-sm text-muted-foreground"><slot name="help" /></div>
      </aside>
    </div>
  </div>
</template>
