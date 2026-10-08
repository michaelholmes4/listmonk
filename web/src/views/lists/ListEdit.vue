<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import CopyText from '@/components/CopyText.vue'
import FormPage from '@/components/layout/FormPage.vue'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useList } from '@/composables/queries/useLists'
import ListHelp from '@/features/lists/ListHelp.vue'
import Form from '@/features/lists/Form.vue'
import { usePageTitle } from '@/lib/page-title'

const { t } = useI18n()
const route = useRoute()
const id = computed(() => Number(route.params.id))
const { data: list } = useList(id)

usePageTitle(() => list.value?.name)
</script>

<template>
  <FormPage :title="list?.name ?? '…'">
    <template v-if="list" #badges>
      <Badge variant="secondary">{{ t(`lists.types.${list.type}`) }}</Badge>
    </template>
    <template v-if="list" #meta>
      <span>{{ t('globals.fields.id') }}: <CopyText :text="String(list.id)" /></span>
      <span>{{ t('globals.fields.uuid') }}: <CopyText :text="list.uuid ?? ''" /></span>
    </template>

    <div v-if="!list" class="space-y-4">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-24 w-full" />
    </div>
    <!-- Keyed by id so moving between lists never reuses another list's form state. -->
    <Form v-else :key="list.id" :list="list" />
    <template #help><ListHelp /></template>
  </FormPage>
</template>
