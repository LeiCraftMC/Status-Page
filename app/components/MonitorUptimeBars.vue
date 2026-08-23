<script setup lang="ts">
import type {
    GetPublicStatusPageHistoryResponses,
    GetStatusPageHistoryResponses
} from '@/api-client/types.gen'

type PublicHistory = GetPublicStatusPageHistoryResponses[200]['data']['monitors'][number]
type AuthHistory = GetStatusPageHistoryResponses[200]['data']['monitors'][number]
type MonitorHistory = PublicHistory | AuthHistory

interface Props {
    history: MonitorHistory
}

defineProps<Props>()

function statusColorClass(status: MonitorHistory['buckets'][number]['status']): string {
    switch (status) {
        case 'up':
            return 'bg-emerald-500 hover:bg-emerald-400'
        case 'down':
            return 'bg-red-500 hover:bg-red-400'
        case 'degraded':
            return 'bg-amber-500 hover:bg-amber-400'
        case 'unknown':
        default:
            return 'bg-slate-600 hover:bg-slate-500'
    }
}

function formatDateLabel(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    })
}

function formatUptime(uptime: number): string {
    return uptime.toFixed(2) + '%'
}
</script>

<template>
    <div class="flex items-center gap-3 w-full min-w-0">
        <span class="text-xs text-slate-400 shrink-0 w-14 text-right">
            {{ formatUptime(history.uptime_percentage) }}
        </span>

        <div class="flex-1 flex items-center min-w-0 h-6 overflow-x-auto scrollbar-hide">
            <div class="flex items-center gap-[2px] min-w-full h-full">
                <UTooltip
                    v-for="bucket in history.buckets"
                    :key="bucket.date"
                    :popper="{ placement: 'top' }"
                    class="flex-1 min-w-[3px] h-full"
                >
                <template #content>
                    <div class="text-xs">
                        <p class="font-medium">{{ formatDateLabel(bucket.date) }}</p>
                        <p class="capitalize">Status: {{ bucket.status }}</p>
                        <p>Uptime: {{ bucket.uptime_percentage.toFixed(1) }}% ({{ bucket.total_checks }} checks)</p>
                    </div>
                </template>

                    <div
                        class="w-full h-full rounded-[1px] transition-colors cursor-pointer"
                        :class="statusColorClass(bucket.status)"
                    />
                </UTooltip>
            </div>
        </div>
    </div>
</template>
