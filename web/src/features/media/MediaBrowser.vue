<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import { FileUp, Loader2, Search } from '@lucide/vue'
import type { PaginationState } from '@tanstack/vue-table'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { MediaQuery } from '@/api/media'
import type { MediaFile } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DataTablePagination from '@/components/datatable/DataTablePagination.vue'
import FileChips from '@/components/FileChips.vue'
import FileDropzone from '@/components/FileDropzone.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDeleteMedia, useMedia, useUploadMedia } from '@/composables/queries/useMedia'
import { usePermission } from '@/composables/usePermission'
import MediaGallery from './MediaGallery.vue'

/**
 * Search, upload, gallery and paging for media. Used as the Media page (search and page kept in
 * the URL by the page) and inside the picker dialog (kept locally), so both are `v-model`s.
 * With `selectable`, clicking a file emits `select` instead of opening it.
 */
defineProps<{ selectable?: boolean }>()
const emit = defineEmits<{ select: [file: MediaFile]; total: [n: number] }>()
const search = defineModel<string>('search', { default: '' })
const page = defineModel<number>('page', { default: 1 })

const { t } = useI18n()
const { can } = usePermission()

const searchInput = ref(search.value)
watch(search, (v) => (searchInput.value = v))

const query = computed<MediaQuery>(() => ({ query: search.value, page: page.value }))
const { data, isPending } = useMedia(query)
const total = computed(() => data.value?.total ?? 0)
const items = computed(() => data.value?.results ?? [])
watch(total, (n) => emit('total', n), { immediate: true })

// The server decides the page size; the pager follows what it reports.
const pageSize = computed(() => data.value?.per_page || 20)
const pager = computed<PaginationState>({
  get: () => ({ pageIndex: page.value - 1, pageSize: pageSize.value }),
  set: (v) => (page.value = v.pageIndex + 1),
})

function submitSearch() {
  search.value = searchInput.value.trim()
  page.value = 1
}

// --- Upload. The panel's open state is a per-user convenience, so localStorage is right. ---------
const showUpload = useLocalStorage('librelist.media.upload', false)
const files = ref<File[]>([])
const upload = useUploadMedia()
function submitUpload() {
  upload.mutate(files.value, {
    onSuccess: (num) => {
      toast.success(t('globals.messages.created', { name: `${num} ${t('media.title').toLowerCase()}` }))
      files.value = []
    },
    // On a partial failure the global handler toasts it and the selection is kept for a retry.
  })
}

// --- Delete. ------------------------------------------------------------------------------------
const remove = useDeleteMedia()
const toDelete = ref<MediaFile | null>(null)
const deleteOpen = computed({ get: () => !!toDelete.value, set: (o) => !o && (toDelete.value = null) })
function confirmDelete() {
  const m = toDelete.value!
  remove.mutate(m.id!, {
    onSuccess: () => {
      toast.success(t('globals.messages.deleted', { name: m.filename }))
      toDelete.value = null
    },
  })
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-2">
      <form class="relative min-w-64 max-w-sm flex-1" @submit.prevent="submitSearch">
        <Search class="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
        <Input v-model="searchInput" class="pl-8" :placeholder="t('media.title')" :aria-label="t('media.title')" />
      </form>
      <Button v-if="can('media:manage')" type="button" variant="outline" size="sm" @click="showUpload = !showUpload">
        <FileUp />{{ t('media.upload') }}
      </Button>
    </div>

    <form v-if="can('media:manage') && showUpload" class="max-w-2xl space-y-3" data-cy="upload" @submit.prevent="submitUpload">
      <FileDropzone multiple :label="t('media.uploadHelp')" @select="files = [...files, ...$event]" />
      <FileChips :files="files" @remove="files.splice($event, 1)" />
      <Button type="submit" :disabled="!files.length || upload.isPending.value">
        <Loader2 v-if="upload.isPending.value" class="animate-spin" />
        {{ t('media.upload') }}
      </Button>
    </form>

    <MediaGallery
      :items="items"
      :loading="isPending"
      :selectable="selectable"
      :can-delete="can('media:manage')"
      @select="emit('select', $event)"
      @delete="toDelete = $event"
    />
    <p v-if="!isPending && !items.length" class="text-sm text-muted-foreground">{{ t('globals.messages.emptyState') }}</p>

    <DataTablePagination v-if="total > pageSize" v-model="pager" :total="total" :page-sizes="[pageSize]" />

    <ConfirmDialog
      v-model:open="deleteOpen"
      destructive
      :title="t('globals.messages.confirm')"
      :description="toDelete?.filename"
      :confirm-label="t('globals.buttons.delete')"
      :pending="remove.isPending.value"
      @confirm="confirmDelete"
    />
  </div>
</template>
