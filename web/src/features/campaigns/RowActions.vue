<script setup lang="ts">
import { BarChart3, Ban, Clock, Copy, Eye, MoreHorizontal, Pause, Pencil, Play, Rocket, Trash2 } from '@lucide/vue'
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
import { canCancel, canPause, canResume, canSchedule, canStart } from './status'

/**
 * The row's "⋯" menu. The one status change that applies right now (start, schedule, pause or
 * resume) comes first, then the everyday actions, then the destructive ones.
 */
const props = defineProps<{ campaign: Campaign }>()
const emit = defineEmits<{
  edit: []
  preview: []
  clone: []
  start: []
  schedule: []
  pause: []
  resume: []
  cancel: []
  delete: []
}>()

const { t } = useI18n()
const { can } = usePermission()
const c = props.campaign
const send = can('campaigns:send')
const hasStatusAction = send && (canStart(c) || canSchedule(c) || canPause(c) || canResume(c))
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-sm" :aria-label="t('web.common.actions')"><MoreHorizontal /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="min-w-44">
      <template v-if="hasStatusAction">
        <DropdownMenuItem v-if="canStart(c)" data-cy="row-start" @select="emit('start')"><Rocket />{{ t('campaigns.start') }}</DropdownMenuItem>
        <DropdownMenuItem v-else-if="canSchedule(c)" data-cy="row-schedule" @select="emit('schedule')"><Clock />{{ t('campaigns.schedule') }}</DropdownMenuItem>
        <DropdownMenuItem v-else-if="canPause(c)" data-cy="row-pause" @select="emit('pause')"><Pause />{{ t('campaigns.pause') }}</DropdownMenuItem>
        <DropdownMenuItem v-else-if="canResume(c)" data-cy="row-resume" @select="emit('resume')"><Play />{{ t('campaigns.send') }}</DropdownMenuItem>
        <DropdownMenuSeparator />
      </template>
      <DropdownMenuItem @select="emit('edit')">
        <Pencil />{{ can('campaigns:manage') ? t('globals.buttons.edit') : t('web.common.view') }}
      </DropdownMenuItem>
      <DropdownMenuItem @select="emit('preview')"><Eye />{{ t('campaigns.preview') }}</DropdownMenuItem>
      <DropdownMenuItem v-if="can('campaigns:manage')" @select="emit('clone')">
        <Copy />{{ t('globals.buttons.clone') }}
      </DropdownMenuItem>
      <DropdownMenuItem v-if="can('campaigns:get_analytics')" as-child>
        <RouterLink :to="{ name: 'campaign-analytics', query: { id: c.id } }">
          <BarChart3 />{{ t('globals.terms.analytics') }}
        </RouterLink>
      </DropdownMenuItem>
      <template v-if="(send && canCancel(c)) || can('campaigns:manage')">
        <DropdownMenuSeparator />
        <DropdownMenuItem v-if="send && canCancel(c)" @select="emit('cancel')"><Ban />{{ t('globals.buttons.cancel') }}</DropdownMenuItem>
        <DropdownMenuItem v-if="can('campaigns:manage')" variant="destructive" @select="emit('delete')">
          <Trash2 />{{ t('globals.buttons.delete') }}
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
