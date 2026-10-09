<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Page from '@/components/layout/Page.vue'
import Form from '@/features/users/Form.vue'
import UserHelp from '@/features/users/UserHelp.vue'

const { t } = useI18n()
</script>

<template>
  <Page width="form" :title="t('users.newUser')">
    <Form />
    <template #help><UserHelp /></template>
  </Page>
</template>
