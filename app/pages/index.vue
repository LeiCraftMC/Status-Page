<script setup lang="ts">

type PublicPage = GetPublicStatusPagesRootResponses[200]['data']

definePageMeta({
    layout: 'public'
})

useSeoMeta({
    title: 'Status | LeiCraft_MC Status Page'
})

const {
    data: pageDetails,
    pending: loading
} = await useLazyAsyncData<PublicPage | null>('public-root-status-page', async () => {
    const res = await useAPI((api) => api.getPublicStatusPagesRoot({}), true)
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
        ...pageDetails.value.groups.flatMap(g => g.monitors),
        ...pageDetails.value.ungrouped
    ]
    if (all.some(m => m.latest_check?.status === 'down')) return 'down'
    if (all.some(m => m.latest_check?.status === 'degraded')) return 'degraded'
    if (all.every(m => m.latest_check?.status === 'up')) return 'up'
    return 'unknown'
})


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
                description="An administrator can set a root status page in the admin settings."
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

                <!-- Monitors -->
                <div>
                    <h2 class="text-lg font-semibold text-white mb-3">Services</h2>
                    <MonitorList :groups="pageDetails.groups" :ungrouped="pageDetails.ungrouped" />
                </div>
            </div>
        </template>
    </div>
</template>
