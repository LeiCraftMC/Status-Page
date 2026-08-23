<script setup lang="ts">
import type { DropdownMenuItem, TableColumn, FormSubmitEvent } from '#ui/types'
import type { GetStatusPageMaintenanceResponses } from '@/api-client/types.gen'
import * as z from 'zod'
import { zPostStatusPageMaintenanceBody, zPutStatusPageMaintenanceByMaintenanceIdBody } from '~/api-client/zod.gen'

type Maintenance = GetStatusPageMaintenanceResponses[200]['data'][number]

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Maintenance | LeiCraft_MC Status Page',
    description: 'Manage scheduled maintenance'
})

const toast = useToast()
const userInfoStore = useUserInfoStore()
const currentUser = await userInfoStore.use()
if (!userInfoStore.isValid(currentUser) || currentUser.value.role !== 'admin') {
    await navigateTo('/dashboard')
}

const {
    data: maintenance,
    loading,
    refresh
} = await useAPILazyAsyncData<Maintenance[]>('admin-status-page-maintenance', async () => {
    const res = await useAPI((api) => api.getStatusPageMaintenance({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load maintenance', description: res.message, color: 'error' })
        return []
    }
    return res.data
})

const maintenanceColumns: TableColumn<Maintenance>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'title', header: 'Title' },
    { id: 'status', header: 'Status' },
    { id: 'start', header: 'Start' },
    { id: 'end', header: 'End' },
    { id: 'actions', header: '', enableSorting: false, enableHiding: false }
]

const statusOptions = [
    { label: 'Scheduled', value: 'scheduled' },
    { label: 'In Progress', value: 'in_progress' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' }
]

// Create
const createSchema = zPostStatusPageMaintenanceBody.extend({
    scheduled_start_at: z.string().min(1, 'Start time is required').transform((v) => parseDateISO(v)),
    scheduled_end_at: z.string().optional().transform((v) => v ? parseDateISO(v) : undefined)
})
type CreateSchema = z.input<typeof createSchema>
type CreateOutput = z.output<typeof createSchema>
const createForm = reactive<CreateSchema>({
    title: '',
    message: '',
    status: 'scheduled',
    scheduled_start_at: '',
    scheduled_end_at: undefined
})
const showCreateModal = ref(false)

async function handleCreate(event: FormSubmitEvent<CreateOutput>) {
    const body: CreateOutput = {
        title: event.data.title,
        message: event.data.message,
        status: event.data.status,
        scheduled_start_at: event.data.scheduled_start_at,
        scheduled_end_at: event.data.scheduled_end_at
    }

    const res = await useAPI((api) => api.postStatusPageMaintenance({ body }))
    if (res.success) {
        toast.add({ title: 'Maintenance scheduled', color: 'success' })
        showCreateModal.value = false
        createForm.title = ''
        createForm.message = ''
        createForm.status = 'scheduled'
        createForm.scheduled_start_at = ''
        createForm.scheduled_end_at = undefined
        await refresh()
    } else {
        toast.add({ title: 'Create failed', description: res.message, color: 'error' })
    }
}

// Edit
const editSchema = zPutStatusPageMaintenanceByMaintenanceIdBody.extend({
    scheduled_start_at: z.string().optional().transform((v) => v ? parseDateISO(v) : undefined),
    scheduled_end_at: z.string().optional().nullable().transform((v) => v ? parseDateISO(v) : v === '' ? null : undefined)
})
type EditSchema = z.input<typeof editSchema>
type EditOutput = z.output<typeof editSchema>
const selectedMaintenance = ref<Maintenance | null>(null)
const editForm = reactive<EditSchema>({})
const showEditModal = ref(false)

function openEdit(item: Maintenance) {
    selectedMaintenance.value = item
    editForm.title = item.title
    editForm.message = item.message
    editForm.status = item.status
    editForm.scheduled_start_at = formatDateISO(item.scheduled_start_at)
    editForm.scheduled_end_at = item.scheduled_end_at ? formatDateISO(item.scheduled_end_at) : ''
    showEditModal.value = true
}

async function submitEdit() {
    if (!selectedMaintenance.value) return
    const parseResult = editSchema.safeParse(editForm)
    if (!parseResult.success) {
        toast.add({ title: 'Invalid values', description: parseResult.error.message, color: 'error' })
        return
    }
    const data = parseResult.data
    const body: EditOutput = {}
    if (data.title !== selectedMaintenance.value.title) body.title = data.title
    if (data.message !== selectedMaintenance.value.message) body.message = data.message
    if (data.status !== selectedMaintenance.value.status) body.status = data.status
    if (data.scheduled_start_at !== undefined && data.scheduled_start_at !== selectedMaintenance.value.scheduled_start_at) body.scheduled_start_at = data.scheduled_start_at
    if (data.scheduled_end_at !== undefined && data.scheduled_end_at !== selectedMaintenance.value.scheduled_end_at) body.scheduled_end_at = data.scheduled_end_at

    const res = await useAPI((api) => api.putStatusPageMaintenanceByMaintenanceId({
        path: { maintenanceId: selectedMaintenance.value!.id },
        body
    }))
    if (res.success) {
        toast.add({ title: 'Maintenance updated', color: 'success' })
        showEditModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

// Delete
const deleteTarget = ref<Maintenance | null>(null)
const showDeleteModal = ref(false)

function openDelete(item: Maintenance) {
    deleteTarget.value = item
    showDeleteModal.value = true
}

async function onDelete() {
    if (!deleteTarget.value) return
    const res = await useAPI((api) => api.deleteStatusPageMaintenanceByMaintenanceId({
        path: { maintenanceId: deleteTarget.value!.id }
    }))
    if (res.success) {
        toast.add({ title: 'Maintenance deleted', color: 'success' })
        showDeleteModal.value = false
        deleteTarget.value = null
        await refresh()
    } else {
        toast.add({ title: 'Delete failed', description: res.message, color: 'error' })
    }
}

function getDropdownItems(row: { original: Maintenance }): DropdownMenuItem[][] {
    return [
        [
            { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEdit(row.original) },
            { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openDelete(row.original) }
        ]
    ]
}
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                title="Maintenance"
                icon="i-lucide-calendar-clock"
                description="Manage scheduled maintenance"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <DashboardDataTable
                    :data="maintenance"
                    :columns="maintenanceColumns"
                    :loading="loading"
                    :filters="[
                        { column: 'title', type: 'text', placeholder: 'Search maintenance...', icon: 'i-lucide-search' },
                        { column: 'status', type: 'select', placeholder: 'All statuses', icon: 'i-lucide-filter', options: statusOptions }
                    ]"
                    empty-title="No maintenance"
                    empty-description="Schedule maintenance windows to inform users about planned downtime."
                    empty-icon="i-lucide-calendar-clock"
                    @refresh="refresh"
                >
                    <template #header-right>
                        <UButton label="Schedule Maintenance" icon="i-lucide-plus" color="primary" @click="showCreateModal = true" />
                    </template>

                    <template #id-cell="{ row }">
                        <span class="font-mono text-sm">#{{ row.original.id }}</span>
                    </template>

                    <template #status-cell="{ row }">
                        <UBadge :color="getMaintenanceStatusColor(row.original.status)" variant="soft" class="capitalize">
                            {{ row.original.status.replace('_', ' ') }}
                        </UBadge>
                    </template>

                    <template #start-cell="{ row }">
                        <span class="text-slate-400">{{ formatDate(row.original.scheduled_start_at) }}</span>
                    </template>

                    <template #end-cell="{ row }">
                        <span class="text-slate-400">{{ row.original.scheduled_end_at ? formatDate(row.original.scheduled_end_at) : '-' }}</span>
                    </template>

                    <template #actions-cell="{ row }">
                        <UDropdownMenu :items="getDropdownItems(row)">
                            <UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
                        </UDropdownMenu>
                    </template>

                    <template #empty-actions>
                        <UButton label="Schedule Maintenance" color="primary" @click="showCreateModal = true" />
                    </template>
                </DashboardDataTable>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

    <!-- Create Maintenance Modal -->
    <DashboardModal
        v-model:open="showCreateModal"
        title="Schedule Maintenance"
        icon="i-lucide-calendar-clock"
    >
        <UForm :schema="createSchema" :state="createForm" class="space-y-4" @submit="handleCreate">
            <UFormField label="Title" name="title" required>
                <UInput v-model="createForm.title" class="w-full" />
            </UFormField>

            <UFormField label="Message" name="message" required>
                <UTextarea v-model="createForm.message" class="w-full" />
            </UFormField>

            <UFormField label="Status" name="status" required>
                <USelect v-model="createForm.status" :items="statusOptions" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UFormField label="Start" name="scheduled_start_at" required>
                    <UInput v-model="createForm.scheduled_start_at" type="datetime-local" class="w-full" />
                </UFormField>

                <UFormField label="End" name="scheduled_end_at">
                    <UInput v-model="createForm.scheduled_end_at" type="datetime-local" class="w-full" />
                </UFormField>
            </div>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showCreateModal = false" />
                <UButton type="submit" label="Schedule" color="primary" />
            </div>
        </UForm>
    </DashboardModal>

    <!-- Edit Maintenance Modal -->
    <DashboardModal
        v-model:open="showEditModal"
        :title="`Edit Maintenance: ${selectedMaintenance?.title}`"
        icon="i-lucide-pencil"
    >
        <div class="space-y-4">
            <UFormField label="Title">
                <UInput v-model="editForm.title" class="w-full" />
            </UFormField>

            <UFormField label="Message">
                <UTextarea v-model="editForm.message" class="w-full" />
            </UFormField>

            <UFormField label="Status">
                <USelect v-model="editForm.status" :items="statusOptions" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UFormField label="Start">
                    <UInput v-model="editForm.scheduled_start_at" type="datetime-local" class="w-full" />
                </UFormField>

                <UFormField label="End">
                    <UInput v-model="editForm.scheduled_end_at" type="datetime-local" class="w-full" />
                </UFormField>
            </div>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showEditModal = false" />
                <UButton label="Save" color="primary" @click="submitEdit" />
            </div>
        </div>
    </DashboardModal>

    <!-- Delete Maintenance Modal -->
    <DashboardDeleteModal
        v-model:open="showDeleteModal"
        title="Delete Maintenance"
        :warning-text="`Are you sure you want to delete maintenance &quot;${deleteTarget?.title || ''}&quot;? This action cannot be undone.`"
        :on-delete="onDelete"
    />
</template>
