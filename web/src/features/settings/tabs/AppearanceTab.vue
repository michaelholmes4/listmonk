<script setup lang="ts">
import { useFormContext } from 'vee-validate'
import { useI18n } from 'vue-i18n'
import CodeEditor from '@/components/CodeEditor.vue'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SettingsForm } from '../schema'

const { t } = useI18n()
const { values, setFieldValue } = useFormContext<SettingsForm>()
const areas = ['admin', 'public'] as const
</script>

<template>
  <Tabs default-value="admin">
    <TabsList>
      <TabsTrigger value="admin">{{ t('settings.appearance.adminName') }}</TabsTrigger>
      <TabsTrigger value="public">{{ t('settings.appearance.publicName') }}</TabsTrigger>
    </TabsList>
    <TabsContent v-for="area in areas" :key="area" :value="area" class="space-y-4 pt-4">
      <p class="text-sm text-muted-foreground">{{ area === 'admin' ? t('settings.appearance.adminHelp') : t('settings.appearance.publicHelp') }}</p>
      <div class="space-y-2">
        <Label>{{ t('settings.appearance.customCSS') }}</Label>
        <CodeEditor
          lang="css"
          class="h-64"
          :model-value="values.appearance?.[area].custom_css ?? ''"
          @update:model-value="setFieldValue(`appearance.${area}.custom_css`, $event)"
        />
      </div>
      <div class="space-y-2">
        <Label>{{ t('settings.appearance.customJS') }}</Label>
        <CodeEditor
          lang="javascript"
          class="h-64"
          :model-value="values.appearance?.[area].custom_js ?? ''"
          @update:model-value="setFieldValue(`appearance.${area}.custom_js`, $event)"
        />
      </div>
    </TabsContent>
  </Tabs>
</template>
