<script setup lang="ts">
import { format } from 'date-fns'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useSubscriberAutomations, useSubscriberEvents } from '@/composables/queries/useAutomations'
import { enrollmentVariant } from '@/features/automations/status'

/** The automations a subscriber is or was in, and the events recorded about them. */
const props = defineProps<{ subscriberId: number }>()
const { t } = useI18n()
const { data: enrollments, isPending } = useSubscriberAutomations(() => props.subscriberId)
const { data: events, isPending: eventsPending } = useSubscriberEvents(() => props.subscriberId)
const stamp = (iso?: string | null) => (iso ? format(new Date(iso), 'PP p') : '')
</script>

<template>
  <div class="space-y-6" data-cy="subscriber-automations">
    <section class="space-y-2">
      <h3 class="text-sm font-medium">{{ t('web.automations.title') }}</h3>
      <Skeleton v-if="isPending" class="h-10 w-full" />
      <p v-else-if="!enrollments?.length" class="text-sm text-muted-foreground">{{ t('web.subscribers.noAutomations') }}</p>
      <ul v-else class="divide-y rounded-lg border">
        <li v-for="e in enrollments" :key="e.id" class="flex items-center justify-between gap-3 p-3 text-sm">
          <div>
            <RouterLink :to="{ name: 'automation', params: { id: e.automation_id }, query: { tab: 'activity' } }" class="font-medium hover:underline">
              {{ e.automation_name }}
            </RouterLink>
            <p class="text-xs text-muted-foreground">{{ stamp(e.entered_at) }}</p>
          </div>
          <Badge :variant="enrollmentVariant(e.status)">{{ t(`web.automations.enrollment.${e.status}`) }}</Badge>
        </li>
      </ul>
    </section>

    <section class="space-y-2">
      <h3 class="text-sm font-medium">{{ t('web.subscribers.events') }}</h3>
      <Skeleton v-if="eventsPending" class="h-10 w-full" />
      <p v-else-if="!events?.results.length" class="text-sm text-muted-foreground">{{ t('web.subscribers.noEvents') }}</p>
      <ul v-else class="divide-y rounded-lg border">
        <li v-for="ev in events.results" :key="ev.id" class="space-y-1 p-3 text-sm">
          <div class="flex items-center justify-between gap-3">
            <span class="font-mono">{{ ev.name }}</span>
            <span class="text-xs text-muted-foreground">{{ stamp(ev.occurred_at) }}</span>
          </div>
          <pre v-if="ev.properties && Object.keys(ev.properties).length" class="overflow-x-auto rounded bg-muted p-2 text-xs">{{ JSON.stringify(ev.properties, null, 2) }}</pre>
        </li>
      </ul>
    </section>
  </div>
</template>
