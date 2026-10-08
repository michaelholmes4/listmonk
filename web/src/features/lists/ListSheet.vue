<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { Loader2 } from '@lucide/vue'
import { useForm } from 'vee-validate'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import CopyText from '@/components/CopyText.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { TagsInput, TagsInputInput, TagsInputItem, TagsInputItemDelete, TagsInputItemText } from '@/components/ui/tags-input'
import { Textarea } from '@/components/ui/textarea'
import { useCreateList, useList, useUpdateList } from '@/composables/queries/useLists'
import { usePermission } from '@/composables/usePermission'
import { emptyList, listSchema, toForm } from './schema'

/** `id` undefined = creating a new list. */
const props = defineProps<{ id?: number }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { can, canList } = usePermission()

const isEditing = computed(() => props.id !== undefined)
const canManage = computed(() => (isEditing.value ? canList(props.id!, 'list:manage') : can('lists:manage_all')))

const { data: list, isPending: loadingList } = useList(() => props.id)
const create = useCreateList()
const update = useUpdateList()
const saving = computed(() => create.isPending.value || update.isPending.value)
const showSkeleton = computed(() => isEditing.value && loadingList.value)

const { handleSubmit, resetForm, values, setFieldValue } = useForm({
  validationSchema: toTypedSchema(listSchema(t)),
  initialValues: emptyList(),
})

watch(
  [open, () => props.id, list],
  () => {
    if (!open.value) return
    if (!isEditing.value) resetForm({ values: emptyList() })
    else if (list.value) resetForm({ values: toForm(list.value) })
  },
  { immediate: true },
)

const onSubmit = handleSubmit((v) => {
  const { archived, ...rest } = v
  const body = { ...rest, status: archived ? ('archived' as const) : ('active' as const) }
  const done = (name: string | undefined, key: 'created' | 'updated') => {
    toast.success(t(`globals.messages.${key}`, { name: name ?? v.name }))
    open.value = false
  }
  if (props.id === undefined) create.mutate(body, { onSuccess: (l) => done(l.name, 'created') })
  else update.mutate({ id: props.id, body }, { onSuccess: (l) => done(l.name, 'updated') })
})
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent class="w-full gap-0 sm:max-w-lg">
      <SheetHeader class="border-b">
        <SheetTitle class="flex items-center gap-2">
          {{ isEditing ? (list?.name ?? '…') : t('lists.newList') }}
          <Badge v-if="list" variant="secondary">{{ t(`lists.types.${list.type}`) }}</Badge>
        </SheetTitle>
        <SheetDescription v-if="list" class="flex flex-wrap gap-x-4 text-xs">
          <span>{{ t('globals.fields.id') }}: <CopyText :text="String(list.id)" /></span>
          <span>{{ t('globals.fields.uuid') }}: <CopyText :text="list.uuid ?? ''" /></span>
        </SheetDescription>
        <SheetDescription v-else class="sr-only">{{ t('lists.newList') }}</SheetDescription>
      </SheetHeader>

      <form class="flex min-h-0 flex-1 flex-col" @submit.prevent="onSubmit">
        <div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <div v-if="showSkeleton" class="space-y-4">
            <Skeleton class="h-9 w-full" />
            <Skeleton class="h-9 w-full" />
            <Skeleton class="h-24 w-full" />
          </div>
          <template v-else>
            <FormField v-slot="{ componentField }" name="name">
              <FormItem>
                <FormLabel>{{ t('globals.fields.name') }}</FormLabel>
                <FormControl><Input v-bind="componentField" maxlength="200" :disabled="!canManage" autofocus /></FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

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
                <p class="text-xs text-muted-foreground">{{ t('lists.typeHelp') }}</p>
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
                <p class="text-xs text-muted-foreground">{{ t('lists.optinHelp') }}</p>
              </FormItem>
            </FormField>

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
          </template>
        </div>

        <SheetFooter class="flex-row justify-end border-t">
          <Button type="button" variant="outline" @click="open = false">{{ t('globals.buttons.close') }}</Button>
          <Button v-if="canManage" type="submit" :disabled="saving || showSkeleton">
            <Loader2 v-if="saving" class="animate-spin" />
            {{ t('globals.buttons.save') }}
          </Button>
        </SheetFooter>
      </form>
    </SheetContent>
  </Sheet>
</template>
