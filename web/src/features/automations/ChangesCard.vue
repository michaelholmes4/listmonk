<script setup lang="ts">
import { ChevronRight, Undo2 } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge, type BadgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useBuilder } from './context'
import type { Change, ChangeKind } from './diff'
import { stepMeta, triggerMeta } from './labels'
import { stepSummary, triggerSummary } from './summary'

/** What publishing would change, listed under a one-line heading that opens it. Inside the builder (for its lookups). */
const props = defineProps<{ changes: Change[]; canDiscard: boolean }>()
const emit = defineEmits<{ discard: [] }>()
const { t } = useI18n()
const b = useBuilder()
const open = ref(false)

const variant: Record<ChangeKind, BadgeVariants['variant']> = {
  added: 'success',
  removed: 'destructive',
  changed: 'warning',
  email: 'warning',
  moved: 'secondary',
}

const rows = computed(() =>
  props.changes.map((c) => {
    let title: string, now: string, was: string
    if (c.step) {
      title = t(stepMeta[c.step.type].title)
      now = stepSummary(t, c.step, b.lookups)
      was = c.kind === 'changed' && c.before ? stepSummary(t, c.before, b.lookups) : ''
    } else {
      title = t(triggerMeta[c.trigger.type].title)
      now = triggerSummary(t, c.trigger, b.lookups)
      was = c.kind === 'changed' && c.before ? triggerSummary(t, c.before, b.lookups) : ''
    }
    return { key: `${c.kind}:${(c.step ?? c.trigger).id}`, kind: c.kind, title, now, was: was !== now ? was : '' }
  }),
)
</script>

<template>
  <section class="mb-4 w-full rounded-lg border bg-card text-sm" data-cy="changes">
    <Collapsible v-model:open="open">
      <div class="flex items-center gap-2 py-1.5 pr-2 pl-2">
        <CollapsibleTrigger as-child>
          <button type="button" class="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left font-medium" data-cy="changes-toggle">
            <ChevronRight class="size-4 shrink-0 text-muted-foreground transition-transform" :class="open && 'rotate-90'" />
            {{ t('web.automations.changes.title', { n: changes.length }) }}
          </button>
        </CollapsibleTrigger>
        <Button v-if="canDiscard" variant="ghost" size="xs" data-cy="discard" @click="emit('discard')">
          <Undo2 />{{ t('web.automations.changes.discard') }}
        </Button>
      </div>
      <CollapsibleContent>
        <ul class="space-y-2.5 border-t px-4 py-3" data-cy="changes-list">
          <li v-for="r in rows" :key="r.key" class="flex items-start gap-2">
            <Badge :variant="variant[r.kind]" class="mt-px shrink-0">{{ t(`web.automations.changes.${r.kind}`) }}</Badge>
            <div class="min-w-0">
              <p>
                <span class="font-medium">{{ r.title }}</span><span v-if="r.now" class="text-muted-foreground"> · {{ r.now }}</span>
              </p>
              <p v-if="r.was" class="text-xs text-muted-foreground">{{ t('web.automations.changes.was', { summary: r.was }) }}</p>
            </div>
          </li>
          <li v-if="!rows.length" class="text-muted-foreground">{{ t('web.automations.changes.layout') }}</li>
        </ul>
      </CollapsibleContent>
    </Collapsible>
  </section>
</template>
