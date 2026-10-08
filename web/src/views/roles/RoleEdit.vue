<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import CopyText from '@/components/CopyText.vue'
import FormPage from '@/components/layout/FormPage.vue'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useListRoles, useUserRoles } from '@/composables/queries/useRoles'
import ListRoleForm from '@/features/roles/ListRoleForm.vue'
import RoleHelp from '@/features/roles/RoleHelp.vue'
import { SUPER_ADMIN_ROLE_ID } from '@/features/roles/schema'
import UserRoleForm from '@/features/roles/UserRoleForm.vue'
import { usePageTitle } from '@/lib/page-title'

const props = defineProps<{ kind: 'user' | 'list' }>()
const { t } = useI18n()
const route = useRoute()
const id = computed(() => Number(route.params.id))

// There is no per-role endpoint: roles are small, so find the one in the (cached) list.
const userRoles = useUserRoles()
const listRoles = useListRoles()
const userRole = computed(() => userRoles.data.value?.find((r) => r.id === id.value))
const listRole = computed(() => listRoles.data.value?.find((r) => r.id === id.value))
const loaded = computed(() => (props.kind === 'user' ? userRoles : listRoles).data.value !== undefined)
const role = computed(() => (props.kind === 'user' ? userRole.value : listRole.value))

usePageTitle(() => role.value?.name ?? undefined)
</script>

<template>
  <FormPage :title="role?.name ?? '…'">
    <template v-if="role" #badges>
      <Badge v-if="role.id === SUPER_ADMIN_ROLE_ID" variant="default">{{ t('users.type.super') }}</Badge>
    </template>
    <template v-if="role" #meta>
      <span>{{ t('globals.fields.id') }}: <CopyText :text="String(role.id)" /></span>
    </template>

    <div v-if="!loaded" class="space-y-4">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-48 w-full" />
    </div>
    <p v-else-if="!role" class="text-sm text-muted-foreground">{{ t('web.errors.notFoundTitle') }}</p>
    <template v-else>
      <UserRoleForm v-if="kind === 'user'" :key="role.id" :role="userRole" />
      <ListRoleForm v-else :key="role.id" :role="listRole" />
    </template>
    <template #help><RoleHelp :kind="kind" /></template>
  </FormPage>
</template>
