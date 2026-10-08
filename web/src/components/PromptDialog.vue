<script setup lang="ts">
import { Loader2 } from '@lucide/vue'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Asks for one line of text (e.g. the name of a clone). Emits it on submit. */
const props = defineProps<{
  title: string
  label: string
  /** Initial value, re-applied each time the dialog opens. */
  initial?: string
  confirmLabel?: string
  pending?: boolean
}>()
const emit = defineEmits<{ submit: [value: string] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const value = ref('')
watch(open, (o) => o && (value.value = props.initial ?? ''))

const submit = () => value.value.trim() && emit('submit', value.value.trim())
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <form class="space-y-4" @submit.prevent="submit">
        <DialogHeader>
          <DialogTitle>{{ title }}</DialogTitle>
          <DialogDescription class="sr-only">{{ title }}</DialogDescription>
        </DialogHeader>
        <div class="space-y-2">
          <Label for="prompt-value">{{ label }}</Label>
          <Input id="prompt-value" v-model="value" maxlength="200" autofocus />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">{{ t('globals.buttons.cancel') }}</Button>
          <Button type="submit" :disabled="!value.trim() || pending">
            <Loader2 v-if="pending" class="animate-spin" />
            {{ confirmLabel ?? t('web.common.confirm') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
