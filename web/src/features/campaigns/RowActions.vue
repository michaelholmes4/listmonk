<script setup lang="ts">
import { BarChart3, Ban, Copy, Eye, MoreHorizontal, Pencil, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { Campaign } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePermission } from '@/composables/usePermission'
import { canCancel } from './status'

const props = defineProps<{ campaign: Campaign }>()
const emit = defineEmits<{ edit: []; preview: []; clone: []; cancel: []; delete: [] }>()

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
        <Pencil />{{ can('campaigns:manage') ? t('globals.buttons.edit') : t('web.common.view') }}
      </DropdownMenuItem>
      <DropdownMenuItem @select="emit('preview')"><Eye />{{ t('campaigns.preview') }}</DropdownMenuItem>
      <DropdownMenuItem v-if="can('campaigns:manage')" @select="emit('clone')">
        <Copy />{{ t('globals.buttons.clone') }}
      </DropdownMenuItem>
      <DropdownMenuItem v-if="can('campaigns:get_analytics')" as-child>
        <RouterLink :to="{ name: 'campaign-analytics', query: { id: props.campaign.id } }">
          <BarChart3 />{{ t('globals.terms.analytics') }}
        </RouterLink>
      </DropdownMenuItem>
      <template v-if="can('campaigns:send') && canCancel(props.campaign)">
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="emit('cancel')"><Ban />{{ t('globals.buttons.cancel') }}</DropdownMenuItem>
      </template>
      <template v-if="can('campaigns:manage')">
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" @select="emit('delete')">
          <Trash2 />{{ t('globals.buttons.delete') }}
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
