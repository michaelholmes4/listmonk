<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Page from '@/components/layout/Page.vue'
import LogView from '@/components/LogView.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { useLogs } from '@/composables/queries/useLogs'

const { t } = useI18n()
const { data, isPending } = useLogs()
</script>

<template>
  <Page :title="t('logs.title')">
    <Skeleton v-if="isPending" class="h-[70vh] w-full" />
    <LogView v-else :lines="data ?? []" class="max-h-[75vh] min-h-[50vh]" />
  </Page>
</template>
