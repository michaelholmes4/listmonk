<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Page from '@/components/layout/Page.vue'
import ListHelp from '@/features/lists/ListHelp.vue'
import Form from '@/features/lists/Form.vue'

const { t } = useI18n()
</script>

<template>
  <Page width="form" :title="t('lists.newList')">
    <Form />
    <template #help><ListHelp /></template>
  </Page>
</template>
