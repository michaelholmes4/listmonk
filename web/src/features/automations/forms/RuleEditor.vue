<script setup lang="ts">
import { Plus, Trash2 } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import ListSelect from '../ListSelect.vue'
import type { Step } from '../model'
import {
  canCompareWithEvent,
  coerceValue,
  emptyFilter,
  emptyGroup,
  emptyLeaf,
  isGroup,
  needsValue,
  operators,
  ruleTypes,
  subscriberFields,
  type Rule,
  type RuleType,
} from '../rule'
import DurationInput from './DurationInput.vue'

/**
 * Edits a condition: a group of tests joined by "all" or "any", which may hold further groups.
 * It edits a copy owned by the caller, replacing it on every change.
 */
const props = withDefaults(
  defineProps<{
    emailSteps: Step[]
    allowSql: boolean
    /** Messages by path (`rule.0.1`), from the step's validation. */
    errors?: Record<string, string>
    path?: number[]
    depth?: number
    disabled?: boolean
    /** An event filter: only tests of the event's properties. */
    filter?: boolean
    /** No run's event to compare with (a trigger's filter). */
    noRunEvent?: boolean
  }>(),
  { errors: () => ({}), path: () => [], depth: 0, disabled: false, filter: false, noRunEvent: false },
)
const rule = defineModel<Rule>({ required: true })
const { t } = useI18n()

const at = (i: number[]) => `rule.${i.join('.')}`
const err = (i: number[]) => props.errors[at(i)]

const types = computed(() => ruleTypes.filter((x) => x !== 'sql' || props.allowSql))

// --- Group operations -----------------------------------------------------------------------------------
const rules = computed(() => rule.value.rules ?? [])
const setRules = (r: Rule[]) => (rule.value = { ...rule.value, rules: r })
const update = (i: number, r: Rule) => setRules(rules.value.map((x, j) => (j === i ? r : x)))
const remove = (i: number) => setRules(rules.value.filter((_, j) => j !== i))
const addLeaf = () => setRules([...rules.value, emptyLeaf(props.filter ? 'property' : 'attribute')])
const addGroup = () => setRules([...rules.value, props.filter ? emptyFilter() : emptyGroup()])

// --- Leaf operations --------------------------------------------------------------------------------------
const patch = (p: Partial<Rule>) => {
  const next = { ...rule.value, ...p }
  for (const k of Object.keys(next) as (keyof Rule)[]) if (next[k] === undefined) delete next[k]
  rule.value = next
}
const setType = (type: RuleType) => (rule.value = emptyLeaf(type))
const opLabel = (type: RuleType, op: string) => t(`web.automations.rule.op.${type === 'subscriber' || type === 'property' ? 'attribute' : type}.${op}`)

// A property test compares with a typed value, or with a property of the run's event.
const fromEvent = computed(() => rule.value.value_from !== undefined)
const setOperator = (operator: string) =>
  patch(canCompareWithEvent(operator) ? { operator } : { operator, value_from: undefined, value: fromEvent.value ? '' : rule.value.value })
const setSource = (src: string) => patch(src === 'event' ? { value_from: '', value: undefined } : { value_from: undefined, value: '' })

// An event test counts any occurrence, those in the last N, or those since the run started.
const eventWindow = computed(() => (rule.value.since ? 'entered' : rule.value.within !== undefined ? 'within' : 'any'))
const setWindow = (w: string) => patch({ since: w === 'entered' ? 'entered' : undefined, within: w === 'within' ? '7d' : undefined })
</script>

<template>
  <!-- A group. -->
  <div v-if="isGroup(rule)" :class="depth > 0 ? 'space-y-3 rounded-lg border bg-muted/30 p-3' : 'space-y-3'" :data-cy="`rule-group-${path.join('-') || 'root'}`">
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <span>{{ t('web.automations.rule.match') }}</span>
      <Select :model-value="rule.op ?? 'and'" :disabled="disabled" @update:model-value="rule = { ...rule, op: $event as 'and' | 'or' }">
        <SelectTrigger size="sm" class="w-28" :aria-label="t('web.automations.rule.match')"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="and">{{ t('web.automations.rule.all') }}</SelectItem>
          <SelectItem value="or">{{ t('web.automations.rule.any') }}</SelectItem>
        </SelectContent>
      </Select>
      <span>{{ t('web.automations.rule.ofThese') }}</span>
    </div>
    <p v-if="err(path)" class="text-sm text-destructive">{{ err(path) }}</p>

    <div v-for="(child, i) in rules" :key="i" class="flex items-start gap-2">
      <RuleEditor
        class="min-w-0 flex-1"
        :model-value="child"
        :email-steps="emailSteps"
        :allow-sql="allowSql"
        :errors="errors"
        :path="[...path, i]"
        :depth="depth + 1"
        :disabled="disabled"
        :filter="filter"
        :no-run-event="noRunEvent"
        @update:model-value="update(i, $event)"
      />
      <Button
        v-if="!disabled && (rules.length > 1 || depth > 0)"
        type="button"
        variant="ghost"
        size="icon-sm"
        class="mt-1"
        :aria-label="t('globals.buttons.delete')"
        @click="remove(i)"
      >
        <Trash2 />
      </Button>
    </div>

    <div v-if="!disabled" class="flex gap-2">
      <Button type="button" variant="outline" size="sm" data-cy="rule-add" @click="addLeaf"><Plus />{{ t('web.automations.rule.add') }}</Button>
      <Button v-if="depth < 2" type="button" variant="ghost" size="sm" @click="addGroup">
        <Plus />{{ t('web.automations.rule.addGroup') }}
      </Button>
    </div>
  </div>

  <!-- A single test. -->
  <div v-else class="space-y-2" :data-cy="`rule-${path.join('-')}`">
    <div class="flex flex-wrap items-center gap-2">
      <Select v-if="!filter" :model-value="rule.type" :disabled="disabled" @update:model-value="setType($event as RuleType)">
        <SelectTrigger size="sm" class="w-40" :aria-label="t('web.automations.rule.type')"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="x in types" :key="x" :value="x">{{ t(`web.automations.rule.types.${x}`) }}</SelectItem>
        </SelectContent>
      </Select>

      <!-- attribute, event property -->
      <template v-if="rule.type === 'attribute' || rule.type === 'property'">
        <Input
          class="h-8 w-40"
          :model-value="rule.path ?? ''"
          :placeholder="rule.type === 'property' ? 'product' : 'plan'"
          :aria-label="t(rule.type === 'property' ? 'web.automations.rule.propertyName' : 'web.automations.rule.attributeName')"
          :disabled="disabled"
          @update:model-value="patch({ path: String($event) })"
        />
      </template>

      <!-- subscriber field -->
      <Select v-else-if="rule.type === 'subscriber'" :model-value="rule.path" :disabled="disabled" @update:model-value="patch({ path: String($event) })">
        <SelectTrigger size="sm" class="w-32" :aria-label="t('web.automations.rule.field')"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="f in subscriberFields" :key="f" :value="f">{{ t(`web.automations.rule.fields.${f}`) }}</SelectItem>
        </SelectContent>
      </Select>

      <!-- list -->
      <div v-else-if="rule.type === 'list'" class="w-48">
        <ListSelect :model-value="rule.list_id" :disabled="disabled" @update:model-value="patch({ list_id: $event })" />
      </div>

      <!-- step -->
      <Select v-else-if="rule.type === 'step'" :model-value="rule.node_id" :disabled="disabled" @update:model-value="patch({ node_id: String($event) })">
        <SelectTrigger size="sm" class="w-48" :aria-label="t('web.automations.rule.emailStep')">
          <SelectValue :placeholder="t('web.automations.rule.chooseEmail')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="s in emailSteps" :key="s.id" :value="s.id">{{ t('web.automations.step.send_email') }} · {{ s.id }}</SelectItem>
        </SelectContent>
      </Select>

      <!-- event -->
      <Input
        v-else-if="rule.type === 'event'"
        class="h-8 w-44"
        :model-value="rule.name ?? ''"
        placeholder="signed_up"
        :aria-label="t('web.automations.rule.eventName')"
        :disabled="disabled"
        @update:model-value="patch({ name: String($event) })"
      />

      <!-- operator -->
      <Select
        v-if="rule.type && rule.type !== 'sql'"
        :model-value="rule.operator"
        :disabled="disabled"
        @update:model-value="setOperator(String($event))"
      >
        <SelectTrigger size="sm" class="w-44" :aria-label="t('web.automations.rule.operator')"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="o in operators[rule.type]" :key="o" :value="o">{{ opLabel(rule.type, o) }}</SelectItem>
        </SelectContent>
      </Select>

      <!-- what a property is compared with -->
      <Select
        v-if="rule.type === 'property' && !noRunEvent && canCompareWithEvent(rule.operator)"
        :model-value="fromEvent ? 'event' : 'value'"
        :disabled="disabled"
        @update:model-value="setSource(String($event))"
      >
        <SelectTrigger size="sm" class="w-44" :aria-label="t('web.automations.rule.compareWith')"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="value">{{ t('web.automations.rule.aValue') }}</SelectItem>
          <SelectItem value="event">{{ t('web.automations.rule.runEventProperty') }}</SelectItem>
        </SelectContent>
      </Select>
      <Input
        v-if="rule.type === 'property' && fromEvent"
        class="h-8 w-40"
        :model-value="rule.value_from ?? ''"
        placeholder="product"
        :aria-label="t('web.automations.rule.runEventProperty')"
        :disabled="disabled"
        @update:model-value="patch({ value_from: String($event) })"
      />

      <!-- value -->
      <Input
        v-else-if="(rule.type === 'attribute' || rule.type === 'subscriber' || rule.type === 'property') && needsValue(rule.operator)"
        class="h-8 w-44"
        :model-value="rule.value === undefined ? '' : String(rule.value)"
        :aria-label="t('web.automations.rule.value')"
        :disabled="disabled"
        @update:model-value="patch({ value: coerceValue(rule.operator, String($event)) })"
      />

      <!-- event window -->
      <template v-if="rule.type === 'event'">
        <Select :model-value="eventWindow" :disabled="disabled" @update:model-value="setWindow(String($event))">
          <SelectTrigger size="sm" class="w-48" :aria-label="t('web.automations.rule.when')"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{{ t('web.automations.rule.anyTime') }}</SelectItem>
            <SelectItem value="within">{{ t('web.automations.rule.within') }}</SelectItem>
            <SelectItem value="entered">{{ t('web.automations.rule.sinceEntered') }}</SelectItem>
          </SelectContent>
        </Select>
        <DurationInput v-if="eventWindow === 'within'" :model-value="rule.within ?? ''" :disabled="disabled" @update:model-value="patch({ within: $event || '' })" />
      </template>
    </div>

    <!-- event filter -->
    <template v-if="rule.type === 'event'">
      <div v-if="rule.where" class="space-y-2 rounded-lg border bg-muted/30 p-3" :data-cy="`rule-${path.join('-')}-where`">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm">{{ t('web.automations.rule.onlyWhere') }}</span>
          <Button v-if="!disabled" type="button" variant="ghost" size="sm" @click="patch({ where: undefined })">{{ t('web.automations.rule.removeFilter') }}</Button>
        </div>
        <RuleEditor
          :model-value="rule.where"
          :email-steps="emailSteps"
          :allow-sql="false"
          :depth="0"
          :disabled="disabled"
          filter
          :no-run-event="noRunEvent"
          @update:model-value="patch({ where: $event })"
        />
      </div>
      <Button v-else-if="!disabled" type="button" variant="ghost" size="sm" :data-cy="`rule-${path.join('-')}-add-where`" @click="patch({ where: emptyFilter() })">
        <Plus />{{ t('web.automations.rule.addFilter') }}
      </Button>
    </template>

    <Textarea
      v-if="rule.type === 'sql'"
      :model-value="rule.query ?? ''"
      rows="3"
      class="font-mono text-sm"
      placeholder="s.attribs->>'plan' = 'pro'"
      :disabled="disabled"
      @update:model-value="patch({ query: String($event) })"
    />
    <p v-if="rule.type === 'sql'" class="text-xs text-muted-foreground">{{ t('web.automations.rule.sqlHelp') }}</p>
    <p v-if="err(path)" class="text-sm text-destructive">{{ err(path) }}</p>
  </div>
</template>
