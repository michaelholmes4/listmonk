<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import CopyText from '@/components/CopyText.vue'
import FormPage from '@/components/layout/FormPage.vue'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useSubscriber } from '@/composables/queries/useSubscribers'
import SubscriberHelp from '@/features/subscribers/SubscriberHelp.vue'
import Form from '@/features/subscribers/Form.vue'
import { usePageTitle } from '@/lib/page-title'

const { t } = useI18n()
const route = useRoute()
const id = computed(() => Number(route.params.id))
const { data: subscriber } = useSubscriber(id)

usePageTitle(() => subscriber.value?.email)
const statusVariant = (s?: string) => (s === 'blocklisted' ? 'destructive' : s === 'unsubscribed' ? 'warning' : 'success')
</script>

<template>
  <FormPage :title="subscriber?.name || subscriber?.email || '…'">
    <template v-if="subscriber" #badges>
      <Badge :variant="statusVariant(subscriber.status)">{{ t(`subscribers.status.${subscriber.status}`) }}</Badge>
    </template>
    <template v-if="subscriber" #meta>
      <span>{{ subscriber.email }}</span>
      <span>{{ t('globals.fields.id') }}: <CopyText :text="String(subscriber.id)" /></span>
      <span>{{ t('globals.fields.uuid') }}: <CopyText :text="subscriber.uuid ?? ''" /></span>
    </template>

    <div v-if="!subscriber" class="space-y-4">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-40 w-full" />
    </div>
    <!-- Keyed by id so moving between subscribers never reuses another one's form state. -->
    <Form v-else :key="subscriber.id" :subscriber="subscriber" />
    <template #help><SubscriberHelp /></template>
  </FormPage>
</template>
