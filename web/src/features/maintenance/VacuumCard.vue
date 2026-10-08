<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { Loader2 } from '@lucide/vue'
import { useForm } from 'vee-validate'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useSaveSettingsKey, useSettings } from '@/composables/queries/useSettings'
import { cronPattern } from '@/features/settings/schema'

/** Scheduled VACUUM: the only settings change that lives on the maintenance page. */
const { t } = useI18n()
const { data: settings, isPending } = useSettings()
const save = useSaveSettingsKey()

const schema = z
  .object({ vacuum: z.boolean(), cron: z.string().trim() })
  .refine((v) => !v.vacuum || cronPattern.test(v.cron), { path: ['cron'], message: t('globals.messages.invalidFields', { name: 'cron' }) })

const { handleSubmit, resetForm, values, setFieldValue } = useForm({
  validationSchema: toTypedSchema(schema),
  initialValues: { vacuum: false, cron: '0 2 * * *' },
})
watch(
  settings,
  (s) => s && resetForm({ values: { vacuum: !!s['maintenance.db']?.vacuum, cron: s['maintenance.db']?.vacuum_cron_interval || '0 2 * * *' } }),
  { immediate: true },
)

const onSubmit = handleSubmit((v) => save.mutate({ key: 'maintenance.db', value: { vacuum: v.vacuum, vacuum_cron_interval: v.cron } }))
</script>

<template>
  <form class="space-y-4 rounded-lg border p-4" data-cy="vacuum" @submit.prevent="onSubmit">
    <div class="space-y-1">
      <h2 class="font-medium">{{ t('maintenance.database.title') }}</h2>
      <h3 class="text-sm">Vacuum</h3>
      <p class="text-xs text-muted-foreground">{{ t('maintenance.database.vacuumHelp') }}</p>
    </div>
    <Skeleton v-if="isPending" class="h-9 w-full" />
    <div v-else class="flex flex-wrap items-start gap-6">
      <div class="flex items-center gap-2 pt-7">
        <Switch id="vacuum" :model-value="values.vacuum" @update:model-value="setFieldValue('vacuum', $event)" />
        <label for="vacuum" class="text-sm">{{ t('globals.buttons.enabled') }}</label>
      </div>
      <FormField v-slot="{ componentField }" name="cron">
        <FormItem class="w-56">
          <FormLabel>{{ t('settings.maintenance.cron') }}</FormLabel>
          <FormControl><Input v-bind="componentField" placeholder="0 2 * * *" :disabled="!values.vacuum" /></FormControl>
          <FormMessage />
        </FormItem>
      </FormField>
      <Button type="submit" class="mt-7" :disabled="save.isPending.value">
        <Loader2 v-if="save.isPending.value" class="animate-spin" />{{ t('globals.buttons.save') }}
      </Button>
    </div>
  </form>
</template>
