<script setup lang="ts">
import { Archive, MoreHorizontal, Pause, Pencil, Play, Trash2 } from '@lucide/vue'
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
import { canArchive, canDelete, canPause, canResume } from './status'

const props = defineProps<{ status: string }>()
const emit = defineEmits<{ edit: []; pause: []; resume: []; archive: []; delete: [] }>()

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
        <Pencil />{{ can('automations:manage') ? t('globals.buttons.edit') : t('web.common.view') }}
      </DropdownMenuItem>
      <template v-if="can('automations:manage')">
        <DropdownMenuItem v-if="canPause(props.status)" @select="emit('pause')">
          <Pause />{{ t('web.automations.pause') }}
        </DropdownMenuItem>
        <DropdownMenuItem v-if="canResume(props.status)" @select="emit('resume')">
          <Play />{{ t('web.automations.resume') }}
        </DropdownMenuItem>
        <DropdownMenuItem v-if="canArchive(props.status)" @select="emit('archive')">
          <Archive />{{ t('web.automations.archive') }}
        </DropdownMenuItem>
        <template v-if="canDelete(props.status)">
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" @select="emit('delete')">
            <Trash2 />{{ t('globals.buttons.delete') }}
          </DropdownMenuItem>
        </template>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
