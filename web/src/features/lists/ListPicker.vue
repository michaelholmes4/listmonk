<script setup lang="ts">
import { Check, ChevronsUpDown, X } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { List } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useAllLists } from '@/composables/queries/useLists'
import { cn } from '@/lib/utils'

/** Multi-select of lists (by id). Lists the user can't see are never offered. */
const props = withDefaults(defineProps<{ placeholder?: string; disabled?: boolean }>(), {
  placeholder: undefined,
  disabled: false,
})
const selected = defineModel<number[]>({ default: () => [] })
const open = ref(false)

const { t } = useI18n()
const { data: lists, isPending } = useAllLists()

const byId = computed(() => new Map((lists.value ?? []).map((l) => [l.id!, l])))
const chosen = computed(() => selected.value.map((id) => byId.value.get(id)).filter((l): l is List => !!l))

const toggle = (id: number) =>
  (selected.value = selected.value.includes(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id])
</script>

<template>
  <div class="space-y-2">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button variant="outline" role="combobox" class="w-full justify-between font-normal" :disabled="props.disabled">
          <span class="truncate text-muted-foreground">{{ placeholder ?? t('subscribers.listsPlaceholder') }}</span>
          <ChevronsUpDown class="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-(--reka-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput :placeholder="t('globals.terms.lists')" />
          <CommandList>
            <div v-if="isPending" class="space-y-2 p-2"><Skeleton class="h-6 w-full" /><Skeleton class="h-6 w-2/3" /></div>
            <template v-else>
              <CommandEmpty>{{ t('web.commands.empty') }}</CommandEmpty>
              <CommandGroup>
                <CommandItem v-for="l in lists" :key="l.id" :value="l.name ?? ''" @select.prevent="toggle(l.id!)">
                  <Check :class="cn('size-4', selected.includes(l.id!) ? 'opacity-100' : 'opacity-0')" />
                  <span class="truncate">{{ l.name }}</span>
                  <span v-if="l.optin === 'double'" class="ml-auto text-xs text-muted-foreground">
                    {{ t('lists.optins.double') }}
                  </span>
                </CommandItem>
              </CommandGroup>
            </template>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    <div v-if="chosen.length" class="flex flex-wrap gap-1.5">
      <Badge v-for="l in chosen" :key="l.id" variant="secondary" class="gap-1 pr-1">
        {{ l.name }}
        <button
          type="button"
          class="rounded-full p-0.5 hover:bg-foreground/10"
          :aria-label="t('globals.buttons.remove')"
          :disabled="props.disabled"
          @click="toggle(l.id!)"
        >
          <X class="size-3" />
        </button>
      </Badge>
    </div>
  </div>
</template>
