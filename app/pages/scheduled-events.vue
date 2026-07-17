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
    pending: loading
} = await useLazyAsyncData<Maintenance[]>('public-maintenance', async () => {
    const res = await useAPI((api) => api.getPublicStatusPageMaintenance({}), true)
    if (!res.success) {
        return []
    }
    return res.data
})

const upcoming = computed(() => (maintenance.value || []).filter(m => ['scheduled', 'in_progress'].includes(m.status)))
const past = computed(() => (maintenance.value || []).filter(m => ['completed', 'cancelled'].includes(m.status)))
</script>

<template>
    <div class="space-y-8">
        <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold text-white">Scheduled Maintenance</h1>
            <NuxtLink to="/" class="text-sm text-primary-400 hover:text-primary-300">
                ← Back to status page
            </NuxtLink>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
        </div>

        <template v-else>
            <div v-if="upcoming.length" class="space-y-3">
                <h2 class="text-lg font-semibold text-white">Upcoming / In Progress</h2>
                <UCard
                    v-for="item in upcoming"
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

            <div v-if="past.length" class="space-y-3">
                <h2 class="text-lg font-semibold text-white">Completed / Cancelled</h2>
                <UCard
                    v-for="item in past"
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
