<script setup lang="ts">
import type { GetStatusPageResponses } from '@/api-client/types.gen'

type StatusPage = GetStatusPageResponses[200]['data']
type Incident = StatusPage['incidents'][number]
type Maintenance = StatusPage['maintenance'][number]
type Update = StatusPage['updates'][number]

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Status Page Preview | LeiCraft_MC Status Page',
    description: 'Preview the public status page'
})

const toast = useToast()

const {
    data: page,
    loading,
    refresh
} = await useAPILazyAsyncData<StatusPage | null>('dashboard-status-page-preview', async () => {
    const res = await useAPI((api) => api.getStatusPage({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load status page', description: res.message, color: 'error' })
        return null
    }
    return res.data
})

const activeIncidents = computed(() => page.value?.incidents ?? [])
const scheduledMaintenance = computed(() => page.value?.maintenance ?? [])
const recentUpdates = computed(() => page.value?.updates.slice(0, 5) ?? [])

function incidentSeverityColor(severity: Incident['severity']) {
    return getSeverityColor(severity)
}

function maintenanceStatusColor(status: Maintenance['status']) {
    return getMaintenanceStatusColor(status)
}
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                title="Status Page Preview"
                icon="i-lucide-layout-grid"
                description="Authenticated preview of the public status page"
            >
                <template #right>
                    <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="subtle" @click="refresh" />
                </template>
            </DashboardPageHeader>
        </template>

        <template #body>
            <DashboardPageBody>
                <div v-if="loading" class="flex items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
                </div>

                <div v-else-if="!page" class="text-center py-12">
                    <UEmpty icon="i-lucide-file-x" title="Status page not available" description="Could not load the status page preview." variant="naked" />
                </div>

                <div v-else class="space-y-6">
                    <!-- Header -->
                    <div class="text-center space-y-2">
                        <h1 class="text-2xl font-bold text-white">{{ page.page.title }}</h1>
                        <p v-if="page.page.description" class="text-slate-400 max-w-2xl mx-auto">{{ page.page.description }}</p>

                        <div class="flex justify-center gap-2">
                            <UBadge :color="page.page.is_public ? 'success' : 'neutral'" variant="soft">
                                {{ page.page.is_public ? 'Public' : 'Private' }}
                            </UBadge>
                            <UBadge :color="page.page.is_enabled ? 'success' : 'neutral'" variant="soft">
                                {{ page.page.is_enabled ? 'Enabled' : 'Disabled' }}
                            </UBadge>
                        </div>
                    </div>

                    <!-- Monitors -->
                    <MonitorList :groups="page.groups" :ungrouped="page.ungrouped" />

                    <!-- Active Incidents -->
                    <UCard v-if="activeIncidents.length" class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <h3 class="font-semibold text-white flex items-center gap-2">
                                <UIcon name="i-lucide-alert-triangle" class="text-error" />
                                Active Incidents
                            </h3>
                        </template>

                        <div class="space-y-4">
                            <div
                                v-for="incident in activeIncidents"
                                :key="incident.id"
                                class="p-4 rounded-lg border border-slate-800 bg-slate-900/40"
                            >
                                <div class="flex items-start justify-between gap-4">
                                    <div class="min-w-0">
                                        <p class="font-semibold text-white">{{ incident.title }}</p>
                                        <p class="text-slate-400 text-sm mt-1">{{ incident.message }}</p>
                                    </div>
                                    <div class="flex items-center gap-2 shrink-0">
                                        <UBadge :color="incidentSeverityColor(incident.severity)" variant="soft" class="capitalize">
                                            {{ incident.severity }}
                                        </UBadge>
                                        <UBadge :color="getIncidentStatusColor(incident.status)" variant="soft" class="capitalize">
                                            {{ incident.status }}
                                        </UBadge>
                                    </div>
                                </div>
                                <p class="text-xs text-slate-500 mt-3">Started {{ formatDate(incident.started_at) }}</p>
                            </div>
                        </div>
                    </UCard>

                    <!-- Scheduled Maintenance -->
                    <UCard v-if="scheduledMaintenance.length" class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <h3 class="font-semibold text-white flex items-center gap-2">
                                <UIcon name="i-lucide-calendar-clock" class="text-warning" />
                                Scheduled Maintenance
                            </h3>
                        </template>

                        <div class="space-y-4">
                            <div
                                v-for="item in scheduledMaintenance"
                                :key="item.id"
                                class="p-4 rounded-lg border border-slate-800 bg-slate-900/40"
                            >
                                <div class="flex items-start justify-between gap-4">
                                    <div class="min-w-0">
                                        <p class="font-semibold text-white">{{ item.title }}</p>
                                        <p class="text-slate-400 text-sm mt-1">{{ item.message }}</p>
                                    </div>
                                    <UBadge :color="maintenanceStatusColor(item.status)" variant="soft" class="capitalize shrink-0">
                                        {{ item.status.replace('_', ' ') }}
                                    </UBadge>
                                </div>
                                <p class="text-xs text-slate-500 mt-3">
                                    {{ formatDate(item.scheduled_start_at) }}
                                    <span v-if="item.scheduled_end_at"> — {{ formatDate(item.scheduled_end_at) }}</span>
                                </p>
                            </div>
                        </div>
                    </UCard>

                    <!-- Recent Updates -->
                    <UCard v-if="recentUpdates.length" class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <h3 class="font-semibold text-white flex items-center gap-2">
                                <UIcon name="i-lucide-megaphone" class="text-primary" />
                                Recent Updates
                            </h3>
                        </template>

                        <div class="space-y-4">
                            <div
                                v-for="update in recentUpdates"
                                :key="update.id"
                                class="p-4 rounded-lg border border-slate-800 bg-slate-900/40"
                            >
                                <div class="flex items-start justify-between gap-4">
                                    <div class="min-w-0">
                                        <p class="font-semibold text-white">{{ update.title }}</p>
                                        <p class="text-slate-400 text-sm mt-1">{{ update.message }}</p>
                                    </div>
                                    <UBadge variant="soft" class="capitalize shrink-0">
                                        {{ update.type }}
                                    </UBadge>
                                </div>
                                <p class="text-xs text-slate-500 mt-3">{{ formatDate(update.created_at) }}</p>
                            </div>
                        </div>
                    </UCard>
                </div>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>
</template>
