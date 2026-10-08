<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { Eye, Loader2 } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { useForm } from 'vee-validate'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { Template } from '@/api/types'
import CodeEditor from '@/components/CodeEditor.vue'
import PreviewDialog from '@/components/PreviewDialog.vue'
import { Button } from '@/components/ui/button'
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateTemplate, usePreviewTemplate, useUpdateTemplate } from '@/composables/queries/useTemplates'
import { useGoBack } from '@/composables/useGoBack'
import { usePermission } from '@/composables/usePermission'
import VisualEditor from '@/features/campaigns/visual/VisualEditor.vue'
import { typeLabelKey } from './columns'
import { emptyTemplate, hasContentPlaceholder, templateSchema, toForm } from './schema'

/** Create (no `template`) or edit. The type can't change after creation. */
const props = defineProps<{ template?: Template }>()

const { t } = useI18n()
const { can } = usePermission()
const goBack = useGoBack({ name: 'templates' })
const canManage = computed(() => can('templates:manage'))
const isEditing = computed(() => !!props.template)

const create = useCreateTemplate()
const update = useUpdateTemplate()
const saving = computed(() => create.isPending.value || update.isPending.value)

const { handleSubmit, resetForm, values, setFieldValue } = useForm({
  validationSchema: toTypedSchema(templateSchema(t)),
  initialValues: props.template ? toForm(props.template) : emptyTemplate(),
})
watch(
  () => props.template,
  (tpl) => tpl && resetForm({ values: toForm(tpl) }),
)

const placeholder = '{{ template "content" . }}'
const isVisual = computed(() => values.type === 'campaign_visual')
// Campaign templates are useless without the placeholder; say so before the server does.
const missingPlaceholder = computed(() => values.type === 'campaign' && !!values.body && !hasContentPlaceholder(values.body))

function onVisualChange(v: { source: string; body: string }) {
  setFieldValue('body', v.body)
  setFieldValue('bodySource', v.source)
}

const onSubmit = handleSubmit((v) => {
  const body = { name: v.name, type: v.type, subject: v.type === 'tx' ? v.subject : '', body: v.body, body_source: v.bodySource ?? undefined }
  const done = (name: string | undefined, key: 'created' | 'updated') => {
    toast.success(t(`globals.messages.${key}`, { name: name ?? v.name }))
    goBack()
  }
  if (!props.template) create.mutate(body, { onSuccess: (r) => done(r.name, 'created') })
  else update.mutate({ id: props.template.id!, body }, { onSuccess: (r) => done(r.name, 'updated') })
})

// --- Preview of what's in the form right now (F9), not of the saved version. ---------------------
const preview = usePreviewTemplate()
const previewOpen = ref(false)
function showPreview() {
  previewOpen.value = true
  preview.mutate({ type: values.type ?? 'campaign', body: values.body ?? '' })
}
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'F9') {
    e.preventDefault()
    showPreview()
  }
})
</script>

<template>
  <form class="space-y-6" @submit.prevent="onSubmit">
    <div class="grid items-start gap-6 md:grid-cols-[1fr_14rem]">
      <FormField v-slot="{ componentField }" name="name">
        <FormItem>
          <FormLabel>{{ t('globals.fields.name') }}</FormLabel>
          <FormControl><Input v-bind="componentField" maxlength="200" :disabled="!canManage" autofocus /></FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="type">
        <FormItem>
          <FormLabel>{{ t('globals.fields.type') }}</FormLabel>
          <Select v-bind="componentField" :disabled="isEditing || !canManage">
            <FormControl><SelectTrigger class="w-full"><SelectValue /></SelectTrigger></FormControl>
            <SelectContent>
              <SelectItem v-for="ty in ['campaign', 'campaign_visual', 'tx']" :key="ty" :value="ty">
                {{ t(typeLabelKey(ty)) }}
              </SelectItem>
            </SelectContent>
          </Select>
        </FormItem>
      </FormField>
    </div>

    <FormField v-if="values.type === 'tx'" v-slot="{ componentField }" name="subject">
      <FormItem>
        <FormLabel>{{ t('templates.subject') }}</FormLabel>
        <FormControl><Input v-bind="componentField" maxlength="200" :disabled="!canManage" /></FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <div v-if="isVisual" class="space-y-2">
      <div class="flex items-center justify-between">
        <Label>{{ t('templates.typeCampaignVisual') }}</Label>
        <Button type="button" variant="outline" size="sm" @click="showPreview">
          <Eye />{{ t('templates.preview') }} (F9)
        </Button>
      </div>
      <VisualEditor
        :source="values.bodySource ?? null"
        :body="values.body ?? ''"
        :disabled="!canManage"
        @change="onVisualChange"
      />
    </div>

    <FormField v-else name="body">
      <FormItem>
        <div class="flex items-center justify-between">
          <FormLabel>{{ t('templates.rawHTML') }}</FormLabel>
          <Button type="button" variant="outline" size="sm" @click="showPreview">
            <Eye />{{ t('templates.preview') }} (F9)
          </Button>
        </div>
        <CodeEditor
          :model-value="values.body ?? ''"
          lang="html"
          :readonly="!canManage"
          class="h-[55vh]"
          @update:model-value="setFieldValue('body', $event)"
        />
        <FormDescription v-if="values.type === 'campaign'" :class="missingPlaceholder && 'text-destructive'">
          {{ t('templates.placeholderHelp', { placeholder }) }}
          <a href="https://listmonk.app/docs/templating" target="_blank" rel="noopener noreferrer" class="underline">
            {{ t('globals.buttons.learnMore') }}
          </a>
        </FormDescription>
        <FormMessage />
      </FormItem>
    </FormField>

    <div class="flex gap-2">
      <Button v-if="canManage" type="submit" :disabled="saving">
        <Loader2 v-if="saving" class="animate-spin" />
        {{ t('globals.buttons.save') }}
      </Button>
      <Button type="button" variant="outline" @click="goBack">
        {{ canManage ? t('globals.buttons.cancel') : t('globals.buttons.close') }}
      </Button>
    </div>

    <PreviewDialog v-model:open="previewOpen" :title="values.name || t('templates.preview')" :html="preview.data.value" :pending="preview.isPending.value" />
  </form>
</template>
