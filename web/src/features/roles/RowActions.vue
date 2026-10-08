<script setup lang="ts">
import { Copy, MoreHorizontal, Pencil, Trash2 } from '@lucide/vue'
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
import { SUPER_ADMIN_ROLE_ID } from './schema'

const props = defineProps<{ id: number }>()
const emit = defineEmits<{ edit: []; clone: []; delete: [] }>()

const { t } = useI18n()
const { can } = usePermission()
// The Super Admin role (1) is fixed: viewable and cloneable, never edited or deleted.
const fixed = () => props.id === SUPER_ADMIN_ROLE_ID
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-sm" :aria-label="t('web.common.actions')"><MoreHorizontal /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @select="emit('edit')">
        <Pencil />{{ can('roles:manage') && !fixed() ? t('globals.buttons.edit') : t('web.common.view') }}
      </DropdownMenuItem>
      <template v-if="can('roles:manage')">
        <DropdownMenuItem @select="emit('clone')"><Copy />{{ t('globals.buttons.clone') }}</DropdownMenuItem>
        <template v-if="!fixed()">
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" @select="emit('delete')"><Trash2 />{{ t('globals.buttons.delete') }}</DropdownMenuItem>
        </template>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
