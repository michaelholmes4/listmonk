<script setup lang="ts">
import { format } from 'date-fns'
import { useI18n } from 'vue-i18n'
import type { AutomationEnrollment, AutomationStep } from '@/api/types'
import { Badge } from '@/components/ui/badge'

/** What happened at each step for one subscriber, oldest first. */
defineProps<{ steps: AutomationStep[]; enrollment?: AutomationEnrollment | null }>()
const { t, te } = useI18n()
const known = (key: string, raw: string) => (te(key) ? t(key) : raw)
const stamp = (iso?: string | null) => (iso ? format(new Date(iso), 'PP p') : '')
const variant = (s?: string) => (s === 'done' ? 'success' : s === 'failed' ? 'destructive' : s === 'skipped' ? 'secondary' : 'outline')
const detail = (s: AutomationStep): string => {
  const r = (s.result ?? {}) as Record<string, unknown>
  if (s.error) return s.error
  if (r.reason) return known(`web.automations.skipReason.${String(r.reason).replace(/ /g, '_')}`, String(r.reason))
  if (r.branch) return t(`web.automations.branch.${String(r.branch)}`)
  if (r.note) return String(r.note)
  if (r.until) return t('web.automations.waitingUntil', { when: stamp(String(r.until)) })
  return ''
}
</script>

<template>
  <ol v-if="steps.length" class="space-y-3" data-cy="step-log">
    <li v-for="s in steps" :key="s.id" class="rounded-lg border p-3">
      <div class="flex items-center justify-between gap-2">
        <span class="font-mono text-sm">{{ s.node_id }}</span>
        <Badge :variant="variant(s.status)">{{ t(`web.automations.stepStatus.${s.status}`) }}</Badge>
      </div>
      <p class="mt-1 text-xs text-muted-foreground">{{ stamp(s.started_at) }}</p>
      <p v-if="detail(s)" class="mt-1 text-sm" :class="s.error ? 'text-destructive' : ''">{{ detail(s) }}</p>
    </li>
  </ol>
  <p v-else class="text-sm text-muted-foreground">{{ t('web.automations.noSteps') }}</p>
  <p v-if="enrollment?.exit_reason" class="mt-4 text-sm text-muted-foreground">
    {{ t('web.automations.exited', { reason: known(`web.automations.exitReason.${enrollment.exit_reason}`, enrollment.exit_reason) }) }}
  </p>
</template>
