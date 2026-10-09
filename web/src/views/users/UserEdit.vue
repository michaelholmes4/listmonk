<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import CopyText from '@/components/CopyText.vue'
import Page from '@/components/layout/Page.vue'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useUser } from '@/composables/queries/useUsers'
import Form from '@/features/users/Form.vue'
import UserHelp from '@/features/users/UserHelp.vue'
import { usePageTitle } from '@/lib/page-title'

const { t } = useI18n()
const route = useRoute()
const id = computed(() => Number(route.params.id))
const { data: user } = useUser(id)

usePageTitle(() => user.value?.name || user.value?.username)
</script>

<template>
  <Page width="form" :title="user?.name || user?.username || '…'">
    <template v-if="user" #badges>
      <Badge v-if="user.type === 'api'" variant="outline">{{ t('users.type.api') }}</Badge>
      <Badge v-if="user.status === 'disabled'" variant="secondary">{{ t('users.status.disabled') }}</Badge>
    </template>
    <template v-if="user" #meta>
      <span>{{ t('globals.fields.id') }}: <CopyText :text="String(user.id)" /></span>
    </template>

    <div v-if="!user" class="space-y-4">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-24 w-full" />
    </div>
    <Form v-else :key="user.id" :user="user" />
    <template #help><UserHelp /></template>
  </Page>
</template>
