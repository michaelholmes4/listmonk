<script setup lang="ts">
import { format } from 'date-fns'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useSubscriberActivity } from '@/composables/queries/useSubscribers'

const props = defineProps<{ subscriberId: number }>()
const { t, n } = useI18n()
const { data, isPending } = useSubscriberActivity(() => props.subscriberId)

const views = computed(() => data.value?.campaign_views ?? [])
const clicks = computed(() => data.value?.link_clicks ?? [])
const totalViews = computed(() => views.value.reduce((a, v) => a + (v.view_count ?? 0), 0))
const totalClicks = computed(() => clicks.value.reduce((a, c) => a + (c.click_count ?? 0), 0))
const when = (iso?: string) => (iso ? format(new Date(iso), 'PP p') : '')
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-3 gap-3 text-center">
      <div
        v-for="s in [
          { k: 'c', label: t('globals.terms.campaigns'), v: views.length },
          { k: 'v', label: t('campaigns.views'), v: totalViews },
          { k: 'k', label: t('campaigns.clicks'), v: totalClicks },
        ]" :key="s.k" class="rounded-lg border p-3"
      >
        <div class="text-xs text-muted-foreground">{{ s.label }}</div>
        <Skeleton v-if="isPending" class="mx-auto mt-1 h-7 w-10" />
        <div v-else class="text-2xl font-semibold tabular-nums">{{ n(s.v) }}</div>
      </div>
    </div>

    <section class="space-y-2">
      <h4 class="text-sm font-medium">{{ t('campaigns.views') }}</h4>
      <Skeleton v-if="isPending" class="h-20 w-full" />
      <p v-else-if="!views.length" class="text-sm text-muted-foreground">{{ t('globals.messages.emptyState') }}</p>
      <div v-else class="box overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ t('globals.terms.campaign', 1) }}</TableHead>
              <TableHead class="text-right">{{ t('campaigns.views') }}</TableHead>
              <TableHead>{{ t('globals.fields.createdAt') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="v in views" :key="v.uuid ?? v.name ?? ''">
              <TableCell>
                <template v-if="v.uuid">
                  <div class="font-medium">{{ v.name }}</div>
                  <div class="text-xs text-muted-foreground">{{ v.subject }}</div>
                </template>
                <em v-else class="text-muted-foreground">{{ t('web.subscribers.campaignDeleted') }}</em>
              </TableCell>
              <TableCell class="text-right tabular-nums">{{ v.view_count }}</TableCell>
              <TableCell class="whitespace-nowrap">{{ when(v.last_viewed_at) }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </section>

    <section class="space-y-2">
      <h4 class="text-sm font-medium">{{ t('campaigns.clicks') }}</h4>
      <Skeleton v-if="isPending" class="h-20 w-full" />
      <p v-else-if="!clicks.length" class="text-sm text-muted-foreground">{{ t('globals.messages.emptyState') }}</p>
      <div v-else class="box overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ t('globals.terms.url') }}</TableHead>
              <TableHead class="text-right">{{ t('campaigns.clicks') }}</TableHead>
              <TableHead>{{ t('globals.fields.createdAt') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="c in clicks" :key="`${c.link_id}-${c.campaign_id}`">
              <TableCell class="max-w-64">
                <a :href="c.url" target="_blank" rel="noopener noreferrer" class="block truncate text-primary hover:underline">
                  {{ c.url }}
                </a>
                <div class="truncate text-xs text-muted-foreground">{{ c.campaign_name }}</div>
              </TableCell>
              <TableCell class="text-right tabular-nums">{{ c.click_count }}</TableCell>
              <TableCell class="whitespace-nowrap">{{ when(c.last_clicked_at) }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </section>
  </div>
</template>
