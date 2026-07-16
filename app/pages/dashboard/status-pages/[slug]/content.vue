<script setup lang="ts">
import type { DropdownMenuItem, TableColumn, FormSubmitEvent } from '#ui/types'
import * as z from 'zod'
import {
    zPostStatusPagesBySlugIncidentsBody,
    zPutStatusPagesBySlugIncidentsByIncidentIdBody,
    zPostStatusPagesBySlugMaintenanceBody,
    zPutStatusPagesBySlugMaintenanceByMaintenanceIdBody,
    zPostStatusPagesBySlugUpdatesBody,
    zPutStatusPagesBySlugUpdatesByUpdateIdBody
} from '~/api-client/zod.gen'

const route = useRoute()
const slug = route.params.slug as string

if (!slug) {
    throw new Error('Status page slug is required')
}

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Content | LeiCraft_MC Status Page',
    description: 'Manage status page content'
})

const toast = useToast()

const selectedTab = ref('incidents')

const {
    data: incidents,
    loading: incidentsLoading,
    refresh: refreshIncidents
} = await useAPILazyAsyncData<GetStatusPagesBySlugIncidentsResponses[200]['data']>(`status-page-incidents-${slug}`, async () => {
    const res = await useAPI((api) => api.getStatusPagesBySlugIncidents({ path: { slug } }))
    if (!res.success) {
        toast.add({ title: 'Failed to load incidents', description: res.message, color: 'error' })
        return []
    }
    return res.data
})

const {
    data: maintenance,
    loading: maintenanceLoading,
    refresh: refreshMaintenance
} = await useAPILazyAsyncData<GetStatusPagesBySlugMaintenanceResponses[200]['data']>(`status-page-maintenance-${slug}`, async () => {
    const res = await useAPI((api) => api.getStatusPagesBySlugMaintenance({ path: { slug } }))
    if (!res.success) {
        toast.add({ title: 'Failed to load maintenance', description: res.message, color: 'error' })
        return []
    }
    return res.data
})

const {
    data: updates,
    loading: updatesLoading,
    refresh: refreshUpdates
} = await useAPILazyAsyncData<GetStatusPagesBySlugUpdatesResponses[200]['data']>(`status-page-updates-${slug}`, async () => {
    const res = await useAPI((api) => api.getStatusPagesBySlugUpdates({ path: { slug } }))
    if (!res.success) {
        toast.add({ title: 'Failed to load updates', description: res.message, color: 'error' })
        return []
    }
    return res.data
})

function refreshAll() {
    refreshIncidents()
    refreshMaintenance()
    refreshUpdates()
}

// Incidents
const incidentSchema = zPostStatusPagesBySlugIncidentsBody
type IncidentSchema = z.output<typeof incidentSchema>
const incidentColumns: TableColumn<GetStatusPagesBySlugIncidentsResponses[200]['data'][number]>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'title', header: 'Title' },
    { id: 'status', header: 'Status' },
    { id: 'severity', header: 'Severity' },
    { accessorKey: 'started_at', header: 'Started' },
    { id: 'actions', header: '', enableSorting: false, enableHiding: false }
]
const showIncidentModal = ref(false)
const incidentForm = reactive<IncidentSchema>({
    title: '',
    message: '',
    status: 'investigating',
    severity: 'major'
})
const editingIncident = ref<GetStatusPagesBySlugIncidentsResponses[200]['data'][number] | null>(null)
const editIncidentForm = reactive<Partial<IncidentSchema>>({
    title: '',
    message: '',
    status: undefined,
    severity: undefined
})
const deleteIncidentTarget = ref<GetStatusPagesBySlugIncidentsResponses[200]['data'][number] | null>(null)
const deleteIncidentOpen = ref(false)

async function submitIncident(event: FormSubmitEvent<IncidentSchema>) {
    const res = await useAPI((api) => api.postStatusPagesBySlugIncidents({
        path: { slug },
        body: event.data
    }))
    if (res.success) {
        toast.add({ title: 'Incident created', color: 'success' })
        showIncidentModal.value = false
        incidentForm.title = ''
        incidentForm.message = ''
        await refreshIncidents()
    } else {
        toast.add({ title: 'Create failed', description: res.message, color: 'error' })
    }
}

function startEditIncident(item: GetStatusPagesBySlugIncidentsResponses[200]['data'][number]) {
    editingIncident.value = item
    editIncidentForm.title = item.title
    editIncidentForm.message = item.message
    editIncidentForm.status = item.status
    editIncidentForm.severity = item.severity
}

async function saveIncidentEdit() {
    if (!editingIncident.value) return
    const res = await useAPI((api) => api.putStatusPagesBySlugIncidentsByIncidentId({
        path: { slug, incidentId: editingIncident.value.id },
        body: editIncidentForm
    }))
    if (res.success) {
        toast.add({ title: 'Incident updated', color: 'success' })
        editingIncident.value = null
        await refreshIncidents()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

function openDeleteIncident(item: GetStatusPagesBySlugIncidentsResponses[200]['data'][number]) {
    deleteIncidentTarget.value = item
    deleteIncidentOpen.value = true
}

async function onDeleteIncident() {
    if (!deleteIncidentTarget.value) return
    const res = await useAPI((api) => api.deleteStatusPagesBySlugIncidentsByIncidentId({
        path: { slug, incidentId: deleteIncidentTarget.value.id }
    }))
    if (res.success) {
        toast.add({ title: 'Incident deleted', color: 'success' })
        deleteIncidentOpen.value = false
        deleteIncidentTarget.value = null
        await refreshIncidents()
    } else {
        toast.add({ title: 'Delete failed', description: res.message, color: 'error' })
    }
}

// Maintenance
const maintenanceSchema = zPostStatusPagesBySlugMaintenanceBody
type MaintenanceSchema = z.output<typeof maintenanceSchema>
const maintenanceColumns: TableColumn<GetStatusPagesBySlugMaintenanceResponses[200]['data'][number]>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'title', header: 'Title' },
    { id: 'status', header: 'Status' },
    { accessorKey: 'scheduled_start_at', header: 'Start' },
    { accessorKey: 'scheduled_end_at', header: 'End' },
    { id: 'actions', header: '', enableSorting: false, enableHiding: false }
]
const showMaintenanceModal = ref(false)
const maintenanceForm = reactive<MaintenanceSchema>({
    title: '',
    message: '',
    status: 'scheduled',
    scheduled_start_at: Math.floor(Date.now() / 1000),
    scheduled_end_at: undefined
})
const editingMaintenance = ref<GetStatusPagesBySlugMaintenanceResponses[200]['data'][number] | null>(null)
const editMaintenanceForm = reactive<Partial<MaintenanceSchema>>({
    title: '',
    message: '',
    status: undefined,
    scheduled_start_at: undefined,
    scheduled_end_at: undefined
})
const deleteMaintenanceTarget = ref<GetStatusPagesBySlugMaintenanceResponses[200]['data'][number] | null>(null)
const deleteMaintenanceOpen = ref(false)

async function submitMaintenance(event: FormSubmitEvent<MaintenanceSchema>) {
    const body: MaintenanceSchema = {
        title: event.data.title,
        message: event.data.message,
        status: event.data.status,
        scheduled_start_at: event.data.scheduled_start_at
    }
    if (event.data.scheduled_end_at) {
        body.scheduled_end_at = event.data.scheduled_end_at
    }
    const res = await useAPI((api) => api.postStatusPagesBySlugMaintenance({
        path: { slug },
        body
    }))
    if (res.success) {
        toast.add({ title: 'Maintenance created', color: 'success' })
        showMaintenanceModal.value = false
        maintenanceForm.title = ''
        maintenanceForm.message = ''
        await refreshMaintenance()
    } else {
        toast.add({ title: 'Create failed', description: res.message, color: 'error' })
    }
}

function startEditMaintenance(item: GetStatusPagesBySlugMaintenanceResponses[200]['data'][number]) {
    editingMaintenance.value = item
    editMaintenanceForm.title = item.title
    editMaintenanceForm.message = item.message
    editMaintenanceForm.status = item.status
    editMaintenanceForm.scheduled_start_at = item.scheduled_start_at
    editMaintenanceForm.scheduled_end_at = item.scheduled_end_at ?? undefined
}

async function saveMaintenanceEdit() {
    if (!editingMaintenance.value) return
    const body: Partial<MaintenanceSchema> = {
        title: editMaintenanceForm.title,
        message: editMaintenanceForm.message,
        status: editMaintenanceForm.status,
        scheduled_start_at: editMaintenanceForm.scheduled_start_at,
        scheduled_end_at: editMaintenanceForm.scheduled_end_at
    }
    const res = await useAPI((api) => api.putStatusPagesBySlugMaintenanceByMaintenanceId({
        path: { slug, maintenanceId: editingMaintenance.value.id },
        body
    }))
    if (res.success) {
        toast.add({ title: 'Maintenance updated', color: 'success' })
        editingMaintenance.value = null
        await refreshMaintenance()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

function openDeleteMaintenance(item: GetStatusPagesBySlugMaintenanceResponses[200]['data'][number]) {
    deleteMaintenanceTarget.value = item
    deleteMaintenanceOpen.value = true
}

async function onDeleteMaintenance() {
    if (!deleteMaintenanceTarget.value) return
    const res = await useAPI((api) => api.deleteStatusPagesBySlugMaintenanceByMaintenanceId({
        path: { slug, maintenanceId: deleteMaintenanceTarget.value.id }
    }))
    if (res.success) {
        toast.add({ title: 'Maintenance deleted', color: 'success' })
        deleteMaintenanceOpen.value = false
        deleteMaintenanceTarget.value = null
        await refreshMaintenance()
    } else {
        toast.add({ title: 'Delete failed', description: res.message, color: 'error' })
    }
}

// Updates
const updateSchema = zPostStatusPagesBySlugUpdatesBody
type UpdateSchema = z.output<typeof updateSchema>
const updateColumns: TableColumn<GetStatusPagesBySlugUpdatesResponses[200]['data'][number]>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'title', header: 'Title' },
    { id: 'type', header: 'Type' },
    { accessorKey: 'created_at', header: 'Created' },
    { id: 'actions', header: '', enableSorting: false, enableHiding: false }
]
const showUpdateModal = ref(false)
const updateForm = reactive<UpdateSchema>({
    title: '',
    message: '',
    type: 'general'
})
const editingUpdate = ref<GetStatusPagesBySlugUpdatesResponses[200]['data'][number] | null>(null)
const editUpdateForm = reactive<Partial<UpdateSchema>>({
    title: '',
    message: '',
    type: undefined
})
const deleteUpdateTarget = ref<GetStatusPagesBySlugUpdatesResponses[200]['data'][number] | null>(null)
const deleteUpdateOpen = ref(false)

async function submitUpdate(event: FormSubmitEvent<UpdateSchema>) {
    const res = await useAPI((api) => api.postStatusPagesBySlugUpdates({
        path: { slug },
        body: event.data
    }))
    if (res.success) {
        toast.add({ title: 'Update created', color: 'success' })
        showUpdateModal.value = false
        updateForm.title = ''
        updateForm.message = ''
        await refreshUpdates()
    } else {
        toast.add({ title: 'Create failed', description: res.message, color: 'error' })
    }
}

function startEditUpdate(item: GetStatusPagesBySlugUpdatesResponses[200]['data'][number]) {
    editingUpdate.value = item
    editUpdateForm.title = item.title
    editUpdateForm.message = item.message
    editUpdateForm.type = item.type
}

async function saveUpdateEdit() {
    if (!editingUpdate.value) return
    const res = await useAPI((api) => api.putStatusPagesBySlugUpdatesByUpdateId({
        path: { slug, updateId: editingUpdate.value.id },
        body: editUpdateForm
    }))
    if (res.success) {
        toast.add({ title: 'Update saved', color: 'success' })
        editingUpdate.value = null
        await refreshUpdates()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

function openDeleteUpdate(item: GetStatusPagesBySlugUpdatesResponses[200]['data'][number]) {
    deleteUpdateTarget.value = item
    deleteUpdateOpen.value = true
}

async function onDeleteUpdate() {
    if (!deleteUpdateTarget.value) return
    const res = await useAPI((api) => api.deleteStatusPagesBySlugUpdatesByUpdateId({
        path: { slug, updateId: deleteUpdateTarget.value.id }
    }))
    if (res.success) {
        toast.add({ title: 'Update deleted', color: 'success' })
        deleteUpdateOpen.value = false
        deleteUpdateTarget.value = null
        await refreshUpdates()
    } else {
        toast.add({ title: 'Delete failed', description: res.message, color: 'error' })
    }
}

// Helpers
function getIncidentItems(row: { original: GetStatusPagesBySlugIncidentsResponses[200]['data'][number] }): DropdownMenuItem[][] {
    return [[
        { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => startEditIncident(row.original) },
        { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openDeleteIncident(row.original) }
    ]]
}

function getMaintenanceItems(row: { original: GetStatusPagesBySlugMaintenanceResponses[200]['data'][number] }): DropdownMenuItem[][] {
    return [[
        { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => startEditMaintenance(row.original) },
        { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openDeleteMaintenance(row.original) }
    ]]
}

function getUpdateItems(row: { original: GetStatusPagesBySlugUpdatesResponses[200]['data'][number] }): DropdownMenuItem[][] {
    return [[
        { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => startEditUpdate(row.original) },
        { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openDeleteUpdate(row.original) }
    ]]
}
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                title="Status Page Content"
                icon="i-lucide-file-text"
                description="Manage incidents, maintenance, and updates"
                :breadcrumb-items="[
                    { label: 'Status Page', to: `/dashboard/status-pages/${slug}`, icon: 'i-lucide-layout-grid' },
                    { label: 'Content', icon: 'i-lucide-file-text' }
                ]"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <UTabs v-model="selectedTab" :items="[
                    { label: 'Incidents', value: 'incidents', icon: 'i-lucide-alert-triangle' },
                    { label: 'Maintenance', value: 'maintenance', icon: 'i-lucide-wrench' },
                    { label: 'Updates', value: 'updates', icon: 'i-lucide-megaphone' }
                ]">
                    <!-- Incidents -->
                    <template #incidents="{ item }">
                        <DashboardDataTable
                            :data="incidents"
                            :columns="incidentColumns"
                            :loading="incidentsLoading"
                            empty-title="No incidents"
                            empty-description="Create an incident to communicate an outage."
                            empty-icon="i-lucide-alert-triangle"
                            @refresh="refreshIncidents"
                        >
                            <template #header-right>
                                <UButton label="New Incident" icon="i-lucide-plus" color="primary" @click="showIncidentModal = true" />
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
                                <UDropdownMenu :ui="{ viewport: 'main-bg-color' }" :items="getIncidentItems(row)">
                                    <UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
                                </UDropdownMenu>
                            </template>

                            <template #empty-actions>
                                <UButton label="New Incident" color="primary" @click="showIncidentModal = true" />
                            </template>
                        </DashboardDataTable>
                    </template>

                    <!-- Maintenance -->
                    <template #maintenance="{ item }">
                        <DashboardDataTable
                            :data="maintenance"
                            :columns="maintenanceColumns"
                            :loading="maintenanceLoading"
                            empty-title="No maintenance"
                            empty-description="Schedule maintenance windows."
                            empty-icon="i-lucide-wrench"
                            @refresh="refreshMaintenance"
                        >
                            <template #header-right>
                                <UButton label="New Maintenance" icon="i-lucide-plus" color="primary" @click="showMaintenanceModal = true" />
                            </template>

                            <template #status-cell="{ row }">
                                <UBadge :color="getMaintenanceStatusColor(row.original.status)" variant="soft" class="capitalize">
                                    {{ row.original.status.replace('_', ' ') }}
                                </UBadge>
                            </template>

                            <template #scheduled_start_at-cell="{ row }">
                                <span class="text-slate-400">{{ formatDate(row.original.scheduled_start_at) }}</span>
                            </template>

                            <template #scheduled_end_at-cell="{ row }">
                                <span class="text-slate-400">{{ formatDate(row.original.scheduled_end_at) }}</span>
                            </template>

                            <template #actions-cell="{ row }">
                                <UDropdownMenu :ui="{ viewport: 'main-bg-color' }" :items="getMaintenanceItems(row)">
                                    <UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
                                </UDropdownMenu>
                            </template>

                            <template #empty-actions>
                                <UButton label="New Maintenance" color="primary" @click="showMaintenanceModal = true" />
                            </template>
                        </DashboardDataTable>
                    </template>

                    <!-- Updates -->
                    <template #updates="{ item }">
                        <DashboardDataTable
                            :data="updates"
                            :columns="updateColumns"
                            :loading="updatesLoading"
                            empty-title="No updates"
                            empty-description="Post general updates."
                            empty-icon="i-lucide-megaphone"
                            @refresh="refreshUpdates"
                        >
                            <template #header-right>
                                <UButton label="New Update" icon="i-lucide-plus" color="primary" @click="showUpdateModal = true" />
                            </template>

                            <template #type-cell="{ row }">
                                <span class="capitalize text-slate-400">{{ row.original.type }}</span>
                            </template>

                            <template #created_at-cell="{ row }">
                                <span class="text-slate-400">{{ formatDate(row.original.created_at) }}</span>
                            </template>

                            <template #actions-cell="{ row }">
                                <UDropdownMenu :ui="{ viewport: 'main-bg-color' }" :items="getUpdateItems(row)">
                                    <UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
                                </UDropdownMenu>
                            </template>

                            <template #empty-actions>
                                <UButton label="New Update" color="primary" @click="showUpdateModal = true" />
                            </template>
                        </DashboardDataTable>
                    </template>
                </UTabs>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

    <!-- Incident Modal -->
    <DashboardModal v-model:open="showIncidentModal" title="New Incident" icon="i-lucide-alert-triangle">
        <UForm :schema="incidentSchema" :state="incidentForm" class="space-y-4" @submit="submitIncident">
            <UFormField label="Title" name="title" required>
                <UInput v-model="incidentForm.title" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
                <UFormField label="Status" name="status" required>
                    <USelect v-model="incidentForm.status" :items="['investigating','identified','monitoring','resolved'].map(s => ({ label: s, value: s }))" class="w-full" />
                </UFormField>
                <UFormField label="Severity" name="severity" required>
                    <USelect v-model="incidentForm.severity" :items="['critical','major','minor','maintenance'].map(s => ({ label: s, value: s }))" class="w-full" />
                </UFormField>
            </div>

            <UFormField label="Message" name="message" required>
                <UTextarea v-model="incidentForm.message" class="w-full" rows="5" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showIncidentModal = false" />
                <UButton type="submit" label="Create" color="primary" />
            </div>
        </UForm>
    </DashboardModal>

    <!-- Edit Incident Modal -->
    <DashboardModal v-model:open="editingIncident" title="Edit Incident" icon="i-lucide-pencil">
        <div v-if="editingIncident" class="space-y-4">
            <UFormField label="Title">
                <UInput v-model="editIncidentForm.title" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
                <UFormField label="Status">
                    <USelect v-model="editIncidentForm.status" :items="['investigating','identified','monitoring','resolved'].map(s => ({ label: s, value: s }))" class="w-full" />
                </UFormField>
                <UFormField label="Severity">
                    <USelect v-model="editIncidentForm.severity" :items="['critical','major','minor','maintenance'].map(s => ({ label: s, value: s }))" class="w-full" />
                </UFormField>
            </div>

            <UFormField label="Message">
                <UTextarea v-model="editIncidentForm.message" class="w-full" rows="5" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="editingIncident = null" />
                <UButton label="Save" color="primary" @click="saveIncidentEdit" />
            </div>
        </div>
    </DashboardModal>

    <DashboardDeleteModal
        v-model:open="deleteIncidentOpen"
        title="Delete Incident"
        :warning-text="`Delete incident &quot;${deleteIncidentTarget?.title || ''}&quot;?`"
        :on-delete="onDeleteIncident"
        :prevent-auto-close="true"
    />

    <!-- Maintenance Modal -->
    <DashboardModal v-model:open="showMaintenanceModal" title="New Maintenance" icon="i-lucide-wrench">
        <UForm :schema="maintenanceSchema" :state="maintenanceForm" class="space-y-4" @submit="submitMaintenance">
            <UFormField label="Title" name="title" required>
                <UInput v-model="maintenanceForm.title" class="w-full" />
            </UFormField>

            <UFormField label="Status" name="status" required>
                <USelect v-model="maintenanceForm.status" :items="['scheduled','in_progress','completed','cancelled'].map(s => ({ label: s.replace('_', ' '), value: s }))" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
                <UFormField label="Start" name="scheduled_start_at" required>
                    <UInput v-model="maintenanceForm.scheduled_start_at" type="datetime-local" class="w-full" />
                </UFormField>
                <UFormField label="End" name="scheduled_end_at">
                    <UInput v-model="maintenanceForm.scheduled_end_at" type="datetime-local" class="w-full" />
                </UFormField>
            </div>

            <UFormField label="Message" name="message" required>
                <UTextarea v-model="maintenanceForm.message" class="w-full" rows="5" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showMaintenanceModal = false" />
                <UButton type="submit" label="Create" color="primary" />
            </div>
        </UForm>
    </DashboardModal>

    <!-- Edit Maintenance Modal -->
    <DashboardModal v-model:open="editingMaintenance" title="Edit Maintenance" icon="i-lucide-pencil">
        <div v-if="editingMaintenance" class="space-y-4">
            <UFormField label="Title">
                <UInput v-model="editMaintenanceForm.title" class="w-full" />
            </UFormField>

            <UFormField label="Status">
                <USelect v-model="editMaintenanceForm.status" :items="['scheduled','in_progress','completed','cancelled'].map(s => ({ label: s.replace('_', ' '), value: s }))" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
                <UFormField label="Start">
                    <UInput v-model="editMaintenanceForm.scheduled_start_at" type="datetime-local" class="w-full" />
                </UFormField>
                <UFormField label="End">
                    <UInput v-model="editMaintenanceForm.scheduled_end_at" type="datetime-local" class="w-full" />
                </UFormField>
            </div>

            <UFormField label="Message">
                <UTextarea v-model="editMaintenanceForm.message" class="w-full" rows="5" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="editingMaintenance = null" />
                <UButton label="Save" color="primary" @click="saveMaintenanceEdit" />
            </div>
        </div>
    </DashboardModal>

    <DashboardDeleteModal
        v-model:open="deleteMaintenanceOpen"
        title="Delete Maintenance"
        :warning-text="`Delete maintenance &quot;${deleteMaintenanceTarget?.title || ''}&quot;?`"
        :on-delete="onDeleteMaintenance"
        :prevent-auto-close="true"
    />

    <!-- Update Modal -->
    <DashboardModal v-model:open="showUpdateModal" title="New Update" icon="i-lucide-megaphone">
        <UForm :schema="updateSchema" :state="updateForm" class="space-y-4" @submit="submitUpdate">
            <UFormField label="Title" name="title" required>
                <UInput v-model="updateForm.title" class="w-full" />
            </UFormField>

            <UFormField label="Type" name="type" required>
                <USelect v-model="updateForm.type" :items="['general','incident','maintenance'].map(t => ({ label: t, value: t }))" class="w-full" />
            </UFormField>

            <UFormField label="Message" name="message" required>
                <UTextarea v-model="updateForm.message" class="w-full" rows="5" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showUpdateModal = false" />
                <UButton type="submit" label="Create" color="primary" />
            </div>
        </UForm>
    </DashboardModal>

    <!-- Edit Update Modal -->
    <DashboardModal v-model:open="editingUpdate" title="Edit Update" icon="i-lucide-pencil">
        <div v-if="editingUpdate" class="space-y-4">
            <UFormField label="Title">
                <UInput v-model="editUpdateForm.title" class="w-full" />
            </UFormField>

            <UFormField label="Type">
                <USelect v-model="editUpdateForm.type" :items="['general','incident','maintenance'].map(t => ({ label: t, value: t }))" class="w-full" />
            </UFormField>

            <UFormField label="Message">
                <UTextarea v-model="editUpdateForm.message" class="w-full" rows="5" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="editingUpdate = null" />
                <UButton label="Save" color="primary" @click="saveUpdateEdit" />
            </div>
        </div>
    </DashboardModal>

    <DashboardDeleteModal
        v-model:open="deleteUpdateOpen"
        title="Delete Update"
        :warning-text="`Delete update &quot;${deleteUpdateTarget?.title || ''}&quot;?`"
        :on-delete="onDeleteUpdate"
        :prevent-auto-close="true"
    />
</template>
