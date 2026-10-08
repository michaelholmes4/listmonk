<script setup lang="ts">
import { VisDonut, VisSingleContainer } from '@unovis/vue'
import { computed } from 'vue'

/** Share of each slice in the total; colours cycle through --chart-1..5. */
const props = defineProps<{ slices: { label: string; value: number }[] }>()

const colorOf = (i: number) => `var(--chart-${(i % 5) + 1})`
const total = computed(() => props.slices.reduce((a, s) => a + s.value, 0))
</script>

<template>
  <div class="relative aspect-square w-full max-w-40">
    <VisSingleContainer :data="slices" class="size-full">
      <VisDonut :value="(d: { value: number }) => d.value" :color="(_: unknown, i: number) => colorOf(i)" :arc-width="14" :pad-angle="0.02" />
    </VisSingleContainer>
    <span class="pointer-events-none absolute inset-0 grid place-items-center text-lg font-semibold tabular-nums">{{ total }}</span>
  </div>
</template>
