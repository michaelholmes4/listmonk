<script setup lang="ts">
import { Download } from '@lucide/vue'
import { format, subDays } from 'date-fns'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { deleteOldEvents } from '@/api/automations'
import { analyticsExportURL, type AnalyticsType, type OrphanType } from '@/api/maintenance'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Page from '@/components/layout/Page.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMutation } from '@tanstack/vue-query'
import {
  useDeleteAnalytics,
  useDeleteSubscribers,
  useDeleteUnconfirmedSubscriptions,
} from '@/composables/queries/useMaintenance'
import { usePermission } from '@/composables/usePermission'
import VacuumCard from '@/features/maintenance/VacuumCard.vue'

const { t } = useI18n()
const { can } = usePermission()

const day = (daysAgo: number) => format(subDays(new Date(), daysAgo), 'yyyy-MM-dd')
// A date input gives local midnight; the API wants an RFC 3339 instant.
const instant = (d: string) => new Date(`${d}T00:00:00`).toISOString()

const subscriberType = ref<OrphanType>('orphan')
const subscriptionDate = ref(day(7))
const analyticsType = ref<AnalyticsType>('all')
const analyticsDate = ref(day(7))
const eventsDate = ref(day(90))
const exportType = ref<'views' | 'clicks'>('views')
const exportDate = ref(day(30))
const exportURL = computed(() => analyticsExportURL(exportType.value, instant(exportDate.value)))

// Every destructive action goes through one confirmation.
type Action = 'subscribers' | 'subscriptions' | 'analytics' | 'events'
const pending = ref<Action | null>(null)
const confirmOpen = computed({ get: () => !!pending.value, set: (o) => !o && (pending.value = null) })

const delSubscribers = useDeleteSubscribers()
const delSubscriptions = useDeleteUnconfirmedSubscriptions()
const delAnalytics = useDeleteAnalytics()
const delEvents = useMutation({ mutationFn: (before: string) => deleteOldEvents(before) })
const busy = computed(
  () => delSubscribers.isPending.value || delSubscriptions.isPending.value || delAnalytics.isPending.value || delEvents.isPending.value,
)

const counted = (name: string) => (r: { count: number }) =>
  toast.success(t('globals.messages.deletedCount', { name, num: r.count }))

function run() {
  const done = () => (pending.value = null)
  switch (pending.value) {
    case 'subscribers':
      delSubscribers.mutate(subscriberType.value, { onSuccess: (r) => (counted(t('globals.terms.subscribers'))(r), done()) })
      break
    case 'subscriptions':
      delSubscriptions.mutate(instant(subscriptionDate.value), {
        onSuccess: (r) => (counted(t('globals.terms.subscriptions', 2))(r), done()),
      })
      break
    case 'events':
      delEvents.mutate(instant(eventsDate.value), {
        onSuccess: (r) => (counted(t('web.maintenance.events'))({ count: r.deleted }), done()),
      })
      break
    case 'analytics':
      delAnalytics.mutate(
        { type: analyticsType.value, beforeDate: instant(analyticsDate.value) },
        { onSuccess: () => (toast.success(t('globals.messages.done')), done()) },
      )
      break
  }
}
</script>

<template>
  <Page :title="t('maintenance.title')" :description="t('maintenance.help')" width="form">
    <section class="space-y-4 rounded-lg border p-4" data-cy="gc-subscribers">
      <h2 class="font-medium">{{ t('globals.terms.subscribers') }}</h2>
      <div class="flex flex-wrap items-end gap-4">
        <div class="w-56 space-y-2">
          <Label>{{ t('web.maintenance.data') }}</Label>
          <Select v-model="subscriberType">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="orphan">{{ t('dashboard.orphanSubs') }}</SelectItem>
              <SelectItem value="blocklisted">{{ t('subscribers.status.blocklisted') }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="destructive" :disabled="busy" @click="pending = 'subscribers'">{{ t('globals.buttons.delete') }}</Button>
      </div>
      <p class="text-xs text-muted-foreground">{{ t('maintenance.orphanHelp') }}</p>
    </section>

    <section class="space-y-4 rounded-lg border p-4" data-cy="gc-subscriptions">
      <h2 class="font-medium">{{ t('globals.terms.subscriptions', 2) }}</h2>
      <div class="flex flex-wrap items-end gap-4">
        <div class="w-56 space-y-2">
          <Label>{{ t('web.maintenance.data') }}</Label>
          <Select model-value="optin">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="optin">{{ t('maintenance.maintenance.unconfirmedOptins') }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-2">
          <Label for="gc-subscriptions-date">{{ t('maintenance.olderThan') }}</Label>
          <Input id="gc-subscriptions-date" v-model="subscriptionDate" type="date" class="w-44" />
        </div>
        <Button variant="destructive" :disabled="busy || !subscriptionDate" @click="pending = 'subscriptions'">{{ t('globals.buttons.delete') }}</Button>
      </div>
    </section>

    <section class="space-y-6 rounded-lg border p-4" data-cy="gc-analytics">
      <div class="space-y-4">
        <h2 class="font-medium">{{ t('globals.terms.analytics') }}</h2>
        <div class="flex flex-wrap items-end gap-4">
          <div class="w-56 space-y-2">
            <Label>{{ t('web.maintenance.data') }}</Label>
            <Select v-model="analyticsType">
              <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{{ t('globals.terms.all') }}</SelectItem>
                <SelectItem value="views">{{ t('dashboard.campaignViews') }}</SelectItem>
                <SelectItem value="clicks">{{ t('dashboard.linkClicks') }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label for="gc-analytics-date">{{ t('maintenance.olderThan') }}</Label>
            <Input id="gc-analytics-date" v-model="analyticsDate" type="date" class="w-44" />
          </div>
          <Button variant="destructive" :disabled="busy || !analyticsDate" @click="pending = 'analytics'">{{ t('globals.buttons.delete') }}</Button>
        </div>
      </div>

      <div class="space-y-4 border-t pt-4">
        <h3 class="text-sm font-medium">{{ t('subscribers.export') }}</h3>
        <div class="flex flex-wrap items-end gap-4">
          <div class="w-56 space-y-2">
            <Label>{{ t('web.maintenance.data') }}</Label>
            <Select v-model="exportType">
              <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="views">{{ t('dashboard.campaignViews') }}</SelectItem>
                <SelectItem value="clicks">{{ t('dashboard.linkClicks') }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label for="export-date">{{ t('analytics.fromDate') }}</Label>
            <Input id="export-date" v-model="exportDate" type="date" class="w-44" />
          </div>
          <Button as-child variant="outline" :class="!exportDate && 'pointer-events-none opacity-50'">
            <a :href="exportURL" download data-cy="export-link"><Download />{{ t('subscribers.export') }}</a>
          </Button>
        </div>
      </div>
    </section>

    <section v-if="can('automations:manage')" class="space-y-4 rounded-lg border p-4" data-cy="gc-events">
      <h2 class="font-medium">{{ t('web.maintenance.events') }}</h2>
      <div class="flex flex-wrap items-end gap-4">
        <div class="space-y-2">
          <Label for="gc-events-date">{{ t('maintenance.olderThan') }}</Label>
          <Input id="gc-events-date" v-model="eventsDate" type="date" class="w-44" />
        </div>
        <Button variant="destructive" :disabled="busy || !eventsDate" @click="pending = 'events'">{{ t('globals.buttons.delete') }}</Button>
      </div>
      <p class="text-xs text-muted-foreground">{{ t('web.maintenance.eventsHelp') }}</p>
    </section>

    <VacuumCard v-if="can('settings:manage')" />

    <ConfirmDialog
      v-model:open="confirmOpen"
      destructive
      :title="t('globals.messages.confirm')"
      :confirm-label="t('globals.buttons.delete')"
      :pending="busy"
      @confirm="run"
    />
  </Page>
</template>
