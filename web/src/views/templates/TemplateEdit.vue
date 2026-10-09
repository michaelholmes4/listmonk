<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import CopyText from '@/components/CopyText.vue'
import Page from '@/components/layout/Page.vue'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useTemplate } from '@/composables/queries/useTemplates'
import { typeLabelKey } from '@/features/templates/columns'
import Form from '@/features/templates/Form.vue'
import TemplateHelp from '@/features/templates/TemplateHelp.vue'
import { usePageTitle } from '@/lib/page-title'

const { t } = useI18n()
const route = useRoute()
const id = computed(() => Number(route.params.id))
const { data: template } = useTemplate(id)

usePageTitle(() => template.value?.name)
</script>

<template>
  <Page :title="template?.name ?? '…'">
    <template v-if="template" #badges>
      <Badge variant="outline">{{ t(typeLabelKey(template.type)) }}</Badge>
      <Badge v-if="template.is_default" variant="secondary">{{ t('templates.default') }}</Badge>
    </template>
    <template v-if="template" #meta>
      <span>{{ t('globals.fields.id') }}: <CopyText :text="String(template.id)" /></span>
    </template>

    <div v-if="!template" class="space-y-4">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-[40vh] w-full" />
    </div>
    <Form v-else :key="template.id" :template="template" />
    <template #help><TemplateHelp /></template>
  </Page>
</template>
