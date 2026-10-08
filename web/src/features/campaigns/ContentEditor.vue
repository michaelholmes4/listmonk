<script setup lang="ts">
import { Eye, FileSearch, Loader2 } from '@lucide/vue'
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
import { useFetchTemplate, useTemplates } from '@/composables/queries/useTemplates'
import { convertContent } from './convert'
import RichtextEditor from './richtext/RichtextEditor.vue'
import { contentTypes, type ContentType } from './schema'
import VisualEditor from './visual/VisualEditor.vue'

/**
 * The content tab: format and template pickers, the editor for the chosen format, and the
 * preview. Everything is bound with v-model so the page's form stays the single source of truth.
 */
const props = defineProps<{ campaignId: number; title: string; disabled?: boolean }>()
const emit = defineEmits<{ save: [] }>()
const contentType = defineModel<ContentType>('contentType', { required: true })
const body = defineModel<string>('body', { required: true })
const bodySource = defineModel<string | null>('bodySource', { default: null })
const templateId = defineModel<number | null>('templateId', { default: null })

const { t } = useI18n()
const { data: templates } = useTemplates()

const formatLabel = (f: ContentType) =>
  ({
    richtext: t('campaigns.richText'),
    html: t('campaigns.rawHTML'),
    markdown: t('campaigns.markdown'),
    plain: t('campaigns.plainText'),
    visual: t('campaigns.visual'),
  })[f]

// Visual campaigns use visual templates (as a starting document), the rest use campaign templates.
const validTemplates = computed(() =>
  (templates.value ?? []).filter(
    (tpl) => tpl.type === (contentType.value === 'visual' ? 'campaign_visual' : 'campaign'),
  ),
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
    const out = await convertContent(body.value, from, to, (md) =>
      convertServer.mutateAsync({ body: md, from: 'markdown', to }),
    )
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

// --- Visual editor: start from a visual template. ----------------------------------------------------
const visual = ref<InstanceType<typeof VisualEditor>>()
const importing = ref(false)
const importTemplateId = ref<number | null>(null)
const importConfirmOpen = ref(false)
const fetchTemplate = useFetchTemplate()

function onVisualChange(v: { source: string; body: string }) {
  body.value = v.body
  bodySource.value = v.source
}

function startImport() {
  importing.value = true
  importTemplateId.value = validTemplates.value[0]?.id ?? null
}

async function importTemplate() {
  if (!importTemplateId.value) return
  try {
    const tpl = await fetchTemplate.mutateAsync(importTemplateId.value)
    body.value = tpl.body ?? ''
    bodySource.value = tpl.body_source ?? null
    visual.value?.reset(tpl.body_source ? JSON.parse(tpl.body_source) : null)
    importing.value = false
  } finally {
    importConfirmOpen.value = false
  }
}

// --- Preview of the editor's current (unsaved) content, F9. ----------------------------------------
const preview = usePreviewCampaignBody()
const previewOpen = ref(false)
function showPreview() {
  previewOpen.value = true
  preview.mutate({
    id: props.campaignId,
    contentType: contentType.value,
    body: body.value,
    templateId: templateId.value,
  })
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
              <SelectItem v-for="f in contentTypes" :key="f" :value="f" :data-cy="`check-${f}`">
                {{
                  formatLabel(f)
                }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div v-if="contentType !== 'visual'" class="space-y-2">
          <Label>{{ t('globals.terms.template', 1) }}</Label>
          <Select
            :model-value="templateId == null ? undefined : String(templateId)"
            :disabled="disabled"
            @update:model-value="templateId = Number($event)"
          >
            <SelectTrigger class="w-56" data-cy="template">
              <SelectValue :placeholder="t('globals.terms.none')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="tpl in validTemplates" :key="tpl.id" :value="String(tpl.id)">
                {{
                  tpl.name
                }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Button
          v-if="contentType === 'visual' && !importing"
          type="button"
          variant="ghost"
          size="sm"
          :disabled="disabled"
          data-cy="btn-select-visual-tpl"
          @click="startImport"
        >
          <FileSearch />{{ t('campaigns.importVisualTemplate') }}
        </Button>
        <Button type="button" variant="outline" size="sm" data-cy="btn-preview" @click="showPreview">
          <Eye />{{ t('campaigns.preview') }} (F9)
        </Button>
      </div>
    </div>

    <div
      v-if="contentType === 'visual' && importing"
      class="flex flex-wrap items-center gap-2"
      data-cy="import-visual-tpl"
    >
      <Select
        :model-value="importTemplateId == null ? undefined : String(importTemplateId)"
        @update:model-value="importTemplateId = Number($event)"
      >
        <SelectTrigger class="w-64"><SelectValue :placeholder="t('globals.terms.none')" /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="tpl in validTemplates" :key="tpl.id" :value="String(tpl.id)">{{ tpl.name }}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        :disabled="!importTemplateId || fetchTemplate.isPending.value"
        data-cy="btn-save-visual-tpl"
        @click="importConfirmOpen = true"
      >
        <Loader2 v-if="fetchTemplate.isPending.value" class="animate-spin" />{{ t('campaigns.importVisualTemplate') }}
      </Button>
      <Button type="button" variant="ghost" size="sm" @click="importing = false">
        {{
          t('globals.buttons.cancel')
        }}
      </Button>
    </div>

    <RichtextEditor
      v-if="contentType === 'richtext'"
      v-model="body"
      :disabled="disabled"
      @save="emit('save')"
      @preview="showPreview"
    />
    <VisualEditor
      v-else-if="contentType === 'visual'"
      ref="visual"
      :source="bodySource"
      :body="body"
      :disabled="disabled"
      @change="onVisualChange"
    />
    <CodeEditor v-else-if="contentType === 'html'" v-model="body" lang="html" :readonly="disabled" class="h-[60vh]" />
    <CodeEditor
      v-else-if="contentType === 'markdown'"
      v-model="body"
      lang="markdown"
      :readonly="disabled"
      class="h-[60vh]"
    />
    <Textarea v-else v-model="body" :disabled="disabled" class="h-[60vh] font-mono text-sm" name="content" />

    <PreviewDialog
      v-model:open="previewOpen"
      :title="title"
      :html="preview.data.value"
      :pending="preview.isPending.value"
    />

    <ConfirmDialog
      v-model:open="importConfirmOpen"
      :title="t('campaigns.confirmOverwriteContent')"
      :confirm-label="t('web.common.confirm')"
      :pending="fetchTemplate.isPending.value"
      @confirm="importTemplate"
    />
    <ConfirmDialog
      v-model:open="convertOpen"
      :title="t('campaigns.confirmSwitchFormat')"
      :confirm-label="t('web.common.confirm')"
      :pending="converting"
      @confirm="apply(pendingType!)"
    />
  </section>
</template>
