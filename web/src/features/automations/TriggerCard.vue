<script setup lang="ts">
import { AlertTriangle, Trash2 } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useBuilder } from './context'
import { triggerMeta } from './labels'
import type { Trigger } from './model'
import { triggerSummary } from './summary'

const props = defineProps<{ trigger: Trigger }>()
const emit = defineEmits<{ remove: [] }>()
const { t } = useI18n()
const b = useBuilder()
const meta = computed(() => triggerMeta[props.trigger.type])
const summary = computed(() => triggerSummary(t, props.trigger, b.lookups))
const warn = computed(() => (b.issues.value.get(props.trigger.id)?.length ?? 0) > 0)
</script>

<template>
  <div
    :class="cn('group relative flex w-full max-w-md items-center gap-3 rounded-lg border border-primary/40 bg-card p-3 shadow-xs hover:border-ring/60', warn && 'border-destructive/60')"
    :data-cy="`trigger-${trigger.id}`"
  >
    <button type="button" class="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-ring" :aria-label="t(meta.title)" @click="b.open(trigger.id)" />
    <div class="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><component :is="meta.icon" class="size-4.5" /></div>
    <div class="min-w-0 flex-1">
      <p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">{{ t('web.automations.when') }}</p>
      <p class="text-sm font-medium">{{ t(meta.title) }}</p>
      <p class="truncate text-xs text-muted-foreground">{{ summary || t('web.automations.notSetUp') }}</p>
    </div>
    <AlertTriangle v-if="warn" class="relative z-10 size-4 shrink-0 text-destructive" :aria-label="t('web.automations.needsAttention')" />
    <Button v-if="!b.readonly.value" variant="ghost" size="icon-sm" class="relative z-10 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" :aria-label="t('globals.buttons.delete')" @click="emit('remove')">
      <Trash2 />
    </Button>
  </div>
</template>
