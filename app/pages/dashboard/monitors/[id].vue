<script setup lang="ts">
import type { TableColumn } from '#ui/types'
import type { GetMonitorsByMonitorIdResponses, PostMonitorsByMonitorIdCheckResponses } from '@/api-client/types.gen'

type MonitorDetail = GetMonitorsByMonitorIdResponses[200]['data']
type Check = MonitorDetail['recent_checks'][number]

const route = useRoute()
const monitorId = Number(route.params.id)

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Monitor Details | LeiCraft_MC Status Page',
    description: 'View monitor details'
})

const toast = useToast()
const userInfoStore = useUserInfoStore()
const currentUser = await userInfoStore.use()
const isAdmin = computed(() => currentUser.value?.role === 'admin')

const checkColumns: TableColumn<Check>[] = [
    { accessorKey: 'status', header: 'Status' },
    { accessorKey: 'response_time_ms', header: 'Response Time' },
    { accessorKey: 'checked_at', header: 'Checked At' }
]

const {
    data: monitor,
    loading,
    refresh
} = await useAPILazyAsyncData<MonitorDetail | null>('dashboard-monitor-detail', async () => {
    const res = await useAPI((api) => api.getMonitorsByMonitorId({ path: { monitorId } }))
    if (!res.success) {
        toast.add({ title: 'Failed to load monitor', description: res.message, color: 'error' })
        return null
    }
    return res.data
})

const checkResult = ref<PostMonitorsByMonitorIdCheckResponses[200]['data']['check'] | null>(null)
const showCheckModal = ref(false)
const checking = ref(false)

const overallStatus = computed(() => monitor.value?.latest_check?.status ?? 'unknown')

async function runCheck() {
    if (!monitor.value) return
    checking.value = true
    showCheckModal.value = true
    checkResult.value = null
    const res = await useAPI((api) => api.postMonitorsByMonitorIdCheck({
        path: { monitorId: monitor.value!.id }
    }))
    if (res.success) {
        checkResult.value = (res.data as PostMonitorsByMonitorIdCheckResponses[200]['data']).check
        await refresh()
    } else {
        toast.add({ title: 'Check failed', description: res.message, color: 'error' })
    }
    checking.value = false
}
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                :title="monitor?.name || 'Monitor Details'"
                icon="i-lucide-heart-pulse"
                description="Monitor status and recent checks"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <div v-if="loading" class="flex items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
                </div>

                <div v-else-if="!monitor" class="text-center py-12">
                    <UEmpty icon="i-lucide-file-x" title="Monitor not found" description="The requested monitor does not exist." variant="naked" />
                </div>

                <div v-else class="space-y-6">
                    <div class="flex justify-end">
                        <UButton
                            v-if="isAdmin"
                            icon="i-lucide-activity"
                            label="Check now"
                            color="primary"
                            @click="runCheck"
                        />
                    </div>

                    <UCard class="border-slate-800 bg-slate-900/60">
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <p class="text-sm text-slate-400">Status</p>
                                <StatusBadge :status="overallStatus" />
                            </div>
                            <div>
                                <p class="text-sm text-slate-400">Type</p>
                                <p class="font-medium text-white uppercase">{{ monitor.type }}</p>
                            </div>
                            <div>
                                <p class="text-sm text-slate-400">Target</p>
                                <p class="font-medium text-white">{{ monitor.target }}</p>
                            </div>
                            <div>
                                <p class="text-sm text-slate-400">Interval</p>
                                <p class="font-medium text-white">{{ formatDuration(monitor.interval_seconds) }}</p>
                            </div>
                        </div>
                    </UCard>

                    <UCard class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <h3 class="font-semibold text-white">Recent Checks</h3>
                        </template>
                        <DashboardDataTable
                            :data="monitor.recent_checks"
                            :columns="checkColumns"
                            :loading="loading"
                            empty-title="No checks yet"
                            empty-description="This monitor has not been checked yet."
                            empty-icon="i-lucide-activity"
                            @refresh="refresh"
                        >
                            <template #status-cell="{ row }">
                                <StatusBadge :status="row.original.status" />
                            </template>

                            <template #response_time_ms-cell="{ row }">
                                <span class="text-slate-300">{{ row.original.response_time_ms ?? '-' }} ms</span>
                            </template>

                            <template #checked_at-cell="{ row }">
                                <span class="text-slate-400">{{ formatDate(row.original.checked_at) }}</span>
                            </template>
                        </DashboardDataTable>
                    </UCard>
                </div>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

    <DashboardModal
        v-if="isAdmin"
        v-model:open="showCheckModal"
        title="Monitor Check"
        icon="i-lucide-activity"
        :loading="checking"
    >
        <div v-if="checkResult" class="space-y-4">
            <div class="flex items-center gap-3">
                <span class="text-slate-400">Status:</span>
                <StatusBadge :status="checkResult.status" />
            </div>
            <div class="flex items-center gap-3">
                <span class="text-slate-400">Response time:</span>
                <span class="text-white">{{ checkResult.response_time_ms ?? '-' }} ms</span>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-slate-400">Checked at:</span>
                <span class="text-white">{{ formatDate(checkResult.checked_at) }}</span>
            </div>
        </div>
        <p v-else class="text-slate-400">Running check...</p>
    </DashboardModal>
</template>
