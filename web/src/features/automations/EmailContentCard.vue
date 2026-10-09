<script setup lang="ts">
import { Eye, Pencil } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import PreviewDialog from '@/components/PreviewDialog.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCampaign, usePreviewCampaign } from '@/composables/queries/useCampaigns'

/**
 * What an email step sends, at a glance: subject, from address, format and a small preview, with a
 * link to the page where it is written. The content itself is edited there, not in the step panel.
 */
const props = defineProps<{ campaignId: number; to: object; disabled?: boolean }>()
const { t } = useI18n()

const { data: campaign, isPending } = useCampaign(() => props.campaignId)
const formats: Record<string, string> = {
  richtext: 'campaigns.richText',
  html: 'campaigns.rawHTML',
  markdown: 'campaigns.markdown',
  plain: 'campaigns.plainText',
  visual: 'campaigns.visual',
}
const format = computed(() => (campaign.value?.content_type ? t(formats[campaign.value.content_type] ?? 'campaigns.richText') : ''))

// A thumbnail of the saved email: the campaign's own preview, in a sandboxed frame (as in PreviewDialog).
const preview = usePreviewCampaign()
const dialog = ref(false)
watch(
  () => campaign.value?.id,
  (id) => id && preview.mutate(id),
  { immediate: true },
)
</script>

<template>
  <div class="space-y-3 rounded-lg border p-3" data-cy="email-card">
    <div v-if="isPending" class="space-y-2"><Skeleton class="h-4 w-2/3" /><Skeleton class="h-3 w-1/2" /><Skeleton class="h-32 w-full" /></div>
    <template v-else-if="campaign">
      <dl class="space-y-1 text-sm">
        <dd class="font-medium" :class="!campaign.subject && 'text-muted-foreground'" data-cy="email-card-subject">
          {{ campaign.subject || t('web.automations.email.noSubject') }}
        </dd>
        <dd class="text-xs text-muted-foreground">{{ campaign.from_email }}</dd>
        <dd class="text-xs text-muted-foreground">{{ t('campaigns.format') }}: {{ format }}</dd>
      </dl>
      <div class="h-40 overflow-hidden rounded-md border bg-white" aria-hidden="true">
        <Skeleton v-if="preview.isPending.value" class="size-full rounded-none" />
        <iframe
          v-else-if="preview.data.value"
          :srcdoc="preview.data.value"
          sandbox="allow-scripts"
          tabindex="-1"
          class="pointer-events-none h-[16rem] w-[153.85%] origin-top-left scale-[0.65] border-0"
        />
      </div>
      <div class="flex gap-2">
        <Button as-child size="sm" data-cy="edit-email">
          <RouterLink :to="to"><Pencil />{{ t(disabled ? 'web.automations.email.view' : 'web.automations.email.edit') }}</RouterLink>
        </Button>
        <Button type="button" variant="outline" size="sm" data-cy="preview-email" @click="dialog = true"><Eye />{{ t('campaigns.preview') }}</Button>
      </div>
      <PreviewDialog v-model:open="dialog" :title="campaign.subject || t('web.automations.email.noSubject')" :html="preview.data.value" :pending="preview.isPending.value" />
    </template>
  </div>
</template>
