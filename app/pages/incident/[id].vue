<script setup lang="ts">
import type { GetPublicIncidentsByIncidentIdResponses } from '@/api-client/types.gen'

type Incident = GetPublicIncidentsByIncidentIdResponses[200]['data']['incident']

definePageMeta({
    layout: 'public'
})

const route = useRoute()
const incidentId = Number(route.params.id)

const {
    data: incident,
    pending: loading,
    refresh
} = await useLazyAsyncData<Incident | null>(`public-incident-${incidentId}`, async () => {
    const res = await useAPI((api) => api.getPublicIncidentsByIncidentId({ path: { incidentId } }), true)
    if (!res.success) {
        return null
    }
    return res.data.incident
})

// Keep the page live while the tab is visible
usePollingRefresh(refresh, 30_000)

useSeoMeta({
    title: computed(() => `${incident.value?.title ?? 'Incident'} | LeiCraft_MC Status Page`),
    description: computed(() => incident.value?.message.slice(0, 160) ?? 'Incident details and updates')
})

const bannerClass = computed(() => {
    if (!incident.value) return 'border-slate-800 bg-slate-900/60'
    if (incident.value.is_resolved) return 'border-emerald-800 bg-emerald-950/30'
    return incident.value.severity === 'critical' || incident.value.severity === 'major'
        ? 'border-red-800 bg-red-950/30'
        : 'border-amber-800 bg-amber-950/30'
})
</script>

<template>
    <div class="space-y-8">
        <div>
            <NuxtLink to="/incidents" class="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-primary-400 transition-colors">
                <UIcon name="i-lucide-arrow-left" class="size-4" />
                All incidents
            </NuxtLink>
        </div>

        <div v-if="loading && !incident" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
        </div>

        <UEmpty
            v-else-if="!incident"
            icon="i-lucide-alert-triangle"
            title="Incident not found"
            description="This incident does not exist or has been removed."
            variant="naked"
        />

        <template v-else>
            <div class="rounded-2xl border p-6" :class="bannerClass">
                <div class="flex flex-wrap items-start justify-between gap-4">
                    <div class="min-w-0">
                        <h1 class="text-2xl font-bold text-white">{{ incident.title }}</h1>
                        <div class="flex flex-wrap items-center gap-2 mt-3">
                            <UBadge :color="getIncidentStatusColor(incident.status)" variant="soft" class="capitalize">
                                {{ incident.status }}
                            </UBadge>
                            <UBadge :color="getSeverityColor(incident.severity)" variant="outline" class="capitalize">
                                {{ incident.severity }}
                            </UBadge>
                        </div>
                    </div>

                    <div class="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                        <span class="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Live
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 text-sm">
                    <div>
                        <p class="text-slate-400">Started</p>
                        <p class="text-white font-medium">{{ formatDate(incident.started_at) }}</p>
                    </div>
                    <div>
                        <p class="text-slate-400">{{ incident.is_resolved ? 'Resolved' : 'Last update' }}</p>
                        <p class="text-white font-medium">
                            {{ formatDate(incident.is_resolved ? incident.resolved_at : (incident.updates[0]?.created_at ?? incident.started_at)) }}
                        </p>
                    </div>
                </div>
            </div>

            <div>
                <h2 class="text-lg font-semibold text-white mb-4">Updates</h2>
                <UCard class="border-slate-800 bg-slate-900/60">
                    <UpdateTimeline
                        kind="incident"
                        :updates="incident.updates"
                        :opening-message="incident.message"
                        :opening-at="incident.started_at"
                        opening-label="Reported"
                    />
                </UCard>
            </div>
        </template>
    </div>
</template>