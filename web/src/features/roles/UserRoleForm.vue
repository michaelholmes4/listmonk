<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { TriangleAlert } from '@lucide/vue'
import { useForm } from 'vee-validate'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { Role } from '@/api/types'
import FormActions from '@/components/layout/FormActions.vue'
import FormSection from '@/components/layout/FormSection.vue'
import LeaveConfirm from '@/components/LeaveConfirm.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useConfig } from '@/composables/queries/useConfig'
import { useCreateUserRole, useUpdateUserRole } from '@/composables/queries/useRoles'
import { useGoBack } from '@/composables/useGoBack'
import { usePermission } from '@/composables/usePermission'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import {
  SUPER_ADMIN_ROLE_ID,
  emptyUserRole,
  permissionGroups,
  toUserRoleForm,
  toUserRoleRequest,
  userRoleSchema,
} from './schema'

/** Create (no `role`) or edit a user role: a name and a checkbox per permission, grouped. */
const props = defineProps<{ role?: Role }>()

const { t } = useI18n()
const { can } = usePermission()
const goBack = useGoBack({ name: 'user-roles' })
const { data: config } = useConfig()
const groups = computed(() => permissionGroups(config.value))

const readonly = computed(() => !can('roles:manage') || props.role?.id === SUPER_ADMIN_ROLE_ID)

const create = useCreateUserRole()
const update = useUpdateUserRole()
const saving = computed(() => create.isPending.value || update.isPending.value)

const { handleSubmit, resetForm, values, setFieldValue, meta } = useForm({
  validationSchema: toTypedSchema(userRoleSchema(t)),
  initialValues: props.role ? toUserRoleForm(props.role) : emptyUserRole(groups.value),
})
watch(
  () => props.role,
  (r) => r && resetForm({ values: toUserRoleForm(r) }),
)
// A new role's defaults need the permission list; it arrives with the (cached) server config.
watch(groups, (g) => {
  if (!props.role && values.permissions?.length === 0 && g.length) setFieldValue('permissions', emptyUserRole(g).permissions)
})

const all = computed(() => groups.value.flatMap((g) => g.permissions))
const allSelected = computed(() => all.value.length > 0 && all.value.every((p) => values.permissions?.includes(p)))
const toggleAll = () => setFieldValue('permissions', allSelected.value ? [] : [...all.value])

function toggle(p: string, on: boolean) {
  const cur = values.permissions ?? []
  setFieldValue('permissions', on ? [...cur, p] : cur.filter((x) => x !== p))
}

const dirty = computed(() => !readonly.value && meta.value.dirty)
const { leaveOpen, decide } = useUnsavedGuard(dirty, saving)
/** After a successful save: the form is clean again, then leave. */
const savedAndBack = () => {
  resetForm({ values: { ...values } })
  goBack()
}

const onSubmit = handleSubmit((v) => {
  const body = toUserRoleRequest(v)
  const done = (name: string | null | undefined, key: 'created' | 'updated') => {
    toast.success(t(`globals.messages.${key}`, { name: name ?? v.name }))
    savedAndBack()
  }
  if (!props.role) create.mutate(body, { onSuccess: (r) => done(r.name, 'created') })
  else update.mutate({ id: props.role.id!, body }, { onSuccess: (r) => done(r.name, 'updated') })
})
</script>

<template>
  <FormActions :pending="saving" :dirty="role ? dirty : undefined" :can-save="!readonly" :on-cancel="goBack" @save="onSubmit" />
  <form class="space-y-8" @submit.prevent="onSubmit">
    <FormSection :title="t('web.common.details')">
      <FormField v-slot="{ componentField }" name="name">
        <FormItem>
          <FormLabel>{{ t('globals.fields.name') }}</FormLabel>
          <FormControl><Input v-bind="componentField" maxlength="200" :disabled="readonly" autofocus /></FormControl>
          <FormMessage />
        </FormItem>
      </FormField>
    </FormSection>

    <FormSection :title="t('users.perms')">
      <div v-if="!readonly" class="-mb-3 flex justify-end">
        <Button type="button" variant="link" size="sm" class="h-auto p-0" @click="toggleAll">
          {{ t('globals.buttons.toggleSelect') }}
        </Button>
      </div>

      <div class="divide-y rounded-lg border">
        <div v-for="g in groups" :key="g.group" class="space-y-3 p-4" :data-cy="`perm-group-${g.group}`">
          <h3 class="text-sm font-medium">{{ t(`globals.terms.${g.group}`) }}</h3>
          <div class="grid gap-2 sm:grid-cols-2">
            <div v-for="p in g.permissions" :key="p" class="flex items-center gap-2">
              <Checkbox
                :id="`perm-${p}`"
                :model-value="readonly && role?.id === SUPER_ADMIN_ROLE_ID ? true : values.permissions?.includes(p)"
                :disabled="readonly"
                @update:model-value="toggle(p, $event === true)"
              />
              <label :for="`perm-${p}`" class="text-sm">{{ p }}</label>
              <a
                v-if="p === 'subscribers:sql_query'"
                href="https://listmonk.app/docs/roles-and-permissions/#subscriberssql_query"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="t('web.roles.highRisk')"
                :title="t('web.roles.highRisk')"
              >
                <TriangleAlert class="size-4 text-destructive" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </FormSection>

    <!-- Enter in a field submits; the visible Save button is in the page header. -->
    <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true" />
  </form>
  <LeaveConfirm :open="leaveOpen" @decide="decide" />
</template>
