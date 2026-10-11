<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useForm } from 'vee-validate'
import { computed, nextTick, onScopeDispose, ref, watch, watchEffect, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import type { Settings } from '@/api/types'
import FormActions from '@/components/layout/FormActions.vue'
import LeaveConfirm from '@/components/LeaveConfirm.vue'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useSaveSettings } from '@/composables/queries/useSettings'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { usePermission } from '@/composables/usePermission'
import { useUiStore } from '@/stores/ui'
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
import { tabOfPath, tabOfQuery, tabs, type SettingsTab } from './tabIds'

const props = defineProps<{ settings: Settings }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { can } = usePermission()
const canManage = computed(() => can('settings:manage'))

const save = useSaveSettings()

const { handleSubmit, resetForm, values, errors, validate } = useForm({
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

const { leaveOpen, decide } = useUnsavedGuard(
  dirty,
  computed(() => save.isPending.value),
)

// --- Sections live in the URL (`?tab=`); the sidebar's Settings space links them. -------------------
const tab = computed(() => tabOfQuery(route.query.tab))

// Sections holding an error get a dot in the sidebar, so a problem in another section isn't invisible.
const { navAlerts } = storeToRefs(useUiStore())
watchEffect(() => {
  const label = t('web.settings.hasErrors')
  navAlerts.value = Object.fromEntries(Object.keys(errors.value).map((path) => [`settings-${tabOfPath(path)}`, label]))
})
onScopeDispose(() => (navAlerts.value = {}))

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
      // Jump to the section with the problem, then validate again once its fields have mounted:
      // a field that was not on screen at submit time would otherwise show no message.
      void router
        .replace({ query: { ...route.query, tab: tabOfPath(first) } })
        .then(() => nextTick())
        .then(() => validate())
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

const sections: Record<SettingsTab, Component> = {
  general: GeneralTab,
  performance: PerformanceTab,
  privacy: PrivacyTab,
  security: SecurityTab,
  media: MediaTab,
  smtp: SmtpTab,
  bounces: BouncesTab,
  messengers: MessengersTab,
  appearance: AppearanceTab,
}
</script>

<template>
  <FormActions :pending="save.isPending.value" :dirty="dirty" :can-save="canManage" @save="submit" />

  <!-- The section's name and help are the page header (SettingsView); the sidebar switches sections. -->
  <form novalidate class="min-w-0 space-y-8" @submit.prevent="submit">
    <!-- Tabs without a TabsList: the sidebar is the switcher, TabsContent mounts the active section. -->
    <Tabs :model-value="tab">
      <fieldset :disabled="!canManage" class="min-w-0 border-0 p-0">
        <TabsContent v-for="id in tabs" :key="id" :value="id"><component :is="sections[id]" /></TabsContent>
      </fieldset>
    </Tabs>
    <p class="text-xs text-muted-foreground">{{ t('web.settings.saveHint') }}</p>
    <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true" />
  </form>

  <LeaveConfirm :open="leaveOpen" @decide="decide" />
</template>
