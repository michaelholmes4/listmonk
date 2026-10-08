<script setup lang="ts">
import { CurveType } from '@unovis/ts'
import { VisArea, VisAxis, VisLine, VisXYContainer } from '@unovis/vue'
import { format } from 'date-fns'
import { computed } from 'vue'
import { ChartContainer, ChartCrosshair, ChartTooltip, ChartTooltipContent, componentToString, type ChartConfig } from '@/components/ui/chart'
import { parseDay } from '@/lib/dates'

/** A single-series line/area chart over days: `[{ date: ISO string, count }]`. */
const props = defineProps<{ data: { date: string; count: number }[]; label: string }>()

type Point = { date: Date; count: number }
const points = computed<Point[]>(() => props.data.map((d) => ({ date: parseDay(d.date), count: d.count })))

// Colours come from the theme tokens via the chart config (no hardcoded colours).
const config = computed<ChartConfig>(() => ({ count: { label: props.label, color: 'var(--chart-1)' } }))

const x = (d: Point) => d.date.getTime()
const y = (d: Point) => d.count
const day = (v: number | Date) => format(v, 'dd MMM')
</script>

<template>
  <ChartContainer :config="config" class="aspect-auto h-56 w-full">
    <VisXYContainer :data="points" :margin="{ top: 8, right: 8 }" :y-domain="[0, undefined]">
      <!-- Linear segments: smoothing would overshoot and misstate daily counts. -->
      <VisArea :x="x" :y="y" :curve-type="CurveType.Linear" color="var(--color-count)" :opacity="0.12" />
      <VisLine :x="x" :y="y" :curve-type="CurveType.Linear" color="var(--color-count)" />
      <VisAxis type="x" :x="x" :num-ticks="6" :tick-format="day" :grid-line="false" :domain-line="false" />
      <VisAxis type="y" :num-ticks="4" :tick-format="(v: number) => (Number.isInteger(v) ? String(v) : '')" :domain-line="false" />
      <ChartTooltip />
      <ChartCrosshair
        color="var(--color-count)"
        :template="componentToString(config, ChartTooltipContent, { labelFormatter: day })"
      />
    </VisXYContainer>
  </ChartContainer>
</template>
