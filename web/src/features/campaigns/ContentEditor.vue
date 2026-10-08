<script setup lang="ts">
import { Eye } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import CodeEditor from '@/components/CodeEditor.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PreviewDialog from '@/components/PreviewDialog.vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useConvertCampaignContent, usePreviewCampaignBody } from '@/composables/queries/useCampaigns'
import { useTemplates } from '@/composables/queries/useTemplates'
import { convertContent } from './convert'
import { contentTypes, type ContentType } from './schema'

/**
 * The content tab: format and template pickers, the editor for the chosen format, and the
 * preview. Everything is bound with v-model so the page's form stays the single source of truth.
 */
const props = defineProps<{ campaignId: number; title: string; disabled?: boolean }>()
const contentType = defineModel<ContentType>('contentType', { required: true })
const body = defineModel<string>('body', { required: true })
const bodySource = defineModel<string | null>('bodySource', { default: null })
const templateId = defineModel<number | null>('templateId', { default: null })

const { t } = useI18n()
const { data: templates } = useTemplates()

const formatLabel = (f: ContentType) =>
  ({ richtext: t('campaigns.richText'), html: t('campaigns.rawHTML'), markdown: t('campaigns.markdown'), plain: t('campaigns.plainText'), visual: t('campaigns.visual') })[f]

// Visual campaigns use visual templates (as a starting document), the rest use campaign templates.
const validTemplates = computed(() =>
  (templates.value ?? []).filter((tpl) => tpl.type === (contentType.value === 'visual' ? 'campaign_visual' : 'campaign')),
)

// New campaigns start with no template: use the default one, else the first.
const effectiveTemplate = computed(() => {
  if (contentType.value === 'visual') return null
  if (templateId.value && validTemplates.value.some((x) => x.id === templateId.value)) return templateId.value
  return validTemplates.value.find((x) => x.is_default)?.id ?? validTemplates.value[0]?.id ?? null
})
// Persist the default we showed, so what the user sees is what gets saved.
watch(
  [templates, contentType],
  () => {
    if (templates.value && contentType.value !== 'visual' && templateId.value !== effectiveTemplate.value) {
      templateId.value = effectiveTemplate.value
    }
  },
  { immediate: true },
)

// --- Switching format: confirm (it is lossy), convert, then apply type+body together. ----------------
const pendingType = ref<ContentType | null>(null)
const convertOpen = computed({ get: () => pendingType.value !== null, set: (o) => !o && (pendingType.value = null) })
const convertServer = useConvertCampaignContent()
const converting = ref(false)

function onFormatSelect(v: unknown) {
  const to = v as ContentType
  if (to === contentType.value) return
  // Nothing to lose when the body is empty.
  if (!body.value.trim()) void apply(to)
  else pendingType.value = to
}

async function apply(to: ContentType) {
  const from = contentType.value
  converting.value = true
  try {
    const out = await convertContent(body.value, from, to, (md) => convertServer.mutateAsync({ body: md, from: 'markdown', to }))
    contentType.value = to
    body.value = out.body
    bodySource.value = out.bodySource
    if (out.resetTemplate) templateId.value = null
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e))
  } finally {
    converting.value = false
    pendingType.value = null
  }
}

// --- Preview of the editor's current (unsaved) content, F9. ----------------------------------------
const preview = usePreviewCampaignBody()
const previewOpen = ref(false)
function showPreview() {
  previewOpen.value = true
  preview.mutate({ id: props.campaignId, contentType: contentType.value, body: body.value, templateId: templateId.value })
}
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'F9') {
    e.preventDefault()
    showPreview()
  }
})
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-wrap items-end gap-4">
        <div class="space-y-2">
          <Label>{{ t('campaigns.format') }}</Label>
          <Select :model-value="contentType" :disabled="disabled || converting" @update:model-value="onFormatSelect">
            <SelectTrigger class="w-44" data-cy="format"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="f in contentTypes" :key="f" :value="f" :data-cy="`check-${f}`">{{ formatLabel(f) }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div v-if="contentType !== 'visual'" class="space-y-2">
          <Label>{{ t('globals.terms.template', 1) }}</Label>
          <Select :model-value="templateId == null ? undefined : String(templateId)" :disabled="disabled" @update:model-value="templateId = Number($event)">
            <SelectTrigger class="w-56" data-cy="template"><SelectValue :placeholder="t('globals.terms.none')" /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="tpl in validTemplates" :key="tpl.id" :value="String(tpl.id)">{{ tpl.name }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" data-cy="btn-preview" @click="showPreview">
        <Eye />{{ t('campaigns.preview') }} (F9)
      </Button>
    </div>

    <!-- richtext and visual get their own editors; until those land they edit the HTML directly. -->
    <CodeEditor v-if="contentType === 'html' || contentType === 'richtext' || contentType === 'visual'" v-model="body" lang="html" :readonly="disabled" class="h-[60vh]" />
    <CodeEditor v-else-if="contentType === 'markdown'" v-model="body" lang="markdown" :readonly="disabled" class="h-[60vh]" />
    <Textarea v-else v-model="body" :disabled="disabled" class="h-[60vh] font-mono text-sm" name="content" />

    <PreviewDialog v-model:open="previewOpen" :title="title" :html="preview.data.value" :pending="preview.isPending.value" />

    <ConfirmDialog
      v-model:open="convertOpen"
      :title="t('campaigns.confirmSwitchFormat')"
      :confirm-label="t('web.common.confirm')"
      :pending="converting"
      @confirm="apply(pendingType!)"
    />
  </section>
</template>
