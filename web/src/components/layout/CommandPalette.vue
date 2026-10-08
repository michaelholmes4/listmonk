<script setup lang="ts">
import { useMagicKeys } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { commands, type Command } from '@/lib/commands'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const { commandPaletteOpen: open } = storeToRefs(useUiStore())

// Cmd/Ctrl+K toggles the palette.
const keys = useMagicKeys({
  passive: false,
  onEventFired: (e) => e.key === 'k' && (e.metaKey || e.ctrlKey) && e.preventDefault(),
})
watch(
  () => keys['Meta+K']?.value || keys['Ctrl+K']?.value,
  (pressed) => pressed && (open.value = !open.value),
)

const groups = computed(() => {
  const out = new Map<string, Command[]>()
  for (const c of commands.value) out.set(c.group, [...(out.get(c.group) ?? []), c])
  return [...out.entries()]
})

const run = (c: Command) => {
  open.value = false
  c.run()
}
</script>

<template>
  <CommandDialog v-model:open="open" :title="t('web.commands.open')" :description="t('web.commands.placeholder')">
    <CommandInput :placeholder="t('web.commands.placeholder')" />
    <CommandList>
      <CommandEmpty>{{ t('web.commands.empty') }}</CommandEmpty>
      <CommandGroup v-for="[group, items] in groups" :key="group" :heading="group">
        <CommandItem
          v-for="c in items"
          :key="c.id"
          :value="[c.label, ...(c.keywords ?? [])].join(' ')"
          @select="run(c)"
        >
          <component :is="c.icon" v-if="c.icon" />
          {{ c.label }}
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>
