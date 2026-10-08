<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FormPage from '@/components/layout/FormPage.vue'
import Form from '@/features/templates/Form.vue'
import TemplateHelp from '@/features/templates/TemplateHelp.vue'

const { t } = useI18n()
</script>

<template>
  <FormPage :title="t('templates.newTemplate')">
    <Form />
    <template #help><TemplateHelp /></template>
  </FormPage>
</template>
