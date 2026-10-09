<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { Code, UserRound } from '@lucide/vue'
import { useForm } from 'vee-validate'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { User } from '@/api/types'
import CopyText from '@/components/CopyText.vue'
import FormActions from '@/components/layout/FormActions.vue'
import LeaveConfirm from '@/components/LeaveConfirm.vue'
import { Checkbox } from '@/components/ui/checkbox'
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useListRoles, useUserRoles } from '@/composables/queries/useRoles'
import { useCreateUser, useUpdateUser } from '@/composables/queries/useUsers'
import { useGoBack } from '@/composables/useGoBack'
import { usePermission } from '@/composables/usePermission'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { emptyUser, toForm, toRequest, userSchema } from './schema'

/** Create (no `user`) or edit. Leaves the page on success or cancel; a new API user stays to show its token. */
const props = defineProps<{ user?: User }>()

const { t } = useI18n()
const { can } = usePermission()
const goBack = useGoBack({ name: 'users' })
const canManage = computed(() => can('users:manage'))
const isEditing = computed(() => !!props.user)

const { data: userRoles } = useUserRoles()
const { data: listRoles } = useListRoles()

const create = useCreateUser()
const update = useUpdateUser()
const saving = computed(() => create.isPending.value || update.isPending.value)

const { handleSubmit, resetForm, values, setFieldValue, meta } = useForm({
  validationSchema: toTypedSchema(userSchema(t, !!props.user)),
  initialValues: props.user ? toForm(props.user) : emptyUser(),
  // Email and password fields disappear for API users; their values (and the schema) must not.
  keepValuesOnUnmount: true,
})
watch(
  () => props.user,
  (u) => u && resetForm({ values: toForm(u) }),
)

const isAPI = computed(() => values.type === 'api')
// The one-time token of a freshly created API user; the page stays until it has been copied.
const apiToken = ref<string | null>(null)

const NONE = 'none'

const dirty = computed(() => canManage.value && !apiToken.value && meta.value.dirty)
const { leaveOpen, decide } = useUnsavedGuard(dirty, saving)
/** After a successful save: the form is clean again, then leave. */
const savedAndBack = () => {
  resetForm({ values: { ...values } })
  goBack()
}

const onSubmit = handleSubmit((v) => {
  const body = toRequest(v)
  if (!props.user) {
    create.mutate(body, {
      onSuccess: (u) => {
        toast.success(t('globals.messages.created', { name: u.name }))
        if (u.type === 'api') apiToken.value = u.password ?? null
        else savedAndBack()
      },
    })
  } else {
    update.mutate(
      { id: props.user.id!, body },
      {
        onSuccess: (u) => {
          toast.success(t('globals.messages.updated', { name: u.name }))
          savedAndBack()
        },
      },
    )
  }
})
</script>

<template>
  <FormActions :pending="saving" :dirty="user ? dirty : undefined" :can-save="canManage && !apiToken" :on-cancel="goBack" @save="onSubmit" />
  <form class="space-y-6" @submit.prevent="onSubmit">
    <div class="grid items-start gap-6 md:grid-cols-2">
      <FormField name="type">
        <FormItem>
          <FormLabel>{{ t('users.type') }}</FormLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            class="w-full"
            :model-value="values.type"
            :disabled="isEditing || !canManage"
            @update:model-value="$event && setFieldValue('type', $event as 'user' | 'api')"
          >
            <ToggleGroupItem value="user" class="flex-1"><UserRound />{{ t('users.type.user') }}</ToggleGroupItem>
            <ToggleGroupItem value="api" class="flex-1"><Code />{{ t('users.type.api') }}</ToggleGroupItem>
          </ToggleGroup>
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="status">
        <FormItem>
          <FormLabel>{{ t('globals.fields.status') }}</FormLabel>
          <Select v-bind="componentField" :disabled="!canManage">
            <FormControl><SelectTrigger class="w-full"><SelectValue /></SelectTrigger></FormControl>
            <SelectContent>
              <SelectItem value="enabled">{{ t('users.status.enabled') }}</SelectItem>
              <SelectItem value="disabled">{{ t('users.status.disabled') }}</SelectItem>
            </SelectContent>
          </Select>
        </FormItem>
      </FormField>
    </div>

    <div class="grid items-start gap-6 md:grid-cols-2">
      <FormField v-slot="{ componentField }" name="username">
        <FormItem>
          <FormLabel>{{ t('users.username') }}</FormLabel>
          <FormControl><Input v-bind="componentField" maxlength="200" autocomplete="off" :disabled="!canManage" autofocus /></FormControl>
          <FormDescription>{{ t('users.usernameHelp') }}</FormDescription>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="name">
        <FormItem>
          <FormLabel>{{ t('globals.fields.name') }}</FormLabel>
          <FormControl><Input v-bind="componentField" maxlength="200" :disabled="!canManage" /></FormControl>
          <FormMessage />
        </FormItem>
      </FormField>
    </div>

    <template v-if="!isAPI">
      <FormField v-slot="{ componentField }" name="email">
        <FormItem>
          <FormLabel>{{ t('subscribers.email') }}</FormLabel>
          <FormControl><Input v-bind="componentField" type="email" maxlength="200" :disabled="!canManage" /></FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <section class="space-y-4 rounded-lg border p-4">
        <div class="flex items-center gap-2">
          <Checkbox
            id="password-login"
            :model-value="values.passwordLogin"
            :disabled="!canManage"
            @update:model-value="setFieldValue('passwordLogin', $event === true)"
          />
          <label for="password-login" class="text-sm font-medium">{{ t('users.passwordEnable') }}</label>
        </div>
        <div class="grid items-start gap-6 md:grid-cols-2">
          <FormField v-slot="{ componentField }" name="password">
            <FormItem>
              <FormLabel>{{ t('users.password') }}</FormLabel>
              <FormControl>
                <Input v-bind="componentField" type="password" maxlength="200" autocomplete="new-password" :disabled="!values.passwordLogin || !canManage" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="password2">
            <FormItem>
              <FormLabel>{{ t('users.passwordRepeat') }}</FormLabel>
              <FormControl>
                <Input v-bind="componentField" type="password" maxlength="200" autocomplete="new-password" :disabled="!values.passwordLogin || !canManage" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>
      </section>
    </template>

    <section class="space-y-4 rounded-lg border p-4">
      <h2 class="text-sm font-medium">{{ t('users.roles') }}</h2>
      <div class="grid items-start gap-6 md:grid-cols-2">
        <FormField name="userRoleId">
          <FormItem>
            <FormLabel>{{ t('users.userRole', 1) }}</FormLabel>
            <Select
              :model-value="values.userRoleId == null ? undefined : String(values.userRoleId)"
              :disabled="!canManage"
              @update:model-value="setFieldValue('userRoleId', Number($event))"
            >
              <FormControl><SelectTrigger class="w-full" data-cy="user-role"><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem v-for="r in userRoles ?? []" :key="r.id" :value="String(r.id)">{{ r.name }}</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField name="listRoleId">
          <FormItem>
            <FormLabel>{{ t('users.listRole', 0) }}</FormLabel>
            <Select
              :model-value="values.listRoleId == null ? NONE : String(values.listRoleId)"
              :disabled="!canManage"
              @update:model-value="setFieldValue('listRoleId', $event === NONE ? null : Number($event))"
            >
              <FormControl><SelectTrigger class="w-full" data-cy="list-role"><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem :value="NONE">{{ t('globals.terms.none') }}</SelectItem>
                <SelectItem v-for="r in listRoles ?? []" :key="r.id" :value="String(r.id)">{{ r.name }}</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        </FormField>
      </div>
    </section>

    <div v-if="apiToken" class="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-4" data-cy="api-token">
      <p class="text-sm">{{ t('users.apiOneTimeToken') }}</p>
      <CopyText :text="apiToken" />
    </div>

    <!-- Enter in a field submits; the visible Save button is in the page header. -->
    <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true" />
  </form>
  <LeaveConfirm :open="leaveOpen" @decide="decide" />
</template>
