<script setup lang="ts">
import { Loader2 } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAutomations, useEnrollSubscribers } from '@/composables/queries/useAutomations'

/** Enrolls subscribers by hand into a live automation that has the "manual" trigger. */
const props = defineProps<{ subscriberIds: number[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ done: [] }>()

const { t, n } = useI18n()
const { data, isPending } = useAutomations(
  { status: ['active'], manual: true, page: 1, perPage: 'all', orderBy: 'name', order: 'asc' },
  open,
)
const automations = computed(() => data.value?.results ?? [])
const { mutate, isPending: saving } = useEnrollSubscribers()

const picked = ref<string>()
watch(open, (o) => o && (picked.value = undefined))

function submit() {
  const a = automations.value.find((x) => String(x.id) === picked.value)
  if (!a) return
  const total = props.subscriberIds.length
  mutate(
    { id: a.id!, subscriberIds: props.subscriberIds },
    {
      onSuccess: (r) => {
        toast.success(t('web.automations.enroll.done', { n: n(r.enrolled), total: n(total), name: a.name }))
        open.value = false
        emit('done')
      },
    },
  )
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent data-cy="enroll-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('web.automations.enroll.title') }}</DialogTitle>
        <DialogDescription>
          {{ subscriberIds.length === 1 ? t('web.automations.enroll.one') : t('subscribers.numSelected', { num: n(subscriberIds.length) }) }}
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <Skeleton v-if="isPending" class="h-9 w-full" />
        <p v-else-if="!automations.length" class="text-sm text-muted-foreground" data-cy="enroll-none">
          {{ t('web.automations.enroll.none') }}
          <RouterLink :to="{ name: 'automations' }" class="link-style" @click="open = false">{{ t('web.automations.title') }}</RouterLink>
        </p>
        <div v-else class="space-y-2">
          <Label for="enroll-automation">{{ t('web.automations.enroll.automation') }}</Label>
          <Select v-model="picked">
            <SelectTrigger id="enroll-automation" class="w-full" data-cy="enroll-automation">
              <SelectValue :placeholder="t('web.automations.enroll.choose')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="a in automations" :key="a.id" :value="String(a.id)">{{ a.name }}</SelectItem>
            </SelectContent>
          </Select>
          <p class="text-xs text-muted-foreground">{{ t('web.automations.enroll.help') }}</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">{{ t('globals.buttons.close') }}</Button>
          <Button type="submit" :disabled="!picked || saving" data-cy="enroll-submit">
            <Loader2 v-if="saving" class="animate-spin" />
            {{ t('web.automations.enroll.submit') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
