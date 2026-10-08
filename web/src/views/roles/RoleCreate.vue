<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FormPage from '@/components/layout/FormPage.vue'
import ListRoleForm from '@/features/roles/ListRoleForm.vue'
import RoleHelp from '@/features/roles/RoleHelp.vue'
import UserRoleForm from '@/features/roles/UserRoleForm.vue'

defineProps<{ kind: 'user' | 'list' }>()
const { t } = useI18n()
</script>

<template>
  <FormPage :title="kind === 'user' ? t('users.newUserRole') : t('users.newListRole')">
    <UserRoleForm v-if="kind === 'user'" />
    <ListRoleForm v-else />
    <template #help><RoleHelp :kind="kind" /></template>
  </FormPage>
</template>
