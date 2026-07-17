<script setup lang="ts">
import type { TableColumn } from '#ui/types'
import type { GetAdminStatusPageIncidentsResponses } from '@/api-client/types.gen'
import { zPostAdminStatusPageIncidentsBody, zPutAdminStatusPageIncidentsByIncidentIdBody } from '~/api-client/zod.gen'

type Incident = GetAdminStatusPageIncidentsResponses[200]['data'][number]

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Incidents | LeiCraft_MC Status Page',
    description: 'Manage incidents'
})

const toast = useToast()
const userInfoStore = useUserInfoStore()
const currentUser = await userInfoStore.use()
if (!userInfoStore.isValid(currentUser) || currentUser.value.role !== 'admin') {
    await navigateTo('/dashboard')
}

const incidentColumns: TableColumn<Incident>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'title', header: 'Title' },
    { accessorKey: 'status', header: 'Status' },
    { accessorKey: 'severity', header: 'Severity' },
    { id: 'started_at', header: 'Started' },
    { id: 'actions', header: '', enableSorting: false, enableHiding: false }
]

const {
    data: incidents,
    loading,
    refresh
} = await useAPILazyAsyncData<Incident[]>('admin-incidents', async () => {
    const res = await useAPI((api) => api.getAdminStatusPageIncidents({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load incidents', description: res.message, color: 'error' })
        return []
    }
    return res.data
})

const createSchema = zPostAdminStatusPageIncidentsBody
const createForm = reactive<z.output<typeof createSchema>>({
    title: '',
    message: '',
    status: 'investigating',
    severity: 'major'
})
const showCreateModal = ref(false)

const editSchema = zPutAdminStatusPageIncidentsByIncidentIdBody
const editForm = reactive<z.output<typeof editSchema>>({})
const showEditModal = ref(false)
const selectedIncident = ref<Incident | null>(null)

const deleteConfirmOpen = ref(false)
const deleteTarget = ref<Incident | null>(null)

function openCreate() {
    createForm.title = ''
    createForm.message = ''
    createForm.status = 'investigating'
    createForm.severity = 'major'
    showCreateModal.value = true
}

async function handleCreate() {
    const res = await useAPI((api) => api.postAdminStatusPageIncidents({ body: createForm }))
    if (res.success) {
        toast.add({ title: 'Incident created', color: 'success' })
        showCreateModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Create failed', description: res.message, color: 'error' })
    }
}

function openEdit(incident: Incident) {
    selectedIncident.value = incident
    editForm.title = incident.title
    editForm.message = incident.message
    editForm.status = incident.status
    editForm.severity = incident.severity
    showEditModal.value = true
}

async function handleEdit() {
    if (!selectedIncident.value) return
    const res = await useAPI((api) => api.putAdminStatusPageIncidentsByIncidentId({
        path: { incidentId: selectedIncident.value.id },
        body: editForm
    }))
    if (res.success) {
        toast.add({ title: 'Incident updated', color: 'success' })
        showEditModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

function openDelete(incident: Incident) {
    deleteTarget.value = incident
    deleteConfirmOpen.value = true
}

async function onDelete() {
    if (!deleteTarget.value) return
    const res = await useAPI((api) => api.deleteAdminStatusPageIncidentsByIncidentId({
        path: { incidentId: deleteTarget.value.id }
    }))
    if (res.success) {
        toast.add({ title: 'Incident deleted', color: 'success' })
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
                title="Incidents"
                icon="i-lucide-alert-triangle"
                description="Manage status page incidents"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <DashboardDataTable
                    :data="incidents"
                    :columns="incidentColumns"
                    :loading="loading"
                    :filters="[
                        { column: 'status', type: 'select', placeholder: 'All statuses', icon: 'i-lucide-filter', options: ['investigating', 'identified', 'monitoring', 'resolved'].map(s => ({ label: s, value: s })) },
                        { column: 'severity', type: 'select', placeholder: 'All severities', icon: 'i-lucide-filter', options: ['critical', 'major', 'minor', 'maintenance'].map(s => ({ label: s, value: s })) }
                    ]"
                    empty-title="No incidents"
                    empty-description="There are no incidents yet."
                    empty-icon="i-lucide-alert-triangle"
                    @refresh="refresh"
                >
                    <template #header-right>
                        <UButton label="New Incident" icon="i-lucide-plus" color="primary" @click="openCreate" />
                    </template>

                    <template #id-cell="{ row }">
                        <span class="font-mono text-sm">#{{ row.original.id }}</span>
                    </template>

                    <template #status-cell="{ row }">
                        <UBadge :color="getIncidentStatusColor(row.original.status)" variant="soft" class="capitalize">
                            {{ row.original.status }}
                        </UBadge>
                    </template>

                    <template #severity-cell="{ row }">
                        <UBadge :color="getSeverityColor(row.original.severity)" variant="soft" class="capitalize">
                            {{ row.original.severity }}
                        </UBadge>
                    </template>

                    <template #started_at-cell="{ row }">
                        <span class="text-slate-400">{{ formatDate(row.original.started_at) }}</span>
                    </template>

                    <template #actions-cell="{ row }">
                        <div class="flex gap-2">
                            <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="xs" @click="openEdit(row.original)" />
                            <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="xs" @click="openDelete(row.original)" />
                        </div>
                    </template>

                    <template #empty-actions>
                        <UButton label="Create Incident" color="primary" @click="openCreate" />
                    </template>
                </DashboardDataTable>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

    <DashboardModal v-model:open="showCreateModal" title="Create Incident" icon="i-lucide-alert-triangle">
        <UForm :schema="createSchema" :state="createForm" class="space-y-4" @submit="handleCreate">
            <UFormField label="Title" name="title" required>
                <UInput v-model="createForm.title" class="w-full" />
            </UFormField>
            <UFormField label="Message" name="message" required>
                <UTextarea v-model="createForm.message" class="w-full" />
            </UFormField>
            <div class="grid grid-cols-2 gap-4">
                <UFormField label="Status" name="status" required>
                    <USelect v-model="createForm.status" :items="['investigating', 'identified', 'monitoring', 'resolved'].map(s => ({ label: s, value: s }))" class="w-full" />
                </UFormField>
                <UFormField label="Severity" name="severity" required>
                    <USelect v-model="createForm.severity" :items="['critical', 'major', 'minor', 'maintenance'].map(s => ({ label: s, value: s }))" class="w-full" />
                </UFormField>
            </div>
            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showCreateModal = false" />
                <UButton type="submit" label="Create" color="primary" />
            </div>
        </UForm>
    </DashboardModal>

    <DashboardModal v-model:open="showEditModal" title="Edit Incident" icon="i-lucide-pencil">
        <div class="space-y-4">
            <UFormField label="Title" required>
                <UInput v-model="editForm.title" class="w-full" />
            </UFormField>
            <UFormField label="Message" required>
                <UTextarea v-model="editForm.message" class="w-full" />
            </UFormField>
            <div class="grid grid-cols-2 gap-4">
                <UFormField label="Status" required>
                    <USelect v-model="editForm.status" :items="['investigating', 'identified', 'monitoring', 'resolved'].map(s => ({ label: s, value: s }))" class="w-full" />
                </UFormField>
                <UFormField label="Severity" required>
                    <USelect v-model="editForm.severity" :items="['critical', 'major', 'minor', 'maintenance'].map(s => ({ label: s, value: s }))" class="w-full" />
                </UFormField>
            </div>
            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showEditModal = false" />
                <UButton label="Save" color="primary" @click="handleEdit" />
            </div>
        </div>
    </DashboardModal>

    <DashboardDeleteModal
        v-model:open="deleteConfirmOpen"
        title="Delete Incident"
        :warning-text="`Are you sure you want to delete incident &quot;${deleteTarget?.title || ''}&quot;? This action cannot be undone.`"
        :on-delete="onDelete"
        :prevent-auto-close="true"
    />
</template>
