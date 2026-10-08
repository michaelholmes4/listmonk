<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { Loader2, Plus, Trash2 } from '@lucide/vue'
import { useForm } from 'vee-validate'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import type { ListRole } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAllLists } from '@/composables/queries/useLists'
import { useCreateListRole, useUpdateListRole } from '@/composables/queries/useRoles'
import { useGoBack } from '@/composables/useGoBack'
import { usePermission } from '@/composables/usePermission'
import { emptyListRole, listRoleSchema, toListRoleForm, toListRoleRequest } from './schema'

/** Create (no `role`) or edit a list role: a name and, per list, view and/or manage access. */
const props = defineProps<{ role?: ListRole }>()

const { t } = useI18n()
const { can } = usePermission()
const goBack = useGoBack({ name: 'list-roles' })
const readonly = computed(() => !can('roles:manage'))
const { data: allLists } = useAllLists()

const create = useCreateListRole()
const update = useUpdateListRole()
const saving = computed(() => create.isPending.value || update.isPending.value)

const { handleSubmit, resetForm, values, setFieldValue } = useForm({
  validationSchema: toTypedSchema(listRoleSchema(t)),
  initialValues: props.role ? toListRoleForm(props.role) : emptyListRole(),
})
watch(
  () => props.role,
  (r) => r && resetForm({ values: toListRoleForm(r) }),
)

type Perm = 'list:get' | 'list:manage'
const lists = computed(() => values.lists ?? [])
const available = computed(() => (allLists.value ?? []).filter((l) => !lists.value.some((x) => x.id === l.id)))

const picked = ref<string>()
function addList() {
  const l = available.value.find((x) => String(x.id) === picked.value)
  if (!l) return
  setFieldValue('lists', [...lists.value, { id: l.id!, name: l.name ?? '', permissions: ['list:get', 'list:manage'] }])
  picked.value = undefined
}
const removeList = (id: number) =>
  setFieldValue('lists', lists.value.filter((l) => l.id !== id))
function setPerm(id: number, perm: Perm, on: boolean) {
  setFieldValue(
    'lists',
    lists.value.map((l) =>
      l.id !== id ? l : { ...l, permissions: on ? [...new Set([...l.permissions, perm])] : l.permissions.filter((p) => p !== perm) },
    ),
  )
}

const onSubmit = handleSubmit((v) => {
  const body = toListRoleRequest(v)
  const done = (name: string | null | undefined, key: 'created' | 'updated') => {
    toast.success(t(`globals.messages.${key}`, { name: name ?? v.name }))
    goBack()
  }
  if (!props.role) create.mutate(body, { onSuccess: (r) => done(r.name, 'created') })
  else update.mutate({ id: props.role.id!, body }, { onSuccess: (r) => done(r.name, 'updated') })
})
</script>

<template>
  <form class="space-y-6" @submit.prevent="onSubmit">
    <FormField v-slot="{ componentField }" name="name">
      <FormItem>
        <FormLabel>{{ t('globals.fields.name') }}</FormLabel>
        <FormControl><Input v-bind="componentField" maxlength="200" :disabled="readonly" autofocus /></FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <section class="space-y-3">
      <h2 class="text-sm font-medium">{{ t('users.listPerms') }}</h2>

      <div v-if="!readonly" class="flex gap-2">
        <Select v-model="picked" :disabled="available.length < 1">
          <SelectTrigger class="w-full max-w-sm" data-cy="pick-list"><SelectValue :placeholder="t('globals.terms.list', 1)" /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="l in available" :key="l.id" :value="String(l.id)">{{ l.name }}</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" :disabled="!picked" data-cy="add-list" @click="addList">
          <Plus />{{ t('globals.buttons.add') }}
        </Button>
      </div>

      <div class="divide-y rounded-lg border" data-cy="role-lists">
        <p v-if="lists.length === 0" class="p-4 text-sm text-muted-foreground">{{ t('web.roles.noLists') }}</p>
        <div v-for="l in lists" :key="l.id" class="flex flex-wrap items-center gap-x-6 gap-y-2 p-3" :data-cy="`role-list-${l.id}`">
          <RouterLink :to="{ name: 'list', params: { id: l.id } }" target="_blank" class="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
            {{ l.name }}
          </RouterLink>
          <div class="flex items-center gap-4">
            <label class="flex items-center gap-2 text-sm">
              <Checkbox
                :model-value="l.permissions.includes('list:get')"
                :disabled="readonly"
                :aria-label="`${l.name}: ${t('globals.buttons.view')}`"
                @update:model-value="setPerm(l.id, 'list:get', $event === true)"
              />{{ t('globals.buttons.view') }}
            </label>
            <label class="flex items-center gap-2 text-sm">
              <Checkbox
                :model-value="l.permissions.includes('list:manage')"
                :disabled="readonly"
                :aria-label="`${l.name}: ${t('globals.buttons.manage')}`"
                @update:model-value="setPerm(l.id, 'list:manage', $event === true)"
              />{{ t('globals.buttons.manage') }}
            </label>
            <Button v-if="!readonly" type="button" variant="ghost" size="icon-sm" :aria-label="t('globals.buttons.delete')" @click="removeList(l.id)">
              <Trash2 />
            </Button>
          </div>
        </div>
      </div>
    </section>

    <div class="flex gap-2">
      <Button v-if="!readonly" type="submit" :disabled="saving">
        <Loader2 v-if="saving" class="animate-spin" />
        {{ t('globals.buttons.save') }}
      </Button>
      <Button type="button" variant="outline" @click="goBack">{{ readonly ? t('globals.buttons.close') : t('globals.buttons.cancel') }}</Button>
    </div>
  </form>
</template>
