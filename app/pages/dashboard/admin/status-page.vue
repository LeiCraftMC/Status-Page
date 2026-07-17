<script setup lang="ts">
import type { TableColumn } from '#ui/types'
import type { GetAdminStatusPageResponses, GetAdminMonitorsResponses } from '@/api-client/types.gen'
import * as z from 'zod'
import { zPutAdminStatusPageBody, zPostAdminStatusPageGroupsBody, zPutAdminStatusPageGroupsByGroupIdBody, zPostAdminStatusPageMonitorsBody, zPutAdminStatusPageMonitorsByLinkIdBody } from '~/api-client/zod.gen'

type StatusPageFull = GetAdminStatusPageResponses[200]['data']
type Group = StatusPageFull['groups'][number]
type Link = StatusPageFull['links'][number]
type Monitor = GetAdminMonitorsResponses[200]['data'][number]

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Status Page Admin | LeiCraft_MC Status Page',
    description: 'Configure the status page'
})

const toast = useToast()
const userInfoStore = useUserInfoStore()
const currentUser = await userInfoStore.use()
if (!userInfoStore.isValid(currentUser) || currentUser.value.role !== 'admin') {
    await navigateTo('/dashboard')
}

const {
    data: statusPage,
    loading,
    refresh
} = await useAPILazyAsyncData<StatusPageFull | null>('admin-status-page', async () => {
    const res = await useAPI((api) => api.getAdminStatusPage({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load status page', description: res.message, color: 'error' })
        return null
    }
    return res.data
})

const {
    data: monitors
} = await useAPILazyAsyncData<Monitor[]>('admin-monitors-for-links', async () => {
    const res = await useAPI((api) => api.getAdminMonitors({}))
    return res.success ? res.data : []
})

const groupColumns: TableColumn<Group>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'sort_order', header: 'Order' },
    { id: 'actions', header: '', enableSorting: false, enableHiding: false }
]

const linkColumns: TableColumn<Link>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'monitor_name', header: 'Monitor' },
    { accessorKey: 'display_name', header: 'Display Name' },
    { accessorKey: 'group_id', header: 'Group' },
    { accessorKey: 'sort_order', header: 'Order' },
    { id: 'actions', header: '', enableSorting: false, enableHiding: false }
]

const editConfigForm = reactive<z.output<typeof zPutAdminStatusPageBody>>({})
const showEditConfigModal = ref(false)

const groupForm = reactive<z.output<typeof zPostAdminStatusPageGroupsBody>>({ name: '', sort_order: 0 })
const showCreateGroupModal = ref(false)
const showEditGroupModal = ref(false)
const selectedGroup = ref<Group | null>(null)
const editGroupForm = reactive<z.output<typeof zPutAdminStatusPageGroupsByGroupIdBody>>({})

const linkForm = reactive<z.output<typeof zPostAdminStatusPageMonitorsBody>>({ monitor_id: 0, group_id: undefined, display_name: undefined, sort_order: 0 })
const showCreateLinkModal = ref(false)
const showEditLinkModal = ref(false)
const selectedLink = ref<Link | null>(null)
const editLinkForm = reactive<z.output<typeof zPutAdminStatusPageMonitorsByLinkIdBody>>({})

function openEditConfig() {
    if (!statusPage.value) return
    editConfigForm.title = statusPage.value.config.title
    editConfigForm.description = statusPage.value.config.description ?? undefined
    editConfigForm.is_public = statusPage.value.config.is_public
    editConfigForm.is_enabled = statusPage.value.config.is_enabled
    editConfigForm.theme = statusPage.value.config.theme
    showEditConfigModal.value = true
}

async function submitConfigEdit() {
    const res = await useAPI((api) => api.putAdminStatusPage({ body: editConfigForm }))
    if (res.success) {
        toast.add({ title: 'Status page updated', color: 'success' })
        showEditConfigModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

function openCreateGroup() {
    groupForm.name = ''
    groupForm.sort_order = 0
    showCreateGroupModal.value = true
}

async function submitCreateGroup() {
    const res = await useAPI((api) => api.postAdminStatusPageGroups({ body: groupForm }))
    if (res.success) {
        toast.add({ title: 'Group created', color: 'success' })
        showCreateGroupModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Create failed', description: res.message, color: 'error' })
    }
}

function openEditGroup(group: Group) {
    selectedGroup.value = group
    editGroupForm.name = group.name
    editGroupForm.sort_order = group.sort_order
    showEditGroupModal.value = true
}

async function submitEditGroup() {
    if (!selectedGroup.value) return
    const res = await useAPI((api) => api.putAdminStatusPageGroupsByGroupId({
        path: { groupId: selectedGroup.value.id },
        body: editGroupForm
    }))
    if (res.success) {
        toast.add({ title: 'Group updated', color: 'success' })
        showEditGroupModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

async function deleteGroup(group: Group) {
    if (!confirm(`Delete group "${group.name}"? Monitors in this group will become ungrouped.`)) return
    const res = await useAPI((api) => api.deleteAdminStatusPageGroupsByGroupId({ path: { groupId: group.id } }))
    if (res.success) {
        toast.add({ title: 'Group deleted', color: 'success' })
        await refresh()
    } else {
        toast.add({ title: 'Delete failed', description: res.message, color: 'error' })
    }
}

function openCreateLink() {
    linkForm.monitor_id = 0
    linkForm.group_id = undefined
    linkForm.display_name = undefined
    linkForm.sort_order = 0
    showCreateLinkModal.value = true
}

async function submitCreateLink() {
    const res = await useAPI((api) => api.postAdminStatusPageMonitors({ body: linkForm }))
    if (res.success) {
        toast.add({ title: 'Monitor linked', color: 'success' })
        showCreateLinkModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Link failed', description: res.message, color: 'error' })
    }
}

function openEditLink(link: Link) {
    selectedLink.value = link
    editLinkForm.group_id = link.group_id ?? null
    editLinkForm.display_name = link.display_name ?? null
    editLinkForm.sort_order = link.sort_order
    showEditLinkModal.value = true
}

async function submitEditLink() {
    if (!selectedLink.value) return
    const res = await useAPI((api) => api.putAdminStatusPageMonitorsByLinkId({
        path: { linkId: selectedLink.value.id },
        body: editLinkForm
    }))
    if (res.success) {
        toast.add({ title: 'Link updated', color: 'success' })
        showEditLinkModal.value = false
        await refresh()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

async function deleteLink(link: Link) {
    if (!confirm(`Unlink monitor "${link.monitor_name}"?`)) return
    const res = await useAPI((api) => api.deleteAdminStatusPageMonitorsByLinkId({ path: { linkId: link.id } }))
    if (res.success) {
        toast.add({ title: 'Monitor unlinked', color: 'success' })
        await refresh()
    } else {
        toast.add({ title: 'Unlink failed', description: res.message, color: 'error' })
    }
}

const groupOptions = computed(() => (statusPage.value?.groups || []).map(g => ({ label: g.name, value: g.id })))
const unlinkedMonitors = computed(() => {
    const linkedIds = new Set((statusPage.value?.links || []).map(l => l.monitor_id))
    return (monitors.value || []).filter(m => !linkedIds.has(m.id))
})
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                title="Status Page"
                icon="i-lucide-layout-grid"
                description="Configure the status page"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <div v-if="loading" class="flex items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
                </div>

                <div v-else-if="!statusPage" class="text-center py-12">
                    <UEmpty icon="i-lucide-layout-grid" title="No status page" description="Failed to load status page configuration." variant="naked" />
                </div>

                <div v-else class="space-y-8">
                    <!-- Configuration -->
                    <UCard class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <div class="flex items-center justify-between">
                                <div>
                                    <h3 class="font-semibold text-white">Configuration</h3>
                                    <p class="text-sm text-slate-400">Public: {{ statusPage.config.is_public ? 'Yes' : 'No' }} · Enabled: {{ statusPage.config.is_enabled ? 'Yes' : 'No' }} · Theme: {{ statusPage.config.theme }}</p>
                                </div>
                                <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" @click="openEditConfig" />
                            </div>
                        </template>

                        <div class="space-y-2">
                            <p><span class="text-slate-400">Title:</span> {{ statusPage.config.title }}</p>
                            <p><span class="text-slate-400">Description:</span> {{ statusPage.config.description || '—' }}</p>
                        </div>
                    </UCard>

                    <!-- Groups -->
                    <UCard class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <div class="flex items-center justify-between">
                                <h3 class="font-semibold text-white">Monitor Groups</h3>
                                <UButton icon="i-lucide-plus" color="primary" @click="openCreateGroup" />
                            </div>
                        </template>

                        <DashboardDataTable
                            :data="statusPage.groups"
                            :columns="groupColumns"
                            empty-title="No groups"
                            empty-description="Add groups to organize monitors on the status page."
                            empty-icon="i-lucide-folder"
                        >
                            <template #id-cell="{ row }">
                                <span class="font-mono text-sm">#{{ row.original.id }}</span>
                            </template>

                            <template #actions-cell="{ row }">
                                <div class="flex gap-2">
                                    <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="xs" @click="openEditGroup(row.original)" />
                                    <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="xs" @click="deleteGroup(row.original)" />
                                </div>
                            </template>
                        </DashboardDataTable>
                    </UCard>

                    <!-- Linked Monitors -->
                    <UCard class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <div class="flex items-center justify-between">
                                <h3 class="font-semibold text-white">Linked Monitors</h3>
                                <UButton icon="i-lucide-plus" color="primary" @click="openCreateLink" />
                            </div>
                        </template>

                        <DashboardDataTable
                            :data="statusPage.links"
                            :columns="linkColumns"
                            empty-title="No linked monitors"
                            empty-description="Link monitors to display them on the status page."
                            empty-icon="i-lucide-heart-pulse"
                        >
                            <template #id-cell="{ row }">
                                <span class="font-mono text-sm">#{{ row.original.id }}</span>
                            </template>

                            <template #group_id-cell="{ row }">
                                <span class="text-slate-400">{{ statusPage.groups.find(g => g.id === row.original.group_id)?.name || 'Ungrouped' }}</span>
                            </template>

                            <template #actions-cell="{ row }">
                                <div class="flex gap-2">
                                    <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="xs" @click="openEditLink(row.original)" />
                                    <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="xs" @click="deleteLink(row.original)" />
                                </div>
                            </template>
                        </DashboardDataTable>
                    </UCard>

                    <!-- Content admin shortcuts -->
                    <UCard class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <h3 class="font-semibold text-white">Content</h3>
                        </template>
                        <UNavigationMenu
                            :items="[
                                { label: 'Incidents', icon: 'i-lucide-alert-triangle', to: '/dashboard/admin/status-page/incidents' },
                                { label: 'Maintenance', icon: 'i-lucide-calendar-clock', to: '/dashboard/admin/status-page/maintenance' },
                                { label: 'Updates', icon: 'i-lucide-megaphone', to: '/dashboard/admin/status-page/updates' }
                            ]"
                            orientation="vertical"
                        />
                    </UCard>
                </div>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

    <!-- Edit Config Modal -->
    <DashboardModal v-model:open="showEditConfigModal" title="Edit Status Page" icon="i-lucide-settings">
        <div class="space-y-4">
            <UFormField label="Title" required>
                <UInput v-model="editConfigForm.title" class="w-full" />
            </UFormField>

            <UFormField label="Description">
                <UTextarea v-model="editConfigForm.description" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
                <UFormField label="Public">
                    <USwitch v-model="editConfigForm.is_public" />
                </UFormField>
                <UFormField label="Enabled">
                    <USwitch v-model="editConfigForm.is_enabled" />
                </UFormField>
            </div>

            <UFormField label="Theme">
                <USelect v-model="editConfigForm.theme" :items="[{ label: 'Auto', value: 'auto' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]" class="w-full" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showEditConfigModal = false" />
                <UButton label="Save" color="primary" @click="submitConfigEdit" />
            </div>
        </div>
    </DashboardModal>

    <!-- Create/Edit Group Modal -->
    <DashboardModal v-model:open="showCreateGroupModal" title="Create Group" icon="i-lucide-folder">
        <div class="space-y-4">
            <UFormField label="Name" required>
                <UInput v-model="groupForm.name" class="w-full" />
            </UFormField>
            <UFormField label="Sort Order">
                <UInput v-model="groupForm.sort_order" type="number" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showCreateGroupModal = false" />
                <UButton label="Create" color="primary" @click="submitCreateGroup" />
            </div>
        </div>
    </DashboardModal>

    <DashboardModal v-model:open="showEditGroupModal" title="Edit Group" icon="i-lucide-folder">
        <div class="space-y-4">
            <UFormField label="Name" required>
                <UInput v-model="editGroupForm.name" class="w-full" />
            </UFormField>
            <UFormField label="Sort Order">
                <UInput v-model="editGroupForm.sort_order" type="number" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showEditGroupModal = false" />
                <UButton label="Save" color="primary" @click="submitEditGroup" />
            </div>
        </div>
    </DashboardModal>

    <!-- Create/Edit Link Modal -->
    <DashboardModal v-model:open="showCreateLinkModal" title="Link Monitor" icon="i-lucide-heart-pulse">
        <div class="space-y-4">
            <UFormField label="Monitor" required>
                <USelect v-model="linkForm.monitor_id" :items="unlinkedMonitors.map(m => ({ label: m.name, value: m.id }))" class="w-full" />
            </UFormField>
            <UFormField label="Group">
                <USelect v-model="linkForm.group_id" :items="[{ label: 'None', value: undefined }, ...groupOptions]" class="w-full" />
            </UFormField>
            <UFormField label="Display Name">
                <UInput v-model="linkForm.display_name" class="w-full" />
            </UFormField>
            <UFormField label="Sort Order">
                <UInput v-model="linkForm.sort_order" type="number" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showCreateLinkModal = false" />
                <UButton label="Link" color="primary" @click="submitCreateLink" />
            </div>
        </div>
    </DashboardModal>

    <DashboardModal v-model:open="showEditLinkModal" title="Edit Link" icon="i-lucide-heart-pulse">
        <div class="space-y-4">
            <UFormField label="Group">
                <USelect v-model="editLinkForm.group_id" :items="[{ label: 'None', value: null }, ...groupOptions]" class="w-full" />
            </UFormField>
            <UFormField label="Display Name">
                <UInput v-model="editLinkForm.display_name" class="w-full" />
            </UFormField>
            <UFormField label="Sort Order">
                <UInput v-model="editLinkForm.sort_order" type="number" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showEditLinkModal = false" />
                <UButton label="Save" color="primary" @click="submitEditLink" />
            </div>
        </div>
    </DashboardModal>
</template>
