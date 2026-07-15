<script setup lang="ts">
import type { DropdownMenuItem, TableColumn, FormSubmitEvent } from '#ui/types'
import type { GetAdminMonitorsResponses, GetAdminMonitorsByMonitorIdResponses, PostAdminMonitorsByMonitorIdCheckResponses } from '@/api-client/types.gen'
import * as z from 'zod'
import { zPostAdminMonitorsBody, zPutAdminMonitorsByMonitorIdBody } from '~/api-client/zod.gen'

type Monitor = GetAdminMonitorsResponses[200]['data'][number]

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Monitors | LeiCraft_MC Status Page',
    description: 'Manage monitors'
})

const toast = useToast()

const userInfoStore = useUserInfoStore()
const currentUser = await userInfoStore.use()
if (!userInfoStore.isValid(currentUser)) {
    throw new Error('User not authenticated but trying to access Admin Monitors')
}

const isAdmin = currentUser.value.role === 'admin'
if (!isAdmin) {
    await navigateTo('/dashboard')
}

const monitorColumns: TableColumn<Monitor>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'type', header: 'Type' },
    { accessorKey: 'target', header: 'Target' },
    { id: 'interval', header: 'Interval' },
    { id: 'enabled', header: 'Enabled' },
    { id: 'actions', header: '', enableSorting: false, enableHiding: false }
]

const {
    data: monitors,
    loading,
    refresh
} = await useAPILazyAsyncData<Monitor[]>('admin-monitors-list', async () => {
    if (!isAdmin) return []
    const res = await useAPI((api) => api.getAdminMonitors({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load monitors', description: res.message, color: 'error' })
        return []
    }
    return res.data
})

const createSchema = zPostAdminMonitorsBody
type CreateSchema = z.output<typeof createSchema>

const editSchema = zPutAdminMonitorsByMonitorIdBody
type EditSchema = z.output<typeof editSchema>

const defaultCreateForm: CreateSchema = {
    name: '',
    type: 'http',
    target: '',
    interval_seconds: 300,
    timeout_seconds: 30,
    http_method: 'GET',
    expected_http_status: 200,
    follow_redirects: true,
    verify_tls: true,
    is_enabled: true
}

const createForm = reactive<CreateSchema>({ ...defaultCreateForm })
const showCreateModal = ref(false)

const showEditModal = ref(false)
const selectedMonitor = ref<Monitor | null>(null)
const editForm = reactive<EditSchema>({})

const checkResult = ref<GetAdminMonitorsByMonitorIdResponses[200]['data']['latest_check'] | null>(null)
const showCheckModal = ref(false)
const checking = ref(false)

const deleteConfirmOpen = ref(false)
const deleteTarget = ref<Monitor | null>(null)

function getMonitorOptionsDropdownItems(row: { original: Monitor }): DropdownMenuItem[][] {
    return [
        [
            {
                label: 'Edit',
                icon: 'i-lucide-pencil',
                onSelect: () => openEdit(row.original)
            },
            {
                label: 'Check now',
                icon: 'i-lucide-activity',
                onSelect: () => runCheck(row.original)
            }
        ],
        [
            {
                label: 'Delete',
                icon: 'i-lucide-trash-2',
                color: 'error',
                onSelect: () => openDelete(row.original)
            }
        ]
    ]
}

function openEdit(monitor: Monitor) {
    selectedMonitor.value = monitor
    editForm.name = monitor.name
    editForm.type = monitor.type
    editForm.target = monitor.target
    editForm.interval_seconds = monitor.interval_seconds
    editForm.timeout_seconds = monitor.timeout_seconds
    editForm.http_method = monitor.http_method || undefined
    editForm.expected_http_status = monitor.expected_http_status || undefined
    editForm.follow_redirects = monitor.follow_redirects
    editForm.verify_tls = monitor.verify_tls
    editForm.is_enabled = monitor.is_enabled
    showEditModal.value = true
}

async function handleCreate(event: FormSubmitEvent<CreateSchema>) {
    const res = await useAPI((api) => api.postAdminMonitors({ body: event.data }))
    if (res.success) {
        toast.add({ title: 'Monitor created', color: 'success' })
        showCreateModal.value = false
        Object.assign(createForm, defaultCreateForm)
        await refresh()
    } else {
        toast.add({ title: 'Create failed', description: res.message, color: 'error' })
    }
}

async function submitEdit() {
    if (!selectedMonitor.value) return
    const body: EditSchema = { ...editForm }
    // Only send HTTP-specific fields when type is http
    if (body.type === 'tcp') {
        body.http_method = undefined
        body.expected_http_status = undefined
        body.follow_redirects = undefined
        body.verify_tls = undefined
    }
    const res = await useAPI((api) => api.putAdminMonitorsByMonitorId({
        path: { monitorId: selectedMonitor.value!.id },
        body
    }))
    if (res.success) {
        toast.add({ title: 'Monitor updated', color: 'success' })
        showEditModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

async function runCheck(monitor: Monitor) {
    selectedMonitor.value = monitor
    checking.value = true
    showCheckModal.value = true
    checkResult.value = null
    const res = await useAPI((api) => api.postAdminMonitorsByMonitorIdCheck({
        path: { monitorId: monitor.id }
    }))
    if (res.success) {
        checkResult.value = (res.data as PostAdminMonitorsByMonitorIdCheckResponses[200]['data']).check
    } else {
        toast.add({ title: 'Check failed', description: res.message, color: 'error' })
    }
    checking.value = false
}

function openDelete(monitor: Monitor) {
    deleteTarget.value = monitor
    deleteConfirmOpen.value = true
}

async function onDeleteMonitor() {
    if (!deleteTarget.value) return
    const res = await useAPI((api) => api.deleteAdminMonitorsByMonitorId({
        path: { monitorId: deleteTarget.value!.id }
    }))
    if (res.success) {
        toast.add({ title: 'Monitor deleted', color: 'success' })
        deleteConfirmOpen.value = false
        deleteTarget.value = null
        await refresh()
    } else {
        toast.add({ title: 'Delete failed', description: res.message, color: 'error' })
    }
}
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                title="Monitors"
                icon="i-lucide-heart-pulse"
                description="Manage status monitors"
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
                        { column: 'type', type: 'select', placeholder: 'All types', icon: 'i-lucide-filter', options: [{ label: 'HTTP', value: 'http' }, { label: 'TCP', value: 'tcp' }] },
                        { column: 'is_enabled', type: 'select', placeholder: 'All states', icon: 'i-lucide-filter', options: [{ label: 'Enabled', value: true }, { label: 'Disabled', value: false }] }
                    ]"
                    empty-title="No monitors"
                    empty-description="Create your first monitor to start checking services."
                    empty-icon="i-lucide-heart-pulse"
                    @refresh="refresh"
                >
                    <template #header-right>
                        <UButton
                            label="New Monitor"
                            icon="i-lucide-plus"
                            color="primary"
                            @click="showCreateModal = true"
                        />
                    </template>

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

                    <template #enabled-cell="{ row }">
                        <UBadge :color="row.original.is_enabled ? 'success' : 'neutral'" variant="soft">
                            {{ row.original.is_enabled ? 'Enabled' : 'Disabled' }}
                        </UBadge>
                    </template>

                    <template #actions-cell="{ row }">
                        <UDropdownMenu
                            :ui="{ viewport: 'main-bg-color' }"
                            :items="getMonitorOptionsDropdownItems(row)"
                        >
                            <UButton
                                icon="i-lucide-more-horizontal"
                                variant="ghost"
                                color="neutral"
                                size="xs"
                            />
                        </UDropdownMenu>
                    </template>

                    <template #empty-actions>
                        <UButton label="Create Monitor" color="primary" @click="showCreateModal = true" />
                    </template>
                </DashboardDataTable>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

    <!-- Create Monitor Modal -->
    <DashboardModal
        v-model:open="showCreateModal"
        title="Create Monitor"
        icon="i-lucide-heart-pulse"
    >
        <UForm :schema="createSchema" :state="createForm" class="space-y-4" @submit="handleCreate">
            <UFormField label="Name" name="name" required>
                <UInput v-model="createForm.name" placeholder="Website API" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
                <UFormField label="Type" name="type" required>
                    <USelect v-model="createForm.type" :items="[{ label: 'HTTP', value: 'http' }, { label: 'TCP', value: 'tcp' }]" class="w-full" />
                </UFormField>
                <UFormField label="Enabled" name="is_enabled">
                    <USwitch v-model="createForm.is_enabled" label="Enabled" />
                </UFormField>
            </div>

            <UFormField label="Target" name="target" required>
                <UInput v-model="createForm.target" placeholder="https://api.example.com/health" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
                <UFormField label="Interval (seconds)" name="interval_seconds" required>
                    <UInput v-model="createForm.interval_seconds" type="number" class="w-full" />
                </UFormField>
                <UFormField label="Timeout (seconds)" name="timeout_seconds" required>
                    <UInput v-model="createForm.timeout_seconds" type="number" class="w-full" />
                </UFormField>
            </div>

            <template v-if="createForm.type === 'http'">
                <div class="grid grid-cols-2 gap-4">
                    <UFormField label="HTTP Method" name="http_method">
                        <USelect v-model="createForm.http_method" :items="['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].map(m => ({ label: m, value: m }))" class="w-full" />
                    </UFormField>
                    <UFormField label="Expected Status" name="expected_http_status">
                        <UInput v-model="createForm.expected_http_status" type="number" class="w-full" />
                    </UFormField>
                </div>
                <div class="flex gap-4">
                    <UFormField name="follow_redirects">
                        <UCheckbox v-model="createForm.follow_redirects" label="Follow redirects" />
                    </UFormField>
                    <UFormField name="verify_tls">
                        <UCheckbox v-model="createForm.verify_tls" label="Verify TLS" />
                    </UFormField>
                </div>
            </template>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showCreateModal = false" />
                <UButton type="submit" label="Create" color="primary" />
            </div>
        </UForm>
    </DashboardModal>

    <!-- Edit Monitor Modal -->
    <DashboardModal
        v-model:open="showEditModal"
        :title="`Edit Monitor: ${selectedMonitor?.name}`"
        icon="i-lucide-pencil"
    >
        <div class="space-y-4">
            <UFormField label="Name">
                <UInput v-model="editForm.name" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
                <UFormField label="Type">
                    <USelect v-model="editForm.type" :items="[{ label: 'HTTP', value: 'http' }, { label: 'TCP', value: 'tcp' }]" class="w-full" />
                </UFormField>
                <UFormField label="Enabled">
                    <USwitch v-model="editForm.is_enabled" label="Enabled" />
                </UFormField>
            </div>

            <UFormField label="Target">
                <UInput v-model="editForm.target" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
                <UFormField label="Interval (seconds)">
                    <UInput v-model="editForm.interval_seconds" type="number" class="w-full" />
                </UFormField>
                <UFormField label="Timeout (seconds)">
                    <UInput v-model="editForm.timeout_seconds" type="number" class="w-full" />
                </UFormField>
            </div>

            <template v-if="editForm.type === 'http'">
                <div class="grid grid-cols-2 gap-4">
                    <UFormField label="HTTP Method">
                        <USelect v-model="editForm.http_method" :items="['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].map(m => ({ label: m, value: m }))" class="w-full" />
                    </UFormField>
                    <UFormField label="Expected Status">
                        <UInput v-model="editForm.expected_http_status" type="number" class="w-full" />
                    </UFormField>
                </div>
                <div class="flex gap-4">
                    <UFormField>
                        <UCheckbox v-model="editForm.follow_redirects" label="Follow redirects" />
                    </UFormField>
                    <UFormField>
                        <UCheckbox v-model="editForm.verify_tls" label="Verify TLS" />
                    </UFormField>
                </div>
            </template>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showEditModal = false" />
                <UButton label="Save" color="primary" @click="submitEdit" />
            </div>
        </div>
    </DashboardModal>

    <!-- Check Result Modal -->
    <DashboardModal
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

    <!-- Delete Monitor Modal -->
    <DashboardDeleteModal
        v-model:open="deleteConfirmOpen"
        title="Delete Monitor"
        :warning-text="`Are you sure you want to delete monitor &quot;${deleteTarget?.name || ''}&quot;? This action cannot be undone.`"
        :on-delete="onDeleteMonitor"
        :prevent-auto-close="true"
    />
</template>
