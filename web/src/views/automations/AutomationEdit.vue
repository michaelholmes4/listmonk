<script setup lang="ts">
import { Archive, Loader2, Pause, Play, Rocket } from '@lucide/vue'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { PublishError } from '@/api/automations'
import type { AutomationProblem } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import LeaveConfirm from '@/components/LeaveConfirm.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useArchiveAutomation,
  useAutomation,
  useAutomationDraft,
  useAutomationVersions,
  useNodeStats,
  usePauseAutomation,
  usePublishAutomation,
  useResumeAutomation,
  useSaveDraft,
} from '@/composables/queries/useAutomations'
import { usePermission } from '@/composables/usePermission'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import EnrollmentsPanel from '@/features/automations/EnrollmentsPanel.vue'
import FlowBuilder from '@/features/automations/FlowBuilder.vue'
import { emptyFlow, flowToGraph, graphToFlow, type Flow } from '@/features/automations/model'
import PublishDialog from '@/features/automations/PublishDialog.vue'
import SettingsPanel from '@/features/automations/SettingsPanel.vue'
import { automationVariant, canArchive, canPause, canResume, isLive } from '@/features/automations/status'
import { flowIssues } from '@/features/automations/validate'
import VersionsPanel from '@/features/automations/VersionsPanel.vue'
import { usePageTitle } from '@/lib/page-title'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { can } = usePermission()

const id = computed(() => Number(route.params.id))
const { data: automation } = useAutomation(id)
const { data: draft } = useAutomationDraft(id)
const { data: versions } = useAutomationVersions(id)
usePageTitle(() => automation.value?.name)

const status = computed(() => automation.value?.status)
const readonly = computed(() => !can('automations:manage') || status.value === 'archived')
const live = computed(() => isLive(status.value))
const { data: stats } = useNodeStats(id, live)

// --- The working copy of the flow. Edited in place; saved explicitly. ----------------------------------
const flow = reactive<Flow>(emptyFlow())
const savedJson = ref('')
const loaded = ref(false)
watch(
  draft,
  (d) => {
    if (!d || loaded.value) return
    const f = graphToFlow(d.graph)
    flow.triggers = f.triggers
    flow.steps = f.steps
    savedJson.value = JSON.stringify(flowToGraph(f))
    loaded.value = true
  },
  { immediate: true },
)
const currentJson = computed(() => JSON.stringify(flowToGraph(flow)))
const dirty = computed(() => loaded.value && currentJson.value !== savedJson.value)

// Whether the live version differs from what is being edited.
const publishedJson = computed(() => {
  const cur = versions.value?.find((v) => v.id === automation.value?.current_version_id)
  return cur ? JSON.stringify(flowToGraph(graphToFlow(cur.graph))) : undefined
})
const unpublished = computed(() => loaded.value && publishedJson.value !== undefined && publishedJson.value !== currentJson.value)
const neverPublished = computed(() => automation.value?.current_version_id == null)

// --- Problems the server found (on save and publish), shown on the steps. -----------------------------
const problemList = ref<AutomationProblem[]>([])
const problems = computed(() => {
  const m = new Map<string, string[]>()
  for (const p of problemList.value) if (p.node_id) m.set(p.node_id, [...(m.get(p.node_id) ?? []), p.message ?? ''])
  return m
})
const general = computed(() => problemList.value.filter((p) => !p.node_id).map((p) => p.message))
watch(currentJson, () => (problemList.value = []))

const localIssues = computed(() => flowIssues(flow, can('subscribers:sql_query')))

// --- Save, publish, lifecycle. ------------------------------------------------------------------------------
const save = useSaveDraft()
const publish = usePublishAutomation()
const pause = usePauseAutomation()
const resume = useResumeAutomation()
const archive = useArchiveAutomation()
const busy = computed(() => save.isPending.value || publish.isPending.value)

async function saveDraft(): Promise<boolean> {
  try {
    const r = await save.mutateAsync({ id: id.value, graph: flowToGraph(flow) })
    savedJson.value = currentJson.value
    problemList.value = r.problems
    if (!r.problems.length) toast.success(t('web.automations.draftSaved'))
    else toast.warning(t('web.automations.draftSavedProblems', { n: r.problems.length }))
    return true
  } catch {
    return false
  }
}

const publishOpen = ref(false)
const hasListTrigger = computed(() => flow.triggers.some((x) => x.type === 'list_joined'))
async function doPublish(enrollExisting: boolean) {
  if (dirty.value && !(await saveDraft())) return
  publish.mutate(
    { id: id.value, enrollExisting },
    {
      onSuccess: () => {
        publishOpen.value = false
        toast.success(t('web.automations.published'))
      },
      onError: (e) => {
        publishOpen.value = false
        if (e instanceof PublishError) {
          problemList.value = e.problems
          toast.error(t('web.automations.cannotPublish', { n: e.problems.length }))
        }
      },
    },
  )
}

type Act = 'pause' | 'resume' | 'archive'
const acting = ref<Act | null>(null)
const actOpen = computed({ get: () => !!acting.value, set: (o) => !o && (acting.value = null) })
function confirmAct() {
  const m = { pause, resume, archive }[acting.value!]
  m.mutate(id.value, {
    onSuccess: () => {
      toast.success(t('globals.messages.updated', { name: automation.value?.name }))
      acting.value = null
    },
  })
}

// --- Tabs in the URL. -------------------------------------------------------------------------------------------
const tabs = ['flow', 'activity', 'settings', 'versions'] as const
type Tab = (typeof tabs)[number]
const tab = computed<Tab>({
  get: () => (tabs.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : 'flow'),
  set: (v) => router.replace({ query: { ...route.query, tab: v === 'flow' ? undefined : v } }),
})

const settingsPanel = ref<InstanceType<typeof SettingsPanel>>()
const guardDirty = computed(() => dirty.value || !!settingsPanel.value?.dirty)
const { leaveOpen, decide } = useUnsavedGuard(guardDirty, busy)

// Ctrl+S saves the draft on the flow tab.
function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && tab.value === 'flow' && !readonly.value) {
    e.preventDefault()
    if (dirty.value) void saveDraft()
  }
}
</script>

<template>
  <div class="space-y-4 p-6" @keydown="onKey">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div class="space-y-1">
        <h1 class="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <Skeleton v-if="!automation" class="h-7 w-48" />
          <template v-else>
            {{ automation.name }}
            <Badge :variant="automationVariant(status)" data-cy="status">{{ t(`web.automations.status.${status}`) }}</Badge>
            <Badge v-if="unpublished" variant="warning">{{ t('web.automations.unpublished') }}</Badge>
          </template>
        </h1>
      </div>

      <div v-if="automation && can('automations:manage')" class="flex flex-wrap items-center gap-2">
        <Button v-if="canPause(status)" variant="outline" size="sm" @click="acting = 'pause'"><Pause />{{ t('web.automations.pause') }}</Button>
        <Button v-if="canResume(status)" variant="outline" size="sm" @click="acting = 'resume'"><Play />{{ t('web.automations.resume') }}</Button>
        <Button v-if="canArchive(status)" variant="outline" size="sm" @click="acting = 'archive'"><Archive />{{ t('web.automations.archive') }}</Button>
        <template v-if="!readonly">
          <Button variant="outline" size="sm" :disabled="!dirty || busy" data-cy="save-draft" @click="saveDraft">
            <Loader2 v-if="save.isPending.value" class="animate-spin" />{{ t('web.automations.saveDraft') }}
          </Button>
          <Button size="sm" :disabled="busy || (!dirty && !unpublished && !neverPublished)" data-cy="publish" @click="publishOpen = true">
            <Rocket />{{ t(neverPublished ? 'web.automations.publish.action' : 'web.automations.publishChanges') }}
          </Button>
        </template>
      </div>
    </header>

    <Alert v-if="general.length" variant="destructive" data-cy="problems">
      <AlertDescription>
        <p v-for="m in general" :key="m">{{ m }}</p>
      </AlertDescription>
    </Alert>

    <div v-if="!automation || !loaded" class="space-y-3"><Skeleton class="mx-auto h-16 w-md max-w-full" /><Skeleton class="mx-auto h-16 w-md max-w-full" /></div>
    <Tabs v-else v-model="tab">
      <TabsList>
        <TabsTrigger value="flow">{{ t('web.automations.tabs.flow') }}</TabsTrigger>
        <TabsTrigger value="activity" :disabled="neverPublished">{{ t('web.automations.tabs.activity') }}</TabsTrigger>
        <TabsTrigger value="settings">{{ t('web.automations.tabs.settings') }}</TabsTrigger>
        <TabsTrigger value="versions" :disabled="neverPublished">{{ t('web.automations.tabs.versions') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="flow" class="pt-4">
        <Alert v-if="live && status !== 'archived'" class="mb-4">
          <AlertDescription>{{ t('web.automations.liveNote') }}</AlertDescription>
        </Alert>
        <p v-if="localIssues.size && tab === 'flow'" class="mb-2 text-center text-sm text-muted-foreground">
          {{ t('web.automations.incomplete', { n: localIssues.size }) }}
        </p>
        <FlowBuilder :flow="flow" :readonly="readonly" :stats="stats" :problems="problems" />
      </TabsContent>
      <TabsContent value="activity" class="pt-4"><EnrollmentsPanel :automation-id="id" /></TabsContent>
      <TabsContent value="settings" class="pt-4">
        <SettingsPanel ref="settingsPanel" :automation="automation" :flow="flow" :readonly="readonly" />
      </TabsContent>
      <TabsContent value="versions" class="pt-4">
        <VersionsPanel :automation-id="id" :current-version-id="automation.current_version_id" />
      </TabsContent>
    </Tabs>
  </div>

  <PublishDialog v-model:open="publishOpen" :pending="busy" :first="neverPublished" :has-list-trigger="hasListTrigger" @confirm="doPublish" />

  <ConfirmDialog
    v-model:open="actOpen"
    :destructive="acting === 'archive'"
    :title="acting ? t(`web.automations.${acting}`) : ''"
    :description="acting === 'archive' ? t('web.automations.archiveWarning') : automation?.name"
    :confirm-label="acting ? t(`web.automations.${acting}`) : ''"
    :pending="pause.isPending.value || resume.isPending.value || archive.isPending.value"
    @confirm="confirmAct"
  />

  <LeaveConfirm :open="leaveOpen" @decide="decide" />
</template>
