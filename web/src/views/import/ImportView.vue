<script setup lang="ts">
import { Loader2 } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AdminSplitLayout from '@/components/layout/AdminSplitLayout.vue'
import LogView from '@/components/LogView.vue'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  isDone,
  isRunning,
  useImportLogs,
  useImportStatus,
  useStopImport,
} from '@/composables/queries/useImport'
import ImportForm from '@/features/import/ImportForm.vue'
import ImportHelp from '@/features/import/ImportHelp.vue'

const { t, n } = useI18n()
const route = useRoute()

const { data: status, isPending } = useImportStatus()
const running = computed(() => isRunning(status.value?.status))
const done = computed(() => isDone(status.value?.status))
const showStatus = computed(() => running.value || done.value)

// Logs exist once an import has started; keep polling them while it runs.
const { data: logs } = useImportLogs(() => showStatus.value, () => running.value)
const stop = useStopImport()

const progress = computed(() => {
  const s = status.value
  return s && s.total ? Math.min(100, Math.ceil((s.imported! / s.total) * 100)) : 0
})

// "Import" on a list row passes ?list_id=; accept one or several.
const initialLists = computed(() =>
  [route.query.list_id ?? []].flat().map(Number).filter((v) => Number.isInteger(v) && v > 0),
)
const tone = computed(() =>
  status.value?.status === 'finished' ? 'text-success' : status.value?.status === 'failed' ? 'text-destructive' : '',
)
</script>

<template>
  <AdminSplitLayout>
    <h1 class="mb-6 text-xl font-semibold">{{ t('import.title') }}</h1>

    <div v-if="isPending" class="space-y-4">
      <Skeleton class="h-20 w-full" />
      <Skeleton class="h-10 w-full" />
      <Skeleton class="h-32 w-full" />
    </div>

    <ImportForm v-else-if="!showStatus" :initial-lists="initialLists" />

    <section v-else class="space-y-4" data-cy="import-status">
      <Progress :model-value="progress" />
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="font-medium capitalize" :class="tone">{{ status?.status }}</p>
        <p class="text-sm text-muted-foreground tabular-nums">
          {{ t('import.recordsCount', { num: n(status?.imported ?? 0), total: n(status?.total ?? 0) }) }}
        </p>
      </div>
      <Button :disabled="stop.isPending.value || status?.status === 'stopping'" @click="stop.mutate()">
        <Loader2 v-if="stop.isPending.value || status?.status === 'stopping'" class="animate-spin" />
        {{ done ? t('import.importDone') : t('import.stopImport') }}
      </Button>
      <LogView :lines="logs ?? []" />
    </section>

    <template #help><ImportHelp /></template>
  </AdminSplitLayout>
</template>
