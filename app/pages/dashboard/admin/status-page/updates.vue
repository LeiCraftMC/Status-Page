<script setup lang="ts">
import type { TableColumn } from '#ui/types'
import type { GetAdminStatusPageUpdatesResponses } from '@/api-client/types.gen'
import { zPostAdminStatusPageUpdatesBody, zPutAdminStatusPageUpdatesByUpdateIdBody } from '~/api-client/zod.gen'

type Update = GetAdminStatusPageUpdatesResponses[200]['data'][number]

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Updates | LeiCraft_MC Status Page',
    description: 'Manage status updates'
})

const toast = useToast()
const userInfoStore = useUserInfoStore()
const currentUser = await userInfoStore.use()
if (!userInfoStore.isValid(currentUser) || currentUser.value.role !== 'admin') {
    await navigateTo('/dashboard')
}

const updateColumns: TableColumn<Update>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'title', header: 'Title' },
    { accessorKey: 'type', header: 'Type' },
    { id: 'created_at', header: 'Created' },
    { id: 'actions', header: '', enableSorting: false, enableHiding: false }
]

const {
    data: updates,
    loading,
    refresh
} = await useAPILazyAsyncData<Update[]>('admin-updates', async () => {
    const res = await useAPI((api) => api.getAdminStatusPageUpdates({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load updates', description: res.message, color: 'error' })
        return []
    }
    return res.data
})

const createSchema = zPostAdminStatusPageUpdatesBody
const createForm = reactive<z.output<typeof createSchema>>({
    title: '',
    message: '',
    type: 'general'
})
const showCreateModal = ref(false)

const editSchema = zPutAdminStatusPageUpdatesByUpdateIdBody
const editForm = reactive<z.output<typeof editSchema>>({})
const showEditModal = ref(false)
const selectedUpdate = ref<Update | null>(null)

const deleteConfirmOpen = ref(false)
const deleteTarget = ref<Update | null>(null)

function openCreate() {
    createForm.title = ''
    createForm.message = ''
    createForm.type = 'general'
    showCreateModal.value = true
}

async function handleCreate() {
    const res = await useAPI((api) => api.postAdminStatusPageUpdates({ body: createForm }))
    if (res.success) {
        toast.add({ title: 'Update created', color: 'success' })
        showCreateModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Create failed', description: res.message, color: 'error' })
    }
}

function openEdit(item: Update) {
    selectedUpdate.value = item
    editForm.title = item.title
    editForm.message = item.message
    editForm.type = item.type
    showEditModal.value = true
}

async function handleEdit() {
    if (!selectedUpdate.value) return
    const res = await useAPI((api) => api.putAdminStatusPageUpdatesByUpdateId({
        path: { updateId: selectedUpdate.value.id },
        body: editForm
    }))
    if (res.success) {
        toast.add({ title: 'Update updated', color: 'success' })
        showEditModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

function openDelete(item: Update) {
    deleteTarget.value = item
    deleteConfirmOpen.value = true
}

async function onDelete() {
    if (!deleteTarget.value) return
    const res = await useAPI((api) => api.deleteAdminStatusPageUpdatesByUpdateId({
        path: { updateId: deleteTarget.value.id }
    }))
    if (res.success) {
        toast.add({ title: 'Update deleted', color: 'success' })
        deleteConfirmOpen.value = false
        deleteTarget.value = null
        await refresh()
    } else {
        toast.add({ title: 'Delete failed', description: res.message, color: 'error' })
    }
}

function getUpdateTypeColor(type: string) {
    switch (type) {
        case 'incident': return 'error'
        case 'maintenance': return 'warning'
        default: return 'primary'
    }
}
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                title="Updates"
                icon="i-lucide-megaphone"
                description="Manage status updates"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <DashboardDataTable
                    :data="updates"
                    :columns="updateColumns"
                    :loading="loading"
                    :filters="[
                        { column: 'type', type: 'select', placeholder: 'All types', icon: 'i-lucide-filter', options: ['general', 'incident', 'maintenance'].map(t => ({ label: t, value: t })) }
                    ]"
                    empty-title="No updates"
                    empty-description="There are no status updates yet."
                    empty-icon="i-lucide-megaphone"
                    @refresh="refresh"
                >
                    <template #header-right>
                        <UButton label="New Update" icon="i-lucide-plus" color="primary" @click="openCreate" />
                    </template>

                    <template #id-cell="{ row }">
                        <span class="font-mono text-sm">#{{ row.original.id }}</span>
                    </template>

                    <template #type-cell="{ row }">
                        <UBadge :color="getUpdateTypeColor(row.original.type)" variant="soft" class="capitalize">
                            {{ row.original.type }}
                        </UBadge>
                    </template>

                    <template #created_at-cell="{ row }">
                        <span class="text-slate-400">{{ formatDate(row.original.created_at) }}</span>
                    </template>

                    <template #actions-cell="{ row }">
                        <div class="flex gap-2">
                            <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="xs" @click="openEdit(row.original)" />
                            <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="xs" @click="openDelete(row.original)" />
                        </div>
                    </template>

                    <template #empty-actions>
                        <UButton label="Create Update" color="primary" @click="openCreate" />
                    </template>
                </DashboardDataTable>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

    <DashboardModal v-model:open="showCreateModal" title="Create Update" icon="i-lucide-megaphone">
        <UForm :schema="createSchema" :state="createForm" class="space-y-4" @submit="handleCreate">
            <UFormField label="Title" name="title" required>
                <UInput v-model="createForm.title" class="w-full" />
            </UFormField>
            <UFormField label="Message" name="message" required>
                <UTextarea v-model="createForm.message" class="w-full" />
            </UFormField>
            <UFormField label="Type" name="type" required>
                <USelect v-model="createForm.type" :items="['general', 'incident', 'maintenance'].map(t => ({ label: t, value: t }))" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showCreateModal = false" />
                <UButton type="submit" label="Create" color="primary" />
            </div>
        </UForm>
    </DashboardModal>

    <DashboardModal v-model:open="showEditModal" title="Edit Update" icon="i-lucide-pencil">
        <div class="space-y-4">
            <UFormField label="Title" required>
                <UInput v-model="editForm.title" class="w-full" />
            </UFormField>
            <UFormField label="Message" required>
                <UTextarea v-model="editForm.message" class="w-full" />
            </UFormField>
            <UFormField label="Type" required>
                <USelect v-model="editForm.type" :items="['general', 'incident', 'maintenance'].map(t => ({ label: t, value: t }))" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showEditModal = false" />
                <UButton label="Save" color="primary" @click="handleEdit" />
            </div>
        </div>
    </DashboardModal>

    <DashboardDeleteModal
        v-model:open="deleteConfirmOpen"
        title="Delete Update"
        :warning-text="`Are you sure you want to delete update &quot;${deleteTarget?.title || ''}&quot;? This action cannot be undone.`"
        :on-delete="onDelete"
        :prevent-auto-close="true"
    />
</template>
