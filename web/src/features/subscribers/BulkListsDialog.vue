<script setup lang="ts">
import { Loader2 } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { ListChange } from '@/api/subscribers'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useBulkChangeLists, type BulkTarget } from '@/composables/queries/useSubscribers'
import { useAllLists } from '@/composables/queries/useLists'
import ListPicker from '@/features/lists/ListPicker.vue'

const props = defineProps<{ target: BulkTarget; count: number }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { data: lists } = useAllLists()
const { mutate, isPending } = useBulkChangeLists()

const action = ref<ListChange['action']>('add')
const targetListIds = ref<number[]>([])
const preconfirm = ref(false)

const hasOptinList = computed(() =>
  (lists.value ?? []).some((l) => targetListIds.value.includes(l.id!) && l.optin === 'double'),
)

// Start clean each time the dialog opens.
watch(open, (o) => {
  if (!o) return
  action.value = 'add'
  targetListIds.value = []
  preconfirm.value = false
})

function submit() {
  mutate(
    { target: props.target, change: { action: action.value, targetListIds: targetListIds.value, preconfirm: preconfirm.value } },
    {
      onSuccess: () => {
        toast.success(t('subscribers.listChangeApplied'))
        open.value = false
      },
    },
  )
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('subscribers.manageLists') }}</DialogTitle>
        <DialogDescription>{{ t('subscribers.numSelected', { num: count }) }}</DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <RadioGroup v-model="action" class="flex flex-wrap gap-4">
          <div
            v-for="a in [
              { v: 'add', label: t('globals.buttons.add') },
              { v: 'remove', label: t('globals.buttons.remove') },
              { v: 'unsubscribe', label: t('subscribers.markUnsubscribed') },
            ]" :key="a.v" class="flex items-center gap-2"
          >
            <RadioGroupItem :id="`bulk-${a.v}`" :value="a.v" />
            <Label :for="`bulk-${a.v}`">{{ a.label }}</Label>
          </div>
        </RadioGroup>

        <ListPicker v-model="targetListIds" />

        <div class="flex items-start gap-2">
          <Checkbox id="bulk-preconfirm" v-model="preconfirm" :disabled="!hasOptinList" class="mt-0.5" />
          <div class="space-y-0.5">
            <Label for="bulk-preconfirm">{{ t('subscribers.preconfirm') }}</Label>
            <p class="text-xs text-muted-foreground">{{ t('subscribers.preconfirmHelp') }}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">{{ t('globals.buttons.close') }}</Button>
          <Button type="submit" :disabled="!targetListIds.length || isPending">
            <Loader2 v-if="isPending" class="animate-spin" />
            {{ t('globals.buttons.save') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
