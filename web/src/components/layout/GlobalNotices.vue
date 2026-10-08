<script setup lang="ts">
import { Info, RefreshCw, TriangleAlert } from '@lucide/vue'
import { format } from 'date-fns'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useConfig } from '@/composables/queries/useConfig'
import { useRestartApp } from '@/composables/queries/useSettings'
import { usePermission } from '@/composables/usePermission'

/**
 * Banners above every page: settings that need a restart, a new release, notices from the project,
 * and the leftover legacy admin credentials.
 */
const { t } = useI18n()
const { data: config } = useConfig()
const { can } = usePermission()

const update = computed(() => config.value?.update)
const newRelease = computed(() => (update.value?.update?.is_new ? update.value.update : null))
const messages = computed(() => update.value?.messages ?? [])
const releaseDate = computed(() => {
  const d = newRelease.value?.release_date
  return d ? format(new Date(d), 'dd MMM yy') : ''
})

const restart = useRestartApp()
const confirmOpen = ref(false)
function doRestart() {
  restart.mutate(undefined, { onSettled: () => (confirmOpen.value = false) })
}
</script>

<template>
  <div v-if="config?.needs_restart || newRelease || messages.length || config?.has_legacy_user" class="space-y-2 px-4 pt-3" data-cy="notices">
    <Alert v-if="config?.needs_restart" variant="destructive" data-cy="notice-restart">
      <RefreshCw />
      <AlertDescription class="flex flex-wrap items-center gap-3">
        {{ t('settings.needsRestart') }}
        <Button v-if="can('settings:manage')" size="sm" variant="outline" @click="confirmOpen = true">{{ t('settings.restart') }}</Button>
      </AlertDescription>
    </Alert>

    <Alert v-if="newRelease" data-cy="notice-update">
      <Info />
      <AlertDescription>
        {{ t('settings.updateAvailable', { version: `${newRelease.release_version} (${releaseDate})` }) }}
        <a :href="newRelease.url" target="_blank" rel="noopener noreferrer" class="link-style ml-1">{{ t('web.common.view') }}</a>
      </AlertDescription>
    </Alert>

    <Alert v-for="m in messages" :key="m.title" :variant="m.priority === 'high' ? 'destructive' : 'default'">
      <Info />
      <AlertDescription>
        <strong v-if="m.title" class="block">{{ m.title }}</strong>
        <span v-if="m.description">{{ m.description }}</span>
        <a v-if="m.url" :href="m.url" target="_blank" rel="noopener noreferrer" class="link-style ml-1">{{ t('web.common.view') }}</a>
      </AlertDescription>
    </Alert>

    <Alert v-if="config?.has_legacy_user" variant="destructive" data-cy="notice-legacy">
      <TriangleAlert />
      <AlertDescription>
        {{ t('web.notices.legacyUser') }}
        <RouterLink :to="{ name: 'users' }" class="link-style">{{ t('globals.terms.users') }}</RouterLink>
        <a href="https://listmonk.app/docs/upgrade/#upgrading-to-v4xx" target="_blank" rel="noopener noreferrer" class="link-style ml-1">
          {{ t('web.common.learnMore') }}
        </a>
      </AlertDescription>
    </Alert>
  </div>

  <ConfirmDialog
    v-model:open="confirmOpen"
    :title="t('settings.confirmRestart')"
    :confirm-label="t('settings.restart')"
    :pending="restart.isPending.value"
    @confirm="doRestart"
  />
</template>
