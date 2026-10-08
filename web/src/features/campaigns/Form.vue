<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useEventListener } from '@vueuse/core'
import { Clock, Eye, FileUp, Loader2, Mail, Plus, Rocket, Save, X } from '@lucide/vue'
import { useForm } from 'vee-validate'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { z } from 'zod'
import type { Campaign } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PreviewDialog from '@/components/PreviewDialog.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TagsInput, TagsInputInput, TagsInputItem, TagsInputItemDelete, TagsInputItemText } from '@/components/ui/tags-input'
import { Textarea } from '@/components/ui/textarea'
import { useConfig } from '@/composables/queries/useConfig'
import {
  useChangeCampaignStatus,
  useCreateCampaign,
  usePreviewCampaignArchive,
  useTestCampaign,
  useUpdateCampaign,
  useUpdateCampaignArchive,
} from '@/composables/queries/useCampaigns'
import { useTemplates } from '@/composables/queries/useTemplates'
import { usePermission } from '@/composables/usePermission'
import ListPicker from '@/features/lists/ListPicker.vue'
import MediaPickerDialog from '@/features/media/MediaPickerDialog.vue'
import ContentEditor from './ContentEditor.vue'
import { htmlToPlain } from './convert'
import { campaignSchema, emptyCampaign, parseObject, toForm, toRequest, type CampaignForm } from './schema'
import { canEdit as statusAllowsEdit } from './status'

/** Create (no `campaign`) or edit. A new campaign is created without content; the editor opens next. */
const props = defineProps<{ campaign?: Campaign; initialLists?: number[] }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { can } = usePermission()
const { data: config } = useConfig()
const { data: templates } = useTemplates()

const isNew = computed(() => !props.campaign)
const canManage = computed(() => can('campaigns:manage'))
const canSend = computed(() => can('campaigns:send'))
const status = computed(() => props.campaign?.status)
// Content and settings lock once a campaign is running or over; archive settings stay editable.
const canEdit = computed(() => canManage.value && (isNew.value || statusAllowsEdit({ status: status.value, send_at: props.campaign?.send_at })))
const canArchive = computed(() => canManage.value && status.value !== 'cancelled' && props.campaign?.type !== 'optin')

// --- Form state. ---------------------------------------------------------------------------------
const initial = (): CampaignForm =>
  props.campaign ? toForm(props.campaign) : emptyCampaign(config.value?.from_email ?? '', props.initialLists ?? [])

const { handleSubmit, resetForm, values, setFieldValue, errors } = useForm({
  validationSchema: toTypedSchema(campaignSchema(t)),
  initialValues: initial(),
})
// The config (default from address) may arrive after the form is created.
watch(
  () => config.value?.from_email,
  (from) => isNew.value && from && !values.fromEmail && setFieldValue('fromEmail', from),
)

const baseline = ref(JSON.stringify(values))
const dirty = computed(() => canEdit.value && JSON.stringify(values) !== baseline.value)
function reset(c: Campaign) {
  resetForm({ values: toForm(c) })
  baseline.value = JSON.stringify(toForm(c))
}
// Fresh data from the server (after a status change or a refetch) replaces the form, unless the
// user has unsaved edits.
watch(
  () => props.campaign,
  (c) => c && !dirty.value && reset(c),
)

// --- Tabs live in the URL (?tab=content) so a reload or a link lands on the same one. -------------
const tabs = ['campaign', 'content', 'attribs', 'archive'] as const
type Tab = (typeof tabs)[number]
const tab = computed<Tab>({
  get: () => (tabs.includes(route.query.tab as Tab) && !isNew.value ? (route.query.tab as Tab) : 'campaign'),
  set: (v) => router.replace({ query: { ...route.query, tab: v === 'campaign' ? undefined : v } }),
})
const fieldTab = (field: string): Tab =>
  field === 'attribs' ? 'attribs' : field.startsWith('archive') ? 'archive' : field === 'body' ? 'content' : 'campaign'

// --- Saving. -------------------------------------------------------------------------------------
const create = useCreateCampaign()
const update = useUpdateCampaign()
const setStatus = useChangeCampaignStatus()
const saving = computed(() => create.isPending.value || update.isPending.value || setStatus.isPending.value)

/** Validates, then runs `fn` with the form values; on errors, jumps to the first tab that has one. */
const validated = <T,>(fn: (v: CampaignForm) => T | Promise<T>) =>
  handleSubmit(fn, ({ errors: errs }) => {
    const [field, msg] = Object.entries(errs)[0] ?? []
    if (field) {
      tab.value = fieldTab(field)
      toast.error(String(msg))
    }
  })

const createAndContinue = validated(async (v) => {
  const c = await create.mutateAsync(toRequest(v, { create: true }))
  toast.success(t('globals.messages.created', { name: c.name }))
  baseline.value = JSON.stringify(values)
  router.replace({ name: 'campaign', params: { id: c.id }, query: { tab: 'content' } })
})

/** Saves everything; resolves with the saved campaign, or undefined when validation failed. */
const save = validated(async (v) => {
  const c = await update.mutateAsync({ id: props.campaign!.id!, body: toRequest(v) })
  toast.success(t('globals.messages.updated', { name: c.name }))
  reset(c)
  return c
})

const submit = () => (isNew.value ? createAndContinue() : save())

// Start / schedule: save first, then change the status, then go back to the list.
const startOpen = ref(false)
const startsNow = computed(() => !values.sendLater)
async function start() {
  const saved = await save()
  if (!saved) {
    startOpen.value = false
    return
  }
  await setStatus.mutateAsync({ id: saved.id!, status: startsNow.value ? 'running' : 'scheduled' })
  startOpen.value = false
  router.push({ name: 'campaigns' })
}
const unscheduleOpen = ref(false)
function unschedule() {
  setStatus.mutate(
    { id: props.campaign!.id!, status: 'draft' },
    { onSuccess: () => (unscheduleOpen.value = false) },
  )
}

// --- Keyboard and leaving the page. ----------------------------------------------------------------
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && canEdit.value) {
    e.preventDefault()
    void submit()
  }
})
useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
  if (dirty.value) e.preventDefault()
})
const leaveOpen = ref(false)
let leaveDecision: ((ok: boolean) => void) | undefined
onBeforeRouteLeave(() => {
  if (!dirty.value || saving.value) return true
  leaveOpen.value = true
  return new Promise<boolean>((resolve) => (leaveDecision = resolve))
})
function decideLeave(ok: boolean) {
  leaveOpen.value = false
  leaveDecision?.(ok)
}

// --- Send a test. ----------------------------------------------------------------------------------
const testEmails = ref<string[]>([])
const sendTest = useTestCampaign()
const validEmail = (s: string) => z.string().email().safeParse(s).success
function onTestEmails(list: unknown) {
  const next = (list as string[]).filter(validEmail)
  if (next.length !== (list as string[]).length) toast.error(t('subscribers.invalidEmail'))
  testEmails.value = next
}
const runTest = validated((v) =>
  sendTest.mutateAsync({ id: props.campaign!.id!, body: toRequest(v), subscribers: testEmails.value }).then(() => {
    toast.success(t('campaigns.testSent'))
  }),
)

// --- Messengers. -----------------------------------------------------------------------------------
const emailMessengers = computed(() => ['email', ...(config.value?.messengers ?? []).filter((m) => m.startsWith('email-'))])
const otherMessengers = computed(() => (config.value?.messengers ?? []).filter((m) => m !== 'email' && !m.startsWith('email-')))

// --- Attachments, alternative body, headers. -------------------------------------------------------
const mediaOpen = ref(false)
const addMedia = (m: { id?: number; filename?: string }) => {
  if (!m.id || values.media?.some((x) => x.id === m.id)) return
  setFieldValue('media', [...(values.media ?? []), { id: m.id, filename: m.filename ?? '' }])
}
const removeMedia = (i: number) => setFieldValue('media', (values.media ?? []).filter((_, j) => j !== i))
const altRemoveOpen = ref(false)
const showHeaders = ref(false)
const headersVisible = computed(() => showHeaders.value || (values.headers ?? '[]').trim() !== '[]')

// --- Archive. --------------------------------------------------------------------------------------
const archiveTemplates = computed(() => (templates.value ?? []).filter((x) => x.type === 'campaign'))
const archivePreview = usePreviewCampaignArchive()
const archivePreviewOpen = ref(false)
function showArchivePreview() {
  archivePreviewOpen.value = true
  archivePreview.mutate({ id: props.campaign!.id!, archiveMeta: values.archiveMeta ?? '{}', templateId: values.archiveTemplateId ?? null })
}
function fillArchiveMeta() {
  setFieldValue('archiveMeta', JSON.stringify({ email: 'email@domain.com', name: t('globals.fields.name'), attribs: {} }, null, 2))
}
// When the content is locked the archive can still be changed on its own.
const archiveUpdate = useUpdateCampaignArchive()
function saveArchiveOnly() {
  archiveUpdate.mutate(
    {
      id: props.campaign!.id!,
      body: {
        archive: values.archive ?? false,
        archive_template_id: values.archiveTemplateId ?? undefined,
        archive_meta: parseObject(values.archiveMeta ?? '{}') ?? {},
        archive_slug: values.archiveSlug || undefined,
      },
    },
    { onSuccess: (r) => (setFieldValue('archiveSlug', r.archive_slug ?? ''), toast.success(t('globals.messages.updated', { name: props.campaign?.name }))) },
  )
}

const canStartNow = computed(() => canSend.value && !isNew.value && (status.value === 'draft' || status.value === 'paused') && !values.sendLater)
const canScheduleNow = computed(() => canSend.value && !isNew.value && (status.value === 'draft' || status.value === 'paused') && values.sendLater && !!values.sendAt)
const canUnschedule = computed(() => canSend.value && status.value === 'scheduled')
</script>

<template>
  <Teleport v-if="!isNew" defer to="#page-actions">
    <template v-if="canEdit">
      <Button size="sm" variant="outline" :disabled="saving || !dirty" data-cy="btn-save" @click="submit">
        <Loader2 v-if="update.isPending.value" class="animate-spin" /><Save v-else />
        {{ t('globals.buttons.saveChanges') }}
      </Button>
      <Button v-if="canStartNow" size="sm" :disabled="saving" data-cy="btn-start" @click="startOpen = true"><Rocket />{{ t('campaigns.start') }}</Button>
      <Button v-if="canScheduleNow" size="sm" :disabled="saving" data-cy="btn-schedule" @click="startOpen = true"><Clock />{{ t('campaigns.schedule') }}</Button>
    </template>
    <Button v-if="canUnschedule" size="sm" variant="outline" :disabled="saving" data-cy="btn-unschedule" @click="unscheduleOpen = true">
      <Clock />{{ t('campaigns.unSchedule') }}
    </Button>
  </Teleport>

  <form class="space-y-6" @submit.prevent="submit">
    <Tabs v-model="tab">
      <TabsList>
        <TabsTrigger value="campaign">{{ t('globals.terms.campaign', 1) }}</TabsTrigger>
        <TabsTrigger value="content" :disabled="isNew">{{ t('campaigns.content') }}</TabsTrigger>
        <TabsTrigger value="attribs" :disabled="isNew">{{ t('globals.terms.attribs') }}</TabsTrigger>
        <TabsTrigger value="archive" :disabled="isNew">{{ t('campaigns.archive') }}</TabsTrigger>
      </TabsList>

      <!-- Settings -->
      <TabsContent value="campaign" class="space-y-6 pt-4">
        <FormField v-slot="{ componentField }" name="name">
          <FormItem>
            <FormLabel>{{ t('globals.fields.name') }}</FormLabel>
            <FormControl><Input v-bind="componentField" maxlength="200" :disabled="!canEdit" autofocus /></FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="subject">
          <FormItem>
            <FormLabel>{{ t('campaigns.subject') }}</FormLabel>
            <FormControl><Input v-bind="componentField" maxlength="5000" :disabled="!canEdit" /></FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="fromEmail">
          <FormItem>
            <FormLabel>{{ t('campaigns.fromAddress') }}</FormLabel>
            <FormControl><Input v-bind="componentField" maxlength="200" :placeholder="t('campaigns.fromAddressPlaceholder')" :disabled="!canEdit" /></FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField name="lists">
          <FormItem>
            <FormLabel>{{ t('globals.terms.lists') }}</FormLabel>
            <ListPicker :model-value="values.lists ?? []" :placeholder="t('campaigns.sendToLists')" :disabled="!canEdit" @update:model-value="setFieldValue('lists', $event)" />
            <FormMessage />
          </FormItem>
        </FormField>

        <div class="grid items-start gap-6 md:grid-cols-2">
          <FormField v-slot="{ componentField }" name="messenger">
            <FormItem>
              <FormLabel>{{ t('globals.terms.messenger', 1) }}</FormLabel>
              <Select v-bind="componentField" :disabled="!canEdit">
                <FormControl><SelectTrigger class="w-full"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem v-for="m in emailMessengers" :key="m" :value="m">{{ m }}</SelectItem>
                  <SelectItem v-for="m in otherMessengers" :key="m" :value="m">{{ m }}</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          </FormField>

          <FormField v-if="isNew" v-slot="{ componentField }" name="contentType">
            <FormItem>
              <FormLabel>{{ t('campaigns.format') }}</FormLabel>
              <Select v-bind="componentField">
                <FormControl><SelectTrigger class="w-full" data-cy="format"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="richtext">{{ t('campaigns.richText') }}</SelectItem>
                  <SelectItem value="html">{{ t('campaigns.rawHTML') }}</SelectItem>
                  <SelectItem value="markdown">{{ t('campaigns.markdown') }}</SelectItem>
                  <SelectItem value="plain">{{ t('campaigns.plainText') }}</SelectItem>
                  <SelectItem value="visual">{{ t('campaigns.visual') }}</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          </FormField>
        </div>

        <FormField name="tags">
          <FormItem>
            <FormLabel>{{ t('globals.terms.tags') }}</FormLabel>
            <TagsInput :model-value="values.tags ?? []" :disabled="!canEdit" add-on-blur @update:model-value="setFieldValue('tags', $event as string[])">
              <TagsInputItem v-for="tag in values.tags" :key="tag" :value="tag">
                <TagsInputItemText />
                <TagsInputItemDelete />
              </TagsInputItem>
              <TagsInputInput :placeholder="t('globals.terms.tags')" />
            </TagsInput>
          </FormItem>
        </FormField>

        <div class="grid items-start gap-6 md:grid-cols-2">
          <div class="flex items-start justify-between gap-4 rounded-lg border p-3">
            <label for="send-later" class="text-sm font-medium">{{ t('campaigns.sendLater') }}</label>
            <Switch id="send-later" :model-value="values.sendLater" :disabled="!canEdit" data-cy="btn-send-later" @update:model-value="setFieldValue('sendLater', $event)" />
          </div>
          <FormField v-if="values.sendLater" v-slot="{ componentField }" name="sendAt">
            <FormItem>
              <FormControl>
                <Input v-bind="componentField" type="datetime-local" :disabled="!canEdit" :aria-label="t('campaigns.dateAndTime')" data-cy="send_at" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>

        <div class="space-y-2">
          <button v-if="!headersVisible" type="button" class="flex items-center gap-1 text-sm text-primary hover:underline" data-cy="btn-headers" @click="showHeaders = true">
            <Plus class="size-4" />{{ t('settings.smtp.setCustomHeaders') }}
          </button>
          <FormField v-if="headersVisible" v-slot="{ componentField }" name="headers">
            <FormItem>
              <FormLabel>{{ t('settings.smtp.setCustomHeaders') }}</FormLabel>
              <FormControl>
                <Textarea v-bind="componentField" class="font-mono text-xs" rows="4" :disabled="!canEdit" placeholder="[{&quot;X-Custom&quot;: &quot;value&quot;}]" />
              </FormControl>
              <FormDescription>{{ t('campaigns.customHeadersHelp') }}</FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>

        <!-- Test send -->
        <section v-if="!isNew && canManage" class="space-y-3 rounded-lg border p-4">
          <h3 class="text-sm font-medium">{{ t('campaigns.sendTest') }}</h3>
          <TagsInput :model-value="testEmails" add-on-blur @update:model-value="onTestEmails">
            <TagsInputItem v-for="e in testEmails" :key="e" :value="e">
              <TagsInputItemText />
              <TagsInputItemDelete />
            </TagsInputItem>
            <TagsInputInput :aria-label="t('campaigns.testEmails')" :placeholder="t('campaigns.testEmails')" />
          </TagsInput>
          <p class="text-xs text-muted-foreground">{{ t('campaigns.sendTestHelp') }}</p>
          <Button type="button" variant="outline" size="sm" :disabled="!testEmails.length || sendTest.isPending.value" data-cy="btn-test" @click="runTest">
            <Loader2 v-if="sendTest.isPending.value" class="animate-spin" /><Mail v-else />{{ t('campaigns.send') }}
          </Button>
        </section>
      </TabsContent>

      <!-- Content -->
      <TabsContent v-if="!isNew" value="content" class="space-y-6 pt-4">
        <ContentEditor
          :campaign-id="campaign!.id!"
          :title="campaign!.name ?? ''"
          :disabled="!canEdit"
          :content-type="values.contentType!"
          :body="values.body ?? ''"
          :body-source="values.bodySource ?? null"
          :template-id="values.templateId ?? null"
          @update:content-type="setFieldValue('contentType', $event)"
          @update:body="setFieldValue('body', $event)"
          @update:body-source="setFieldValue('bodySource', $event)"
          @update:template-id="setFieldValue('templateId', $event)"
          @save="submit"
        />

        <div class="flex flex-wrap items-start justify-between gap-4 text-sm">
          <div class="space-y-2">
            <button v-if="canEdit" type="button" class="flex items-center gap-1 text-primary hover:underline" data-cy="btn-attach" @click="mediaOpen = true">
              <FileUp class="size-4" />{{ t('campaigns.addAttachments') }}
            </button>
            <div v-if="values.media?.length" class="flex flex-wrap gap-1.5" data-cy="media">
              <Badge v-for="(m, i) in values.media" :key="m.id || m.filename" variant="secondary" class="gap-1 pr-1">
                {{ m.filename }}
                <button v-if="canEdit" type="button" class="rounded-full p-0.5 hover:bg-foreground/10" :aria-label="t('globals.buttons.remove')" @click="removeMedia(i)"><X class="size-3" /></button>
              </Badge>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-4">
            <a href="https://listmonk.app/docs/templating/#template-expressions" target="_blank" rel="noopener noreferrer" class="link-style">{{ t('campaigns.templatingRef') }}</a>
            <template v-if="canEdit && values.contentType !== 'plain'">
              <button v-if="values.altbody === null" type="button" class="text-primary hover:underline" @click="setFieldValue('altbody', htmlToPlain(values.body ?? ''))">{{ t('campaigns.addAltText') }}</button>
              <button v-else type="button" class="text-primary hover:underline" @click="altRemoveOpen = true">{{ t('campaigns.removeAltText') }}</button>
            </template>
          </div>
        </div>
        <Textarea v-if="values.altbody !== null && values.contentType !== 'plain'" :model-value="values.altbody" :disabled="!canEdit" rows="8" :aria-label="t('campaigns.addAltText')" @update:model-value="setFieldValue('altbody', String($event))" />
      </TabsContent>

      <!-- Attributes -->
      <TabsContent v-if="!isNew" value="attribs" class="pt-4">
        <FormField v-slot="{ componentField }" name="attribs">
          <FormItem>
            <FormLabel>{{ t('globals.terms.attribs') }}</FormLabel>
            <FormControl><Textarea v-bind="componentField" class="font-mono text-xs" rows="15" :disabled="!canEdit" /></FormControl>
            <FormDescription>{{ t('campaigns.attribsHelp') }}</FormDescription>
            <FormMessage />
          </FormItem>
        </FormField>
      </TabsContent>

      <!-- Archive -->
      <TabsContent v-if="!isNew" value="archive" class="space-y-6 pt-4">
        <div class="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div class="space-y-0.5">
            <label for="archive" class="text-sm font-medium">{{ t('campaigns.archiveEnable') }}</label>
            <p class="text-xs text-muted-foreground">{{ t('campaigns.archiveHelp') }}</p>
            <a v-if="values.archive && config?.root_url" :href="`${config.root_url}/archive/${campaign!.uuid}`" target="_blank" rel="noopener noreferrer" class="text-xs text-primary hover:underline">
              {{ config.root_url }}/archive/{{ campaign!.uuid }}
            </a>
          </div>
          <Switch id="archive" :model-value="values.archive" :disabled="!canArchive" data-cy="btn-archive" @update:model-value="setFieldValue('archive', $event)" />
        </div>

        <div class="grid items-start gap-6 md:grid-cols-2">
          <FormField v-slot="{ componentField }" name="archiveTemplateId">
            <FormItem>
              <FormLabel>{{ t('globals.terms.template', 1) }}</FormLabel>
              <Select :model-value="componentField.modelValue == null ? undefined : String(componentField.modelValue)" :disabled="!canArchive || !values.archive || values.contentType === 'visual'" @update:model-value="setFieldValue('archiveTemplateId', Number($event))">
                <FormControl><SelectTrigger class="w-full"><SelectValue :placeholder="t('globals.terms.none')" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem v-for="tpl in archiveTemplates" :key="tpl.id" :value="String(tpl.id)">{{ tpl.name }}</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="archiveSlug">
            <FormItem>
              <FormLabel>{{ t('campaigns.archiveSlug') }}</FormLabel>
              <FormControl><Input v-bind="componentField" maxlength="200" :disabled="!canArchive || !values.archive" data-cy="archive-slug" /></FormControl>
              <FormDescription>{{ t('campaigns.archiveSlugHelp') }}</FormDescription>
            </FormItem>
          </FormField>
        </div>

        <FormField v-slot="{ componentField }" name="archiveMeta">
          <FormItem>
            <div class="flex items-center justify-between">
              <FormLabel>{{ t('campaigns.archiveMeta') }}</FormLabel>
              <div v-if="values.archive" class="flex gap-2">
                <Button v-if="!values.archiveMeta || values.archiveMeta === '{}'" type="button" variant="outline" size="sm" @click="fillArchiveMeta">{ }</Button>
                <Button type="button" variant="outline" size="sm" data-cy="btn-archive-preview" @click="showArchivePreview"><Eye />{{ t('campaigns.preview') }}</Button>
              </div>
            </div>
            <FormControl><Textarea v-bind="componentField" class="font-mono text-xs" rows="14" :disabled="!canArchive || !values.archive" data-cy="archive-meta" /></FormControl>
            <FormDescription>{{ t('campaigns.archiveMetaHelp') }}</FormDescription>
            <FormMessage />
          </FormItem>
        </FormField>

        <Button v-if="!canEdit && canArchive" type="button" :disabled="archiveUpdate.isPending.value" data-cy="btn-archive-save" @click="saveArchiveOnly">
          <Loader2 v-if="archiveUpdate.isPending.value" class="animate-spin" />{{ t('globals.buttons.saveChanges') }}
        </Button>
      </TabsContent>
    </Tabs>

    <div v-if="isNew" class="flex gap-2">
      <Button v-if="canManage" type="submit" :disabled="saving" data-cy="btn-continue">
        <Loader2 v-if="create.isPending.value" class="animate-spin" />{{ t('campaigns.continue') }}
      </Button>
      <Button type="button" variant="outline" @click="router.push({ name: 'campaigns' })">{{ t('globals.buttons.cancel') }}</Button>
    </div>

    <p v-if="Object.keys(errors).length && !isNew" class="sr-only" aria-live="polite">{{ Object.values(errors)[0] }}</p>
  </form>

  <MediaPickerDialog v-model:open="mediaOpen" @select="addMedia" />
  <PreviewDialog v-model:open="archivePreviewOpen" :title="t('campaigns.archive')" :html="archivePreview.data.value" :pending="archivePreview.isPending.value" />

  <ConfirmDialog
    v-model:open="startOpen"
    :title="startsNow ? t('campaigns.start') : t('campaigns.schedule')"
    :description="startsNow ? values.name : t('campaigns.confirmSchedule')"
    :confirm-label="startsNow ? t('campaigns.start') : t('campaigns.schedule')"
    :pending="saving"
    @confirm="start"
  />
  <ConfirmDialog v-model:open="unscheduleOpen" :title="t('campaigns.unSchedule')" :description="values.name" :pending="setStatus.isPending.value" @confirm="unschedule" />
  <ConfirmDialog v-model:open="altRemoveOpen" destructive :title="t('campaigns.removeAltText')" :confirm-label="t('globals.buttons.remove')" @confirm="(setFieldValue('altbody', null), (altRemoveOpen = false))" />
  <ConfirmDialog
    :open="leaveOpen"
    :title="t('globals.messages.confirmDiscard')"
    :confirm-label="t('web.common.discard')"
    destructive
    @update:open="(o: boolean) => !o && decideLeave(false)"
    @confirm="decideLeave(true)"
  />
</template>
