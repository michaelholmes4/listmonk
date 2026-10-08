<script setup lang="ts">
import { Loader2 } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { Automation, AutomationSettings } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { useUpdateAutomation } from '@/composables/queries/useAutomations'
import { usePermission } from '@/composables/usePermission'
import DurationInput from './forms/DurationInput.vue'
import RuleEditor from './forms/RuleEditor.vue'
import { allSteps, type Flow } from './model'
import { emptyGroup, isDuration, ruleIssues, type Rule } from './rule'

/** Name, re-entry, send window, timezone and goal: the rules that apply to the whole automation. */
const props = defineProps<{ automation: Automation; flow: Flow; readonly: boolean }>()
const { t } = useI18n()
const { can } = usePermission()

interface Form {
  name: string
  reentry: { mode: string; interval: string }
  window: boolean
  days: number[]
  start: string
  end: string
  timezone: string
  goal: Rule | null
}

function toForm(a: Automation): Form {
  const s = (a.settings ?? {}) as AutomationSettings & { goal?: Rule }
  return {
    name: a.name ?? '',
    reentry: { mode: s.reentry?.mode || 'once', interval: s.reentry?.interval ?? '' },
    window: !!s.send_window,
    days: s.send_window?.days ?? [],
    start: s.send_window?.start ?? '09:00',
    end: s.send_window?.end ?? '17:00',
    timezone: s.timezone ?? '',
    goal: (s.goal as Rule | undefined) ?? null,
  }
}
function toSettings(f: Form): AutomationSettings {
  const s: AutomationSettings = { reentry: { mode: f.reentry.mode as 'once' | 'always' | 'interval' } }
  if (f.reentry.mode === 'interval') s.reentry = { ...s.reentry, interval: f.reentry.interval }
  if (f.window) s.send_window = { days: f.days, start: f.start, end: f.end }
  if (f.timezone.trim()) s.timezone = f.timezone.trim()
  if (f.goal) s.goal = f.goal as AutomationSettings['goal']
  return s
}

const form = ref<Form>(toForm(props.automation))
let loaded = props.automation.updated_at
watch(
  () => props.automation,
  (a) => {
    if (a.updated_at !== loaded) {
      loaded = a.updated_at
      form.value = toForm(a)
    }
  },
)

const dirty = computed(() => JSON.stringify(toSettings(form.value)) !== JSON.stringify(toSettings(toForm(props.automation))) || form.value.name !== props.automation.name)
const emailSteps = computed(() => [...allSteps(props.flow.steps)].filter((s) => s.type === 'send_email'))
const allowSQL = computed(() => can('subscribers:sql_query'))

const errors = computed(() => {
  const e: Record<string, string> = {}
  if (!form.value.name.trim()) e.name = t('web.automations.nameRequired')
  if (form.value.reentry.mode === 'interval' && !isDuration(form.value.reentry.interval)) e.interval = t('web.automations.invalidDuration')
  if (form.value.window && form.value.end <= form.value.start) e.window = t('web.automations.window.order')
  if (form.value.goal) {
    for (const i of ruleIssues(form.value.goal, { allowSQL: allowSQL.value, emailSteps: emailSteps.value.map((s) => s.id) })) e[`rule.${i.at.join('.')}`] = t(i.key)
  }
  return e
})
const ruleErrors = computed(() => Object.fromEntries(Object.entries(errors.value).filter(([k]) => k.startsWith('rule.'))))
const invalid = computed(() => Object.keys(errors.value).length > 0)

const update = useUpdateAutomation()
function save() {
  update.mutate(
    { id: props.automation.id!, name: form.value.name.trim(), settings: toSettings(form.value) },
    { onSuccess: () => toast.success(t('globals.messages.updated', { name: form.value.name })) },
  )
}

const dayNames = [0, 1, 2, 3, 4, 5, 6]
const toggleDay = (d: number, on: boolean) => (form.value.days = on ? [...form.value.days, d].sort() : form.value.days.filter((x) => x !== d))
const dayLabel = (d: number) => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2024, 0, 7 + d))

defineExpose({ dirty })
</script>

<template>
  <form class="max-w-2xl space-y-8" data-cy="automation-settings" @submit.prevent="save">
    <div class="space-y-2">
      <Label for="a-name">{{ t('globals.fields.name') }}</Label>
      <Input id="a-name" v-model="form.name" maxlength="200" :disabled="readonly" :aria-invalid="!!errors.name || undefined" />
      <p v-if="errors.name" class="text-sm text-destructive">{{ errors.name }}</p>
    </div>

    <section class="space-y-3">
      <h3 class="text-sm font-medium">{{ t('web.automations.reentry.title') }}</h3>
      <RadioGroup v-model="form.reentry.mode" class="gap-3" :disabled="readonly">
        <div v-for="m in ['once', 'interval', 'always']" :key="m" class="flex items-start gap-2">
          <RadioGroupItem :id="`re-${m}`" :value="m" class="mt-1" />
          <Label :for="`re-${m}`" class="block font-normal">
            {{ t(`web.automations.reentry.${m}`) }}
            <span class="block text-xs text-muted-foreground">{{ t(`web.automations.reentry.${m}Help`) }}</span>
          </Label>
        </div>
      </RadioGroup>
      <div v-if="form.reentry.mode === 'interval'" class="space-y-2 pl-6">
        <DurationInput v-model="form.reentry.interval" :invalid="!!errors.interval" :disabled="readonly" />
        <p v-if="errors.interval" class="text-sm text-destructive">{{ errors.interval }}</p>
      </div>
    </section>

    <section class="space-y-3">
      <div class="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div class="space-y-0.5">
          <Label for="a-window" class="font-medium">{{ t('web.automations.window.title') }}</Label>
          <p class="text-xs text-muted-foreground">{{ t('web.automations.window.help') }}</p>
        </div>
        <Switch id="a-window" v-model="form.window" :disabled="readonly" />
      </div>
      <div v-if="form.window" class="space-y-4 pl-1">
        <div class="flex flex-wrap gap-3">
          <label v-for="d in dayNames" :key="d" class="flex items-center gap-1.5 text-sm">
            <Checkbox :model-value="form.days.includes(d)" :disabled="readonly" @update:model-value="toggleDay(d, !!$event)" />
            {{ dayLabel(d) }}
          </label>
        </div>
        <p class="text-xs text-muted-foreground">{{ t('web.automations.window.daysHelp') }}</p>
        <div class="flex items-center gap-2">
          <Input v-model="form.start" type="time" class="w-32" :disabled="readonly" :aria-label="t('web.automations.window.from')" />
          <span class="text-sm text-muted-foreground">–</span>
          <Input v-model="form.end" type="time" class="w-32" :disabled="readonly" :aria-label="t('web.automations.window.to')" />
        </div>
        <p v-if="errors.window" class="text-sm text-destructive">{{ errors.window }}</p>
      </div>
    </section>

    <div class="space-y-2">
      <Label for="a-tz">{{ t('web.automations.timezone.title') }}</Label>
      <Input id="a-tz" v-model="form.timezone" placeholder="Europe/Berlin" class="max-w-xs" :disabled="readonly" />
      <p class="text-xs text-muted-foreground">{{ t('web.automations.timezone.help') }}</p>
    </div>

    <section class="space-y-3">
      <div class="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div class="space-y-0.5">
          <Label for="a-goal" class="font-medium">{{ t('web.automations.goal.title') }}</Label>
          <p class="text-xs text-muted-foreground">{{ t('web.automations.goal.help') }}</p>
        </div>
        <Switch id="a-goal" :model-value="!!form.goal" :disabled="readonly" @update:model-value="form.goal = $event ? emptyGroup() : null" />
      </div>
      <RuleEditor v-if="form.goal" v-model="form.goal" :email-steps="emailSteps" :allow-sql="allowSQL" :errors="ruleErrors" :disabled="readonly" />
    </section>

    <Button v-if="!readonly" type="submit" :disabled="!dirty || invalid || update.isPending.value" data-cy="save-settings">
      <Loader2 v-if="update.isPending.value" class="animate-spin" />{{ t('web.common.save') }}
    </Button>
  </form>
</template>
