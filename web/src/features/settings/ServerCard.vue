<script setup lang="ts">
import { ChevronRight, MoreHorizontal, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

/**
 * One entry of a list of servers (SMTP, messengers): a card whose header (name, address, on/off,
 * "⋯" with Delete) always shows, and whose settings open inside it. `cy` prefixes the test hooks.
 */
defineProps<{ title: string; subtitle?: string; enabled: boolean; hasErrors?: boolean; deletable?: boolean; cy: string }>()
const emit = defineEmits<{ 'update:enabled': [on: boolean]; delete: [] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
</script>

<template>
  <section class="rounded-lg border">
    <!-- Closed cards keep their fields mounted (hidden), so a problem in one is still found and flagged. -->
    <Collapsible v-model:open="open" :unmount-on-hide="false">
      <div class="flex items-center gap-3 p-3 pl-2">
        <CollapsibleTrigger as-child>
          <button type="button" class="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left" :data-cy="`${cy}-toggle`">
            <ChevronRight class="size-4 shrink-0 text-muted-foreground transition-transform" :class="open && 'rotate-90'" />
            <span class="min-w-0">
              <span class="block truncate font-semibold">{{ title }}</span>
              <span v-if="subtitle" class="block truncate text-sm text-muted-foreground">{{ subtitle }}</span>
            </span>
          </button>
        </CollapsibleTrigger>
        <Badge v-if="hasErrors" variant="destructive">{{ t('web.settings.serverHasErrors') }}</Badge>
        <div class="flex items-center gap-2">
          <Switch :id="`${cy}-enabled`" :model-value="enabled" @update:model-value="emit('update:enabled', $event)" />
          <Label :for="`${cy}-enabled`">{{ t('globals.buttons.enabled') }}</Label>
        </div>
        <DropdownMenu v-if="deletable">
          <DropdownMenuTrigger as-child>
            <Button type="button" variant="ghost" size="icon-sm" :aria-label="t('web.common.actions')" :data-cy="`${cy}-menu`"><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" :data-cy="`${cy}-delete`" @select="emit('delete')">
              <Trash2 />{{ t('globals.buttons.delete') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CollapsibleContent>
        <div class="space-y-8 border-t p-4 sm:p-6"><slot /></div>
      </CollapsibleContent>
    </Collapsible>
  </section>
</template>
