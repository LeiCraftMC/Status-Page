<script setup lang="ts">
import type { GetPublicStatusPageMaintenanceResponses } from '@/api-client/types.gen'

type Maintenance = GetPublicStatusPageMaintenanceResponses[200]['data'][number]

definePageMeta({
    layout: 'public'
})

useSeoMeta({
    title: 'Scheduled Events | LeiCraft_MC Status Page'
})

const {
    data: maintenance,
    pending: loading,
    refresh: refreshMaintenance
} = await useLazyAsyncData<Maintenance[]>('public-maintenance', async () => {
    const res = await useAPI((api) => api.getPublicStatusPageMaintenance({}), true)
    if (!res.success) {
        return []
    }
    return res.data
})

// Keep the page live while the tab is visible
usePollingRefresh(refreshMaintenance, 60_000)

const sections = computed(() => {
    const list = maintenance.value || []
    return [
        { title: 'In Progress', muted: false, items: list.filter(m => m.status === 'in_progress') },
        { title: 'Upcoming', muted: false, items: list.filter(m => m.status === 'scheduled') },
        { title: 'Completed / Cancelled', muted: true, items: list.filter(m => ['completed', 'cancelled'].includes(m.status)) }
    ]
})
</script>

<template>
    <div class="space-y-8">
        <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold text-white">Scheduled Maintenance</h1>
            <NuxtLink to="/" class="text-sm text-primary-400 hover:text-primary-300">
                ← Back to status page
            </NuxtLink>
        </div>

        <div v-if="loading && !maintenance?.length" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
        </div>

        <template v-else>
            <div v-for="section in sections" :key="section.title" class="space-y-3">
                <template v-if="section.items.length">
                    <h2 class="text-lg font-semibold text-white">{{ section.title }}</h2>
                    <NuxtLink
                        v-for="item in section.items"
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
                        <p class="text-sm mt-3 line-clamp-2 whitespace-pre-line" :class="section.muted ? 'text-slate-400' : 'text-slate-300'">
                            <span v-if="item.updates[0] && !section.muted" class="text-slate-500">Latest update ({{ formatDate(item.updates[0].created_at) }}): </span>{{ item.updates[0]?.message ?? item.message }}
                        </p>
                        <p v-if="item.updates.length && !section.muted" class="text-xs text-slate-500 mt-2">
                            {{ item.updates.length }} {{ item.updates.length === 1 ? 'update' : 'updates' }}
                        </p>
                    </NuxtLink>
                </template>
            </div>

            <UEmpty
                v-if="!maintenance?.length"
                icon="i-lucide-calendar-clock"
                title="No maintenance"
                description="There are no scheduled maintenance entries."
                variant="naked"
            />
        </template>
    </div>
</template>
