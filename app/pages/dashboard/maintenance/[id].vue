<script setup lang="ts">
import type { GetStatusPageMaintenanceByMaintenanceIdResponses } from '@/api-client/types.gen'
import * as z from 'zod'
import {
    zPostStatusPageMaintenanceByMaintenanceIdUpdatesBody,
    zPutStatusPageMaintenanceByMaintenanceIdBody
} from '~/api-client/zod.gen'
import { useUserInfoStore } from '~/composables/stores/useUserStore'

type Maintenance = GetStatusPageMaintenanceByMaintenanceIdResponses[200]['data']
type MaintenanceUpdate = Maintenance['updates'][number]
type MaintenanceStatus = Maintenance['status']

definePageMeta({
    layout: 'dashboard'
})

const route = useRoute()
const maintenanceId = Number(route.params.id)

const toast = useToast()
const userInfoStore = useUserInfoStore()
const currentUser = await userInfoStore.use()
const isAdmin = computed(() => currentUser.value?.role === 'admin')

const {
    data: maintenance,
    loading,
    refresh
} = await useAPILazyAsyncData<Maintenance | null>(`dashboard-maintenance-${maintenanceId}`, async () => {
    const res = await useAPI((api) => api.getStatusPageMaintenanceByMaintenanceId({ path: { maintenanceId } }))
    if (!res.success) {
        toast.add({ title: 'Failed to load maintenance', description: res.message, color: 'error' })
        return null
    }
    return res.data
})

useSeoMeta({
    title: computed(() => `${maintenance.value?.title ?? 'Maintenance'} | LeiCraft_MC Status Page`)
})

const statusOptions: { label: string; value: MaintenanceStatus }[] = [
    { label: 'Scheduled', value: 'scheduled' },
    { label: 'In progress', value: 'in_progress' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' }
]

// Post update
const postSchema = zPostStatusPageMaintenanceByMaintenanceIdUpdatesBody
type PostSchema = z.output<typeof postSchema>
const postForm = reactive<PostSchema>({
    message: '',
    status: 'scheduled'
})
const posting = ref(false)

// Default the status select to the maintenance's current status
watch(() => maintenance.value?.status, (status) => {
    if (status) postForm.status = status
}, { immediate: true })

async function handlePost() {
    posting.value = true
    const res = await useAPI((api) => api.postStatusPageMaintenanceByMaintenanceIdUpdates({
        path: { maintenanceId },
        body: { message: postForm.message, status: postForm.status }
    }))
    posting.value = false
    if (res.success) {
        toast.add({ title: 'Update posted', color: 'success' })
        postForm.message = ''
        await refresh()
    } else {
        toast.add({ title: 'Posting failed', description: res.message, color: 'error' })
    }
}

// Edit update
const editUpdateTarget = ref<MaintenanceUpdate | null>(null)
const editUpdateForm = reactive<{ message: string; status: MaintenanceStatus }>({ message: '', status: 'scheduled' })
const showEditUpdateModal = ref(false)

function openEditUpdate(update: MaintenanceUpdate) {
    editUpdateTarget.value = update
    editUpdateForm.message = update.message
    editUpdateForm.status = update.status as MaintenanceStatus
    showEditUpdateModal.value = true
}

async function submitEditUpdate() {
    const target = editUpdateTarget.value
    if (!target) return
    const body: { message?: string; status?: MaintenanceStatus } = {}
    if (editUpdateForm.message !== target.message) body.message = editUpdateForm.message
    if (editUpdateForm.status !== target.status) body.status = editUpdateForm.status
    if (Object.keys(body).length === 0) {
        showEditUpdateModal.value = false
        return
    }

    const res = await useAPI((api) => api.putStatusPageMaintenanceByMaintenanceIdUpdatesByUpdateId({
        path: { maintenanceId, updateId: target.id },
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
const deleteUpdateTarget = ref<MaintenanceUpdate | null>(null)
const showDeleteUpdateModal = ref(false)

function openDeleteUpdate(update: MaintenanceUpdate) {
    deleteUpdateTarget.value = update
    showDeleteUpdateModal.value = true
}

async function onDeleteUpdate() {
    const target = deleteUpdateTarget.value
    if (!target) return
    const res = await useAPI((api) => api.deleteStatusPageMaintenanceByMaintenanceIdUpdatesByUpdateId({
        path: { maintenanceId, updateId: target.id }
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

// Edit maintenance details (status changes go through updates)
const detailsSchema = zPutStatusPageMaintenanceByMaintenanceIdBody.extend({
    scheduled_start_at: z.string().optional().transform((v) => v ? parseDateISO(v) : undefined),
    scheduled_end_at: z.string().optional().nullable().transform((v) => v ? parseDateISO(v) : v === '' ? null : undefined)
})
type DetailsInput = z.input<typeof detailsSchema>
type DetailsOutput = z.output<typeof detailsSchema>
const detailsForm = reactive<DetailsInput>({})
const showDetailsModal = ref(false)

function openDetails() {
    if (!maintenance.value) return
    detailsForm.title = maintenance.value.title
    detailsForm.message = maintenance.value.message
    detailsForm.scheduled_start_at = formatDateISO(maintenance.value.scheduled_start_at)
    detailsForm.scheduled_end_at = maintenance.value.scheduled_end_at ? formatDateISO(maintenance.value.scheduled_end_at) : ''
    showDetailsModal.value = true
}

async function submitDetails() {
    if (!maintenance.value) return
    const parseResult = detailsSchema.safeParse(detailsForm)
    if (!parseResult.success) {
        toast.add({ title: 'Invalid values', description: parseResult.error.message, color: 'error' })
        return
    }
    const data = parseResult.data
    const current = maintenance.value
    const body: DetailsOutput = {}
    if (data.title !== current.title) body.title = data.title
    if (data.message !== current.message) body.message = data.message
    if (data.scheduled_start_at !== undefined && data.scheduled_start_at !== current.scheduled_start_at) body.scheduled_start_at = data.scheduled_start_at
    if (data.scheduled_end_at !== undefined && data.scheduled_end_at !== current.scheduled_end_at) body.scheduled_end_at = data.scheduled_end_at
    if (Object.keys(body).length === 0) {
        showDetailsModal.value = false
        return
    }

    const res = await useAPI((api) => api.putStatusPageMaintenanceByMaintenanceId({
        path: { maintenanceId },
        body
    }))
    if (res.success) {
        toast.add({ title: 'Maintenance updated', color: 'success' })
        showDetailsModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

// Delete maintenance
const showDeleteMaintenanceModal = ref(false)

async function onDeleteMaintenance() {
    const res = await useAPI((api) => api.deleteStatusPageMaintenanceByMaintenanceId({
        path: { maintenanceId }
    }))
    if (res.success) {
        toast.add({ title: 'Maintenance deleted', color: 'success' })
        showDeleteMaintenanceModal.value = false
        await navigateTo('/dashboard/maintenance')
    } else {
        toast.add({ title: 'Delete failed', description: res.message, color: 'error' })
    }
}
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                :title="maintenance?.title || 'Maintenance'"
                icon="i-lucide-calendar-clock"
                description="Scheduled maintenance details and customer updates"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <NuxtLink to="/dashboard/maintenance" class="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-primary-400 transition-colors">
                        <UIcon name="i-lucide-arrow-left" class="size-4" />
                        All maintenance
                    </NuxtLink>

                    <div v-if="maintenance" class="flex flex-wrap gap-2">
                        <UButton
                            :to="`/scheduled-events/${maintenance.id}`"
                            target="_blank"
                            icon="i-lucide-external-link"
                            label="Public page"
                            color="neutral"
                            variant="soft"
                        />
                        <template v-if="isAdmin">
                            <UButton icon="i-lucide-pencil" label="Edit details" color="neutral" variant="soft" @click="openDetails" />
                            <UButton icon="i-lucide-trash-2" label="Delete" color="error" variant="soft" @click="showDeleteMaintenanceModal = true" />
                        </template>
                    </div>
                </div>

                <div v-if="loading && !maintenance" class="flex items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
                </div>

                <UEmpty
                    v-else-if="!maintenance"
                    icon="i-lucide-file-x"
                    title="Maintenance not found"
                    description="The requested maintenance entry does not exist."
                    variant="naked"
                />

                <template v-else>
                    <UCard class="border-slate-800 bg-slate-900/60">
                        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <p class="text-sm text-slate-400">Status</p>
                                <UBadge :color="getMaintenanceStatusColor(maintenance.status)" variant="soft" class="capitalize mt-1">
                                    {{ formatStatusLabel(maintenance.status) }}
                                </UBadge>
                            </div>
                            <div>
                                <p class="text-sm text-slate-400">Scheduled start</p>
                                <p class="font-medium text-white">{{ formatDate(maintenance.scheduled_start_at) }}</p>
                            </div>
                            <div>
                                <p class="text-sm text-slate-400">Scheduled end</p>
                                <p class="font-medium text-white">{{ maintenance.scheduled_end_at ? formatDate(maintenance.scheduled_end_at) : 'Open-ended' }}</p>
                            </div>
                            <div>
                                <p class="text-sm text-slate-400">Updates</p>
                                <p class="font-medium text-white">{{ maintenance.updates.length }}</p>
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
                            <UFormField label="Status" name="status" required help="The maintenance takes on this status when the update is posted.">
                                <USelect v-model="postForm.status" :items="statusOptions" class="w-full sm:w-64" />
                            </UFormField>

                            <UFormField label="Message" name="message" required>
                                <UTextarea
                                    v-model="postForm.message"
                                    :rows="4"
                                    autoresize
                                    placeholder="What's the latest? E.g. Maintenance has started, services may be briefly unavailable."
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
                            kind="maintenance"
                            :updates="maintenance.updates"
                            :opening-message="maintenance.message"
                            :opening-at="maintenance.created_at"
                            opening-label="Announced"
                        >
                            <template v-if="isAdmin" #actions="{ update }">
                                <div class="flex gap-1">
                                    <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" aria-label="Edit update" @click="openEditUpdate(update as MaintenanceUpdate)" />
                                    <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="Delete update" @click="openDeleteUpdate(update as MaintenanceUpdate)" />
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
            <UFormField label="Status" help="Changing the status also applies it to the maintenance entry.">
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
        title="Edit maintenance details"
        icon="i-lucide-pencil"
    >
        <div class="space-y-4">
            <UFormField label="Title">
                <UInput v-model="detailsForm.title" class="w-full" />
            </UFormField>

            <UFormField label="Announcement" help="The first message customers saw when the maintenance was announced.">
                <UTextarea v-model="detailsForm.message" :rows="4" autoresize class="w-full" />
            </UFormField>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UFormField label="Start">
                    <UInput v-model="detailsForm.scheduled_start_at" type="datetime-local" class="w-full" />
                </UFormField>

                <UFormField label="End">
                    <UInput v-model="detailsForm.scheduled_end_at" type="datetime-local" class="w-full" />
                </UFormField>
            </div>

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
        warning-text="Are you sure you want to delete this update? Customers will no longer see it. This does not change the maintenance entry's current status."
        :on-delete="onDeleteUpdate"
    />

    <DashboardDeleteModal
        v-if="isAdmin"
        v-model:open="showDeleteMaintenanceModal"
        title="Delete maintenance"
        :warning-text="`Are you sure you want to delete &quot;${maintenance?.title || ''}&quot; and all of its updates? This action cannot be undone.`"
        :on-delete="onDeleteMaintenance"
    />
</template>