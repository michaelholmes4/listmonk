<script setup lang="ts">
import { Braces, MoreHorizontal, Trash2 } from '@lucide/vue'
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

const emit = defineEmits<{ details: []; delete: [] }>()
const { t } = useI18n()
const { can } = usePermission()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-sm" :aria-label="t('web.common.actions')"><MoreHorizontal /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @select="emit('details')"><Braces />{{ t('web.bounces.details') }}</DropdownMenuItem>
      <template v-if="can('bounces:manage')">
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" @select="emit('delete')">
          <Trash2 />{{ t('globals.buttons.delete') }}
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
