<script setup lang="ts">
import { Loader2 } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateStepEmail } from '@/composables/queries/useAutomations'
import { useTemplates } from '@/composables/queries/useTemplates'
import { useBuilder } from '../context'
import EmailContentCard from '../EmailContentCard.vue'
import ListSelect from '../ListSelect.vue'
import type { Config } from '../model'

/**
 * An email step's own settings: marketing (with its topic) or transactional (no topic: consent does
 * not depend on one), and either its own content or a transactional template. The content of its
 * own email (a hidden campaign) is written on a page of its own; here it is shown as a card.
 */
const props = defineProps<{ stepId: string; errors: Record<string, string>; disabled?: boolean }>()
const config = defineModel<Config>({ required: true })
const { t } = useI18n()
const num = (v: unknown) => (typeof v === 'number' ? v : undefined)

const patch = (p: Config) => {
  const next: Config = { ...config.value, ...p }
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
  config.value = next
}

const messageType = computed(() => (config.value.message_type as string) ?? 'marketing')
const campaignId = computed(() => (config.value.campaign_id as number | undefined) || undefined)
const mode = computed(() => (config.value.template_id ? 'template' : 'custom'))
function setMessageType(v: string) {
  // A transactional template has no unsubscribe link, so marketing emails always have their own content.
  patch(v === 'marketing' ? { message_type: v, template_id: undefined } : { message_type: v, list_id: undefined })
}

// --- Transactional template ------------------------------------------------------------------------
const { data: templates } = useTemplates()
const txTemplates = computed(() => (templates.value ?? []).filter((x) => x.type === 'tx'))
function setMode(m: string) {
  if (m === 'template') patch({ campaign_id: undefined, template_id: txTemplates.value[0]?.id })
  else patch({ template_id: undefined })
}

// --- Own content: written on its own page --------------------------------------------------------------
const router = useRouter()
const route = useRoute()
const b = useBuilder()
const create = useCreateStepEmail()
const emailPage = computed(() => ({ name: 'automation-email', params: { id: route.params.id, step: props.stepId } }))

/**
 * Creates the step's campaign and opens its page. The step is saved first, so the campaign's id is in
 * the saved flow before anyone can leave: cancelling the panel can't orphan the campaign.
 */
async function writeEmail() {
  b.commit(props.stepId, {}) // the panel's edits, topic included
  const id = await create.mutateAsync({ name: `Automation email ${props.stepId}`, list_id: num(config.value.list_id), content_type: 'richtext', body: '' })
  b.commit(props.stepId, { campaign_id: id, template_id: undefined })
  if (await b.flush()) await router.push(emailPage.value)
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <Label>{{ t('web.automations.email.type') }}</Label>
      <RadioGroup :model-value="messageType" class="gap-3" :disabled="disabled" @update:model-value="setMessageType(String($event))">
        <div class="flex items-start gap-2">
          <RadioGroupItem id="mt-marketing" value="marketing" class="mt-1" />
          <Label for="mt-marketing" class="block font-normal">
            {{ t('web.automations.messageType.marketing') }}
            <span class="block text-xs text-muted-foreground">{{ t('web.automations.email.marketingHelp') }}</span>
          </Label>
        </div>
        <div class="flex items-start gap-2">
          <RadioGroupItem id="mt-tx" value="transactional" class="mt-1" />
          <Label for="mt-tx" class="block font-normal">
            {{ t('web.automations.messageType.transactional') }}
            <span class="block text-xs text-muted-foreground">{{ t('web.automations.email.transactionalHelp') }}</span>
          </Label>
        </div>
      </RadioGroup>
    </div>

    <div v-if="messageType === 'marketing'" class="space-y-2">
      <Label for="email-topic">{{ t('web.automations.email.topic') }}</Label>
      <ListSelect id="email-topic" :model-value="num(config.list_id)" :invalid="!!errors.list_id" :disabled="disabled" @update:model-value="patch({ list_id: $event })" />
      <p v-if="errors.list_id" class="text-sm text-destructive">{{ errors.list_id }}</p>
      <p class="text-xs text-muted-foreground">{{ t('web.automations.email.topicHelp') }}</p>
    </div>

    <div class="space-y-3">
      <Label>{{ t('web.automations.email.content') }}</Label>
      <RadioGroup v-if="messageType === 'transactional' || mode === 'template'" :model-value="mode" class="flex gap-6" :disabled="disabled" @update:model-value="setMode(String($event))">
        <div class="flex items-center gap-2"><RadioGroupItem id="mode-custom" value="custom" /><Label for="mode-custom" class="font-normal">{{ t('web.automations.email.custom') }}</Label></div>
        <div class="flex items-center gap-2"><RadioGroupItem id="mode-template" value="template" /><Label for="mode-template" class="font-normal">{{ t('web.automations.email.template') }}</Label></div>
      </RadioGroup>
      <p v-if="errors.content && (mode === 'template' || campaignId)" class="text-sm text-destructive">{{ errors.content }}</p>
    </div>

    <!-- A transactional template -->
    <div v-if="mode === 'template'" class="space-y-2">
      <Select :model-value="config.template_id ? String(config.template_id) : undefined" :disabled="disabled" @update:model-value="patch({ template_id: Number($event) })">
        <SelectTrigger class="w-full"><SelectValue :placeholder="t('web.automations.email.chooseTemplate')" /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="x in txTemplates" :key="x.id" :value="String(x.id)">{{ x.name }}</SelectItem>
        </SelectContent>
      </Select>
      <p v-if="!txTemplates.length" class="text-xs text-muted-foreground">{{ t('web.automations.email.noTemplates') }}</p>
    </div>

    <!-- Own content -->
    <template v-else>
      <!-- No email yet: where the card will be, with the way to write it (and why it isn't valid yet). -->
      <div v-if="!campaignId" class="space-y-3 rounded-lg border border-dashed p-3" :class="errors.content && 'border-destructive'" data-cy="email-empty">
        <p class="text-sm" :class="errors.content ? 'text-destructive' : 'text-muted-foreground'">
          {{ errors.content || t('web.automations.email.none') }}
        </p>
        <Button type="button" size="sm" :disabled="disabled || create.isPending.value" data-cy="create-email" @click="writeEmail">
          <Loader2 v-if="create.isPending.value" class="animate-spin" />{{ t('web.automations.email.write') }}
        </Button>
      </div>
      <EmailContentCard v-else :campaign-id="campaignId" :to="emailPage" :disabled="disabled" />
    </template>
  </div>
</template>
