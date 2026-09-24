<script setup lang="ts">
import type {
    GetPublicStatusPageResponses,
    GetPublicStatusPageHistoryResponses
} from '@/api-client/types.gen'

type PublicPage = GetPublicStatusPageResponses[200]['data']
type PublicHistory = GetPublicStatusPageHistoryResponses[200]['data']

definePageMeta({
    layout: 'public'
})

useSeoMeta({
    title: 'Status | LeiCraft_MC Status Page'
})

const {
    data: pageDetails,
    pending: loading,
    refresh: refreshPage
} = await useLazyAsyncData<PublicPage | null>('public-status-page', async () => {
    const res = await useAPI((api) => api.getPublicStatusPage({}), true)
    if (!res.success) {
        return null
    }
    return res.data
})

const {
    data: history,
    pending: historyLoading,
    refresh: refreshHistory
} = await useLazyAsyncData<PublicHistory | null>('public-status-page-history', async () => {
    const res = await useAPI((api) => api.getPublicStatusPageHistory({ query: { days: 90 } }), true)
    if (!res.success) {
        return null
    }
    return res.data
})

// Keep the page live: statuses refresh automatically while the tab is visible
usePollingRefresh(async () => {
    await Promise.all([refreshPage(), refreshHistory()])
}, 30_000)

watchEffect(() => {
    const page = pageDetails.value?.page
    if (page) {
        useSeoMeta({ title: `${page.title} | Status Page` })
    }
})

const overallStatus = computed(() => {
    if (!pageDetails.value) return 'unknown'
    const all = [
        ...pageDetails.value.groups.flatMap((g: any) => g.monitors),
        ...pageDetails.value.ungrouped
    ]
    // Paused monitors do not affect the overall status
    const active = all.filter((m: any) => !m.is_paused)
    if (active.some((m: any) => m.latest_check?.status === 'down')) return 'down'
    if (active.some((m: any) => m.latest_check?.status === 'degraded')) return 'degraded'
    if (active.length > 0 && active.every((m: any) => m.latest_check?.status === 'up')) return 'up'
    return 'unknown'
})

const activeIncidents = computed(() => (pageDetails.value?.incidents || []).filter((i) => !i.is_resolved))
const inProgressMaintenance = computed(() => (pageDetails.value?.maintenance || []).filter((m) => m.status === 'in_progress'))
const upcomingMaintenance = computed(() => (pageDetails.value?.maintenance || []).filter((m) => m.status === 'scheduled'))

</script>

<template>
    <div class="space-y-8">
        <div v-if="loading && !pageDetails" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
        </div>

        <div v-else-if="!pageDetails" class="text-center py-12">
            <UEmpty
                icon="i-lucide-layout-grid"
                title="No status page configured"
                description="An administrator can configure the status page in the admin settings."
                variant="naked"
            />
        </div>

        <template v-else>
            <div class="space-y-6">
                <!-- Overall status banner -->
                <div
                    class="rounded-2xl border p-6"
                    :class="{
                        'border-emerald-800 bg-emerald-950/30': overallStatus === 'up',
                        'border-red-800 bg-red-950/30': overallStatus === 'down',
                        'border-amber-800 bg-amber-950/30': overallStatus === 'degraded',
                        'border-slate-800 bg-slate-900/60': overallStatus === 'unknown'
                    }"
                >
                    <div class="flex items-center gap-4">
                        <div
                            class="w-14 h-14 rounded-full flex items-center justify-center"
                            :class="{
                                'bg-emerald-500/20': overallStatus === 'up',
                                'bg-red-500/20': overallStatus === 'down',
                                'bg-amber-500/20': overallStatus === 'degraded',
                                'bg-slate-700': overallStatus === 'unknown'
                            }"
                        >
                            <UIcon :name="getStatusIcon(overallStatus)" class="size-7" :class="{
                                'text-emerald-400': overallStatus === 'up',
                                'text-red-400': overallStatus === 'down',
                                'text-amber-400': overallStatus === 'degraded',
                                'text-slate-400': overallStatus === 'unknown'
                            }" />
                        </div>
                        <div>
                            <h1 class="text-2xl font-bold text-white">
                                {{ overallStatus === 'up' ? 'All systems operational' : overallStatus === 'down' ? 'Major outage' : overallStatus === 'degraded' ? 'Partial degradation' : 'Status unknown' }}
                            </h1>
                            <p class="text-slate-400 flex flex-wrap items-center gap-2">
                                {{ pageDetails.page.title }}
                                <span class="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/80 px-2 py-0.5 text-[10px] text-slate-400">
                                    <span class="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Live
                                </span>
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Active incidents -->
                <div v-if="activeIncidents.length">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-semibold text-white">Active Incidents</h2>
                        <NuxtLink to="/incidents" class="text-sm text-primary-400 hover:text-primary-300">View all</NuxtLink>
                    </div>
                    <div class="space-y-3">
                        <NuxtLink
                            v-for="incident in activeIncidents"
                            :key="incident.id"
                            :to="`/incident/${incident.id}`"
                            class="block rounded-xl border border-red-900/60 bg-red-950/20 p-4 transition-colors hover:border-red-800 hover:bg-red-950/30"
                        >
                            <div class="flex items-start justify-between gap-4">
                                <div class="min-w-0">
                                    <h3 class="font-semibold text-white">{{ incident.title }}</h3>
                                    <p class="text-xs text-slate-400">Started {{ formatDate(incident.started_at) }}</p>
                                </div>
                                <div class="flex items-center gap-2 shrink-0">
                                    <UBadge :color="getIncidentStatusColor(incident.status)" variant="soft" class="capitalize">
                                        {{ incident.status }}
                                    </UBadge>
                                    <UIcon name="i-lucide-chevron-right" class="size-4 text-slate-500" />
                                </div>
                            </div>
                            <p class="text-sm text-slate-300 mt-3 line-clamp-2 whitespace-pre-line">
                                <span v-if="incident.updates[0]" class="text-slate-500">Latest update ({{ formatDate(incident.updates[0].created_at) }}): </span>{{ incident.updates[0]?.message ?? incident.message }}
                            </p>
                        </NuxtLink>
                    </div>
                </div>

                <!-- Maintenance in progress -->
                <div v-if="inProgressMaintenance.length">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-semibold text-white">Maintenance in Progress</h2>
                        <NuxtLink to="/scheduled-events" class="text-sm text-primary-400 hover:text-primary-300">View all</NuxtLink>
                    </div>
                    <div class="space-y-3">
                        <NuxtLink
                            v-for="item in inProgressMaintenance"
                            :key="item.id"
                            :to="`/scheduled-events/${item.id}`"
                            class="block rounded-xl border border-sky-900/60 bg-sky-950/20 p-4 transition-colors hover:border-sky-800 hover:bg-sky-950/30"
                        >
                            <div class="flex items-start justify-between gap-4">
                                <div class="min-w-0">
                                    <h3 class="font-semibold text-white">{{ item.title }}</h3>
                                    <p class="text-xs text-slate-400">
                                        {{ formatDate(item.scheduled_start_at) }}
                                        <span v-if="item.scheduled_end_at"> — {{ formatDate(item.scheduled_end_at) }}</span>
                                    </p>
                                </div>
                                <div class="flex items-center gap-2 shrink-0">
                                    <UBadge :color="getMaintenanceStatusColor(item.status)" variant="soft" class="capitalize">
                                        {{ formatStatusLabel(item.status) }}
                                    </UBadge>
                                    <UIcon name="i-lucide-chevron-right" class="size-4 text-slate-500" />
                                </div>
                            </div>
                            <p class="text-sm text-slate-300 mt-3 line-clamp-2 whitespace-pre-line">
                                <span v-if="item.updates[0]" class="text-slate-500">Latest update ({{ formatDate(item.updates[0].created_at) }}): </span>{{ item.updates[0]?.message ?? item.message }}
                            </p>
                        </NuxtLink>
                    </div>
                </div>

                <!-- Monitors -->
                <div>
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-semibold text-white">Services</h2>
                        <span v-if="!historyLoading && history" class="text-xs text-slate-400">
                            Past {{ history.days }} days
                        </span>
                    </div>
                    <MonitorList
                        :groups="pageDetails.groups"
                        :ungrouped="pageDetails.ungrouped"
                        :histories="history?.monitors"
                    />
                </div>

                <!-- Upcoming maintenance -->
                <div v-if="upcomingMaintenance.length">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-semibold text-white">Upcoming Maintenance</h2>
                        <NuxtLink to="/scheduled-events" class="text-sm text-primary-400 hover:text-primary-300">View all</NuxtLink>
                    </div>
                    <div class="space-y-3">
                        <NuxtLink
                            v-for="item in upcomingMaintenance"
                            :key="item.id"
                            :to="`/scheduled-events/${item.id}`"
                            class="block rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-slate-700 hover:bg-slate-900/80"
                        >
                            <div class="flex items-start justify-between gap-4">
                                <div class="min-w-0">
                                    <h3 class="font-semibold text-white">{{ item.title }}</h3>
                                    <p class="text-xs text-slate-400">
                                        {{ formatDate(item.scheduled_start_at) }}
                                        <span v-if="item.scheduled_end_at"> — {{ formatDate(item.scheduled_end_at) }}</span>
                                    </p>
                                </div>
                                <div class="flex items-center gap-2 shrink-0">
                                    <UBadge :color="getMaintenanceStatusColor(item.status)" variant="soft" class="capitalize">
                                        {{ formatStatusLabel(item.status) }}
                                    </UBadge>
                                    <UIcon name="i-lucide-chevron-right" class="size-4 text-slate-500" />
                                </div>
                            </div>
                            <p class="text-sm text-slate-300 mt-3 line-clamp-2 whitespace-pre-line">{{ item.updates[0]?.message ?? item.message }}</p>
                        </NuxtLink>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
