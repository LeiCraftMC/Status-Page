<script setup lang="ts">
interface ChartPoint {
    date: string
    value: number | null
}

interface Props {
    points: ChartPoint[]
    /** Label shown in the tooltip, e.g. "ms" */
    unit?: string
}

const props = withDefaults(defineProps<Props>(), {
    unit: 'ms'
})

// Fixed viewBox: stretched to container width, strokes stay crisp via
// vector-effect="non-scaling-stroke"
const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 220
const PADDING = 8

const maxValue = computed(() => {
    const values = props.points.map((p) => p.value).filter((v): v is number => v != null)
    if (values.length === 0) return 100
    return Math.max(100, ...values)
})

function x(index: number): number {
    if (props.points.length <= 1) return PADDING
    return PADDING + (index / (props.points.length - 1)) * (VIEW_WIDTH - PADDING * 2)
}

function y(value: number): number {
    const clamped = Math.min(value, maxValue.value)
    return VIEW_HEIGHT - PADDING - (clamped / maxValue.value) * (VIEW_HEIGHT - PADDING * 2)
}

/** Path segments, broken where a day has no data (null) */
const segments = computed<{ path: string; startX: number; endX: number }[]>(() => {
    const segs: { points: { x: number; y: number }[] }[] = []
    let current: { x: number; y: number }[] = []

    props.points.forEach((point, index) => {
        if (point.value == null) {
            if (current.length > 0) segs.push({ points: current })
            current = []
            return
        }
        current.push({ x: x(index), y: y(point.value) })
    })

    if (current.length > 0) segs.push({ points: current })

    return segs.map(({ points }) => ({
        path: points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
        startX: points[0].x,
        endX: points[points.length - 1].x
    }))
})

const areaPaths = computed(() => {
    const baseline = VIEW_HEIGHT - PADDING
    return segments.value.map((segment) => (
        `${segment.path} L${segment.endX.toFixed(1)},${baseline} L${segment.startX.toFixed(1)},${baseline} Z`
    ))
})

const gridLines = computed(() => {
    return [0.25, 0.5, 0.75].map((ratio) => PADDING + ratio * (VIEW_HEIGHT - PADDING * 2))
})

function formatDateLabel(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    })
}

function formatValue(value: number | null): string {
    if (value == null) return 'No data'
    return `${Math.round(value)} ${props.unit}`
}

const firstDate = computed(() => props.points[0]?.date)
const lastDate = computed(() => props.points[props.points.length - 1]?.date)
</script>

<template>
    <div>
        <div class="flex items-end justify-between text-xs text-slate-500 mb-1">
            <span>{{ formatValue(maxValue === 100 ? null : maxValue) }}</span>
            <span>0 {{ unit }}</span>
        </div>

        <div class="relative">
            <svg
                :viewBox="`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`"
                preserveAspectRatio="none"
                class="w-full h-48 block"
                role="img"
                aria-label="Response time chart"
            >
                <defs>
                    <linearGradient id="response-time-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="rgb(56 189 248 / 0.25)" />
                        <stop offset="100%" stop-color="rgb(56 189 248 / 0)" />
                    </linearGradient>
                </defs>

                <line
                    v-for="(line, i) in gridLines"
                    :key="i"
                    x1="0"
                    :y1="line"
                    :x2="VIEW_WIDTH"
                    :y2="line"
                    stroke="rgb(30 41 59)"
                    stroke-width="1"
                    stroke-dasharray="4 4"
                    vector-effect="non-scaling-stroke"
                />

                <path
                    v-for="(area, i) in areaPaths"
                    :key="`area-${i}`"
                    :d="area"
                    fill="url(#response-time-fill)"
                    stroke="none"
                />

                <path
                    v-for="(segment, i) in segments"
                    :key="i"
                    :d="segment.path"
                    fill="none"
                    stroke="rgb(56 189 248)"
                    stroke-width="2"
                    stroke-linejoin="round"
                    stroke-linecap="round"
                    vector-effect="non-scaling-stroke"
                />
            </svg>

            <!-- Hover columns: one per point, stacked over the SVG -->
            <div class="absolute inset-0 flex">
                <UTooltip
                    v-for="(point, index) in points"
                    :key="point.date"
                    :popper="{ placement: 'top' }"
                    class="flex-1 h-full group"
                >
                    <template #content>
                        <div class="text-xs">
                            <p class="font-medium">{{ formatDateLabel(point.date) }}</p>
                            <p>{{ formatValue(point.value) }}</p>
                        </div>
                    </template>

                    <div
                        class="w-full h-full transition-colors group-hover:bg-slate-500/10"
                        :class="{ 'rounded-b-[1px]': index === 0 || index === points.length - 1 }"
                    />
                </UTooltip>
            </div>
        </div>

        <div class="flex items-center justify-between text-xs text-slate-500 mt-1">
            <span v-if="firstDate">{{ formatDateLabel(firstDate) }}</span>
            <span v-if="lastDate && points.length > 1">{{ formatDateLabel(lastDate) }}</span>
        </div>
    </div>
</template>