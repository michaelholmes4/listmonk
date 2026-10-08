<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { Loader2, Mail } from '@lucide/vue'
import { format } from 'date-fns'
import { useForm } from 'vee-validate'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import CopyText from '@/components/CopyText.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAllLists } from '@/composables/queries/useLists'
import {
  useCreateSubscriber,
  useDeleteSubscriberBounces,
  useSendOptin,
  useSubscriber,
  useSubscriberBounces,
  useUpdateSubscriber,
} from '@/composables/queries/useSubscribers'
import { usePermission } from '@/composables/usePermission'
import ListPicker from '@/features/lists/ListPicker.vue'
import SubscriberActivity from './SubscriberActivity.vue'
import { emptySubscriber, parseAttribs, subscriberSchema, toForm } from './schema'

/** `id` undefined = creating a new subscriber. The parent decides when the sheet is mounted open. */
const props = defineProps<{ id?: number }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { can } = usePermission()
const canManage = computed(() => can('subscribers:manage'))

const isEditing = computed(() => props.id !== undefined)
const tab = ref('lists')

const { data: subscriber, isPending: loadingSub } = useSubscriber(() => props.id)
const { data: lists } = useAllLists()
const { data: bounces } = useSubscriberBounces(
  () => props.id,
  () => open.value && can('bounces:get'),
)

const create = useCreateSubscriber()
const update = useUpdateSubscriber()
const optin = useSendOptin()
const deleteBounces = useDeleteSubscriberBounces()
const saving = computed(() => create.isPending.value || update.isPending.value)

const { handleSubmit, resetForm, values, setFieldValue } = useForm({
  validationSchema: toTypedSchema(subscriberSchema(t)),
  initialValues: emptySubscriber(),
})

// (Re)fill the form whenever the sheet opens for a different subscriber or fresh data arrives.
watch(
  [open, () => props.id, subscriber],
  () => {
    if (!open.value) return
    tab.value = 'lists'
    if (!isEditing.value) resetForm({ values: emptySubscriber() })
    else if (subscriber.value) resetForm({ values: toForm(subscriber.value) })
  },
  { immediate: true },
)

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
    toast.success(t(`globals.messages.${key}`, { name: name ?? v.email }))
    open.value = false
  }
  if (props.id === undefined) create.mutate(body, { onSuccess: (s) => done(s.name) })
  else update.mutate({ id: props.id, body }, { onSuccess: (s) => done(s.name, 'updated') })
})

const sendOptin = () =>
  optin.mutate(props.id!, { onSuccess: () => toast.success(t('subscribers.sentOptinConfirm')) })

const confirmBounces = ref(false)
const removeBounces = () =>
  deleteBounces.mutate(props.id!, {
    onSuccess: () => {
      confirmBounces.value = false
      toast.success(t('globals.messages.deleted', { name: subscriber.value?.name ?? '' }))
    },
  })

const when = (iso?: string | null) => (iso ? format(new Date(iso), 'PP p') : '')
const statusVariant = (s?: string) => (s === 'blocklisted' ? 'destructive' : s === 'unsubscribed' ? 'warning' : 'success')
const showSkeleton = computed(() => isEditing.value && loadingSub.value)
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent class="w-full gap-0 sm:max-w-2xl">
      <SheetHeader class="border-b">
        <SheetTitle class="flex items-center gap-2">
          {{ isEditing ? (subscriber?.name || subscriber?.email || '…') : t('subscribers.newSubscriber') }}
          <Badge v-if="subscriber" :variant="statusVariant(subscriber.status)">
            {{ t(`subscribers.status.${subscriber.status}`) }}
          </Badge>
        </SheetTitle>
        <SheetDescription v-if="subscriber" class="flex flex-wrap gap-x-4 text-xs">
          <span>{{ t('globals.fields.id') }}: <CopyText :text="String(subscriber.id)" /></span>
          <span>{{ t('globals.fields.uuid') }}: <CopyText :text="subscriber.uuid ?? ''" /></span>
        </SheetDescription>
        <SheetDescription v-else class="sr-only">{{ t('subscribers.newSubscriber') }}</SheetDescription>
      </SheetHeader>

      <form class="flex min-h-0 flex-1 flex-col" @submit.prevent="onSubmit">
        <div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <div v-if="showSkeleton" class="space-y-4">
            <Skeleton class="h-9 w-full" />
            <Skeleton class="h-9 w-full" />
            <Skeleton class="h-40 w-full" />
          </div>
          <template v-else>
            <FormField v-slot="{ componentField }" name="email">
              <FormItem>
                <FormLabel>{{ t('subscribers.email') }}</FormLabel>
                <FormControl><Input v-bind="componentField" maxlength="200" :disabled="!canManage" autofocus /></FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <div class="grid gap-4 sm:grid-cols-[1fr_12rem]">
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
                </FormItem>
              </FormField>
            </div>
            <p v-if="values.status === 'blocklisted'" class="-mt-3 text-xs text-muted-foreground">
              {{ t('subscribers.blocklistedHelp') }}
            </p>

            <Tabs v-model="tab">
              <TabsList>
                <TabsTrigger value="lists">{{ t('globals.terms.lists') }}</TabsTrigger>
                <TabsTrigger value="subscriptions" :disabled="!subscriber?.lists?.length">
                  {{ t('globals.terms.subscriptions', 2) }} ({{ subscriber?.lists?.length ?? 0 }})
                </TabsTrigger>
                <TabsTrigger v-if="can('bounces:get')" value="bounces" :disabled="!bounces?.length">
                  {{ t('globals.terms.bounces') }} ({{ bounces?.length ?? 0 }})
                </TabsTrigger>
                <TabsTrigger value="activity" :disabled="!isEditing">{{ t('subscribers.activity') }}</TabsTrigger>
              </TabsList>

              <TabsContent value="lists" class="space-y-3 pt-3">
                <ListPicker
                  :model-value="values.lists ?? []"
                  :disabled="!canManage"
                  @update:model-value="setFieldValue('lists', $event)"
                />
                <p class="text-xs text-muted-foreground">{{ t('subscribers.listsHelp') }}</p>
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
              </TabsContent>

              <TabsContent value="subscriptions" class="pt-3">
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
                          <div
                            v-if="l.optin === 'double' && l.subscription_meta?.optin_ip"
                            class="mt-0.5 text-xs text-muted-foreground"
                          >
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

              <TabsContent v-if="can('bounces:get')" value="bounces" class="space-y-2 pt-3">
                <div v-if="can('bounces:manage')" class="flex justify-end">
                  <Button type="button" variant="outline" size="sm" @click="confirmBounces = true">
                    {{ t('globals.buttons.delete') }}
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

              <TabsContent value="activity" class="pt-3">
                <SubscriberActivity v-if="props.id !== undefined && tab === 'activity'" :subscriber-id="props.id" />
              </TabsContent>
            </Tabs>

            <FormField v-slot="{ componentField }" name="attribs">
              <FormItem>
                <FormLabel>{{ t('globals.terms.attribs') }}</FormLabel>
                <FormControl>
                  <Textarea v-bind="componentField" class="font-mono text-xs" rows="6" :disabled="!canManage" />
                </FormControl>
                <p class="text-xs text-muted-foreground">
                  {{ t('subscribers.attribsHelp') }}
                  <code>{"job": "developer", "has_rocket": true}</code>
                </p>
                <FormMessage />
              </FormItem>
            </FormField>
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

      <ConfirmDialog
        v-model:open="confirmBounces"
        destructive
        :title="t('globals.messages.confirm')"
        :confirm-label="t('globals.buttons.delete')"
        :pending="deleteBounces.isPending.value"
        @confirm="removeBounces"
      />
    </SheetContent>
  </Sheet>
</template>
