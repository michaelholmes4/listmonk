<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import { Check, ChevronsUpDown, X } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useCampaigns } from '@/composables/queries/useCampaigns'
import { cn } from '@/lib/utils'

/** Multi-select of campaigns with server-side search. The model keeps names so chips can render. */
export interface PickedCampaign {
  id: number
  name: string
}
const selected = defineModel<PickedCampaign[]>({ default: () => [] })

const { t } = useI18n()
const open = ref(false)
const search = ref('')
const debounced = refDebounced(search, 250)

const { data, isPending } = useCampaigns(() => ({ query: debounced.value, page: 1, perPage: 20, orderBy: 'created_at', order: 'desc' }))
const isSelected = (id: number) => selected.value.some((c) => c.id === id)
const toggle = (c: PickedCampaign) =>
  (selected.value = isSelected(c.id) ? selected.value.filter((x) => x.id !== c.id) : [...selected.value, { id: c.id, name: c.name }])
const rows = computed(() => data.value?.results ?? [])
</script>

<template>
  <div class="space-y-2">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button variant="outline" role="combobox" class="w-full justify-between font-normal" data-cy="campaign-picker">
          <span class="truncate text-muted-foreground">{{ t('globals.terms.campaigns') }}</span>
          <ChevronsUpDown class="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-(--reka-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput v-model="search" :placeholder="t('campaigns.queryPlaceholder')" />
          <CommandList>
            <div v-if="isPending" class="space-y-2 p-2"><Skeleton class="h-6 w-full" /><Skeleton class="h-6 w-2/3" /></div>
            <template v-else>
              <CommandEmpty>{{ t('web.commands.empty') }}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  v-for="c in rows"
                  :key="c.id"
                  :value="`#${c.id} ${c.name} ${c.subject}`"
                  @select.prevent="toggle({ id: c.id!, name: c.name ?? '' })"
                >
                  <Check :class="cn('size-4', isSelected(c.id!) ? 'opacity-100' : 'opacity-0')" />
                  <span class="truncate">#{{ c.id }}: {{ c.name }}</span>
                </CommandItem>
              </CommandGroup>
            </template>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    <div v-if="selected.length" class="flex flex-wrap gap-1.5">
      <Badge v-for="c in selected" :key="c.id" variant="secondary" class="gap-1 pr-1">
        #{{ c.id }}: {{ c.name }}
        <button type="button" class="rounded-full p-0.5 hover:bg-foreground/10" :aria-label="t('globals.buttons.remove')" @click="toggle(c)">
          <X class="size-3" />
        </button>
      </Badge>
    </div>
  </div>
</template>
