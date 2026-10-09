<script setup lang="ts">
import { AlertTriangle, ArrowDown, ArrowUp, Trash2 } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useBuilder } from './context'
import { stepMeta } from './labels'
import type { Step } from './model'
import { stepSummary } from './summary'

const props = defineProps<{ step: Step; first: boolean; last: boolean }>()
const { t } = useI18n()
const b = useBuilder()

const meta = computed(() => stepMeta[props.step.type])
const summary = computed(() => stepSummary(t, props.step, b.lookups))
const issues = computed(() => b.issues.value.get(props.step.id) ?? [])
const problems = computed(() => b.problems.value.get(props.step.id) ?? [])
const warn = computed(() => issues.value.length > 0 || problems.value.length > 0)
const alsoReached = computed(() => (b.jumps.value.get(props.step.id) ?? []).length > 0)
const stat = computed(() => b.stats.value.get(props.step.id))
</script>

<template>
  <div
    :class="
      cn(
        'group relative flex w-full max-w-md items-center gap-3 rounded-lg border bg-card p-3 text-card-foreground shadow-xs transition-colors hover:border-ring/60',
        warn && 'border-destructive/60',
        b.highlight.value === step.id && 'ring-2 ring-ring',
      )
    "
    :data-cy="`step-${step.id}`"
    :data-type="step.type"
    @mouseenter="step.type === 'go_to' && (b.highlight.value = String(step.config.target ?? '') || null)"
    @mouseleave="step.type === 'go_to' && (b.highlight.value = null)"
  >
    <button
      type="button"
      class="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
      :aria-label="`${t(meta.title)} ${summary}`.trim()"
      @click="b.open(step.id)"
    />
    <div class="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
      <component :is="meta.icon" class="size-4.5" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium">{{ t(meta.title) }}</p>
      <p class="truncate text-xs text-muted-foreground">
        <template v-if="summary">{{ summary }}</template>
        <template v-else-if="step.type !== 'condition' && step.type !== 'exit'">{{ t('web.automations.notSetUp') }}</template>
      </p>
      <p v-if="alsoReached" class="truncate text-xs text-muted-foreground" data-cy="also-reached">{{ t('web.automations.goTo.alsoReached') }}</p>
    </div>

    <div v-if="stat" class="relative z-10 text-right text-xs tabular-nums text-muted-foreground" :title="t('web.automations.statsHelp')">
      <p>{{ t('web.automations.entered', { n: stat.entered ?? 0 }) }}</p>
      <p v-if="stat.failed" class="text-destructive">{{ t('web.automations.failedCount', { n: stat.failed }) }}</p>
    </div>

    <Tooltip v-if="warn">
      <TooltipTrigger as-child>
        <AlertTriangle class="relative z-10 size-4 shrink-0 text-destructive" :aria-label="t('web.automations.needsAttention')" />
      </TooltipTrigger>
      <TooltipContent>
        <p v-for="m in [...issues.map((i) => t(i.key)), ...problems]" :key="m">{{ m }}</p>
      </TooltipContent>
    </Tooltip>

    <div v-if="!b.readonly.value" class="relative z-10 flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
      <Button variant="ghost" size="icon-sm" :disabled="first" :aria-label="t('web.automations.moveUp')" @click="b.move(step.id, -1)">
        <ArrowUp />
      </Button>
      <Button variant="ghost" size="icon-sm" :disabled="last" :aria-label="t('web.automations.moveDown')" @click="b.move(step.id, 1)">
        <ArrowDown />
      </Button>
      <Button variant="ghost" size="icon-sm" :aria-label="t('globals.buttons.delete')" data-cy="remove-step" @click="b.remove(step.id)">
        <Trash2 />
      </Button>
    </div>
  </div>
</template>
