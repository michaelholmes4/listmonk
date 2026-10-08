<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { Loader2, Save } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { useForm } from 'vee-validate'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import type { Settings } from '@/api/types'
import LeaveConfirm from '@/components/LeaveConfirm.vue'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSaveSettings } from '@/composables/queries/useSettings'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { usePermission } from '@/composables/usePermission'
import AppearanceTab from './tabs/AppearanceTab.vue'
import BouncesTab from './tabs/BouncesTab.vue'
import GeneralTab from './tabs/GeneralTab.vue'
import MediaTab from './tabs/MediaTab.vue'
import MessengersTab from './tabs/MessengersTab.vue'
import PerformanceTab from './tabs/PerformanceTab.vue'
import PrivacyTab from './tabs/PrivacyTab.vue'
import SecurityTab from './tabs/SecurityTab.vue'
import SmtpTab from './tabs/SmtpTab.vue'
import { halfEditedSecret, settingsSchema, toForm, toRequest } from './schema'
import { tabOfPath, tabs, type SettingsTab } from './tabIds'

const props = defineProps<{ settings: Settings }>()
const emit = defineEmits<{ tab: [tab: SettingsTab] }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { can } = usePermission()
const canManage = computed(() => can('settings:manage'))

const save = useSaveSettings()

const { handleSubmit, resetForm, values, errors } = useForm({
  validationSchema: toTypedSchema(settingsSchema(t)),
  initialValues: toForm(props.settings),
  // Tabs and conditional blocks unmount their fields; their values still belong to the form.
  keepValuesOnUnmount: true,
})

// --- Dirty tracking: a snapshot of the form as loaded/saved. -----------------------------------------
const baseline = ref(JSON.stringify(values))
const dirty = computed(() => JSON.stringify(values) !== baseline.value)
function reset(s: Settings) {
  const form = toForm(s)
  resetForm({ values: form })
  baseline.value = JSON.stringify(form)
}
// A refetch after saving (the server reloaded) replaces the form; edits made meanwhile are kept.
watch(
  () => props.settings,
  (s) => !dirty.value && reset(s),
)

const { leaveOpen, decide } = useUnsavedGuard(dirty, computed(() => save.isPending.value))

// --- Tabs live in the URL. ---------------------------------------------------------------------------
const tab = computed<SettingsTab>({
  get: () => (tabs.includes(route.query.tab as SettingsTab) ? (route.query.tab as SettingsTab) : 'general'),
  set: (v) => void router.replace({ query: { ...route.query, tab: v } }),
})
watch(tab, (v) => emit('tab', v), { immediate: true })

// Tabs holding an error get a dot, so a problem on another tab isn't invisible.
const tabsWithErrors = computed(() => new Set(Object.keys(errors.value).map(tabOfPath)))

// --- Save. -------------------------------------------------------------------------------------------
const submit = handleSubmit(
  (v) => {
    const half = halfEditedSecret(values as never)
    if (half) {
      toast.error(t('globals.messages.passwordChangeFull', { name: half }))
      return
    }
    save.mutate(toRequest(v), { onSuccess: () => (baseline.value = JSON.stringify(values)) })
  },
  ({ errors: errs }) => {
    const first = Object.keys(errs)[0]
    if (first) {
      tab.value = tabOfPath(first)
      toast.error(t('globals.messages.invalidFields', { name: first }))
    }
  },
)

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && canManage.value) {
    e.preventDefault()
    void submit()
  }
})

const tabLabels: Record<SettingsTab, string> = {
  general: 'settings.general.name',
  performance: 'settings.performance.name',
  privacy: 'settings.privacy.name',
  security: 'settings.security.name',
  media: 'settings.media.title',
  smtp: 'settings.smtp.name',
  bounces: 'settings.bounces.name',
  messengers: 'settings.messengers.name',
  appearance: 'settings.appearance.name',
}
</script>

<template>
  <Teleport defer to="#page-actions">
    <Button v-if="canManage" size="sm" :disabled="!dirty || save.isPending.value" data-cy="btn-save" @click="submit">
      <Loader2 v-if="save.isPending.value" class="animate-spin" /><Save v-else />{{ t('globals.buttons.save') }}
    </Button>
  </Teleport>

  <form novalidate @submit.prevent="submit">
    <Tabs v-model="tab">
      <TabsList class="h-auto w-full flex-wrap justify-start" data-cy="settings-tabs">
        <TabsTrigger v-for="id in tabs" :key="id" :value="id" :data-cy="`tab-${id}`">
          {{ t(tabLabels[id]) }}
          <span v-if="tabsWithErrors.has(id)" class="size-1.5 rounded-full bg-destructive" :aria-label="t('web.settings.hasErrors')" />
        </TabsTrigger>
      </TabsList>

      <fieldset :disabled="!canManage" class="min-w-0 border-0 p-0">
        <TabsContent value="general" class="pt-6"><GeneralTab /></TabsContent>
        <TabsContent value="performance" class="pt-6"><PerformanceTab /></TabsContent>
        <TabsContent value="privacy" class="pt-6"><PrivacyTab /></TabsContent>
        <TabsContent value="security" class="pt-6"><SecurityTab /></TabsContent>
        <TabsContent value="media" class="pt-6"><MediaTab /></TabsContent>
        <TabsContent value="smtp" class="pt-6"><SmtpTab /></TabsContent>
        <TabsContent value="bounces" class="pt-6"><BouncesTab /></TabsContent>
        <TabsContent value="messengers" class="pt-6"><MessengersTab /></TabsContent>
        <TabsContent value="appearance" class="pt-6"><AppearanceTab /></TabsContent>
      </fieldset>
    </Tabs>
  </form>

  <LeaveConfirm :open="leaveOpen" @decide="decide" />
</template>
