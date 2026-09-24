<script setup lang="ts">
import type { GetPublicStatusPageIncidentsResponses } from '@/api-client/types.gen'

type Incident = GetPublicStatusPageIncidentsResponses[200]['data'][number]

definePageMeta({
    layout: 'public'
})

useSeoMeta({
    title: 'Incidents | LeiCraft_MC Status Page'
})

const {
    data: incidents,
    pending: loading,
    refresh: refreshIncidents
} = await useLazyAsyncData<Incident[]>('public-incidents', async () => {
    const res = await useAPI((api) => api.getPublicStatusPageIncidents({}), true)
    if (!res.success) {
        return []
    }
    return res.data
})

// Keep the page live while the tab is visible
usePollingRefresh(refreshIncidents, 60_000)

const activeIncidents = computed(() => (incidents.value || []).filter(i => !i.is_resolved))
const resolvedIncidents = computed(() => (incidents.value || []).filter(i => i.is_resolved))
</script>

<template>
    <div class="space-y-8">
        <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold text-white">Incidents</h1>
            <NuxtLink to="/" class="text-sm text-primary-400 hover:text-primary-300">
                ← Back to status page
            </NuxtLink>
        </div>

        <div v-if="loading && !incidents?.length" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
        </div>

        <template v-else>
            <div v-if="activeIncidents.length" class="space-y-3">
                <h2 class="text-lg font-semibold text-white">Active</h2>
                <NuxtLink
                    v-for="incident in activeIncidents"
                    :key="incident.id"
                    :to="`/incident/${incident.id}`"
                    class="block rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-slate-700 hover:bg-slate-900/80"
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
                    <p v-if="incident.updates.length" class="text-xs text-slate-500 mt-2">
                        {{ incident.updates.length }} {{ incident.updates.length === 1 ? 'update' : 'updates' }}
                    </p>
                </NuxtLink>
            </div>

            <div v-if="resolvedIncidents.length" class="space-y-3">
                <h2 class="text-lg font-semibold text-white">Resolved</h2>
                <NuxtLink
                    v-for="incident in resolvedIncidents"
                    :key="incident.id"
                    :to="`/incident/${incident.id}`"
                    class="block rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-slate-700 hover:bg-slate-900/80"
                >
                    <div class="flex items-start justify-between gap-4">
                        <div class="min-w-0">
                            <h3 class="font-semibold text-white">{{ incident.title }}</h3>
                            <p class="text-xs text-slate-400">
                                {{ formatDate(incident.started_at) }}
                                <span v-if="incident.resolved_at"> — {{ formatDate(incident.resolved_at) }}</span>
                            </p>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            <UBadge color="success" variant="soft">resolved</UBadge>
                            <UIcon name="i-lucide-chevron-right" class="size-4 text-slate-500" />
                        </div>
                    </div>
                    <p class="text-sm text-slate-400 mt-3 line-clamp-2 whitespace-pre-line">
                        {{ incident.updates[0]?.message ?? incident.message }}
                    </p>
                </NuxtLink>
            </div>

            <UEmpty
                v-if="!incidents?.length"
                icon="i-lucide-alert-triangle"
                title="No incidents"
                description="There are no incidents to report."
                variant="naked"
            />
        </template>
    </div>
</template>
