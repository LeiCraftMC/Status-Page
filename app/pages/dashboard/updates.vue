<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '#ui/types'
import type { GetStatusPageUpdatesResponses } from '@/api-client/types.gen'
import * as z from 'zod'
import { zPostStatusPageUpdatesBody, zPutStatusPageUpdatesByUpdateIdBody } from '~/api-client/zod.gen'
import { useUserInfoStore } from '~/composables/stores/useUserStore'

type Update = GetStatusPageUpdatesResponses[200]['data'][number]

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Updates | LeiCraft_MC Status Page',
    description: 'Status page updates'
})

const toast = useToast()
const userInfoStore = useUserInfoStore()
const currentUser = await userInfoStore.use()
const isAdmin = computed(() => currentUser.value?.role === 'admin')

const {
    data: updates,
    loading,
    refresh
} = await useAPILazyAsyncData<Update[]>('dashboard-status-page-updates', async () => {
    const res = await useAPI((api) => api.getStatusPageUpdates({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load updates', description: res.message, color: 'error' })
        return []
    }
    return res.data
})

const updateColumns = computed<TableColumn<Update>[]>(() => {
    const cols: TableColumn<Update>[] = [
        { accessorKey: 'id', header: 'ID' },
        { accessorKey: 'title', header: 'Title' },
        { id: 'type', header: 'Type' },
        { id: 'created', header: 'Created' }
    ]
    if (isAdmin.value) {
        cols.push({ id: 'actions', header: '', enableSorting: false, enableHiding: false })
    }
    return cols
})

const typeOptions = [
    { label: 'General', value: 'general' },
    { label: 'Incident', value: 'incident' },
    { label: 'Maintenance', value: 'maintenance' }
]

// Create
const createSchema = zPostStatusPageUpdatesBody
type CreateSchema = z.output<typeof createSchema>
const createForm = reactive<CreateSchema>({
    title: '',
    message: '',
    type: 'general'
})
const showCreateModal = ref(false)

async function handleCreate() {
    const res = await useAPI((api) => api.postStatusPageUpdates({ body: createForm }))
    if (res.success) {
        toast.add({ title: 'Update published', color: 'success' })
        showCreateModal.value = false
        createForm.title = ''
        createForm.message = ''
        createForm.type = 'general'
        await refresh()
    } else {
        toast.add({ title: 'Create failed', description: res.message, color: 'error' })
    }
}

// Edit
const editSchema = zPutStatusPageUpdatesByUpdateIdBody
type EditSchema = z.output<typeof editSchema>
const selectedUpdate = ref<Update | null>(null)
const editForm = reactive<EditSchema>({})
const showEditModal = ref(false)

function openEdit(item: Update) {
    selectedUpdate.value = item
    editForm.title = item.title
    editForm.message = item.message
    editForm.type = item.type
    showEditModal.value = true
}

async function submitEdit() {
    if (!selectedUpdate.value) return
    const body: EditSchema = {}
    if (editForm.title !== selectedUpdate.value.title) body.title = editForm.title
    if (editForm.message !== selectedUpdate.value.message) body.message = editForm.message
    if (editForm.type !== selectedUpdate.value.type) body.type = editForm.type

    const res = await useAPI((api) => api.putStatusPageUpdatesByUpdateId({
        path: { updateId: selectedUpdate.value!.id },
        body
    }))
    if (res.success) {
        toast.add({ title: 'Update saved', color: 'success' })
        showEditModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

// Delete
const deleteTarget = ref<Update | null>(null)
const showDeleteModal = ref(false)

function openDelete(item: Update) {
    deleteTarget.value = item
    showDeleteModal.value = true
}

async function onDelete() {
    if (!deleteTarget.value) return
    const res = await useAPI((api) => api.deleteStatusPageUpdatesByUpdateId({
        path: { updateId: deleteTarget.value!.id }
    }))
    if (res.success) {
        toast.add({ title: 'Update deleted', color: 'success' })
        showDeleteModal.value = false
        deleteTarget.value = null
        await refresh()
    } else {
        toast.add({ title: 'Delete failed', description: res.message, color: 'error' })
    }
}

function getDropdownItems(row: { original: Update }): DropdownMenuItem[][] {
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
                title="Updates"
                icon="i-lucide-megaphone"
                description="Status page updates"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <DashboardDataTable
                    :data="updates"
                    :columns="updateColumns"
                    :loading="loading"
                    :filters="[
                        { column: 'title', type: 'text', placeholder: 'Search updates...', icon: 'i-lucide-search' },
                        { column: 'type', type: 'select', placeholder: 'All types', icon: 'i-lucide-filter', options: typeOptions }
                    ]"
                    empty-title="No updates"
                    empty-description="Admins can publish updates to share news with users."
                    empty-icon="i-lucide-megaphone"
                    @refresh="refresh"
                >
                    <template #header-right>
                        <UButton v-if="isAdmin" label="New Update" icon="i-lucide-plus" color="primary" @click="showCreateModal = true" />
                    </template>

                    <template #id-cell="{ row }">
                        <span class="font-mono text-sm">#{{ row.original.id }}</span>
                    </template>

                    <template #type-cell="{ row }">
                        <UBadge variant="soft" class="capitalize">
                            {{ row.original.type }}
                        </UBadge>
                    </template>

                    <template #created-cell="{ row }">
                        <span class="text-slate-400">{{ formatDate(row.original.created_at) }}</span>
                    </template>

                    <template #actions-cell="{ row }">
                        <UDropdownMenu :items="getDropdownItems(row)">
                            <UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
                        </UDropdownMenu>
                    </template>

                    <template #empty-actions>
                        <UButton v-if="isAdmin" label="Create Update" color="primary" @click="showCreateModal = true" />
                    </template>
                </DashboardDataTable>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

    <!-- Create Update Modal -->
    <DashboardModal
        v-if="isAdmin"
        v-model:open="showCreateModal"
        title="Create Update"
        icon="i-lucide-megaphone"
    >
        <UForm :schema="createSchema" :state="createForm" class="space-y-4" @submit="handleCreate">
            <UFormField label="Title" name="title" required>
                <UInput v-model="createForm.title" class="w-full" />
            </UFormField>

            <UFormField label="Message" name="message" required>
                <UTextarea v-model="createForm.message" class="w-full" />
            </UFormField>

            <UFormField label="Type" name="type" required>
                <USelect v-model="createForm.type" :items="typeOptions" class="w-full" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showCreateModal = false" />
                <UButton type="submit" label="Publish" color="primary" />
            </div>
        </UForm>
    </DashboardModal>

    <!-- Edit Update Modal -->
    <DashboardModal
        v-if="isAdmin"
        v-model:open="showEditModal"
        :title="`Edit Update: ${selectedUpdate?.title}`"
        icon="i-lucide-pencil"
    >
        <div class="space-y-4">
            <UFormField label="Title">
                <UInput v-model="editForm.title" class="w-full" />
            </UFormField>

            <UFormField label="Message">
                <UTextarea v-model="editForm.message" class="w-full" />
            </UFormField>

            <UFormField label="Type">
                <USelect v-model="editForm.type" :items="typeOptions" class="w-full" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showEditModal = false" />
                <UButton label="Save" color="primary" @click="submitEdit" />
            </div>
        </div>
    </DashboardModal>

    <!-- Delete Update Modal -->
    <DashboardDeleteModal
        v-if="isAdmin"
        v-model:open="showDeleteModal"
        title="Delete Update"
        :warning-text="`Are you sure you want to delete update &quot;${deleteTarget?.title || ''}&quot;? This action cannot be undone.`"
        :on-delete="onDelete"
    />
</template>
