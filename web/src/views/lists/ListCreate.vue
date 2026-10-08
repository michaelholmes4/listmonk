<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FormPage from '@/components/layout/FormPage.vue'
import ListHelp from '@/features/lists/ListHelp.vue'
import Form from '@/features/lists/Form.vue'

const { t } = useI18n()
</script>

<template>
  <FormPage :title="t('lists.newList')">
    <Form />
    <template #help><ListHelp /></template>
  </FormPage>
</template>
