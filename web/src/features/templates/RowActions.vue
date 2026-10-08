<script setup lang="ts">
import { CheckCircle2, Copy, Eye, MoreHorizontal, Pencil, Trash2 } from '@lucide/vue'
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

const props = defineProps<{ type: string; isDefault: boolean }>()
const emit = defineEmits<{ preview: []; edit: []; clone: []; makeDefault: []; delete: [] }>()

const { t } = useI18n()
const { can } = usePermission()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-sm" :aria-label="t('web.common.actions')"><MoreHorizontal /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @select="emit('preview')"><Eye />{{ t('templates.preview') }}</DropdownMenuItem>
      <DropdownMenuItem @select="emit('edit')">
        <Pencil />{{ can('templates:manage') ? t('globals.buttons.edit') : t('web.common.view') }}
      </DropdownMenuItem>
      <template v-if="can('templates:manage')">
        <DropdownMenuItem @select="emit('clone')"><Copy />{{ t('globals.buttons.clone') }}</DropdownMenuItem>
        <DropdownMenuItem v-if="!props.isDefault && props.type === 'campaign'" @select="emit('makeDefault')">
          <CheckCircle2 />{{ t('templates.makeDefault') }}
        </DropdownMenuItem>
        <template v-if="!props.isDefault">
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" @select="emit('delete')">
            <Trash2 />{{ t('globals.buttons.delete') }}
          </DropdownMenuItem>
        </template>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
