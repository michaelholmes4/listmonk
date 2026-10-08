<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FormPage from '@/components/layout/FormPage.vue'
import SubscriberHelp from '@/features/subscribers/SubscriberHelp.vue'
import Form from '@/features/subscribers/Form.vue'

const { t } = useI18n()
</script>

<template>
  <FormPage :title="t('subscribers.newSubscriber')">
    <Form />
    <template #help><SubscriberHelp /></template>
  </FormPage>
</template>
