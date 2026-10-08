<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { Loader2 } from '@lucide/vue'
import { useForm } from 'vee-validate'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { List } from '@/api/types'
import { Button } from '@/components/ui/button'
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { TagsInput, TagsInputInput, TagsInputItem, TagsInputItemDelete, TagsInputItemText } from '@/components/ui/tags-input'
import { Textarea } from '@/components/ui/textarea'
import { useCreateList, useUpdateList } from '@/composables/queries/useLists'
import { useGoBack } from '@/composables/useGoBack'
import { usePermission } from '@/composables/usePermission'
import { emptyList, listSchema, toForm } from './schema'

/** Create (no `list`) or edit. Leaves the page on success or cancel. */
const props = defineProps<{ list?: List }>()

const { t } = useI18n()
const { can, canList } = usePermission()
const goBack = useGoBack({ name: 'lists' })

const canManage = computed(() => (props.list ? canList(props.list.id!, 'list:manage') : can('lists:manage_all')))

const create = useCreateList()
const update = useUpdateList()
const saving = computed(() => create.isPending.value || update.isPending.value)

const { handleSubmit, resetForm, values, setFieldValue } = useForm({
  validationSchema: toTypedSchema(listSchema(t)),
  initialValues: props.list ? toForm(props.list) : emptyList(),
})

// Fresh data (a refetch after another tab saved it) replaces the form unless the user is mid-edit.
watch(
  () => props.list,
  (l) => l && resetForm({ values: toForm(l) }),
)

const onSubmit = handleSubmit((v) => {
  const { archived, ...rest } = v
  const body = { ...rest, status: archived ? ('archived' as const) : ('active' as const) }
  const done = (name: string | undefined, key: 'created' | 'updated') => {
    toast.success(t(`globals.messages.${key}`, { name: name ?? v.name }))
    goBack()
  }
  if (!props.list) create.mutate(body, { onSuccess: (l) => done(l.name, 'created') })
  else update.mutate({ id: props.list.id!, body }, { onSuccess: (l) => done(l.name, 'updated') })
})
</script>

<template>
  <form class="space-y-6" @submit.prevent="onSubmit">
    <div class="space-y-6">
      <FormField v-slot="{ componentField }" name="name">
        <FormItem>
          <FormLabel>{{ t('globals.fields.name') }}</FormLabel>
          <FormControl><Input v-bind="componentField" maxlength="200" :disabled="!canManage" autofocus /></FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <div class="grid items-start gap-6 md:grid-cols-2">
        <FormField v-slot="{ componentField }" name="type">
          <FormItem>
            <FormLabel>{{ t('lists.type') }}</FormLabel>
            <Select v-bind="componentField" :disabled="!canManage">
              <FormControl><SelectTrigger class="w-full"><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="private">{{ t('lists.types.private') }}</SelectItem>
                <SelectItem value="public">{{ t('lists.types.public') }}</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>{{ t('lists.typeHelp') }}</FormDescription>
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="optin">
          <FormItem>
            <FormLabel>{{ t('lists.optin') }}</FormLabel>
            <Select v-bind="componentField" :disabled="!canManage">
              <FormControl><SelectTrigger class="w-full"><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="single">{{ t('lists.optins.single') }}</SelectItem>
                <SelectItem value="double">{{ t('lists.optins.double') }}</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>{{ t('lists.optinHelp') }}</FormDescription>
          </FormItem>
        </FormField>
      </div>

      <FormField name="tags">
        <FormItem>
          <FormLabel>{{ t('globals.terms.tags') }}</FormLabel>
          <TagsInput
            :model-value="values.tags ?? []"
            :disabled="!canManage"
            add-on-blur
            @update:model-value="setFieldValue('tags', $event as string[])"
          >
            <TagsInputItem v-for="tag in values.tags" :key="tag" :value="tag">
              <TagsInputItemText />
              <TagsInputItemDelete />
            </TagsInputItem>
            <TagsInputInput :placeholder="t('globals.terms.tags')" />
          </TagsInput>
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="description">
        <FormItem>
          <FormLabel>{{ t('globals.fields.description') }}</FormLabel>
          <FormControl><Textarea v-bind="componentField" maxlength="2000" rows="3" :disabled="!canManage" /></FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <div class="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div class="space-y-0.5">
          <label for="list-archived" class="text-sm font-medium">{{ t('lists.archived') }}</label>
          <p class="text-xs text-muted-foreground">{{ t('lists.archivedHelp') }}</p>
        </div>
        <Switch
          id="list-archived"
          :model-value="values.archived"
          :disabled="!canManage"
          @update:model-value="setFieldValue('archived', $event)"
        />
      </div>
    </div>

    <div class="flex gap-2">
      <Button v-if="canManage" type="submit" :disabled="saving">
        <Loader2 v-if="saving" class="animate-spin" />
        {{ t('globals.buttons.save') }}
      </Button>

      <Button type="button" variant="outline" @click="goBack">{{ canManage ? t('globals.buttons.cancel') : t('globals.buttons.close') }}</Button>
    </div>
  </form>
</template>
