<script setup lang="ts">
import { format } from 'date-fns'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAutomationVersions } from '@/composables/queries/useAutomations'
import { countSteps, graphToFlow } from './model'

const props = defineProps<{ automationId: number; currentVersionId?: number | null }>()
const { t } = useI18n()
const { data, isPending } = useAutomationVersions(() => props.automationId)
const stamp = (iso?: string | null) => (iso ? format(new Date(iso), 'PP p') : '')
</script>

<template>
  <div class="max-w-2xl space-y-2" data-cy="versions">
    <p class="mb-4 text-sm text-muted-foreground">{{ t('web.automations.versions.help') }}</p>
    <Skeleton v-if="isPending" class="h-14 w-full" />
    <template v-else>
      <div v-for="v in data?.filter((x) => x.published_at)" :key="v.id" class="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div>
          <p class="text-sm font-medium">{{ t('web.automations.versions.version', { n: v.version }) }}</p>
          <p class="text-xs text-muted-foreground">
            {{ stamp(v.published_at) }} · {{ t('web.automations.versions.steps', { n: countSteps(graphToFlow(v.graph)) }) }}
          </p>
        </div>
        <Badge v-if="v.id === currentVersionId" variant="success">{{ t('web.automations.versions.current') }}</Badge>
      </div>
      <p v-if="!data?.some((x) => x.published_at)" class="text-sm text-muted-foreground">{{ t('web.automations.versions.none') }}</p>
    </template>
  </div>
</template>
