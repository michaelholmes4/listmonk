<script setup lang="ts">
import { Download, MoreHorizontal, Pencil, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePermission } from '@/composables/usePermission'

defineProps<{ id: number }>()
const emit = defineEmits<{ edit: []; delete: [] }>()

const { t } = useI18n()
const { can } = usePermission()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-sm" :aria-label="t('web.common.actions')"><MoreHorizontal /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @select="emit('edit')">
        <Pencil />{{ can('subscribers:manage') ? t('globals.buttons.edit') : t('web.common.view') }}
      </DropdownMenuItem>
      <DropdownMenuItem as-child>
        <a :href="`/api/subscribers/${id}/export`"><Download />{{ t('subscribers.downloadData') }}</a>
      </DropdownMenuItem>
      <template v-if="can('subscribers:manage')">
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" @select="emit('delete')">
          <Trash2 />{{ t('globals.buttons.delete') }}
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
