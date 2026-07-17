<script setup lang="ts">
import type { TableColumn } from '#ui/types'
import type { GetAdminStatusPageMaintenanceResponses } from '@/api-client/types.gen'
import { zPostAdminStatusPageMaintenanceBody, zPutAdminStatusPageMaintenanceByMaintenanceIdBody } from '~/api-client/zod.gen'

type Maintenance = GetAdminStatusPageMaintenanceResponses[200]['data'][number]

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

const maintenanceColumns: TableColumn<Maintenance>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'title', header: 'Title' },
    { accessorKey: 'status', header: 'Status' },
    { id: 'schedule', header: 'Schedule' },
    { id: 'actions', header: '', enableSorting: false, enableHiding: false }
]

const {
    data: maintenance,
    loading,
    refresh
} = await useAPILazyAsyncData<Maintenance[]>('admin-maintenance', async () => {
    const res = await useAPI((api) => api.getAdminStatusPageMaintenance({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load maintenance', description: res.message, color: 'error' })
        return []
    }
    return res.data
})

const createSchema = zPostAdminStatusPageMaintenanceBody
const createForm = reactive<z.output<typeof createSchema>>({
    title: '',
    message: '',
    status: 'scheduled',
    scheduled_start_at: Date.now(),
    scheduled_end_at: undefined
})
const showCreateModal = ref(false)

const editSchema = zPutAdminStatusPageMaintenanceByMaintenanceIdBody
const editForm = reactive<z.output<typeof editSchema>>({})
const showEditModal = ref(false)
const selectedMaintenance = ref<Maintenance | null>(null)

const deleteConfirmOpen = ref(false)
const deleteTarget = ref<Maintenance | null>(null)

function openCreate() {
    createForm.title = ''
    createForm.message = ''
    createForm.status = 'scheduled'
    createForm.scheduled_start_at = Date.now()
    createForm.scheduled_end_at = undefined
    showCreateModal.value = true
}

async function handleCreate() {
    const res = await useAPI((api) => api.postAdminStatusPageMaintenance({ body: createForm }))
    if (res.success) {
        toast.add({ title: 'Maintenance created', color: 'success' })
        showCreateModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Create failed', description: res.message, color: 'error' })
    }
}

function openEdit(item: Maintenance) {
    selectedMaintenance.value = item
    editForm.title = item.title
    editForm.message = item.message
    editForm.status = item.status
    editForm.scheduled_start_at = item.scheduled_start_at
    editForm.scheduled_end_at = item.scheduled_end_at ?? null
    showEditModal.value = true
}

async function handleEdit() {
    if (!selectedMaintenance.value) return
    const res = await useAPI((api) => api.putAdminStatusPageMaintenanceByMaintenanceId({
        path: { maintenanceId: selectedMaintenance.value.id },
        body: editForm
    }))
    if (res.success) {
        toast.add({ title: 'Maintenance updated', color: 'success' })
        showEditModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

function openDelete(item: Maintenance) {
    deleteTarget.value = item
    deleteConfirmOpen.value = true
}

async function onDelete() {
    if (!deleteTarget.value) return
    const res = await useAPI((api) => api.deleteAdminStatusPageMaintenanceByMaintenanceId({
        path: { maintenanceId: deleteTarget.value.id }
    }))
    if (res.success) {
        toast.add({ title: 'Maintenance deleted', color: 'success' })
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
                        { column: 'status', type: 'select', placeholder: 'All statuses', icon: 'i-lucide-filter', options: ['scheduled', 'in_progress', 'completed', 'cancelled'].map(s => ({ label: s.replace('_', ' '), value: s })) }
                    ]"
                    empty-title="No maintenance"
                    empty-description="There are no scheduled maintenance entries yet."
                    empty-icon="i-lucide-calendar-clock"
                    @refresh="refresh"
                >
                    <template #header-right>
                        <UButton label="New Maintenance" icon="i-lucide-plus" color="primary" @click="openCreate" />
                    </template>

                    <template #id-cell="{ row }">
                        <span class="font-mono text-sm">#{{ row.original.id }}</span>
                    </template>

                    <template #status-cell="{ row }">
                        <UBadge :color="getMaintenanceStatusColor(row.original.status)" variant="soft" class="capitalize">
                            {{ row.original.status.replace('_', ' ') }}
                        </UBadge>
                    </template>

                    <template #schedule-cell="{ row }">
                        <span class="text-slate-400">
                            {{ formatDate(row.original.scheduled_start_at) }}
                            <span v-if="row.original.scheduled_end_at"> — {{ formatDate(row.original.scheduled_end_at) }}</span>
                        </span>
                    </template>

                    <template #actions-cell="{ row }">
                        <div class="flex gap-2">
                            <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="xs" @click="openEdit(row.original)" />
                            <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="xs" @click="openDelete(row.original)" />
                        </div>
                    </template>

                    <template #empty-actions>
                        <UButton label="Create Maintenance" color="primary" @click="openCreate" />
                    </template>
                </DashboardDataTable>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

    <DashboardModal v-model:open="showCreateModal" title="Create Maintenance" icon="i-lucide-calendar-clock">
        <UForm :schema="createSchema" :state="createForm" class="space-y-4" @submit="handleCreate">
            <UFormField label="Title" name="title" required>
                <UInput v-model="createForm.title" class="w-full" />
            </UFormField>
            <UFormField label="Message" name="message" required>
                <UTextarea v-model="createForm.message" class="w-full" />
            </UFormField>
            <UFormField label="Status" name="status" required>
                <USelect v-model="createForm.status" :items="['scheduled', 'in_progress', 'completed', 'cancelled'].map(s => ({ label: s.replace('_', ' '), value: s }))" class="w-full" />
            </UFormField>
            <UFormField label="Start" name="scheduled_start_at" required>
                <UInput :model-value="formatDateISO(createForm.scheduled_start_at)" type="datetime-local" class="w-full" @update:model-value="createForm.scheduled_start_at = parseDateISO($event)" />
            </UFormField>
            <UFormField label="End (optional)" name="scheduled_end_at">
                <UInput :model-value="formatDateISO(createForm.scheduled_end_at)" type="datetime-local" class="w-full" @update:model-value="createForm.scheduled_end_at = $event ? parseDateISO($event) : undefined" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showCreateModal = false" />
                <UButton type="submit" label="Create" color="primary" />
            </div>
        </UForm>
    </DashboardModal>

    <DashboardModal v-model:open="showEditModal" title="Edit Maintenance" icon="i-lucide-pencil">
        <div class="space-y-4">
            <UFormField label="Title" required>
                <UInput v-model="editForm.title" class="w-full" />
            </UFormField>
            <UFormField label="Message" required>
                <UTextarea v-model="editForm.message" class="w-full" />
            </UFormField>
            <UFormField label="Status" required>
                <USelect v-model="editForm.status" :items="['scheduled', 'in_progress', 'completed', 'cancelled'].map(s => ({ label: s.replace('_', ' '), value: s }))" class="w-full" />
            </UFormField>
            <UFormField label="Start" required>
                <UInput :model-value="formatDateISO(editForm.scheduled_start_at)" type="datetime-local" class="w-full" @update:model-value="editForm.scheduled_start_at = parseDateISO($event)" />
            </UFormField>
            <UFormField label="End (optional)">
                <UInput :model-value="formatDateISO(editForm.scheduled_end_at ?? undefined)" type="datetime-local" class="w-full" @update:model-value="editForm.scheduled_end_at = $event ? parseDateISO($event) : null" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showEditModal = false" />
                <UButton label="Save" color="primary" @click="handleEdit" />
            </div>
        </div>
    </DashboardModal>

    <DashboardDeleteModal
        v-model:open="deleteConfirmOpen"
        title="Delete Maintenance"
        :warning-text="`Are you sure you want to delete maintenance &quot;${deleteTarget?.title || ''}&quot;? This action cannot be undone.`"
        :on-delete="onDelete"
        :prevent-auto-close="true"
    />
</template>
