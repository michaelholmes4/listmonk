<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import CopyText from '@/components/CopyText.vue'
import FormPage from '@/components/layout/FormPage.vue'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useCampaign } from '@/composables/queries/useCampaigns'
import CampaignHelp from '@/features/campaigns/CampaignHelp.vue'
import { statusVariant } from '@/features/campaigns/columns'
import Form from '@/features/campaigns/Form.vue'
import { usePageTitle } from '@/lib/page-title'

const { t } = useI18n()
const route = useRoute()
const id = computed(() => Number(route.params.id))
const { data: campaign } = useCampaign(id)

usePageTitle(() => campaign.value?.name)
</script>

<template>
  <FormPage :title="campaign?.name ?? '…'">
    <template v-if="campaign" #badges>
      <Badge :variant="statusVariant(campaign.status)">{{ t(`campaigns.status.${campaign.status}`) }}</Badge>
      <Badge v-if="campaign.type === 'optin'" variant="outline">{{ t('lists.optin') }}</Badge>
    </template>
    <template v-if="campaign" #meta>
      <span>{{ t('globals.fields.id') }}: <CopyText :text="String(campaign.id)" /></span>
      <span>{{ t('globals.fields.uuid') }}: <CopyText :text="campaign.uuid ?? ''" /></span>
    </template>

    <div v-if="!campaign" class="space-y-4">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-40 w-full" />
    </div>
    <!-- Keyed by id so moving between campaigns never reuses another one's form state. -->
    <Form v-else :key="campaign.id" :campaign="campaign" />
    <template #help><CampaignHelp /></template>
  </FormPage>
</template>
