<script setup lang="ts">
import { CurveType } from '@unovis/ts'
import { VisAxis, VisLine, VisXYContainer } from '@unovis/vue'
import { format } from 'date-fns'
import { computed } from 'vue'
import { ChartContainer, ChartCrosshair, ChartTooltip, ChartTooltipContent, componentToString, type ChartConfig } from '@/components/ui/chart'

/**
 * Several time series on one chart. Each series is `{ label, points: [{ at: ISO timestamp, count }] }`;
 * they are merged by timestamp so one crosshair can show every series at that moment.
 * Series colours cycle through the theme's --chart-1..5 tokens.
 */
export interface Series {
  label: string
  points: { at: string; count: number }[]
}
const props = defineProps<{ series: Series[] }>()

const key = (i: number) => `s${i}`
const colorOf = (i: number) => `var(--chart-${(i % 5) + 1})`

type Row = { x: number } & Record<string, number>
const rows = computed<Row[]>(() => {
  const byTime = new Map<number, Row>()
  props.series.forEach((s, i) => {
    for (const p of s.points) {
      const x = new Date(p.at).getTime()
      const row = byTime.get(x) ?? ({ x } as Row)
      row[key(i)] = p.count
      byTime.set(x, row)
    }
  })
  // A series with no point at a time has zero events then.
  return [...byTime.values()]
    .sort((a, b) => a.x - b.x)
    .map((r) => {
      props.series.forEach((_, i) => (r[key(i)] ??= 0))
      return r
    })
})

const config = computed<ChartConfig>(() => Object.fromEntries(props.series.map((s, i) => [key(i), { label: s.label, color: colorOf(i) }])))
const xs = (d: Row) => d.x
const ys = computed(() => props.series.map((_, i) => (d: Row) => d[key(i)]))
const colors = computed(() => props.series.map((_, i) => colorOf(i)))
const stamp = (v: number | Date) => format(v, 'dd MMM HH:mm')
</script>

<template>
  <ChartContainer :config="config" class="aspect-auto h-60 w-full">
    <VisXYContainer :data="rows" :margin="{ top: 8, right: 8 }" :y-domain="[0, undefined]">
      <VisLine :x="xs" :y="ys" :color="colors" :curve-type="CurveType.Linear" />
      <VisAxis type="x" :x="xs" :num-ticks="6" :tick-format="stamp" :grid-line="false" :domain-line="false" />
      <VisAxis type="y" :num-ticks="4" :tick-format="(v: number) => (Number.isInteger(v) ? String(v) : '')" :domain-line="false" />
      <ChartTooltip />
      <ChartCrosshair :x="xs" :y="ys" :color="colors" :template="componentToString(config, ChartTooltipContent, { labelFormatter: stamp })" />
    </VisXYContainer>
  </ChartContainer>
</template>
