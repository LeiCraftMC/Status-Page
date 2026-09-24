<script setup lang="ts">
import type { GetStatusPageIncidentsByIncidentIdResponses } from '@/api-client/types.gen'
import * as z from 'zod'
import {
    zPostStatusPageIncidentsByIncidentIdUpdatesBody,
    zPutStatusPageIncidentsByIncidentIdBody
} from '~/api-client/zod.gen'
import { useUserInfoStore } from '~/composables/stores/useUserStore'

type Incident = GetStatusPageIncidentsByIncidentIdResponses[200]['data']
type IncidentUpdate = Incident['updates'][number]
type IncidentStatus = Incident['status']

definePageMeta({
    layout: 'dashboard'
})

const route = useRoute()
const incidentId = Number(route.params.id)

const toast = useToast()
const userInfoStore = useUserInfoStore()
const currentUser = await userInfoStore.use()
const isAdmin = computed(() => currentUser.value?.role === 'admin')

const {
    data: incident,
    loading,
    refresh
} = await useAPILazyAsyncData<Incident | null>(`dashboard-incident-${incidentId}`, async () => {
    const res = await useAPI((api) => api.getStatusPageIncidentsByIncidentId({ path: { incidentId } }))
    if (!res.success) {
        toast.add({ title: 'Failed to load incident', description: res.message, color: 'error' })
        return null
    }
    return res.data
})

useSeoMeta({
    title: computed(() => `${incident.value?.title ?? 'Incident'} | LeiCraft_MC Status Page`)
})

const statusOptions: { label: string; value: IncidentStatus }[] = [
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

// Post update
const postSchema = zPostStatusPageIncidentsByIncidentIdUpdatesBody
type PostSchema = z.output<typeof postSchema>
const postForm = reactive<PostSchema>({
    message: '',
    status: 'investigating'
})
const posting = ref(false)

// Default the status select to the incident's current status
watch(() => incident.value?.status, (status) => {
    if (status) postForm.status = status
}, { immediate: true })

async function handlePost() {
    posting.value = true
    const res = await useAPI((api) => api.postStatusPageIncidentsByIncidentIdUpdates({
        path: { incidentId },
        body: { message: postForm.message, status: postForm.status }
    }))
    posting.value = false
    if (res.success) {
        toast.add({
            title: 'Update posted',
            description: postForm.status === 'resolved' ? 'The incident is now marked as resolved.' : undefined,
            color: 'success'
        })
        postForm.message = ''
        await refresh()
    } else {
        toast.add({ title: 'Posting failed', description: res.message, color: 'error' })
    }
}

// Edit update
const editUpdateTarget = ref<IncidentUpdate | null>(null)
const editUpdateForm = reactive<{ message: string; status: IncidentStatus }>({ message: '', status: 'investigating' })
const showEditUpdateModal = ref(false)

function openEditUpdate(update: IncidentUpdate) {
    editUpdateTarget.value = update
    editUpdateForm.message = update.message
    editUpdateForm.status = update.status as IncidentStatus
    showEditUpdateModal.value = true
}

async function submitEditUpdate() {
    const target = editUpdateTarget.value
    if (!target) return
    const body: { message?: string; status?: IncidentStatus } = {}
    if (editUpdateForm.message !== target.message) body.message = editUpdateForm.message
    if (editUpdateForm.status !== target.status) body.status = editUpdateForm.status
    if (Object.keys(body).length === 0) {
        showEditUpdateModal.value = false
        return
    }

    const res = await useAPI((api) => api.putStatusPageIncidentsByIncidentIdUpdatesByUpdateId({
        path: { incidentId, updateId: target.id },
        body
    }))
    if (res.success) {
        toast.add({ title: 'Update edited', color: 'success' })
        showEditUpdateModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Edit failed', description: res.message, color: 'error' })
    }
}

// Delete update
const deleteUpdateTarget = ref<IncidentUpdate | null>(null)
const showDeleteUpdateModal = ref(false)

function openDeleteUpdate(update: IncidentUpdate) {
    deleteUpdateTarget.value = update
    showDeleteUpdateModal.value = true
}

async function onDeleteUpdate() {
    const target = deleteUpdateTarget.value
    if (!target) return
    const res = await useAPI((api) => api.deleteStatusPageIncidentsByIncidentIdUpdatesByUpdateId({
        path: { incidentId, updateId: target.id }
    }))
    if (res.success) {
        toast.add({ title: 'Update deleted', color: 'success' })
        showDeleteUpdateModal.value = false
        deleteUpdateTarget.value = null
        await refresh()
    } else {
        toast.add({ title: 'Delete failed', description: res.message, color: 'error' })
    }
}

// Edit incident details (status changes go through updates)
const detailsSchema = zPutStatusPageIncidentsByIncidentIdBody
type DetailsSchema = z.output<typeof detailsSchema>
const detailsForm = reactive<DetailsSchema>({})
const showDetailsModal = ref(false)

function openDetails() {
    if (!incident.value) return
    detailsForm.title = incident.value.title
    detailsForm.message = incident.value.message
    detailsForm.severity = incident.value.severity
    showDetailsModal.value = true
}

async function submitDetails() {
    if (!incident.value) return
    const body: DetailsSchema = {}
    if (detailsForm.title !== incident.value.title) body.title = detailsForm.title
    if (detailsForm.message !== incident.value.message) body.message = detailsForm.message
    if (detailsForm.severity !== incident.value.severity) body.severity = detailsForm.severity
    if (Object.keys(body).length === 0) {
        showDetailsModal.value = false
        return
    }

    const res = await useAPI((api) => api.putStatusPageIncidentsByIncidentId({
        path: { incidentId },
        body
    }))
    if (res.success) {
        toast.add({ title: 'Incident updated', color: 'success' })
        showDetailsModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

// Delete incident
const showDeleteIncidentModal = ref(false)

async function onDeleteIncident() {
    const res = await useAPI((api) => api.deleteStatusPageIncidentsByIncidentId({
        path: { incidentId }
    }))
    if (res.success) {
        toast.add({ title: 'Incident deleted', color: 'success' })
        showDeleteIncidentModal.value = false
        await navigateTo('/dashboard/incidents')
    } else {
        toast.add({ title: 'Delete failed', description: res.message, color: 'error' })
    }
}
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                :title="incident?.title || 'Incident'"
                icon="i-lucide-alert-triangle"
                description="Incident details and customer updates"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <NuxtLink to="/dashboard/incidents" class="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-primary-400 transition-colors">
                        <UIcon name="i-lucide-arrow-left" class="size-4" />
                        All incidents
                    </NuxtLink>

                    <div v-if="incident" class="flex flex-wrap gap-2">
                        <UButton
                            :to="`/incident/${incident.id}`"
                            target="_blank"
                            icon="i-lucide-external-link"
                            label="Public page"
                            color="neutral"
                            variant="soft"
                        />
                        <template v-if="isAdmin">
                            <UButton icon="i-lucide-pencil" label="Edit details" color="neutral" variant="soft" @click="openDetails" />
                            <UButton icon="i-lucide-trash-2" label="Delete" color="error" variant="soft" @click="showDeleteIncidentModal = true" />
                        </template>
                    </div>
                </div>

                <div v-if="loading && !incident" class="flex items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
                </div>

                <UEmpty
                    v-else-if="!incident"
                    icon="i-lucide-file-x"
                    title="Incident not found"
                    description="The requested incident does not exist."
                    variant="naked"
                />

                <template v-else>
                    <UCard class="border-slate-800 bg-slate-900/60">
                        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <p class="text-sm text-slate-400">Status</p>
                                <UBadge :color="getIncidentStatusColor(incident.status)" variant="soft" class="capitalize mt-1">
                                    {{ incident.status }}
                                </UBadge>
                            </div>
                            <div>
                                <p class="text-sm text-slate-400">Severity</p>
                                <UBadge :color="getSeverityColor(incident.severity)" variant="soft" class="capitalize mt-1">
                                    {{ incident.severity }}
                                </UBadge>
                            </div>
                            <div>
                                <p class="text-sm text-slate-400">Started</p>
                                <p class="font-medium text-white">{{ formatDate(incident.started_at) }}</p>
                            </div>
                            <div>
                                <p class="text-sm text-slate-400">{{ incident.is_resolved ? 'Resolved' : 'Updates' }}</p>
                                <p class="font-medium text-white">
                                    {{ incident.is_resolved ? formatDate(incident.resolved_at) : incident.updates.length }}
                                </p>
                            </div>
                        </div>
                    </UCard>

                    <!-- Post update -->
                    <UCard v-if="isAdmin" class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <div class="flex items-center gap-2">
                                <UIcon name="i-lucide-message-square-plus" class="size-5 text-primary-400" />
                                <h3 class="font-semibold text-white">Post an update</h3>
                            </div>
                        </template>

                        <UForm :schema="postSchema" :state="postForm" class="space-y-4" @submit="handlePost">
                            <UFormField label="Status" name="status" required help="The incident takes on this status when the update is posted.">
                                <USelect v-model="postForm.status" :items="statusOptions" class="w-full sm:w-64" />
                            </UFormField>

                            <UFormField label="Message" name="message" required>
                                <UTextarea
                                    v-model="postForm.message"
                                    :rows="4"
                                    autoresize
                                    placeholder="What's the latest? E.g. We have identified the cause and are rolling out a fix."
                                    class="w-full"
                                />
                            </UFormField>

                            <div class="flex justify-end">
                                <UButton type="submit" label="Post update" icon="i-lucide-send" color="primary" :loading="posting" />
                            </div>
                        </UForm>
                    </UCard>

                    <!-- Timeline -->
                    <UCard class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <h3 class="font-semibold text-white">Timeline</h3>
                        </template>

                        <UpdateTimeline
                            kind="incident"
                            :updates="incident.updates"
                            :opening-message="incident.message"
                            :opening-at="incident.started_at"
                            opening-label="Reported"
                        >
                            <template v-if="isAdmin" #actions="{ update }">
                                <div class="flex gap-1">
                                    <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" aria-label="Edit update" @click="openEditUpdate(update as IncidentUpdate)" />
                                    <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="Delete update" @click="openDeleteUpdate(update as IncidentUpdate)" />
                                </div>
                            </template>
                        </UpdateTimeline>
                    </UCard>
                </template>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

    <!-- Edit update modal -->
    <DashboardModal
        v-if="isAdmin"
        v-model:open="showEditUpdateModal"
        title="Edit update"
        icon="i-lucide-pencil"
    >
        <div class="space-y-4">
            <UFormField label="Status" help="Changing the status also applies it to the incident.">
                <USelect v-model="editUpdateForm.status" :items="statusOptions" class="w-full" />
            </UFormField>

            <UFormField label="Message">
                <UTextarea v-model="editUpdateForm.message" :rows="4" autoresize class="w-full" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showEditUpdateModal = false" />
                <UButton label="Save" color="primary" :disabled="!editUpdateForm.message.trim()" @click="submitEditUpdate" />
            </div>
        </div>
    </DashboardModal>

    <!-- Edit details modal -->
    <DashboardModal
        v-if="isAdmin"
        v-model:open="showDetailsModal"
        title="Edit incident details"
        icon="i-lucide-pencil"
    >
        <div class="space-y-4">
            <UFormField label="Title">
                <UInput v-model="detailsForm.title" class="w-full" />
            </UFormField>

            <UFormField label="Initial report" help="The first message customers saw when the incident was reported.">
                <UTextarea v-model="detailsForm.message" :rows="4" autoresize class="w-full" />
            </UFormField>

            <UFormField label="Severity">
                <USelect v-model="detailsForm.severity" :items="severityOptions" class="w-full" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showDetailsModal = false" />
                <UButton label="Save" color="primary" @click="submitDetails" />
            </div>
        </div>
    </DashboardModal>

    <DashboardDeleteModal
        v-if="isAdmin"
        v-model:open="showDeleteUpdateModal"
        title="Delete update"
        warning-text="Are you sure you want to delete this update? Customers will no longer see it. This does not change the incident's current status."
        :on-delete="onDeleteUpdate"
    />

    <DashboardDeleteModal
        v-if="isAdmin"
        v-model:open="showDeleteIncidentModal"
        title="Delete incident"
        :warning-text="`Are you sure you want to delete incident &quot;${incident?.title || ''}&quot; and all of its updates? This action cannot be undone.`"
        :on-delete="onDeleteIncident"
    />
</template>