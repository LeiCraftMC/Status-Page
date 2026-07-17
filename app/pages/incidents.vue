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
    pending: loading
} = await useLazyAsyncData<Incident[]>('public-incidents', async () => {
    const res = await useAPI((api) => api.getPublicStatusPageIncidents({}), true)
    if (!res.success) {
        return []
    }
    return res.data
})

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

        <div v-if="loading" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
        </div>

        <template v-else>
            <div v-if="activeIncidents.length" class="space-y-3">
                <h2 class="text-lg font-semibold text-white">Active</h2>
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

            <div v-if="resolvedIncidents.length" class="space-y-3">
                <h2 class="text-lg font-semibold text-white">Resolved</h2>
                <UCard
                    v-for="incident in resolvedIncidents"
                    :key="incident.id"
                    class="border-slate-800 bg-slate-900/60"
                >
                    <template #header>
                        <div class="flex items-center justify-between">
                            <div>
                                <h3 class="font-semibold text-white">{{ incident.title }}</h3>
                                <p class="text-xs text-slate-400">
                                    {{ formatDate(incident.started_at) }}
                                    <span v-if="incident.resolved_at"> — {{ formatDate(incident.resolved_at) }}</span>
                                </p>
                            </div>
                            <UBadge color="success" variant="soft" class="capitalize">
                                resolved
                            </UBadge>
                        </div>
                    </template>
                    <p class="text-slate-300 whitespace-pre-line">{{ incident.message }}</p>
                </UCard>
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
