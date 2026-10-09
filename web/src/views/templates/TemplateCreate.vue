<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Page from '@/components/layout/Page.vue'
import Form from '@/features/templates/Form.vue'
import TemplateHelp from '@/features/templates/TemplateHelp.vue'

const { t } = useI18n()
</script>

<template>
  <Page :title="t('templates.newTemplate')">
    <Form />
    <template #help><TemplateHelp /></template>
  </Page>
</template>
