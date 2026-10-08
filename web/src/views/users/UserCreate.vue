<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FormPage from '@/components/layout/FormPage.vue'
import Form from '@/features/users/Form.vue'
import UserHelp from '@/features/users/UserHelp.vue'

const { t } = useI18n()
</script>

<template>
  <FormPage :title="t('users.newUser')">
    <Form />
    <template #help><UserHelp /></template>
  </FormPage>
</template>
