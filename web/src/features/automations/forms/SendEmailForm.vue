<script setup lang="ts">
import { Loader2 } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useCampaign } from '@/composables/queries/useCampaigns'
import { useCreateStepEmail, useUpdateStepEmail } from '@/composables/queries/useAutomations'
import { useTemplates } from '@/composables/queries/useTemplates'
import ContentEditor from '@/features/campaigns/ContentEditor.vue'
import type { ContentType } from '@/features/campaigns/schema'
import { toForm, toRequest } from '@/features/campaigns/schema'
import ListSelect from '../ListSelect.vue'
import type { Config } from '../model'

/**
 * An email step: marketing (with its topic) or transactional (no topic: consent does not depend on
 * one), and either its own content (a hidden campaign edited with the ordinary campaign editor) or a
 * transactional template.
 * The content is saved with its own button: it is a campaign, not part of the automation's draft.
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
  patch(v === 'marketing' ? { message_type: v } : { message_type: v, list_id: undefined })
}

// --- Transactional template ------------------------------------------------------------------------
const { data: templates } = useTemplates()
const txTemplates = computed(() => (templates.value ?? []).filter((x) => x.type === 'tx'))
function setMode(m: string) {
  if (m === 'template') patch({ campaign_id: undefined, template_id: txTemplates.value[0]?.id })
  else patch({ template_id: undefined })
}

// --- Own content ---------------------------------------------------------------------------------------
const create = useCreateStepEmail()
function createEmail() {
  create.mutate(
    { name: `Automation email ${props.stepId}`, list_id: num(config.value.list_id), content_type: 'richtext', body: '' },
    { onSuccess: (id) => patch({ campaign_id: id, template_id: undefined }) },
  )
}

const { data: campaign, isPending: loading } = useCampaign(campaignId)
const subject = ref('')
const fromEmail = ref('')
const contentType = ref<ContentType>('richtext')
const body = ref('')
const bodySource = ref<string | null>(null)
const templateId = ref<number | null>(null)
const loadedFor = ref<number>()

watch(
  campaign,
  (c) => {
    // Load once per campaign: refetches must not overwrite what is being typed.
    if (!c || loadedFor.value === c.id) return
    const f = toForm(c)
    subject.value = f.subject
    fromEmail.value = f.fromEmail
    contentType.value = f.contentType
    body.value = f.body
    bodySource.value = f.bodySource
    templateId.value = f.templateId
    loadedFor.value = c.id
  },
  { immediate: true },
)

const update = useUpdateStepEmail()
const dirty = computed(() => {
  const c = campaign.value
  if (!c) return false
  const f = toForm(c)
  return subject.value !== f.subject || fromEmail.value !== f.fromEmail || contentType.value !== f.contentType || body.value !== f.body || templateId.value !== f.templateId
})
function saveEmail() {
  const c = campaign.value!
  const f = { ...toForm(c), subject: subject.value, fromEmail: fromEmail.value, contentType: contentType.value, body: body.value, bodySource: bodySource.value, templateId: templateId.value }
  // The list is the step's topic, which the automation's draft sets.
  const { lists: _lists, ...req } = toRequest(f)
  update.mutate({ id: c.id!, body: req }, { onSuccess: () => toast.success(t('web.automations.email.saved')) })
}
defineExpose({ dirty })
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
      <RadioGroup :model-value="mode" class="flex gap-6" :disabled="disabled" @update:model-value="setMode(String($event))">
        <div class="flex items-center gap-2"><RadioGroupItem id="mode-custom" value="custom" /><Label for="mode-custom" class="font-normal">{{ t('web.automations.email.custom') }}</Label></div>
        <div class="flex items-center gap-2"><RadioGroupItem id="mode-template" value="template" /><Label for="mode-template" class="font-normal">{{ t('web.automations.email.template') }}</Label></div>
      </RadioGroup>
      <p v-if="errors.content" class="text-sm text-destructive">{{ errors.content }}</p>
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
      <div v-if="!campaignId">
        <Button type="button" :disabled="disabled || create.isPending.value" data-cy="create-email" @click="createEmail">
          <Loader2 v-if="create.isPending.value" class="animate-spin" />{{ t('web.automations.email.write') }}
        </Button>
      </div>
      <div v-else-if="loading" class="space-y-3"><Skeleton class="h-9 w-full" /><Skeleton class="h-64 w-full" /></div>
      <div v-else-if="campaign" class="space-y-4" data-cy="email-editor">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <Label for="email-subject">{{ t('campaigns.subject') }}</Label>
            <Input id="email-subject" v-model="subject" maxlength="5000" :disabled="disabled" />
          </div>
          <div class="space-y-2">
            <Label for="email-from">{{ t('campaigns.fromAddress') }}</Label>
            <Input id="email-from" v-model="fromEmail" maxlength="200" :disabled="disabled" />
          </div>
        </div>
        <ContentEditor
          v-model:content-type="contentType"
          v-model:body="body"
          v-model:body-source="bodySource"
          v-model:template-id="templateId"
          :campaign-id="campaign.id!"
          :title="subject"
          :disabled="disabled"
          @save="saveEmail"
        />
        <div class="flex items-center gap-3">
          <Button type="button" :disabled="disabled || update.isPending.value || !dirty" data-cy="save-email" @click="saveEmail">
            <Loader2 v-if="update.isPending.value" class="animate-spin" />{{ t('web.automations.email.save') }}
          </Button>
          <p class="text-xs text-muted-foreground">{{ t('web.automations.email.sharedNote') }}</p>
        </div>
      </div>
    </template>
  </div>
</template>
