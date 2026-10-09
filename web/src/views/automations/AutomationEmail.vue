<script setup lang="ts">
import { Mail } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EmptyState from '@/components/EmptyState.vue'
import FormActions from '@/components/layout/FormActions.vue'
import Page from '@/components/layout/Page.vue'
import LeaveConfirm from '@/components/LeaveConfirm.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAutomation, useAutomationDraft, useEnrollments } from '@/composables/queries/useAutomations'
import { usePermission } from '@/composables/usePermission'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { stepMeta } from '@/features/automations/labels'
import { graphToFlow, locate } from '@/features/automations/model'
import { isLive } from '@/features/automations/status'
import { useStepEmail } from '@/features/automations/useStepEmail'
import ContentEditor from '@/features/campaigns/ContentEditor.vue'
import { usePageParent, usePageTitle } from '@/lib/page-title'

/**
 * The email of one email step, on a page of its own: a long editor wants the whole width, and the
 * step panel next to the flow is too narrow for it. Same layout as a campaign's Content tab.
 * Saving writes the hidden campaign, which sends use at once (in every version of the automation).
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { can } = usePermission()

const id = computed(() => Number(route.params.id))
const stepId = computed(() => String(route.params.step))
const { data: automation } = useAutomation(id)
const { data: draft, isPending: draftPending } = useAutomationDraft(id)

const step = computed(() => {
  if (!draft.value) return undefined
  const loc = locate(graphToFlow(draft.value.graph), stepId.value)
  const s = loc?.list[loc.index]
  return s?.type === 'send_email' ? s : undefined
})
const campaignId = computed(() => (step.value?.config.campaign_id as number | undefined) || undefined)
const mail = useStepEmail(campaignId)

const live = computed(() => isLive(automation.value?.status))
const readonly = computed(() => !can('automations:manage') || automation.value?.status === 'archived')
const missing = computed(() => !!draft.value && !campaignId.value)

// Back to the flow, with the step's panel open again.
const flow = computed(() => ({ name: 'automation', params: { id: id.value }, query: { step: stepId.value } }))
const goBack = () => router.push(flow.value)

const title = computed(() => (mail.subject.value ? t('web.automations.email.title', { subject: mail.subject.value }) : t(stepMeta.send_email.title)))
usePageTitle(() => (mail.ready.value ? title.value : undefined))
usePageParent(() => (automation.value?.name ? { title: automation.value.name, to: flow.value } : undefined))

// --- Saving. On a live automation it changes what is sent from now on, so it asks. -----------------------------
const confirmOpen = ref(false)
// How many people this reaches now; only worth asking for when the dialog is about to show.
const { data: inside } = useEnrollments(id, () => ({ status: ['active', 'waiting'], page: 1, perPage: 1 }))
const people = computed(() => inside.value?.total ?? 0)

async function doSave() {
  await mail.save()
  confirmOpen.value = false
  toast.success(t('web.automations.email.saved'))
}
function onSave() {
  if (readonly.value || !mail.ready.value || !mail.dirty.value || mail.saving.value) return
  if (live.value) confirmOpen.value = true
  else void doSave()
}
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    onSave()
  }
})

const { leaveOpen, decide } = useUnsavedGuard(mail.dirty, mail.saving)
</script>

<template>
  <Page :title="mail.ready.value ? title : (automation?.name ?? '…')" :description="step && automation ? t('web.automations.email.pageDescription', { step: stepId, automation: automation.name }) : undefined">
    <template v-if="step" #badges>
      <Badge variant="secondary">{{ t(`web.automations.messageType.${step.config.message_type === 'transactional' ? 'transactional' : 'marketing'}`) }}</Badge>
    </template>

    <FormActions
      v-if="mail.ready.value"
      :pending="mail.saving.value"
      :dirty="mail.dirty.value"
      :can-save="!readonly"
      :save-label="live ? t('web.automations.email.saveLive') : undefined"
      :on-cancel="goBack"
      @save="onSave"
    />

    <div v-if="draftPending || (campaignId && !mail.ready.value)" class="space-y-3">
      <Skeleton class="h-9 w-full max-w-3xl" /><Skeleton class="h-96 w-full" />
    </div>

    <EmptyState v-else-if="missing" :icon="Mail" :title="t('web.automations.email.notFound')" :description="t('web.automations.email.notFoundHelp')">
      <template #action>
        <Button as-child variant="outline" size="sm" data-cy="back-to-flow"><RouterLink :to="{ name: 'automation', params: { id } }">{{ t('web.automations.email.backToFlow') }}</RouterLink></Button>
      </template>
    </EmptyState>

    <template v-else-if="mail.ready.value">
      <Alert v-if="live" data-cy="live-email-note">
        <AlertDescription>{{ t('web.automations.email.sharedNote') }}</AlertDescription>
      </Alert>

      <!-- Editor page: a row of compact fields, then the editor at full width. -->
      <div class="flex flex-wrap items-end gap-4">
        <div class="min-w-64 flex-1 space-y-2">
          <Label for="email-subject">{{ t('campaigns.subject') }}</Label>
          <Input id="email-subject" v-model="mail.subject.value" maxlength="5000" :disabled="readonly" />
        </div>
        <div class="w-full space-y-2 sm:w-72">
          <Label for="email-from">{{ t('campaigns.fromAddress') }}</Label>
          <Input id="email-from" v-model="mail.fromEmail.value" maxlength="200" :disabled="readonly" />
        </div>
      </div>

      <ContentEditor
        v-model:content-type="mail.contentType.value"
        v-model:body="mail.body.value"
        v-model:body-source="mail.bodySource.value"
        v-model:template-id="mail.templateId.value"
        :campaign-id="mail.campaign.value!.id!"
        :title="mail.subject.value"
        :disabled="readonly"
        @save="onSave"
      />
    </template>
  </Page>

  <ConfirmDialog
    v-model:open="confirmOpen"
    :title="t('web.automations.email.confirmLiveTitle')"
    :description="t('web.automations.email.confirmLive', { n: people }, people)"
    :confirm-label="t('web.automations.email.saveLive')"
    :pending="mail.saving.value"
    @confirm="doSave"
  />
  <LeaveConfirm :open="leaveOpen" @decide="decide" />
</template>
