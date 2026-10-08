<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import ConditionForm from './forms/ConditionForm.vue'
import DelayForm from './forms/DelayForm.vue'
import ListStepForm from './forms/ListStepForm.vue'
import SendEmailForm from './forms/SendEmailForm.vue'
import TriggerForm from './forms/TriggerForm.vue'
import UpdateAttributeForm from './forms/UpdateAttributeForm.vue'
import WaitUntilForm from './forms/WaitUntilForm.vue'
import { stepMeta, triggerMeta } from './labels'
import type { Config, Flow, Step, Trigger } from './model'
import { emailStepsBefore } from './model'
import { stepIssues, triggerIssues } from './validate'
import { usePermission } from '@/composables/usePermission'

/**
 * Settings of one step or trigger, in a side sheet. Edits apply to the flow as they are made (the
 * flow is itself an unsaved draft until saved), so there is nothing to confirm and closing never
 * loses work. An email's content is saved separately, by its own button.
 */
const props = defineProps<{ flow: Flow; target: { kind: 'step' | 'trigger'; id: string } | null; readonly: boolean }>()
const emit = defineEmits<{ apply: [id: string, config: Config]; close: [] }>()
const { t } = useI18n()
const { can } = usePermission()

const step = computed<Step | undefined>(() => {
  if (props.target?.kind !== 'step') return undefined
  const find = (l: Step[]): Step | undefined => {
    for (const s of l) {
      if (s.id === props.target!.id) return s
      if (s.type === 'condition') {
        const h = find(s.yes ?? []) ?? find(s.no ?? [])
        if (h) return h
      }
    }
  }
  return find(props.flow.steps)
})
const trigger = computed<Trigger | undefined>(() => (props.target?.kind === 'trigger' ? props.flow.triggers.find((x) => x.id === props.target!.id) : undefined))
const subject = computed(() => step.value ?? trigger.value)

const draft = ref<Config>({})
const opened = ref<Config>({})
watch(
  subject,
  (s) => {
    if (s) {
      draft.value = JSON.parse(JSON.stringify(s.config))
      opened.value = JSON.parse(JSON.stringify(s.config))
    }
  },
  { immediate: true },
)

const meta = computed(() => (step.value ? stepMeta[step.value.type] : trigger.value ? triggerMeta[trigger.value.type] : undefined))
const allowSQL = computed(() => can('subscribers:sql_query'))

watch(
  draft,
  (d) => {
    if (!subject.value || props.readonly) return
    if (JSON.stringify(d) !== JSON.stringify(subject.value.config)) emit('apply', subject.value.id, d)
  },
  { deep: true },
)

// Problems with the settings, by field; shown once the user has changed something.
const tried = computed(() => !!subject.value && JSON.stringify(draft.value) !== JSON.stringify(opened.value))
const issues = computed(() => {
  if (!subject.value) return []
  return step.value
    ? stepIssues({ ...step.value, config: draft.value }, { flow: props.flow, allowSQL: allowSQL.value })
    : triggerIssues({ ...trigger.value!, config: draft.value })
})
const errors = computed<Record<string, string>>(() => (tried.value ? Object.fromEntries(issues.value.map((i) => [i.field, t(i.key)])) : {}))

const emailSteps = computed(() => (step.value ? emailStepsBefore(props.flow, step.value.id) : []))
const open = computed({ get: () => !!props.target && !!subject.value, set: (o) => !o && emit('close') })
const wide = computed(() => step.value?.type === 'send_email' || step.value?.type === 'condition')

</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent :class="wide ? 'w-full overflow-y-auto sm:max-w-3xl' : 'w-full overflow-y-auto sm:max-w-lg'" data-cy="step-sheet">
      <SheetHeader>
        <SheetTitle>{{ meta ? t(meta.title) : '' }}</SheetTitle>
        <SheetDescription>{{ meta ? t(meta.help) : '' }}</SheetDescription>
      </SheetHeader>

      <div v-if="subject" class="px-4">
        <TriggerForm v-if="trigger" v-model="draft" :type="trigger.type" :errors="errors" :disabled="readonly" />
        <template v-else-if="step">
          <SendEmailForm v-if="step.type === 'send_email'" v-model="draft" :step-id="step.id" :errors="errors" :disabled="readonly" />
          <DelayForm v-else-if="step.type === 'delay'" v-model="draft" :errors="errors" :disabled="readonly" />
          <WaitUntilForm v-else-if="step.type === 'wait_until'" v-model="draft" :errors="errors" :disabled="readonly" />
          <ConditionForm v-else-if="step.type === 'condition'" v-model="draft" :email-steps="emailSteps" :errors="errors" :disabled="readonly" />
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

      <SheetFooter class="flex-row justify-end gap-2">
        <Button type="button" variant="outline" data-cy="step-close" @click="emit('close')">{{ t('globals.buttons.close') }}</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
