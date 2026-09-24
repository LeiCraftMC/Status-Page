<script setup lang="ts">
import type { GetPublicMaintenanceByMaintenanceIdResponses } from '@/api-client/types.gen'

type Maintenance = GetPublicMaintenanceByMaintenanceIdResponses[200]['data']['maintenance']

definePageMeta({
    layout: 'public'
})

const route = useRoute()
const maintenanceId = Number(route.params.id)

const {
    data: maintenance,
    pending: loading,
    refresh
} = await useLazyAsyncData<Maintenance | null>(`public-maintenance-${maintenanceId}`, async () => {
    const res = await useAPI((api) => api.getPublicMaintenanceByMaintenanceId({ path: { maintenanceId } }), true)
    if (!res.success) {
        return null
    }
    return res.data.maintenance
})

// Keep the page live while the tab is visible
usePollingRefresh(refresh, 30_000)

useSeoMeta({
    title: computed(() => `${maintenance.value?.title ?? 'Scheduled Maintenance'} | LeiCraft_MC Status Page`),
    description: computed(() => maintenance.value?.message.slice(0, 160) ?? 'Scheduled maintenance details and updates')
})

const bannerClass = computed(() => {
    switch (maintenance.value?.status) {
        case 'in_progress':
            return 'border-sky-800 bg-sky-950/30'
        case 'completed':
            return 'border-emerald-800 bg-emerald-950/30'
        case 'cancelled':
            return 'border-slate-700 bg-slate-900/60'
        default:
            return 'border-amber-800 bg-amber-950/30'
    }
})
</script>

<template>
    <div class="space-y-8">
        <div>
            <NuxtLink to="/scheduled-events" class="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-primary-400 transition-colors">
                <UIcon name="i-lucide-arrow-left" class="size-4" />
                All scheduled events
            </NuxtLink>
        </div>

        <div v-if="loading && !maintenance" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
        </div>

        <UEmpty
            v-else-if="!maintenance"
            icon="i-lucide-calendar-clock"
            title="Scheduled event not found"
            description="This scheduled event does not exist or has been removed."
            variant="naked"
        />

        <template v-else>
            <div class="rounded-2xl border p-6" :class="bannerClass">
                <div class="flex flex-wrap items-start justify-between gap-4">
                    <div class="min-w-0">
                        <p class="text-xs uppercase tracking-wide text-slate-400 mb-1">Scheduled maintenance</p>
                        <h1 class="text-2xl font-bold text-white">{{ maintenance.title }}</h1>
                        <div class="flex flex-wrap items-center gap-2 mt-3">
                            <UBadge :color="getMaintenanceStatusColor(maintenance.status)" variant="soft" class="capitalize">
                                {{ formatStatusLabel(maintenance.status) }}
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
                        <p class="text-slate-400">Scheduled start</p>
                        <p class="text-white font-medium">{{ formatDate(maintenance.scheduled_start_at) }}</p>
                    </div>
                    <div>
                        <p class="text-slate-400">Scheduled end</p>
                        <p class="text-white font-medium">{{ maintenance.scheduled_end_at ? formatDate(maintenance.scheduled_end_at) : 'Open-ended' }}</p>
                    </div>
                </div>
            </div>

            <div>
                <h2 class="text-lg font-semibold text-white mb-4">Updates</h2>
                <UCard class="border-slate-800 bg-slate-900/60">
                    <UpdateTimeline
                        kind="maintenance"
                        :updates="maintenance.updates"
                        :opening-message="maintenance.message"
                        :opening-at="maintenance.created_at"
                        opening-label="Announced"
                    />
                </UCard>
            </div>
        </template>
    </div>
</template>