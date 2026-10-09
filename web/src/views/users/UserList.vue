<script setup lang="ts">
import { Plus } from '@lucide/vue'
import type { SortingState } from '@tanstack/vue-table'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import type { User } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DataTable from '@/components/datatable/DataTable.vue'
import Page from '@/components/layout/Page.vue'
import { Button } from '@/components/ui/button'
import { useDeleteUser, useUsers } from '@/composables/queries/useUsers'
import { usePermission } from '@/composables/usePermission'
import { createColumns } from '@/features/users/columns'
import { sortRows } from '@/lib/sort'

const { t } = useI18n()
const router = useRouter()
const { can } = usePermission()

const { data, isPending } = useUsers()
const sorting = ref<SortingState>([])
const rows = computed(() =>
  sortRows(data.value ?? [], sorting.value, {
    username: (r) => r.username ?? '',
    role: (r) => r.user_role?.name ?? '',
    email: (r) => r.email ?? '',
    created_at: (r) => r.created_at ?? '',
    updated_at: (r) => r.updated_at ?? '',
    last_login: (r) => r.loggedin_at ?? '',
  }),
)

const remove = useDeleteUser()
const toDelete = ref<User | null>(null)
const deleteOpen = computed({ get: () => !!toDelete.value, set: (o) => !o && (toDelete.value = null) })
function confirmDelete() {
  const u = toDelete.value!
  remove.mutate(u.id!, {
    onSuccess: () => {
      toast.success(t('globals.messages.deleted', { name: u.name }))
      toDelete.value = null
    },
  })
}

const columns = createColumns({
  t,
  onEdit: (u) => router.push({ name: 'user', params: { id: u.id } }),
  onDelete: (u) => (toDelete.value = u),
})
</script>

<template>
  <Page :title="t('globals.terms.users')" :count="data?.length">
    <template #actions>
      <Button v-if="can('users:manage')" size="sm" data-cy="btn-new" @click="router.push({ name: 'user-new' })">
        <Plus />{{ t('users.newUser') }}
      </Button>
    </template>

    <DataTable
      v-model:sorting="sorting"
      :columns="columns"
      :data="rows"
      :loading="isPending"
      :paginated="false"
      :row-id="(r: User) => String(r.id)"
    />
  </Page>

  <ConfirmDialog
    v-model:open="deleteOpen"
    destructive
    :title="t('globals.messages.confirm')"
    :description="toDelete?.username"
    :confirm-label="t('globals.buttons.delete')"
    :pending="remove.isPending.value"
    @confirm="confirmDelete"
  />
</template>
