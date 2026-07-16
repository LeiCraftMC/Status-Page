<script setup lang="ts">
import type { DropdownMenuItem, TableColumn, FormSubmitEvent } from '#ui/types'
import * as z from 'zod'
import { zPostAdminStatusPagesBody } from '~/api-client/zod.gen'

type StatusPage = GetAdminStatusPagesResponses[200]['data'][number]

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Status Pages | LeiCraft_MC Status Page',
    description: 'Manage status pages'
})

const toast = useToast()

const userInfoStore = useUserInfoStore()
const currentUser = await userInfoStore.use()
if (!userInfoStore.isValid(currentUser)) {
    throw new Error('User not authenticated but trying to access Admin Status Pages')
}

const isAdmin = currentUser.value.role === 'admin'
if (!isAdmin) {
    await navigateTo('/dashboard')
}

const pageColumns: TableColumn<StatusPage>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'slug', header: 'Slug' },
    { accessorKey: 'title', header: 'Title' },
    { id: 'public', header: 'Public' },
    { id: 'enabled', header: 'Enabled' },
    { id: 'theme', header: 'Theme' },
    { id: 'actions', header: '', enableSorting: false, enableHiding: false }
]

const {
    data: statusPages,
    loading,
    refresh
} = await useAPILazyAsyncData<StatusPage[]>('admin-status-pages-list', async () => {
    if (!isAdmin) return []
    const res = await useAPI((api) => api.getAdminStatusPages({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load status pages', description: res.message, color: 'error' })
        return []
    }
    return res.data
})

const createSchema = zPostAdminStatusPagesBody
type CreateSchema = z.output<typeof createSchema>

const createForm = reactive<CreateSchema>({
    slug: '',
    title: '',
    description: '',
    is_public: true,
    is_enabled: true,
    theme: 'auto'
})
const showCreateModal = ref(false)

const deleteConfirmOpen = ref(false)
const deleteTarget = ref<StatusPage | null>(null)

function getPageOptionsDropdownItems(row: { original: StatusPage }): DropdownMenuItem[][] {
    return [
        [
            {
                label: 'Edit',
                icon: 'i-lucide-pencil',
                onSelect: () => navigateTo(`/dashboard/admin/status-pages/${row.original.id}`)
            },
            {
                label: 'View',
                icon: 'i-lucide-external-link',
                onSelect: () => navigateTo(`/dashboard/status-pages/${row.original.slug}`, { open: { target: '_blank' } })
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

async function handleCreate(event: FormSubmitEvent<CreateSchema>) {
    const res = await useAPI((api) => api.postAdminStatusPages({ body: event.data }))
    if (res.success) {
        toast.add({ title: 'Status page created', color: 'success' })
        showCreateModal.value = false
        createForm.slug = ''
        createForm.title = ''
        createForm.description = ''
        await refresh()
    } else {
        toast.add({ title: 'Create failed', description: res.message, color: 'error' })
    }
}

function openDelete(page: StatusPage) {
    deleteTarget.value = page
    deleteConfirmOpen.value = true
}

async function onDeletePage() {
    if (!deleteTarget.value) return
    const res = await useAPI((api) => api.deleteAdminStatusPagesByPageId({
        path: { pageId: deleteTarget.value!.id }
    }))
    if (res.success) {
        toast.add({ title: 'Status page deleted', color: 'success' })
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
                title="Status Pages"
                icon="i-lucide-layout-grid"
                description="Manage public and internal status pages"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <DashboardDataTable
                    :data="statusPages"
                    :columns="pageColumns"
                    :loading="loading"
                    :filters="[
                        { column: 'title', type: 'text', placeholder: 'Search pages...', icon: 'i-lucide-search' },
                        { column: 'is_public', type: 'select', placeholder: 'All visibility', icon: 'i-lucide-filter', options: [{ label: 'Public', value: true }, { label: 'Private', value: false }] },
                        { column: 'is_enabled', type: 'select', placeholder: 'All states', icon: 'i-lucide-filter', options: [{ label: 'Enabled', value: true }, { label: 'Disabled', value: false }] }
                    ]"
                    empty-title="No status pages"
                    empty-description="Create your first status page to communicate status."
                    empty-icon="i-lucide-layout-grid"
                    @refresh="refresh"
                >
                    <template #header-right>
                        <UButton
                            label="New Status Page"
                            icon="i-lucide-plus"
                            color="primary"
                            @click="showCreateModal = true"
                        />
                    </template>

                    <template #id-cell="{ row }">
                        <span class="font-mono text-sm">#{{ row.original.id }}</span>
                    </template>

                    <template #slug-cell="{ row }">
                        <span class="text-slate-400">/{{ row.original.slug }}</span>
                    </template>

                    <template #public-cell="{ row }">
                        <UBadge :color="row.original.is_public ? 'success' : 'warning'" variant="soft">
                            {{ row.original.is_public ? 'Public' : 'Private' }}
                        </UBadge>
                    </template>

                    <template #enabled-cell="{ row }">
                        <UBadge :color="row.original.is_enabled ? 'success' : 'neutral'" variant="soft">
                            {{ row.original.is_enabled ? 'Enabled' : 'Disabled' }}
                        </UBadge>
                    </template>

                    <template #theme-cell="{ row }">
                        <span class="capitalize text-slate-400">{{ row.original.theme }}</span>
                    </template>

                    <template #actions-cell="{ row }">
                        <UDropdownMenu
                            :ui="{ viewport: 'main-bg-color' }"
                            :items="getPageOptionsDropdownItems(row)"
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
                        <UButton label="Create Status Page" color="primary" @click="showCreateModal = true" />
                    </template>
                </DashboardDataTable>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

    <!-- Create Status Page Modal -->
    <DashboardModal
        v-model:open="showCreateModal"
        title="Create Status Page"
        icon="i-lucide-layout-grid"
    >
        <UForm :schema="createSchema" :state="createForm" class="space-y-4" @submit="handleCreate">
            <UFormField label="Slug" name="slug" required>
                <UInput v-model="createForm.slug" placeholder="production-status" class="w-full" />
            </UFormField>

            <UFormField label="Title" name="title" required>
                <UInput v-model="createForm.title" placeholder="Production Status" class="w-full" />
            </UFormField>

            <UFormField label="Description" name="description">
                <UTextarea v-model="createForm.description" placeholder="Short description shown on the status page" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
                <UFormField label="Theme" name="theme">
                    <USelect v-model="createForm.theme" :items="[{ label: 'Auto', value: 'auto' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]" class="w-full" />
                </UFormField>
                <UFormField label="Visibility" name="is_public">
                    <USwitch v-model="createForm.is_public" label="Public" />
                </UFormField>
            </div>

            <UFormField label="Enabled" name="is_enabled">
                <USwitch v-model="createForm.is_enabled" label="Enabled" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showCreateModal = false" />
                <UButton type="submit" label="Create" color="primary" />
            </div>
        </UForm>
    </DashboardModal>

    <!-- Delete Status Page Modal -->
    <DashboardDeleteModal
        v-model:open="deleteConfirmOpen"
        title="Delete Status Page"
        :warning-text="`Are you sure you want to delete status page &quot;${deleteTarget?.title || ''}&quot;? This action cannot be undone.`"
        :on-delete="onDeletePage"
        :prevent-auto-close="true"
    />
</template>
