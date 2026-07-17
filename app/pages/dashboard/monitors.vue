<script setup lang="ts">
import type { TableColumn } from '#ui/types'
import type { GetMonitorsResponses } from '@/api-client/types.gen'

type Monitor = GetMonitorsResponses[200]['data'][number]

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Monitors | LeiCraft_MC Status Page',
    description: 'View monitors'
})

const toast = useToast()

const monitorColumns: TableColumn<Monitor>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'type', header: 'Type' },
    { accessorKey: 'target', header: 'Target' },
    { id: 'interval', header: 'Interval' },
    { id: 'status', header: 'Status' },
    { id: 'actions', header: '', enableSorting: false, enableHiding: false }
]

const {
    data: monitors,
    loading,
    refresh
} = await useAPILazyAsyncData<Monitor[]>('dashboard-monitors-list', async () => {
    const res = await useAPI((api) => api.getMonitors({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load monitors', description: res.message, color: 'error' })
        return []
    }
    return res.data
})
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                title="Monitors"
                icon="i-lucide-heart-pulse"
                description="View status monitors"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <DashboardDataTable
                    :data="monitors"
                    :columns="monitorColumns"
                    :loading="loading"
                    :filters="[
                        { column: 'name', type: 'text', placeholder: 'Search monitors...', icon: 'i-lucide-search' },
                        { column: 'type', type: 'select', placeholder: 'All types', icon: 'i-lucide-filter', options: [{ label: 'HTTP', value: 'http' }, { label: 'TCP', value: 'tcp' }] }
                    ]"
                    empty-title="No monitors"
                    empty-description="There are no monitors configured yet."
                    empty-icon="i-lucide-heart-pulse"
                    @refresh="refresh"
                >
                    <template #id-cell="{ row }">
                        <span class="font-mono text-sm">#{{ row.original.id }}</span>
                    </template>

                    <template #type-cell="{ row }">
                        <UBadge variant="soft" color="neutral" class="uppercase text-xs">
                            {{ row.original.type }}
                        </UBadge>
                    </template>

                    <template #interval-cell="{ row }">
                        <span class="text-slate-400">{{ formatDuration(row.original.interval_seconds) }}</span>
                    </template>

                    <template #status-cell="{ row }">
                        <StatusBadge v-if="row.original.latest_check" :status="row.original.latest_check.status" />
                        <span v-else class="text-slate-500">No data</span>
                    </template>

                    <template #actions-cell="{ row }">
                        <UButton
                            icon="i-lucide-eye"
                            variant="ghost"
                            color="neutral"
                            size="xs"
                            :to="`/dashboard/monitors/${row.original.id}`"
                        />
                    </template>
                </DashboardDataTable>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>
</template>
