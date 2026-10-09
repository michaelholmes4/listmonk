<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { User } from '@/api/types'
import FormActions from '@/components/layout/FormActions.vue'
import FormSection from '@/components/layout/FormSection.vue'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useUpdateProfile } from '@/composables/queries/useProfile'
import { profileSchema, toForm, toRequest } from './schema'

const props = defineProps<{ user: User }>()

const { t } = useI18n()
const update = useUpdateProfile()

// Email can only be changed by people who sign in with a password.
const canEditEmail = computed(() => props.user.type !== 'api' && !!props.user.password_login)

const { handleSubmit, resetForm } = useForm({
  validationSchema: toTypedSchema(profileSchema(t, canEditEmail.value)),
  initialValues: toForm(props.user),
  // Email/password fields are not shown for every kind of user; keep their values for the schema.
  keepValuesOnUnmount: true,
})
watch(
  () => props.user,
  (u) => resetForm({ values: toForm(u) }),
)

const onSubmit = handleSubmit((v) =>
  update.mutate(toRequest(v), {
    onSuccess: (u) => toast.success(t('globals.messages.updated', { name: u.username })),
  }),
)
</script>

<template>
  <FormActions :pending="update.isPending.value" @save="onSubmit" />
  <form class="space-y-8" @submit.prevent="onSubmit">
    <FormSection :title="t('web.common.details')">
      <FormField v-if="user.type !== 'api'" v-slot="{ componentField }" name="email">
        <FormItem>
          <FormLabel>{{ t('subscribers.email') }}</FormLabel>
          <FormControl><Input v-bind="componentField" type="email" maxlength="200" :disabled="!canEditEmail" /></FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="name">
        <FormItem>
          <FormLabel>{{ t('globals.fields.name') }}</FormLabel>
          <FormControl><Input v-bind="componentField" maxlength="200" /></FormControl>
          <FormMessage />
        </FormItem>
      </FormField>
    </FormSection>

    <FormSection v-if="user.password_login" :title="t('users.password')" :description="t('web.profile.passwordHelp')">
      <div class="grid items-start gap-6 md:grid-cols-2">
        <FormField v-slot="{ componentField }" name="password">
          <FormItem>
            <FormLabel>{{ t('users.password') }}</FormLabel>
            <FormControl><Input v-bind="componentField" type="password" maxlength="200" autocomplete="new-password" /></FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
        <FormField v-slot="{ componentField }" name="password2">
          <FormItem>
            <FormLabel>{{ t('users.passwordRepeat') }}</FormLabel>
            <FormControl><Input v-bind="componentField" type="password" maxlength="200" autocomplete="new-password" /></FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
      </div>
    </FormSection>

    <!-- Enter in a field submits; the visible Save button is in the page header. -->
    <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true" />
  </form>
</template>
