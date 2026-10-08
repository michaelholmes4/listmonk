<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AddStep from './AddStep.vue'

import { endsList, type Step } from './model'
import StepCard from './StepCard.vue'

/**
 * A vertical run of steps with a "+" before each and at the end. A condition shows its two
 * branches side by side, each another StepList.
 */
defineProps<{ steps: Step[] }>()
const { t } = useI18n()

</script>

<template>
  <div class="flex w-full flex-col items-center">
    <template v-for="(s, i) in steps" :key="s.id">
      <div class="flex flex-col items-center">
        <div class="h-3 w-px bg-border" />
        <AddStep :list="steps" :index="i" />
        <div class="h-3 w-px bg-border" />
      </div>
      <StepCard :step="s" :first="i === 0" :last="i === steps.length - 1 || endsList(steps[i + 1])" />

      <div v-if="s.type === 'condition'" class="w-full">
        <div class="mx-auto h-3 w-px bg-border" />
        <div class="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2">
          <section v-for="h in ['yes', 'no'] as const" :key="h" class="rounded-lg border border-dashed p-3" :data-cy="`branch-${s.id}-${h}`">
            <h3 class="text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {{ t(`web.automations.branch.${h}`) }}
            </h3>
            <StepList :steps="s[h] ?? []" />
          </section>
        </div>
      </div>
    </template>

    <!-- The end of this list: where the next step goes, unless it ended with a condition or an exit. -->
    <template v-if="!endsList(steps[steps.length - 1])">
      <div class="flex flex-col items-center">
        <div class="h-3 w-px bg-border" />
        <AddStep :list="steps" :index="steps.length" />
      </div>
    </template>
    <p v-else-if="steps[steps.length - 1]?.type === 'exit'" class="mt-3 text-xs text-muted-foreground">{{ t('web.automations.ends') }}</p>
  </div>
</template>
