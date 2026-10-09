<script setup lang="ts">
import { Loader2, MoreHorizontal, Trash2, X } from '@lucide/vue'
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { usePermission } from '@/composables/usePermission'
import ConditionForm from './forms/ConditionForm.vue'
import DelayForm from './forms/DelayForm.vue'
import GoToForm from './forms/GoToForm.vue'
import ListStepForm from './forms/ListStepForm.vue'
import SendEmailForm from './forms/SendEmailForm.vue'
import TriggerForm from './forms/TriggerForm.vue'
import UpdateAttributeForm from './forms/UpdateAttributeForm.vue'
import WaitForEventForm from './forms/WaitForEventForm.vue'
import WaitUntilForm from './forms/WaitUntilForm.vue'
import { stepMeta, triggerMeta } from './labels'
import type { Config, Flow } from './model'
import { emailStepsBefore } from './model'
import type { useStepPanel } from './useStepPanel'
import { stepIssues, triggerIssues } from './validate'

/**
 * The settings of the open step or trigger: header, form, and Save / Cancel. It edits the panel's
 * buffered copy (see useStepPanel), so nothing reaches the flow until Save. The frame around it
 * (the docked StepInspector, or StepSheet on narrow screens) only positions it.
 */
const props = withDefaults(
  defineProps<{
    flow: Flow
    panel: ReturnType<typeof useStepPanel>
    readonly: boolean
    /** A draft save is in flight. */
    saving?: boolean
    /** The frame's own title and description elements (a sheet needs its dialog ones). */
    titleAs?: string | Component
    descriptionAs?: string | Component
  }>(),
  { saving: false, titleAs: 'h2', descriptionAs: 'p' },
)
const emit = defineEmits<{ close: []; remove: [] }>()
const { t } = useI18n()
const { can } = usePermission()

const step = computed(() => props.panel.step.value)
const trigger = computed(() => props.panel.trigger.value)
const draft = computed<Config>({
  get: () => props.panel.draft.value,
  set: (v) => props.panel.edit(v),
})
const meta = computed(() => (step.value ? stepMeta[step.value.type] : trigger.value ? triggerMeta[trigger.value.type] : undefined))

// Problems with the settings, by field; shown once the user has changed something.
const issues = computed(() => {
  if (step.value) return stepIssues({ ...step.value, config: draft.value }, { flow: props.flow, allowSQL: can('subscribers:sql_query') })
  return trigger.value ? triggerIssues({ ...trigger.value, config: draft.value }) : []
})
const errors = computed<Record<string, string>>(() => (props.panel.touched.value ? Object.fromEntries(issues.value.map((i) => [i.field, t(i.key)])) : {}))
const emailSteps = computed(() => (step.value ? emailStepsBefore(props.flow, step.value.id) : []))

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    if (!props.readonly) props.panel.save()
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" @keydown="onKey">
    <div class="flex items-start gap-3 border-b px-4 py-3">
      <div v-if="meta" class="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <component :is="meta.icon" class="size-4.5" />
      </div>
      <div class="min-w-0 flex-1">
        <component :is="titleAs" class="text-sm font-semibold">{{ meta ? t(meta.title) : '' }}</component>
        <component :is="descriptionAs" class="text-xs text-muted-foreground">{{ meta ? t(meta.help) : '' }}</component>
      </div>
      <DropdownMenu v-if="!readonly">
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon-sm" :aria-label="t('web.common.actions')" data-cy="step-actions"><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" data-cy="step-delete" @select="emit('remove')">
            <Trash2 />{{ t(trigger ? 'web.automations.panel.deleteTrigger' : 'web.automations.panel.delete') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon-sm" :aria-label="t('globals.buttons.close')" data-cy="step-close" @click="emit('close')"><X /></Button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <TriggerForm v-if="trigger" v-model="draft" :type="trigger.type" :errors="errors" :disabled="readonly" />
      <template v-else-if="step">
        <SendEmailForm v-if="step.type === 'send_email'" v-model="draft" :step-id="step.id" :errors="errors" :disabled="readonly" />
        <DelayForm v-else-if="step.type === 'delay'" v-model="draft" :errors="errors" :disabled="readonly" />
        <WaitForEventForm v-else-if="step.type === 'wait_for_event'" v-model="draft" :branches="step.branches" :errors="errors" :disabled="readonly" />
        <WaitUntilForm v-else-if="step.type === 'wait_until'" v-model="draft" :errors="errors" :disabled="readonly" />
        <ConditionForm v-else-if="step.type === 'condition'" v-model="draft" :email-steps="emailSteps" :errors="errors" :disabled="readonly" />
        <GoToForm v-else-if="step.type === 'go_to'" v-model="draft" :flow="flow" :step-id="step.id" :errors="errors" :disabled="readonly" />
        <UpdateAttributeForm v-else-if="step.type === 'update_attribute'" v-model="draft" :errors="errors" :disabled="readonly" />
        <ListStepForm
          v-else-if="step.type === 'add_to_list' || step.type === 'remove_from_list'"
          v-model="draft"
          :type="step.type"
          :errors="errors"
          :disabled="readonly"
        />
        <p v-else class="text-sm text-muted-foreground">{{ t('web.automations.nothingToSet') }}</p>
      </template>
    </div>

    <div class="flex justify-end gap-2 border-t bg-background px-4 py-3">
      <template v-if="readonly">
        <Button type="button" variant="outline" @click="emit('close')">{{ t('globals.buttons.close') }}</Button>
      </template>
      <template v-else>
        <Button type="button" variant="outline" data-cy="step-cancel" @click="panel.cancel()">{{ t('globals.buttons.cancel') }}</Button>
        <Button type="button" :disabled="!panel.dirty.value" data-cy="step-save" @click="panel.save()">
          <Loader2 v-if="saving" class="animate-spin" />{{ t('globals.buttons.save') }}
        </Button>
      </template>
    </div>
  </div>
</template>
