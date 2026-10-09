<script setup lang="ts">
import { Archive, Loader2, MoreHorizontal, Pause, Play, Rocket, TriangleAlert } from '@lucide/vue'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { PublishError } from '@/api/automations'
import type { AutomationProblem } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Page from '@/components/layout/Page.vue'
import RecordTab from '@/components/layout/RecordTab.vue'
import RecordTabs from '@/components/layout/RecordTabs.vue'
import LeaveConfirm from '@/components/LeaveConfirm.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent } from '@/components/ui/tabs'
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
import { useDraftSaver } from '@/features/automations/useDraftSaver'
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

// --- The working copy of the flow. Edited in place; every change to it is saved to the draft. -------------
const flow = reactive<Flow>(emptyFlow())
const loaded = ref(false)
watch(
  draft,
  (d) => {
    if (!d || loaded.value) return
    const f = graphToFlow(d.graph)
    flow.triggers = f.triggers
    flow.steps = f.steps
    loaded.value = true
  },
  { immediate: true },
)
const currentJson = computed(() => JSON.stringify(flowToGraph(flow)))

// Whether the live version differs from what is being edited.
const publishedJson = computed(() => {
  const cur = versions.value?.find((v) => v.id === automation.value?.current_version_id)
  return cur ? JSON.stringify(flowToGraph(graphToFlow(cur.graph))) : undefined
})
const unpublished = computed(
  () => loaded.value && publishedJson.value !== undefined && publishedJson.value !== currentJson.value,
)
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

// Saves are serialised and coalesced; the flow is read when a save starts, so it is always the latest.
const saver = useDraftSaver(async () => {
  const r = await save.mutateAsync({ id: id.value, graph: flowToGraph(flow) })
  problemList.value = r.problems
  return r
})
/** A draft save is under way or failed: what the unload guard protects. */
const dirty = computed(() => saver.pending.value)
const savedAt = computed(() => saver.savedAt.value?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? '')

const publishOpen = ref(false)
const hasListTrigger = computed(() => flow.triggers.some((x) => x.type === 'list_joined'))
async function doPublish(enrollExisting: boolean) {
  if (!(await saver.flush())) return
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
const builder = ref<InstanceType<typeof FlowBuilder>>()
const tab = computed<Tab>({
  get: () => {
    const q = route.query.tab as Tab
    // Activity and Versions aren't there until the first publish.
    return tabs.includes(q) && !(neverPublished.value && (q === 'activity' || q === 'versions')) ? q : 'flow'
  },
  set: (v) => {
    // The open step belongs to the Flow tab; leaving it asks first if the panel has edits.
    const go = () => router.replace({ query: { ...route.query, tab: v === 'flow' ? undefined : v, step: undefined, trigger: undefined } })
    if (v !== 'flow' && builder.value) builder.value.leavePanel(go)
    else void go()
  },
})

const settingsPanel = ref<InstanceType<typeof SettingsPanel>>()
const guardDirty = computed(() => dirty.value || !!settingsPanel.value?.dirty || !!builder.value?.panelDirty)
const { leaveOpen, decide } = useUnsavedGuard(guardDirty, busy)

// Ctrl+S saves the open step's edits on the flow tab. The flow itself is saved as it changes.
function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && tab.value === 'flow' && !readonly.value) {
    e.preventDefault()
    builder.value?.savePanel()
  }
}
</script>

<template>
  <Page :title="automation?.name ?? '…'" @keydown="onKey">
    <template v-if="automation" #badges>
      <Badge :variant="automationVariant(status)" data-cy="status">{{ t(`web.automations.status.${status}`) }}</Badge>
      <Badge v-if="unpublished" variant="warning">{{ t('web.automations.unpublished') }}</Badge>
    </template>

    <template v-if="automation && can('automations:manage')" #actions>
      <!-- Lifecycle actions are occasional: they live in the "⋯" menu, so Publish is the one primary button. -->
      <DropdownMenu v-if="canPause(status) || canResume(status) || canArchive(status)">
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="icon-sm" :aria-label="t('web.common.actions')" data-cy="automation-actions"><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem v-if="canPause(status)" @select="acting = 'pause'"><Pause />{{ t('web.automations.pause') }}</DropdownMenuItem>
          <DropdownMenuItem v-if="canResume(status)" @select="acting = 'resume'"><Play />{{ t('web.automations.resume') }}</DropdownMenuItem>
          <DropdownMenuItem v-if="canArchive(status)" @select="acting = 'archive'"><Archive />{{ t('web.automations.archive') }}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <template v-if="!readonly">
        <span v-if="builder?.panelDirty" class="flex items-center gap-1.5 text-xs text-muted-foreground" data-cy="unsaved">
          <span class="size-1.5 rounded-full bg-warning" aria-hidden="true" />{{ t('web.common.unsaved') }}
        </span>
        <!-- The flow saves itself; this says how that is going. -->
        <div v-if="saver.status.value !== 'idle'" class="flex items-center gap-1.5 text-xs text-muted-foreground" role="status" data-cy="save-status">
          <template v-if="saver.status.value === 'saving'"><Loader2 class="size-3.5 animate-spin" />{{ t('web.automations.saving') }}</template>
          <template v-else-if="saver.status.value === 'error'">
            <span class="text-destructive">{{ t('web.automations.saveFailed') }}</span>
            <Button variant="outline" size="xs" data-cy="save-retry" @click="saver.retry()">{{ t('web.automations.retry') }}</Button>
          </template>
          <template v-else-if="saver.result.value?.problems.length">
            <TriangleAlert class="size-3.5 text-warning" />{{ t('web.automations.draftSavedProblems', { n: saver.result.value.problems.length }) }}
          </template>
          <template v-else>{{ t('web.automations.draftSavedAt', { time: savedAt }) }}</template>
        </div>
        <Button
          size="sm"
          :disabled="busy || (!dirty && !unpublished && !neverPublished)"
          data-cy="publish"
          @click="publishOpen = true"
        >
          <Rocket />{{ t(neverPublished ? 'web.automations.publish.action' : 'web.automations.publishChanges') }}
        </Button>
      </template>
    </template>

    <Alert v-if="general.length && tab !== 'flow'" variant="destructive" data-cy="problems">
      <AlertDescription>
        <p v-for="m in general" :key="m">{{ m }}</p>
      </AlertDescription>
    </Alert>

    <div v-if="!automation || !loaded" class="space-y-3">
      <Skeleton class="mx-auto h-16 w-md max-w-full" /><Skeleton class="mx-auto h-16 w-md max-w-full" />
    </div>
    <Tabs v-else v-model="tab">
      <!-- Activity and Versions only exist once the automation has been published. -->
      <RecordTabs>
        <RecordTab value="flow">{{ t('web.automations.tabs.flow') }}</RecordTab>
        <RecordTab v-if="!neverPublished" value="activity">{{ t('web.automations.tabs.activity') }}</RecordTab>
        <RecordTab value="settings">{{ t('web.automations.tabs.settings') }}</RecordTab>
        <RecordTab v-if="!neverPublished" value="versions">{{ t('web.automations.tabs.versions') }}</RecordTab>
      </RecordTabs>

      <TabsContent value="flow">
        <FlowBuilder
          ref="builder"
          :flow="flow"
          :readonly="readonly"
          :stats="stats"
          :problems="problems"
          :saving="saver.status.value === 'saving'"
          :flush="saver.flush"
          @change="saver.request()"
        >
          <template #notices>
            <!-- Inside the builder, so nothing sits above the docked step panel and pushes it down. -->
            <Alert v-if="general.length" variant="destructive" data-cy="problems">
              <AlertDescription>
                <p v-for="m in general" :key="m">{{ m }}</p>
              </AlertDescription>
            </Alert>
            <Alert v-if="live && status !== 'archived'" class="mb-4">
              <AlertDescription>{{ t('web.automations.liveNote') }}</AlertDescription>
            </Alert>
            <p v-if="localIssues.size && tab === 'flow'" class="mb-2 text-center text-sm text-muted-foreground">
              {{ t('web.automations.incomplete', { n: localIssues.size }) }}
            </p>
          </template>
        </FlowBuilder>
      </TabsContent>
      <TabsContent value="activity"><EnrollmentsPanel :automation-id="id" /></TabsContent>
      <TabsContent value="settings">
        <SettingsPanel ref="settingsPanel" :automation="automation" :flow="flow" :readonly="readonly" />
      </TabsContent>
      <TabsContent value="versions">
        <VersionsPanel :automation-id="id" :current-version-id="automation.current_version_id" />
      </TabsContent>
    </Tabs>
  </Page>

  <PublishDialog
    v-model:open="publishOpen"
    :pending="busy"
    :first="neverPublished"
    :has-list-trigger="hasListTrigger"
    @confirm="doPublish"
  />

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
