<script setup lang="ts">
import { Plus, Trash2 } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Config, Step, WaitEvent } from '../model'
import { waitEvents } from '../model'
import { emptyFilter } from '../rule'
import DurationInput from './DurationInput.vue'
import RuleEditor from './RuleEditor.vue'

const MAX_EVENTS = 10

const props = defineProps<{ branches?: Record<string, Step[]>; errors: Record<string, string>; disabled?: boolean }>()
const config = defineModel<Config>({ required: true })
const { t } = useI18n()

const events = computed(() => waitEvents(config.value))
const setEvents = (next: WaitEvent[]) => (config.value = { ...config.value, events: next })
const patch = (i: number, p: Partial<WaitEvent>) => setEvents(events.value.map((e, j) => (j === i ? { ...e, ...p } : e)))

// An event whose path has steps can't become a restart event or be removed: that would delete them silently.
const hasSteps = (e: WaitEvent) => (props.branches?.[e.id]?.length ?? 0) > 0

function add() {
  const used = new Set(events.value.map((e) => e.id))
  let n = 1
  while (used.has(`e${n}`)) n++
  setEvents([...events.value, { id: `e${n}`, name: '', restart: false }])
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <Label for="wait-timeout">{{ t('web.automations.waitForEvent.waitUpTo') }}</Label>
      <DurationInput
        id="wait-timeout"
        :model-value="String(config.timeout ?? '')"
        :invalid="!!errors.timeout"
        :disabled="disabled"
        @update:model-value="config = { ...config, timeout: $event }"
      />
      <p v-if="errors.timeout" class="text-sm text-destructive">{{ errors.timeout }}</p>
    </div>

    <div class="space-y-2">
      <Label>{{ t('web.automations.waitForEvent.events') }}</Label>
      <div v-for="(e, i) in events" :key="e.id" class="space-y-1" :data-cy="`wait-event-${e.id}`">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Input
            class="min-w-40 flex-1"
            :model-value="e.name"
            :disabled="disabled"
            :aria-label="t('web.automations.waitForEvent.eventName')"
            :aria-invalid="!!errors[`event.${i}`] || undefined"
            placeholder="order_completed"
            @update:model-value="patch(i, { name: String($event ?? '') })"
          />
          <div class="flex items-center gap-2">
            <Checkbox
              :id="`wait-restart-${e.id}`"
              :model-value="!!e.restart"
              :disabled="disabled || hasSteps(e)"
              @update:model-value="patch(i, { restart: $event === true })"
            />
            <Label :for="`wait-restart-${e.id}`" class="text-sm font-normal">{{ t('web.automations.waitForEvent.restart') }}</Label>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :disabled="disabled || hasSteps(e)"
            :aria-label="t('globals.buttons.delete')"
            data-cy="wait-event-remove"
            @click="setEvents(events.filter((_, j) => j !== i))"
          >
            <Trash2 />
          </Button>
        </div>
        <div v-if="e.where" class="space-y-2 rounded-lg border bg-muted/30 p-3" :data-cy="`wait-event-${e.id}-where`">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm">{{ t('web.automations.rule.onlyWhere') }}</span>
            <Button v-if="!disabled" type="button" variant="ghost" size="sm" @click="patch(i, { where: undefined })">{{ t('web.automations.rule.removeFilter') }}</Button>
          </div>
          <RuleEditor
            :model-value="e.where"
            :email-steps="[]"
            :allow-sql="false"
            :disabled="disabled"
            filter
            @update:model-value="patch(i, { where: $event })"
          />
        </div>
        <Button v-else-if="!disabled" type="button" variant="ghost" size="sm" :data-cy="`wait-event-${e.id}-add-where`" @click="patch(i, { where: emptyFilter() })">
          <Plus />{{ t('web.automations.rule.addFilter') }}
        </Button>
        <p v-if="errors[`event.${i}`]" class="text-sm text-destructive">{{ errors[`event.${i}`] }}</p>
        <p v-if="hasSteps(e)" class="text-xs text-muted-foreground">{{ t('web.automations.waitForEvent.removeStepsFirst') }}</p>
      </div>
      <p v-if="errors.events" class="text-sm text-destructive">{{ errors.events }}</p>
      <Button v-if="!disabled" type="button" variant="outline" size="sm" :disabled="events.length >= MAX_EVENTS" data-cy="wait-event-add" @click="add">
        <Plus />{{ t('web.automations.waitForEvent.addEvent') }}
      </Button>
      <p class="text-xs text-muted-foreground">{{ t('web.automations.waitForEvent.help') }}</p>
    </div>
  </div>
</template>
