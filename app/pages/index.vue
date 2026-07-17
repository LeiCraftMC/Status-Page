<script setup lang="ts">
import type { GetPublicStatusPageResponses } from '@/api-client/types.gen'

type PublicPage = GetPublicStatusPageResponses[200]['data']

definePageMeta({
    layout: 'public'
})

useSeoMeta({
    title: 'Status | LeiCraft_MC Status Page'
})

const {
    data: pageDetails,
    pending: loading
} = await useLazyAsyncData<PublicPage | null>('public-status-page', async () => {
    const res = await useAPI((api) => api.getPublicStatusPage({}), true)
    if (!res.success) {
        return null
    }
    return res.data
})

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
    if (all.some((m: any) => m.latest_check?.status === 'down')) return 'down'
    if (all.some((m: any) => m.latest_check?.status === 'degraded')) return 'degraded'
    if (all.every((m: any) => m.latest_check?.status === 'up')) return 'up'
    return 'unknown'
})

const activeIncidents = computed(() => (pageDetails.value?.incidents || []).filter((i: any) => !i.is_resolved))
const scheduledMaintenance = computed(() => (pageDetails.value?.maintenance || []).filter((m: any) => ['scheduled', 'in_progress'].includes(m.status)))
const recentUpdates = computed(() => (pageDetails.value?.updates || []).slice(0, 5))

</script>

<template>
    <div class="space-y-8">
        <div v-if="loading" class="flex items-center justify-center py-12">
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
                            <p class="text-slate-400">{{ pageDetails.page.title }}</p>
                        </div>
                    </div>
                </div>

                <!-- Active incidents -->
                <div v-if="activeIncidents.length">
                    <h2 class="text-lg font-semibold text-white mb-3">Active Incidents</h2>
                    <div class="space-y-3">
                        <UCard
                            v-for="incident in activeIncidents"
                            :key="incident.id"
                            class="border-slate-800 bg-slate-900/60"
                        >
                            <template #header>
                                <div class="flex items-center justify-between">
                                    <div>
                                        <h3 class="font-semibold text-white">{{ incident.title }}</h3>
                                        <p class="text-xs text-slate-400">{{ formatDate(incident.started_at) }}</p>
                                    </div>
                                    <UBadge :color="getIncidentStatusColor(incident.status)" variant="soft" class="capitalize">
                                        {{ incident.status }}
                                    </UBadge>
                                </div>
                            </template>
                            <p class="text-slate-300 whitespace-pre-line">{{ incident.message }}</p>
                        </UCard>
                    </div>
                </div>

                <!-- Monitors -->
                <div>
                    <h2 class="text-lg font-semibold text-white mb-3">Services</h2>
                    <MonitorList :groups="pageDetails.groups" :ungrouped="pageDetails.ungrouped" />
                </div>

                <!-- Scheduled maintenance -->
                <div v-if="scheduledMaintenance.length">
                    <h2 class="text-lg font-semibold text-white mb-3">Scheduled Maintenance</h2>
                    <div class="space-y-3">
                        <UCard
                            v-for="item in scheduledMaintenance"
                            :key="item.id"
                            class="border-slate-800 bg-slate-900/60"
                        >
                            <template #header>
                                <div class="flex items-center justify-between">
                                    <h3 class="font-semibold text-white">{{ item.title }}</h3>
                                    <UBadge :color="getMaintenanceStatusColor(item.status)" variant="soft" class="capitalize">
                                        {{ item.status.replace('_', ' ') }}
                                    </UBadge>
                                </div>
                            </template>
                            <p class="text-sm text-slate-400 mb-2">
                                {{ formatDate(item.scheduled_start_at) }}
                                <span v-if="item.scheduled_end_at"> — {{ formatDate(item.scheduled_end_at) }}</span>
                            </p>
                            <p class="text-slate-300 whitespace-pre-line">{{ item.message }}</p>
                        </UCard>
                    </div>
                </div>

                <!-- Recent updates -->
                <div v-if="recentUpdates.length">
                    <h2 class="text-lg font-semibold text-white mb-3">Recent Updates</h2>
                    <div class="space-y-3">
                        <UCard
                            v-for="update in recentUpdates"
                            :key="update.id"
                            class="border-slate-800 bg-slate-900/60"
                        >
                            <template #header>
                                <div class="flex items-center justify-between">
                                    <h3 class="font-semibold text-white">{{ update.title }}</h3>
                                    <span class="text-xs text-slate-400 capitalize">{{ update.type }}</span>
                                </div>
                            </template>
                            <p class="text-sm text-slate-400 mb-2">{{ formatDate(update.created_at) }}</p>
                            <p class="text-slate-300 whitespace-pre-line">{{ update.message }}</p>
                        </UCard>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
