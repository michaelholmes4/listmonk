<script setup lang="ts">
import { Loader2 } from '@lucide/vue'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

const props = defineProps<{ pending: boolean; first: boolean; hasListTrigger: boolean }>()
const emit = defineEmits<{ confirm: [enrollExisting: boolean] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const enrollExisting = ref(false)
watch(open, (o) => o && (enrollExisting.value = false))
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t(props.first ? 'web.automations.publish.titleFirst' : 'web.automations.publish.title') }}</DialogTitle>
        <DialogDescription>{{ t(props.first ? 'web.automations.publish.helpFirst' : 'web.automations.publish.help') }}</DialogDescription>
      </DialogHeader>
      <div v-if="hasListTrigger" class="flex items-start gap-2">
        <Checkbox id="pub-existing" v-model="enrollExisting" class="mt-0.5" />
        <Label for="pub-existing" class="block font-normal">
          {{ t('web.automations.publish.enrollExisting') }}
          <span class="block text-xs text-muted-foreground">{{ t('web.automations.publish.enrollExistingHelp') }}</span>
        </Label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" @click="open = false">{{ t('web.common.cancel') }}</Button>
        <Button type="button" :disabled="pending" data-cy="confirm-publish" @click="emit('confirm', enrollExisting)">
          <Loader2 v-if="pending" class="animate-spin" />{{ t('web.automations.publish.action') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
