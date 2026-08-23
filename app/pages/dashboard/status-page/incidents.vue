<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '#ui/types'
import type { GetStatusPageIncidentsResponses } from '@/api-client/types.gen'
import * as z from 'zod'
import {
    zPostStatusPageIncidentsBody,
    zPutStatusPageIncidentsByIncidentIdBody
} from '~/api-client/zod.gen'
import { useUserInfoStore } from '~/composables/stores/useUserStore'

type Incident = GetStatusPageIncidentsResponses[200]['data'][number]

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Incidents | LeiCraft_MC Status Page',
    description: 'Status page incidents'
})

const toast = useToast()
const userInfoStore = useUserInfoStore()
const currentUser = await userInfoStore.use()
const isAdmin = computed(() => currentUser.value?.role === 'admin')

const {
    data: incidents,
    loading,
    refresh
} = await useAPILazyAsyncData<Incident[]>('dashboard-status-page-incidents', async () => {
    const res = await useAPI((api) => api.getStatusPageIncidents({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load incidents', description: res.message, color: 'error' })
        return []
    }
    return res.data
})

const incidentColumns = computed<TableColumn<Incident>[]>(() => {
    const cols: TableColumn<Incident>[] = [
        { accessorKey: 'id', header: 'ID' },
        { accessorKey: 'title', header: 'Title' },
        { id: 'status', header: 'Status' },
        { id: 'severity', header: 'Severity' },
        { id: 'started', header: 'Started' }
    ]
    if (isAdmin.value) {
        cols.push({ id: 'actions', header: '', enableSorting: false, enableHiding: false })
    }
    return cols
})

const statusOptions = [
    { label: 'Investigating', value: 'investigating' },
    { label: 'Identified', value: 'identified' },
    { label: 'Monitoring', value: 'monitoring' },
    { label: 'Resolved', value: 'resolved' }
]

const severityOptions = [
    { label: 'Critical', value: 'critical' },
    { label: 'Major', value: 'major' },
    { label: 'Minor', value: 'minor' },
    { label: 'Maintenance', value: 'maintenance' }
]

// Create
const createSchema = zPostStatusPageIncidentsBody
type CreateSchema = z.output<typeof createSchema>
const createForm = reactive<CreateSchema>({
    title: '',
    message: '',
    status: 'investigating',
    severity: 'minor'
})
const showCreateModal = ref(false)

async function handleCreate() {
    const res = await useAPI((api) => api.postStatusPageIncidents({ body: createForm }))
    if (res.success) {
        toast.add({ title: 'Incident created', color: 'success' })
        showCreateModal.value = false
        createForm.title = ''
        createForm.message = ''
        createForm.status = 'investigating'
        createForm.severity = 'minor'
        await refresh()
    } else {
        toast.add({ title: 'Create failed', description: res.message, color: 'error' })
    }
}

// Edit
const editSchema = zPutStatusPageIncidentsByIncidentIdBody
type EditSchema = z.output<typeof editSchema>
const selectedIncident = ref<Incident | null>(null)
const editForm = reactive<EditSchema>({})
const showEditModal = ref(false)

function openEdit(incident: Incident) {
    selectedIncident.value = incident
    editForm.title = incident.title
    editForm.message = incident.message
    editForm.status = incident.status
    editForm.severity = incident.severity
    editForm.is_resolved = incident.is_resolved
    showEditModal.value = true
}

async function submitEdit() {
    if (!selectedIncident.value) return
    const body: EditSchema = {}
    if (editForm.title !== selectedIncident.value.title) body.title = editForm.title
    if (editForm.message !== selectedIncident.value.message) body.message = editForm.message
    if (editForm.status !== selectedIncident.value.status) body.status = editForm.status
    if (editForm.severity !== selectedIncident.value.severity) body.severity = editForm.severity
    if (editForm.is_resolved !== selectedIncident.value.is_resolved) body.is_resolved = editForm.is_resolved

    const res = await useAPI((api) => api.putStatusPageIncidentsByIncidentId({
        path: { incidentId: selectedIncident.value!.id },
        body
    }))
    if (res.success) {
        toast.add({ title: 'Incident updated', color: 'success' })
        showEditModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

// Delete
const deleteTarget = ref<Incident | null>(null)
const showDeleteModal = ref(false)

function openDelete(incident: Incident) {
    deleteTarget.value = incident
    showDeleteModal.value = true
}

async function onDelete() {
    if (!deleteTarget.value) return
    const res = await useAPI((api) => api.deleteStatusPageIncidentsByIncidentId({
        path: { incidentId: deleteTarget.value!.id }
    }))
    if (res.success) {
        toast.add({ title: 'Incident deleted', color: 'success' })
        showDeleteModal.value = false
        deleteTarget.value = null
        await refresh()
    } else {
        toast.add({ title: 'Delete failed', description: res.message, color: 'error' })
    }
}

function getDropdownItems(row: { original: Incident }): DropdownMenuItem[][] {
    if (!isAdmin.value) return []
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
                title="Incidents"
                icon="i-lucide-alert-triangle"
                description="Status page incidents"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <DashboardDataTable
                    :data="incidents"
                    :columns="incidentColumns"
                    :loading="loading"
                    :filters="[
                        { column: 'title', type: 'text', placeholder: 'Search incidents...', icon: 'i-lucide-search' },
                        { column: 'status', type: 'select', placeholder: 'All statuses', icon: 'i-lucide-filter', options: statusOptions },
                        { column: 'severity', type: 'select', placeholder: 'All severities', icon: 'i-lucide-filter', options: severityOptions }
                    ]"
                    empty-title="No incidents"
                    empty-description="Admins can create incidents to communicate service disruptions."
                    empty-icon="i-lucide-alert-triangle"
                    @refresh="refresh"
                >
                    <template #header-right>
                        <UButton v-if="isAdmin" label="New Incident" icon="i-lucide-plus" color="primary" @click="showCreateModal = true" />
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

                    <template #started-cell="{ row }">
                        <span class="text-slate-400">{{ formatDate(row.original.started_at) }}</span>
                    </template>

                    <template #actions-cell="{ row }">
                        <UDropdownMenu :items="getDropdownItems(row)">
                            <UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
                        </UDropdownMenu>
                    </template>

                    <template #empty-actions>
                        <UButton v-if="isAdmin" label="Create Incident" color="primary" @click="showCreateModal = true" />
                    </template>
                </DashboardDataTable>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

    <!-- Create Incident Modal -->
    <DashboardModal
        v-if="isAdmin"
        v-model:open="showCreateModal"
        title="Create Incident"
        icon="i-lucide-alert-triangle"
    >
        <UForm :schema="createSchema" :state="createForm" class="space-y-4" @submit="handleCreate">
            <UFormField label="Title" name="title" required>
                <UInput v-model="createForm.title" class="w-full" />
            </UFormField>

            <UFormField label="Message" name="message" required>
                <UTextarea v-model="createForm.message" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
                <UFormField label="Status" name="status" required>
                    <USelect v-model="createForm.status" :items="statusOptions" class="w-full" />
                </UFormField>

                <UFormField label="Severity" name="severity" required>
                    <USelect v-model="createForm.severity" :items="severityOptions" class="w-full" />
                </UFormField>
            </div>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showCreateModal = false" />
                <UButton type="submit" label="Create" color="primary" />
            </div>
        </UForm>
    </DashboardModal>

    <!-- Edit Incident Modal -->
    <DashboardModal
        v-if="isAdmin"
        v-model:open="showEditModal"
        :title="`Edit Incident: ${selectedIncident?.title}`"
        icon="i-lucide-pencil"
    >
        <div class="space-y-4">
            <UFormField label="Title">
                <UInput v-model="editForm.title" class="w-full" />
            </UFormField>

            <UFormField label="Message">
                <UTextarea v-model="editForm.message" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
                <UFormField label="Status">
                    <USelect v-model="editForm.status" :items="statusOptions" class="w-full" />
                </UFormField>

                <UFormField label="Severity">
                    <USelect v-model="editForm.severity" :items="severityOptions" class="w-full" />
                </UFormField>
            </div>

            <UFormField label="Resolved">
                <USwitch v-model="editForm.is_resolved" label="Mark as resolved" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showEditModal = false" />
                <UButton label="Save" color="primary" @click="submitEdit" />
            </div>
        </div>
    </DashboardModal>

    <!-- Delete Incident Modal -->
    <DashboardDeleteModal
        v-if="isAdmin"
        v-model:open="showDeleteModal"
        title="Delete Incident"
        :warning-text="`Are you sure you want to delete incident &quot;${deleteTarget?.title || ''}&quot;? This action cannot be undone.`"
        :on-delete="onDelete"
    />
</template>
