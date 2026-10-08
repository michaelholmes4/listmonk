<script setup lang="ts">
import { Plus } from '@lucide/vue'
import type { SortingState } from '@tanstack/vue-table'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DataTable from '@/components/datatable/DataTable.vue'
import PromptDialog from '@/components/PromptDialog.vue'
import { Button } from '@/components/ui/button'
import {
  useCreateListRole,
  useCreateUserRole,
  useDeleteRole,
  useListRoles,
  useUserRoles,
} from '@/composables/queries/useRoles'
import { usePermission } from '@/composables/usePermission'
import { createColumns, type RoleRow } from '@/features/roles/columns'
import { sortRows } from '@/lib/sort'

/** User roles and list roles are the same screen over two endpoints. */
const props = defineProps<{ kind: 'user' | 'list' }>()

const { t } = useI18n()
const router = useRouter()
const { can } = usePermission()

const userRoles = useUserRoles()
const listRoles = useListRoles()
const query = computed(() => (props.kind === 'user' ? userRoles : listRoles))
const data = computed<RoleRow[]>(() => (query.value.data.value ?? []) as RoleRow[])
const isPending = computed(() => query.value.isPending.value)

const sorting = ref<SortingState>([])
const rows = computed(() =>
  sortRows(data.value, sorting.value, {
    name: (r) => r.name ?? '',
    created_at: (r) => r.created_at ?? '',
    updated_at: (r) => r.updated_at ?? '',
  }),
)

const editRoute = computed(() => (props.kind === 'user' ? 'user-role' : 'list-role'))
const newRoute = computed(() => (props.kind === 'user' ? 'user-role-new' : 'list-role-new'))

// Clone: same permissions under a new name.
const cloning = ref<RoleRow | null>(null)
const cloneOpen = computed({ get: () => !!cloning.value, set: (o) => !o && (cloning.value = null) })
const createUser = useCreateUserRole()
const createList = useCreateListRole()
function clone(name: string) {
  const src = cloning.value!
  const done = () => {
    toast.success(t('globals.messages.created', { name }))
    cloning.value = null
  }
  if (props.kind === 'user') {
    createUser.mutate({ name, permissions: (src as { permissions?: string[] }).permissions ?? [] }, { onSuccess: done })
  } else {
    const lists = (src as { lists?: { id?: number; permissions?: string[] }[] }).lists ?? []
    createList.mutate({ name, lists: lists.map((l) => ({ id: l.id!, permissions: l.permissions as ('list:get' | 'list:manage')[] })) }, { onSuccess: done })
  }
}

const remove = useDeleteRole()
const toDelete = ref<RoleRow | null>(null)
const deleteOpen = computed({ get: () => !!toDelete.value, set: (o) => !o && (toDelete.value = null) })
function confirmDelete() {
  const r = toDelete.value!
  remove.mutate(r.id!, {
    onSuccess: () => {
      toast.success(t('globals.messages.deleted', { name: r.name }))
      toDelete.value = null
    },
  })
}

const columns = computed(() =>
  createColumns<RoleRow>({
    t,
    route: editRoute.value,
    onEdit: (r) => router.push({ name: editRoute.value, params: { id: r.id } }),
    onClone: (r) => (cloning.value = r),
    onDelete: (r) => (toDelete.value = r),
  }),
)
</script>

<template>
  <Teleport defer to="#page-actions">
    <Button v-if="can('roles:manage')" size="sm" data-cy="btn-new" @click="router.push({ name: newRoute })">
      <Plus />{{ t('globals.buttons.new') }}
    </Button>
  </Teleport>

  <div class="space-y-4 p-6">
    <h1 class="text-xl font-semibold">
      {{ kind === 'user' ? t('users.userRoles') : t('users.listRoles') }}
      <span v-if="data.length" class="text-muted-foreground tabular-nums">({{ data.length }})</span>
    </h1>

    <DataTable
      v-model:sorting="sorting"
      :columns="columns"
      :data="rows"
      :loading="isPending"
      :paginated="false"
      :row-id="(r: RoleRow) => String(r.id)"
    />
  </div>

  <PromptDialog
    v-model:open="cloneOpen"
    :title="t('globals.buttons.clone')"
    :label="t('globals.fields.name')"
    :initial="cloning ? t('campaigns.copyOf', { name: cloning.name }) : ''"
    :confirm-label="t('globals.buttons.clone')"
    :pending="createUser.isPending.value || createList.isPending.value"
    @submit="clone"
  />

  <ConfirmDialog
    v-model:open="deleteOpen"
    destructive
    :title="t('globals.messages.confirm')"
    :description="toDelete?.name ?? undefined"
    :confirm-label="t('globals.buttons.delete')"
    :pending="remove.isPending.value"
    @confirm="confirmDelete"
  />
</template>
