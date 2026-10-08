<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import FormPage from '@/components/layout/FormPage.vue'
import Form from '@/features/campaigns/Form.vue'
import CampaignHelp from '@/features/campaigns/CampaignHelp.vue'

const { t } = useI18n()
const route = useRoute()

// "Send campaign" on a list row opens this with ?list_id= (repeatable) to preselect those lists.
const initialLists = computed(() =>
  [route.query.list_id ?? []].flat().map(Number).filter((v) => Number.isInteger(v) && v > 0),
)
</script>

<template>
  <FormPage :title="t('campaigns.newCampaign')">
    <Form :initial-lists="initialLists" />
    <template #help><CampaignHelp /></template>
  </FormPage>
</template>
