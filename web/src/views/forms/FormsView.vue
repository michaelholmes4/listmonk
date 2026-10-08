<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CodeEditor from '@/components/CodeEditor.vue'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfig } from '@/composables/queries/useConfig'
import { useAllLists } from '@/composables/queries/useLists'
import { renderFormHTML } from '@/features/forms/html'

const { t } = useI18n()
const { data: config } = useConfig()
const { data: lists, isPending } = useAllLists()

const publicLists = computed(() => (lists.value ?? []).filter((l) => l.type === 'public'))
const checked = ref<number[]>([])
// '' means "no redirect"; reka's radio can't use an empty string as a value, so map it.
const NONE = '__none'
const redirect = ref(NONE)

const redirectURLs = computed(() => {
  const urls = config.value?.public_subscription?.redirect_urls
  return Array.isArray(urls) ? urls : []
})

const html = computed(() =>
  config.value && checked.value.length
    ? renderFormHTML({
        // Keep the lists in the order they appear on screen, not the order they were ticked.
        lists: publicLists.value.filter((l) => checked.value.includes(l.id!)),
        redirectURL: redirect.value === NONE ? '' : redirect.value,
        config: config.value,
        t,
      })
    : '',
)

const toggle = (id: number, on: boolean) =>
  (checked.value = on ? [...checked.value, id] : checked.value.filter((x) => x !== id))
</script>

<template>
  <div class="space-y-4 p-6">
    <h1 class="text-xl font-semibold">{{ t('forms.title') }}</h1>

    <div v-if="isPending" class="grid gap-6 md:grid-cols-[18rem_1fr]">
      <div class="space-y-2"><Skeleton class="h-5 w-32" /><Skeleton class="h-5 w-48" /><Skeleton class="h-5 w-40" /></div>
      <Skeleton class="h-64 w-full" />
    </div>
    <p v-else-if="!publicLists.length" class="text-muted-foreground">{{ t('forms.noPublicLists') }}</p>

    <div v-else class="grid gap-6 md:grid-cols-[18rem_1fr]">
      <div class="space-y-6">
        <section class="space-y-2" data-cy="lists">
          <h2 class="font-medium">{{ t('forms.publicLists') }}</h2>
          <p class="text-sm text-muted-foreground">{{ t('forms.selectHelp') }}</p>
          <div v-for="l in publicLists" :key="l.id" class="flex items-center gap-2">
            <Checkbox :id="`form-list-${l.id}`" :model-value="checked.includes(l.id!)" @update:model-value="toggle(l.id!, $event === true)" />
            <Label :for="`form-list-${l.id}`">{{ l.name }}</Label>
          </div>
        </section>

        <section v-if="config?.public_subscription?.enabled" class="space-y-1">
          <h2 class="font-medium">{{ t('forms.publicSubPage') }}</h2>
          <a
            :href="`${config.root_url}/subscription/form`"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm break-all text-primary hover:underline"
            data-cy="url"
          >
            {{ config.root_url }}/subscription/form
          </a>
        </section>

        <section class="space-y-2">
          <h2 class="font-medium">{{ t('forms.redirectURL') }}</h2>
          <p class="text-xs text-muted-foreground">{{ t('forms.redirectURLHelp') }}</p>
          <RadioGroup v-if="redirectURLs.length" v-model="redirect" data-cy="redirect-urls">
            <div class="flex items-center gap-2">
              <RadioGroupItem id="redirect-none" :value="NONE" />
              <Label for="redirect-none">{{ t('globals.terms.none') }}</Label>
            </div>
            <div v-for="(u, i) in redirectURLs" :key="u" class="flex items-center gap-2">
              <RadioGroupItem :id="`redirect-${i}`" :value="u" />
              <Label :for="`redirect-${i}`" class="break-all">{{ u }}</Label>
            </div>
          </RadioGroup>
        </section>
      </div>

      <section class="min-w-0 space-y-2" data-cy="form">
        <h2 class="font-medium">{{ t('forms.formHTML') }}</h2>
        <p class="text-sm text-muted-foreground">{{ t('forms.formHTMLHelp') }}</p>
        <CodeEditor v-if="html" :model-value="html" lang="html" readonly />
      </section>
    </div>
  </div>
</template>
