<script setup lang="ts">
import type {
    GetPublicMonitorsByMonitorIdResponses,
    GetPublicMonitorsByMonitorIdHistoryResponses
} from '@/api-client/types.gen'

type PublicMonitor = GetPublicMonitorsByMonitorIdResponses[200]['data']
type MonitorHistory = GetPublicMonitorsByMonitorIdHistoryResponses[200]['data']

definePageMeta({
    layout: 'public'
})

const route = useRoute()
const monitorId = Number(route.params.id)

const {
    data: monitorDetails,
    pending: loading,
    refresh: refreshMonitor
} = await useLazyAsyncData<PublicMonitor | null>(`public-monitor-${monitorId}`, async () => {
    const res = await useAPI((api) => api.getPublicMonitorsByMonitorId({ path: { monitorId } }), true)
    if (!res.success) {
        return null
    }
    return res.data
})

const {
    data: history,
    pending: historyLoading,
    refresh: refreshHistory
} = await useLazyAsyncData<MonitorHistory | null>(`public-monitor-${monitorId}-history`, async () => {
    const res = await useAPI((api) => api.getPublicMonitorsByMonitorIdHistory({
        path: { monitorId },
        query: { days: 90 }
    }), true)
    if (!res.success) {
        return null
    }
    return res.data
})

// Keep the page live while the tab is visible. The daily history and latency
// statistics change slowly, so they refresh less often.
usePollingRefresh(refreshMonitor, 30_000)
usePollingRefresh(refreshHistory, 5 * 60_000)

const monitor = computed(() => monitorDetails.value?.monitor)
const displayName = computed(() => monitorDetails.value?.display_name || monitor.value?.name || 'Monitor')
const isPaused = computed(() => monitor.value?.is_paused ?? false)
const latestCheck = computed(() => monitorDetails.value?.latest_check ?? null)

useSeoMeta({
    title: computed(() => `${displayName.value} | LeiCraft_MC Status Page`),
    description: computed(() => `Live status, uptime history and response times for ${displayName.value}`)
})

const responseTimePoints = computed(() =>
    (history.value?.buckets ?? []).map((bucket) => ({
        date: bucket.date,
        value: bucket.avg_response_time_ms ?? null
    }))
)

const historyForBars = computed(() => {
    if (!history.value) return null
    return {
        monitor_id: monitorId,
        name: monitor.value?.name ?? '',
        display_name: monitorDetails.value?.display_name ?? null,
        group_id: null,
        uptime_percentage: history.value.uptime_percentage,
        buckets: history.value.buckets
    }
})

const recentChecks = computed(() => (history.value?.recent_checks ?? []).slice(0, 10))
</script>

<template>
    <div class="space-y-8">
        <div>
            <NuxtLink to="/" class="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-primary-400 transition-colors">
                <UIcon name="i-lucide-arrow-left" class="size-4" />
                Back to status overview
            </NuxtLink>
        </div>

        <div v-if="loading && !monitorDetails" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
        </div>

        <div v-else-if="!monitorDetails || !monitor" class="text-center py-12">
            <UEmpty
                icon="i-lucide-heart-pulse"
                title="Monitor not found"
                description="This monitor does not exist or is not publicly visible."
                variant="naked"
            />
        </div>

        <template v-else>
            <!-- Monitor header -->
            <div class="rounded-2xl border p-6 border-slate-800 bg-slate-900/60">
                <div class="flex flex-wrap items-start justify-between gap-4">
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-3">
                            <h1 class="text-2xl font-bold text-white">{{ displayName }}</h1>
                            <StatusBadge :status="isPaused ? 'paused' : latestCheck?.status" />
                        </div>
                        <p class="text-sm text-slate-400 mt-1 font-mono break-all">{{ monitor.target }}</p>
                    </div>

                    <div class="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                        <span class="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Live
                    </div>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                    <div class="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                        <p class="text-xs text-slate-400">Response time</p>
                        <p class="text-xl font-semibold text-white mt-1">
                            <template v-if="latestCheck?.response_time_ms != null">{{ latestCheck.response_time_ms }} ms</template>
                            <template v-else>&mdash;</template>
                        </p>
                    </div>
                    <div class="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                        <p class="text-xs text-slate-400">Last checked</p>
                        <p class="text-sm font-medium text-white mt-1.5">{{ formatDate(latestCheck?.checked_at) }}</p>
                    </div>
                    <div class="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                        <p class="text-xs text-slate-400">Type</p>
                        <p class="text-xl font-semibold text-white mt-1 uppercase">{{ monitor.type }}</p>
                    </div>
                    <div class="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                        <p class="text-xs text-slate-400">Avg response ({{ history?.days ?? 90 }}d)</p>
                        <p class="text-xl font-semibold text-white mt-1">
                            <template v-if="history?.latency?.avg_response_time_ms != null">{{ history.latency.avg_response_time_ms }} ms</template>
                            <template v-else>&mdash;</template>
                        </p>
                    </div>
                </div>
            </div>

            <!-- Response time chart -->
            <div>
                <h2 class="text-lg font-semibold text-white mb-3">Response Time</h2>
                <UCard class="border-slate-800 bg-slate-900/60">
                    <ResponseTimeChart :points="responseTimePoints" />
                </UCard>
            </div>

            <!-- Uptime history -->
            <div>
                <div class="flex items-center justify-between mb-3">
                    <h2 class="text-lg font-semibold text-white">Uptime History</h2>
                    <span v-if="!historyLoading && history" class="text-xs text-slate-400">
                        Past {{ history.days }} days
                    </span>
                </div>
                <UCard class="border-slate-800 bg-slate-900/60">
                    <div v-if="historyForBars" class="space-y-4">
                        <div class="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                            <div>
                                <span class="text-slate-400">Uptime:</span>
                                <span class="text-white font-medium ml-1">{{ history.uptime_percentage.toFixed(2) }}%</span>
                            </div>
                            <div v-if="history.latency?.p95_response_time_ms != null">
                                <span class="text-slate-400">P95:</span>
                                <span class="text-white font-medium ml-1">{{ history.latency.p95_response_time_ms }} ms</span>
                            </div>
                            <div v-if="history.latency?.min_response_time_ms != null">
                                <span class="text-slate-400">Min:</span>
                                <span class="text-white font-medium ml-1">{{ history.latency.min_response_time_ms }} ms</span>
                            </div>
                            <div v-if="history.latency?.max_response_time_ms != null">
                                <span class="text-slate-400">Max:</span>
                                <span class="text-white font-medium ml-1">{{ history.latency.max_response_time_ms }} ms</span>
                            </div>
                        </div>
                        <MonitorUptimeBars :history="historyForBars" />
                    </div>
                    <p v-else class="text-slate-400 text-sm">No uptime data yet.</p>
                </UCard>
            </div>

            <!-- Recent checks -->
            <div v-if="recentChecks.length">
                <h2 class="text-lg font-semibold text-white mb-3">Recent Checks</h2>
                <div class="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                    <div class="divide-y divide-slate-800">
                        <div
                            v-for="check in recentChecks"
                            :key="check.id"
                            class="px-4 py-3 flex items-center justify-between gap-4"
                        >
                            <div class="flex items-center gap-3 min-w-0">
                                <StatusBadge :status="check.status" />
                                <span
                                    v-if="check.response_time_ms != null"
                                    class="text-sm text-slate-400"
                                >
                                    {{ check.response_time_ms }} ms
                                </span>
                            </div>
                            <span class="text-xs text-slate-500 shrink-0">{{ formatDate(check.checked_at) }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>