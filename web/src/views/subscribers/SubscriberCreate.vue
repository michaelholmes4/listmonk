<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Page from '@/components/layout/Page.vue'
import SubscriberHelp from '@/features/subscribers/SubscriberHelp.vue'
import Form from '@/features/subscribers/Form.vue'

const { t } = useI18n()
</script>

<template>
  <Page width="form" :title="t('subscribers.newSubscriber')">
    <Form />
    <template #help><SubscriberHelp /></template>
  </Page>
</template>
