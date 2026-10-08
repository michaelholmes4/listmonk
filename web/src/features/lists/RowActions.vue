<script setup lang="ts">
import { FileUp, MoreHorizontal, Pencil, Rocket, Trash2 } from '@lucide/vue'
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

const props = defineProps<{ id: number }>()
const emit = defineEmits<{ edit: []; delete: [] }>()

const { t } = useI18n()
const { can, canList } = usePermission()
const manage = () => canList(props.id, 'list:manage')
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-sm" :aria-label="t('web.common.actions')"><MoreHorizontal /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @select="emit('edit')">
        <Pencil />{{ manage() ? t('globals.buttons.edit') : t('web.common.view') }}
      </DropdownMenuItem>
      <DropdownMenuItem v-if="can('campaigns:manage')" as-child>
        <RouterLink :to="{ name: 'campaign-new', query: { list_id: id } }"><Rocket />{{ t('lists.sendCampaign') }}</RouterLink>
      </DropdownMenuItem>
      <DropdownMenuItem v-if="can('subscribers:import')" as-child>
        <RouterLink :to="{ name: 'import', query: { list_id: id } }"><FileUp />{{ t('import.title') }}</RouterLink>
      </DropdownMenuItem>
      <template v-if="manage()">
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" @select="emit('delete')">
          <Trash2 />{{ t('globals.buttons.delete') }}
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
