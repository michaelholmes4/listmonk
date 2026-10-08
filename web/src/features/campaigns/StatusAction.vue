<script setup lang="ts">
import { Clock, Pause, Play, Rocket } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { Campaign } from '@/api/types'
import { Button } from '@/components/ui/button'
import { usePermission } from '@/composables/usePermission'
import { canPause, canResume, canSchedule, canStart } from './status'

/** The one status transition that applies right now (start, schedule, pause or resume). */
const props = defineProps<{ campaign: Campaign }>()
const emit = defineEmits<{ start: []; schedule: []; pause: []; resume: [] }>()

const { t } = useI18n()
const { can } = usePermission()
</script>

<template>
  <template v-if="can('campaigns:send')">
    <Button v-if="canStart(props.campaign)" variant="outline" size="sm" @click="emit('start')">
      <Rocket />{{ t('campaigns.start') }}
    </Button>
    <Button v-else-if="canSchedule(props.campaign)" variant="outline" size="sm" @click="emit('schedule')">
      <Clock />{{ t('campaigns.schedule') }}
    </Button>
    <Button v-else-if="canPause(props.campaign)" variant="outline" size="sm" @click="emit('pause')">
      <Pause />{{ t('campaigns.pause') }}
    </Button>
    <Button v-else-if="canResume(props.campaign)" variant="outline" size="sm" @click="emit('resume')">
      <Play />{{ t('campaigns.send') }}
    </Button>
  </template>
</template>
