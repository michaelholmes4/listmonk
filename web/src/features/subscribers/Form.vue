<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { Loader2, Mail, Trash2 } from '@lucide/vue'
import { format } from 'date-fns'
import { useForm } from 'vee-validate'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FormActions from '@/components/layout/FormActions.vue'
import FormSection from '@/components/layout/FormSection.vue'
import LeaveConfirm from '@/components/LeaveConfirm.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAllLists } from '@/composables/queries/useLists'
import {
  useCreateSubscriber,
  useDeleteSubscriberBounces,
  useSendOptin,
  useSubscriberBounces,
  useUpdateSubscriber,
} from '@/composables/queries/useSubscribers'
import { useGoBack } from '@/composables/useGoBack'
import { usePermission } from '@/composables/usePermission'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import ListPicker from '@/features/lists/ListPicker.vue'
import SubscriberActivity from './SubscriberActivity.vue'
import SubscriberMessages from './SubscriberMessages.vue'
import SubscriberAutomations from './SubscriberAutomations.vue'
import { subscriberStatusVariant as statusVariant } from './columns'
import { emptySubscriber, parseAttribs, subscriberSchema, toForm } from './schema'
import type { Subscriber } from '@/api/types'

/** Create (no `subscriber`) or edit. Leaves the page on success or cancel. */
const props = defineProps<{ subscriber?: Subscriber }>()

const { t } = useI18n()
const { can } = usePermission()
const canManage = computed(() => can('subscribers:manage'))

const goBack = useGoBack({ name: 'subscribers' })
const isEditing = computed(() => !!props.subscriber)
const subscriberId = computed(() => props.subscriber?.id)
// The profile (the form) is the first tab; the others are read-only views of the subscriber.
const tab = ref('profile')

const { data: lists } = useAllLists()
const { data: bounces } = useSubscriberBounces(subscriberId, () => can('bounces:get'))

const create = useCreateSubscriber()
const update = useUpdateSubscriber()
const optin = useSendOptin()
const deleteBounces = useDeleteSubscriberBounces()
const saving = computed(() => create.isPending.value || update.isPending.value)

const { handleSubmit, resetForm, values, setFieldValue, meta } = useForm({
  validationSchema: toTypedSchema(subscriberSchema(t)),
  initialValues: props.subscriber ? toForm(props.subscriber) : emptySubscriber(),
})

// Fresh data (e.g. after saving from another tab) replaces the form.
watch(
  () => props.subscriber,
  (s) => s && resetForm({ values: toForm(s) }),
)

const dirty = computed(() => canManage.value && meta.value.dirty)
const { leaveOpen, decide } = useUnsavedGuard(dirty, saving)

const hasOptinList = computed(() =>
  (lists.value ?? []).some((l) => values.lists?.includes(l.id!) && l.optin === 'double'),
)

const onSubmit = handleSubmit((v) => {
  const body = {
    email: v.email,
    name: v.name,
    status: v.status,
    lists: v.lists,
    preconfirm_subscriptions: v.preconfirm,
    attribs: parseAttribs(v.attribs) ?? {},
  }
  const done = (name?: string, key: 'created' | 'updated' = 'created') => {
    toast.success(t(`globals.messages.${key}`, { name: name || v.email }))
    resetForm({ values: { ...values } })
    goBack()
  }
  if (!props.subscriber) create.mutate(body, { onSuccess: (s) => done(s.name) })
  else update.mutate({ id: props.subscriber.id!, body }, { onSuccess: (s) => done(s.name, 'updated') })
})

const sendOptin = () =>
  optin.mutate(subscriberId.value!, { onSuccess: () => toast.success(t('subscribers.sentOptinConfirm')) })

const confirmBounces = ref(false)
const removeBounces = () =>
  deleteBounces.mutate(subscriberId.value!, {
    onSuccess: () => {
      confirmBounces.value = false
      toast.success(t('globals.messages.deleted', { name: props.subscriber?.name ?? '' }))
    },
  })

const when = (iso?: string | null) => (iso ? format(new Date(iso), 'PP p') : '')
</script>

<template>
  <FormActions :pending="saving" :dirty="isEditing ? dirty : undefined" :can-save="canManage" :on-cancel="goBack" @save="onSubmit" />

  <Tabs v-model="tab">
    <TabsList v-if="isEditing" class="mb-6">
      <TabsTrigger value="profile">{{ t('web.subscribers.profile') }}</TabsTrigger>
      <TabsTrigger value="subscriptions" :disabled="!subscriber?.lists?.length">
        {{ t('globals.terms.subscriptions', 2) }} ({{ subscriber?.lists?.length ?? 0 }})
      </TabsTrigger>
      <TabsTrigger v-if="can('bounces:get')" value="bounces" :disabled="!bounces?.length">
        {{ t('globals.terms.bounces') }} ({{ bounces?.length ?? 0 }})
      </TabsTrigger>
      <TabsTrigger value="activity">{{ t('subscribers.activity') }}</TabsTrigger>
      <TabsTrigger v-if="can('automations:get')" value="automations">{{ t('web.automations.title') }}</TabsTrigger>
      <TabsTrigger v-if="can('message_log:get')" value="messages">{{ t('web.messages.tab') }}</TabsTrigger>
    </TabsList>

    <!-- Profile: the only editable part, saved with the header's Save. -->
    <TabsContent value="profile" force-mount class="data-[state=inactive]:hidden">
      <form class="space-y-8" novalidate @submit.prevent="onSubmit">
        <FormSection :title="t('web.common.details')">
          <FormField v-slot="{ componentField }" name="email">
            <FormItem>
              <FormLabel>{{ t('subscribers.email') }}</FormLabel>
              <FormControl><Input v-bind="componentField" type="email" maxlength="200" :disabled="!canManage" autofocus /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <div class="grid items-start gap-6 md:grid-cols-2">
            <FormField v-slot="{ componentField }" name="name">
              <FormItem>
                <FormLabel>{{ t('globals.fields.name') }}</FormLabel>
                <FormControl><Input v-bind="componentField" maxlength="200" :disabled="!canManage" /></FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="status">
              <FormItem>
                <FormLabel>{{ t('globals.fields.status') }}</FormLabel>
                <Select v-bind="componentField" :disabled="!canManage">
                  <FormControl><SelectTrigger class="w-full"><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="enabled">{{ t('subscribers.status.enabled') }}</SelectItem>
                    <SelectItem value="blocklisted">{{ t('subscribers.status.blocklisted') }}</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>{{ t('subscribers.blocklistedHelp') }}</FormDescription>
              </FormItem>
            </FormField>
          </div>
        </FormSection>

        <FormSection :title="t('globals.terms.lists')" :description="t('subscribers.listsHelp')">
          <ListPicker
            :model-value="values.lists ?? []"
            :disabled="!canManage"
            :placeholder="t('subscribers.listsPlaceholder')"
            @update:model-value="setFieldValue('lists', $event)"
          />
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex items-start gap-2">
              <Checkbox
                id="sub-preconfirm"
                :model-value="values.preconfirm"
                :disabled="!hasOptinList || !canManage"
                class="mt-0.5"
                @update:model-value="setFieldValue('preconfirm', $event === true)"
              />
              <div class="space-y-0.5">
                <Label for="sub-preconfirm">{{ t('subscribers.preconfirm') }}</Label>
                <p class="text-xs text-muted-foreground">{{ t('subscribers.preconfirmHelp') }}</p>
              </div>
            </div>
            <Button
              v-if="isEditing && canManage"
              type="button"
              variant="outline"
              size="sm"
              :disabled="!hasOptinList || optin.isPending.value"
              @click="sendOptin"
            >
              <Loader2 v-if="optin.isPending.value" class="animate-spin" />
              <Mail v-else />
              {{ t('subscribers.sendOptinConfirm') }}
            </Button>
          </div>
        </FormSection>

        <FormSection :title="t('globals.terms.attribs')">
          <FormField v-slot="{ componentField }" name="attribs">
            <FormItem>
              <FormControl>
                <Textarea v-bind="componentField" class="font-mono text-xs" rows="6" :disabled="!canManage" :aria-label="t('globals.terms.attribs')" />
              </FormControl>
              <p class="text-xs text-muted-foreground">
                {{ t('subscribers.attribsHelp') }}
                <code>{"job": "developer", "has_rocket": true}</code>
              </p>
              <FormMessage />
            </FormItem>
          </FormField>
        </FormSection>
        <!-- Enter in a field submits; the visible Save button is in the page header. -->
        <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true" />
      </form>
    </TabsContent>

    <TabsContent value="subscriptions">
      <div class="box overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ t('globals.terms.list', 1) }}</TableHead>
              <TableHead>{{ t('globals.fields.status') }}</TableHead>
              <TableHead>{{ t('globals.fields.createdAt') }}</TableHead>
              <TableHead>{{ t('globals.fields.updatedAt') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="l in subscriber?.lists" :key="l.id">
              <TableCell>
                <RouterLink :to="{ name: 'subscribers-list', params: { listID: l.id } }" class="font-medium hover:underline">
                  {{ l.name }}
                </RouterLink>
                <div class="text-xs text-muted-foreground">{{ t(`lists.optins.${l.optin}`) }}</div>
              </TableCell>
              <TableCell>
                <Badge :variant="statusVariant(l.subscription_status)">
                  {{ t(`subscribers.status.${l.subscription_status}`) }}
                </Badge>
                <div v-if="l.optin === 'double' && l.subscription_meta?.optin_ip" class="mt-0.5 text-xs text-muted-foreground">
                  {{ l.subscription_meta.optin_ip }}
                </div>
              </TableCell>
              <TableCell class="whitespace-nowrap">{{ when(l.subscription_created_at) }}</TableCell>
              <TableCell class="whitespace-nowrap">{{ when(l.subscription_updated_at) }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </TabsContent>

    <TabsContent v-if="can('bounces:get')" value="bounces" class="space-y-3">
      <div v-if="can('bounces:manage')" class="flex justify-end">
        <Button type="button" variant="outline" size="sm" class="text-destructive" @click="confirmBounces = true">
          <Trash2 />{{ t('globals.buttons.delete') }}
        </Button>
      </div>
      <div class="box overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ t('globals.terms.campaign', 1) }}</TableHead>
              <TableHead>{{ t('globals.fields.createdAt') }}</TableHead>
              <TableHead>{{ t('globals.fields.type') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="b in bounces" :key="b.id">
              <TableCell>{{ b.campaign?.name }}</TableCell>
              <TableCell class="whitespace-nowrap">{{ when(b.created_at) }}</TableCell>
              <TableCell>
                <details>
                  <summary class="cursor-pointer">{{ b.source }}</summary>
                  <pre class="mt-1 max-w-64 overflow-auto text-xs">{{ JSON.stringify(b.meta, null, 2) }}</pre>
                </details>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </TabsContent>

    <TabsContent value="activity">
      <SubscriberActivity v-if="subscriberId !== undefined && tab === 'activity'" :subscriber-id="subscriberId" />
    </TabsContent>

    <TabsContent v-if="can('automations:get')" value="automations">
      <SubscriberAutomations v-if="subscriberId !== undefined && tab === 'automations'" :subscriber-id="subscriberId" />
    </TabsContent>

    <TabsContent v-if="can('message_log:get')" value="messages">
      <SubscriberMessages v-if="subscriberId !== undefined && tab === 'messages'" :subscriber-id="subscriberId" />
    </TabsContent>
  </Tabs>

  <ConfirmDialog
    v-model:open="confirmBounces"
    destructive
    :title="t('globals.messages.confirm')"
    :confirm-label="t('globals.buttons.delete')"
    :pending="deleteBounces.isPending.value"
    @confirm="removeBounces"
  />
  <LeaveConfirm :open="leaveOpen" @decide="decide" />
</template>
