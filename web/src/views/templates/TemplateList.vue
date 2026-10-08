<script setup lang="ts">
import { Plus } from '@lucide/vue'
import type { SortingState } from '@tanstack/vue-table'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { getTemplate } from '@/api/templates'
import type { Template } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DataTable from '@/components/datatable/DataTable.vue'
import PreviewDialog from '@/components/PreviewDialog.vue'
import PromptDialog from '@/components/PromptDialog.vue'
import { Button } from '@/components/ui/button'
import {
  useCreateTemplate,
  useDeleteTemplate,
  useMakeTemplateDefault,
  usePreviewTemplate,
  useTemplates,
} from '@/composables/queries/useTemplates'
import { usePermission } from '@/composables/usePermission'
import { createColumns } from '@/features/templates/columns'
import { sortRows } from '@/lib/sort'

const { t } = useI18n()
const router = useRouter()
const { can } = usePermission()

const { data, isPending } = useTemplates()
const sorting = ref<SortingState>([])
const rows = computed(() =>
  sortRows(data.value ?? [], sorting.value, {
    name: (r) => r.name ?? '',
    type: (r) => r.type ?? '',
    id: (r) => r.id ?? 0,
    created_at: (r) => r.created_at ?? '',
    updated_at: (r) => r.updated_at ?? '',
  }),
)

// Preview of a saved template.
const preview = usePreviewTemplate()
const previewing = ref<Template | null>(null)
const previewOpen = computed({ get: () => !!previewing.value, set: (o) => !o && (previewing.value = null) })
function showPreview(tpl: Template) {
  previewing.value = tpl
  preview.mutate({ id: tpl.id! })
}

// Clone: the list has no bodies, so fetch the full template first.
const cloning = ref<Template | null>(null)
const cloneOpen = computed({ get: () => !!cloning.value, set: (o) => !o && (cloning.value = null) })
const create = useCreateTemplate()
async function clone(name: string) {
  const full = await getTemplate(cloning.value!.id!)
  create.mutate(
    { name, type: full.type!, subject: full.subject, body: full.body ?? '', body_source: full.body_source },
    {
      onSuccess: (r) => {
        toast.success(t('globals.messages.created', { name: r.name }))
        cloning.value = null
      },
    },
  )
}

const makeDefault = useMakeTemplateDefault()
const toDefault = ref<Template | null>(null)
const defaultOpen = computed({ get: () => !!toDefault.value, set: (o) => !o && (toDefault.value = null) })
function confirmDefault() {
  const tpl = toDefault.value!
  makeDefault.mutate(tpl.id!, {
    onSuccess: () => {
      toast.success(t('globals.messages.updated', { name: tpl.name }))
      toDefault.value = null
    },
  })
}

const remove = useDeleteTemplate()
const toDelete = ref<Template | null>(null)
const deleteOpen = computed({ get: () => !!toDelete.value, set: (o) => !o && (toDelete.value = null) })
function confirmDelete() {
  const tpl = toDelete.value!
  remove.mutate(tpl.id!, {
    onSuccess: () => {
      toast.success(t('globals.messages.deleted', { name: tpl.name }))
      toDelete.value = null
    },
  })
}

const columns = createColumns({
  t,
  onPreview: showPreview,
  onEdit: (tpl) => router.push({ name: 'template', params: { id: tpl.id } }),
  onClone: (tpl) => (cloning.value = tpl),
  onMakeDefault: (tpl) => (toDefault.value = tpl),
  onDelete: (tpl) => (toDelete.value = tpl),
})
</script>

<template>
  <Teleport defer to="#page-actions">
    <Button v-if="can('templates:manage')" size="sm" @click="router.push({ name: 'template-new' })">
      <Plus />{{ t('globals.buttons.new') }}
    </Button>
  </Teleport>

  <div class="space-y-4 p-6">
    <h1 class="text-xl font-semibold">
      {{ t('globals.terms.templates') }}
      <span v-if="data?.length" class="text-muted-foreground tabular-nums">({{ data.length }})</span>
    </h1>

    <DataTable
      v-model:sorting="sorting"
      :columns="columns"
      :data="rows"
      :loading="isPending"
      :paginated="false"
      :row-id="(r: Template) => String(r.id)"
    />
  </div>

  <PreviewDialog v-model:open="previewOpen" :title="previewing?.name ?? ''" :html="preview.data.value" :pending="preview.isPending.value" />

  <PromptDialog
    v-model:open="cloneOpen"
    :title="t('globals.buttons.clone')"
    :label="t('globals.fields.name')"
    :initial="cloning ? `Copy of ${cloning.name}` : ''"
    :confirm-label="t('globals.buttons.clone')"
    :pending="create.isPending.value"
    @submit="clone"
  />

  <ConfirmDialog
    v-model:open="defaultOpen"
    :title="t('templates.makeDefault')"
    :description="toDefault?.name"
    :pending="makeDefault.isPending.value"
    @confirm="confirmDefault"
  />

  <ConfirmDialog
    v-model:open="deleteOpen"
    destructive
    :title="t('globals.messages.confirm')"
    :description="toDelete?.name"
    :confirm-label="t('globals.buttons.delete')"
    :pending="remove.isPending.value"
    @confirm="confirmDelete"
  />
</template>
