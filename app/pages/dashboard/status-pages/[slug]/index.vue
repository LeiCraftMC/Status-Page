<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug as string

if (!slug) {
    throw new Error('Status page slug is required')
}

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Status Page | LeiCraft_MC Status Page',
    description: 'Status page details'
})

const toast = useToast()

const {
    data: pageDetails,
    loading,
    refresh
} = await useAPILazyAsyncData<GetStatusPagesBySlugResponses[200]['data'] | null>(`status-page-${slug}`, async () => {
    const res = await useAPI((api) => api.getStatusPagesBySlug({ path: { slug } }))
    if (!res.success) {
        toast.add({ title: 'Failed to load status page', description: res.message, color: 'error' })
        return null
    }
    return res.data
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
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                title="Status Page"
                icon="i-lucide-layout-grid"
                description="View status page details"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <div v-if="loading" class="flex items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
                </div>

                <div v-else-if="!pageDetails" class="text-center py-12 text-slate-400">
                    Status page not found.
                </div>

                <div v-else class="space-y-6">
                    <UCard class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <StatusPageHeader
                                    :page="pageDetails.page"
                                    show-view-link
                                    :view-link="`/status/${pageDetails.page.slug}`"
                                />

                                <div class="flex items-center gap-2">
                                    <span class="text-sm text-slate-400">Overall:</span>
                                    <StatusBadge :status="overallStatus" />
                                </div>
                            </div>
                        </template>

                        <MonitorList :groups="pageDetails.groups" :ungrouped="pageDetails.ungrouped" />

                        <div class="mt-6 flex justify-end">
                            <UButton
                                label="Manage Content"
                                icon="i-lucide-file-text"
                                color="primary"
                                :to="`/dashboard/status-pages/${slug}/content`"
                            />
                        </div>
                    </UCard>
                </div>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>
</template>
