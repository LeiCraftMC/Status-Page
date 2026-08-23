<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '#ui/types'
import type {
    GetStatusPageResponses,
    GetStatusPageConfigResponses,
    GetStatusPageHistoryResponses,
    GetMonitorsResponses
} from '@/api-client/types.gen'
import * as z from 'zod'
import {
    zPutStatusPageBody,
    zPostStatusPageGroupsBody,
    zPutStatusPageGroupsByGroupIdBody,
    zPostStatusPageMonitorsBody,
    zPutStatusPageMonitorsByLinkIdBody
} from '~/api-client/zod.gen'
import { useUserInfoStore } from '~/composables/stores/useUserStore'

type StatusPage = GetStatusPageResponses[200]['data']
type Config = GetStatusPageConfigResponses[200]['data']['config']
type Group = GetStatusPageConfigResponses[200]['data']['groups'][number]
type Link = GetStatusPageConfigResponses[200]['data']['links'][number]
type Monitor = GetMonitorsResponses[200]['data'][number]
type MonitorHistory = GetStatusPageHistoryResponses[200]['data']
type Incident = StatusPage['incidents'][number]
type Maintenance = StatusPage['maintenance'][number]
type Update = StatusPage['updates'][number]

type ConfigData = {
    config: Config
    groups: Group[]
    links: Link[]
}

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Status Page | LeiCraft_MC Status Page',
    description: 'View and manage the public status page'
})

const toast = useToast()
const userInfoStore = useUserInfoStore()
const currentUser = await userInfoStore.use()
const isAdmin = computed(() => currentUser.value?.role === 'admin')

const {
    data: page,
    loading: pageLoading,
    refresh: refreshPage
} = await useAPILazyAsyncData<StatusPage | null>('dashboard-status-page', async () => {
    const res = await useAPI((api) => api.getStatusPage({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load status page', description: res.message, color: 'error' })
        return null
    }
    return res.data
})

const {
    data: configData,
    loading: configLoading,
    refresh: refreshConfig
} = await useAPILazyAsyncData<ConfigData | null>('dashboard-status-page-config', async () => {
    const res = await useAPI((api) => api.getStatusPageConfig({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load status page config', description: res.message, color: 'error' })
        return null
    }
    return res.data
})

const {
    data: monitors,
    refresh: refreshMonitors
} = await useAPILazyAsyncData<Monitor[]>('dashboard-all-monitors', async () => {
    const res = await useAPI((api) => api.getMonitors({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load monitors', description: res.message, color: 'error' })
        return []
    }
    return res.data
})

const {
    data: history,
    refresh: refreshHistory
} = await useAPILazyAsyncData<MonitorHistory | null>('dashboard-status-page-history', async () => {
    const res = await useAPI((api) => api.getStatusPageHistory({ query: { days: 90 } }))
    if (!res.success) {
        toast.add({ title: 'Failed to load uptime history', description: res.message, color: 'error' })
        return null
    }
    return res.data
})

const config = computed(() => configData.value?.config ?? null)
const groups = computed(() => configData.value?.groups ?? [])
const links = computed(() => configData.value?.links ?? [])
const activeIncidents = computed(() => page.value?.incidents ?? [])
const scheduledMaintenance = computed(() => page.value?.maintenance ?? [])
const recentUpdates = computed(() => page.value?.updates.slice(0, 5) ?? [])

const groupById = computed(() => {
    const map = new Map<number | null, string>()
    map.set(null, 'Ungrouped')
    for (const group of groups.value) {
        map.set(group.id, group.name)
    }
    return map
})

const groupOptions = computed(() => [
    { label: 'Ungrouped', value: null },
    ...groups.value.map(g => ({ label: g.name, value: g.id }))
])

const monitorOptions = computed(() => {
    const linkedIds = new Set(links.value.map(l => l.monitor_id))
    return (monitors.value ?? [])
        .filter(m => !linkedIds.has(m.id))
        .map(m => ({ label: m.name, value: m.id }))
})

async function refreshAll() {
    await refreshPage()
    await refreshConfig()
    await refreshMonitors()
    await refreshHistory()
}

// Admin: config form
const configSchema = zPutStatusPageBody
type ConfigSchema = z.output<typeof configSchema>

const configForm = reactive<ConfigSchema>({
    title: undefined,
    description: undefined,
    is_public: undefined,
    is_enabled: undefined,
    theme: undefined
})

watchEffect(() => {
    if (config.value) {
        configForm.title = config.value.title
        configForm.description = config.value.description ?? ''
        configForm.is_public = config.value.is_public
        configForm.is_enabled = config.value.is_enabled
        configForm.theme = config.value.theme as 'light' | 'dark' | 'auto'
    }
})

async function saveConfig() {
    const body: ConfigSchema = {
        title: configForm.title,
        description: configForm.description === '' ? null : configForm.description,
        is_public: configForm.is_public,
        is_enabled: configForm.is_enabled,
        theme: configForm.theme
    }

    const res = await useAPI((api) => api.putStatusPage({ body }))
    if (res.success) {
        toast.add({ title: 'Status page saved', color: 'success' })
        await refreshAll()
    } else {
        toast.add({ title: 'Save failed', description: res.message, color: 'error' })
    }
}

// Admin: groups
const groupColumns = computed<TableColumn<Group>[]>(() => {
    const cols: TableColumn<Group>[] = [
        { accessorKey: 'id', header: 'ID' },
        { accessorKey: 'name', header: 'Name' },
        { accessorKey: 'sort_order', header: 'Sort Order' }
    ]
    if (isAdmin.value) {
        cols.push({ id: 'actions', header: '', enableSorting: false, enableHiding: false })
    }
    return cols
})

const createGroupSchema = zPostStatusPageGroupsBody
type CreateGroupSchema = z.output<typeof createGroupSchema>
const groupCreateForm = reactive<CreateGroupSchema>({ name: '', sort_order: 0 })
const showCreateGroupModal = ref(false)

async function handleCreateGroup() {
    const res = await useAPI((api) => api.postStatusPageGroups({ body: groupCreateForm }))
    if (res.success) {
        toast.add({ title: 'Group created', color: 'success' })
        showCreateGroupModal.value = false
        groupCreateForm.name = ''
        groupCreateForm.sort_order = 0
        await refreshConfig()
    } else {
        toast.add({ title: 'Create failed', description: res.message, color: 'error' })
    }
}

const editGroupSchema = zPutStatusPageGroupsByGroupIdBody
type EditGroupSchema = z.output<typeof editGroupSchema>
const selectedGroup = ref<Group | null>(null)
const groupEditForm = reactive<EditGroupSchema>({})
const showEditGroupModal = ref(false)

function openEditGroup(group: Group) {
    selectedGroup.value = group
    groupEditForm.name = group.name
    groupEditForm.sort_order = group.sort_order
    showEditGroupModal.value = true
}

async function submitEditGroup() {
    if (!selectedGroup.value) return
    const body: EditGroupSchema = {}
    if (groupEditForm.name !== selectedGroup.value.name) body.name = groupEditForm.name
    if (groupEditForm.sort_order !== selectedGroup.value.sort_order) body.sort_order = groupEditForm.sort_order

    const res = await useAPI((api) => api.putStatusPageGroupsByGroupId({
        path: { groupId: selectedGroup.value!.id },
        body
    }))
    if (res.success) {
        toast.add({ title: 'Group updated', color: 'success' })
        showEditGroupModal.value = false
        await refreshConfig()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

const groupDeleteTarget = ref<Group | null>(null)
const showDeleteGroupModal = ref(false)

function openDeleteGroup(group: Group) {
    groupDeleteTarget.value = group
    showDeleteGroupModal.value = true
}

async function onDeleteGroup() {
    if (!groupDeleteTarget.value) return
    const res = await useAPI((api) => api.deleteStatusPageGroupsByGroupId({
        path: { groupId: groupDeleteTarget.value.id }
    }))
    if (res.success) {
        toast.add({ title: 'Group deleted', color: 'success' })
        showDeleteGroupModal.value = false
        groupDeleteTarget.value = null
        await refreshAll()
    } else {
        toast.add({ title: 'Delete failed', description: res.message, color: 'error' })
    }
}

function getGroupDropdownItems(row: { original: Group }): DropdownMenuItem[][] {
    if (!isAdmin.value) return []
    return [[
        { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEditGroup(row.original) },
        { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openDeleteGroup(row.original) }
    ]]
}

// Admin: links
const linkColumns = computed<TableColumn<Link>[]>(() => {
    const cols: TableColumn<Link>[] = [
        { accessorKey: 'monitor_name', header: 'Monitor' },
        { accessorKey: 'display_name', header: 'Display Name' },
        { id: 'group', header: 'Group' },
        { accessorKey: 'sort_order', header: 'Sort Order' }
    ]
    if (isAdmin.value) {
        cols.push({ id: 'actions', header: '', enableSorting: false, enableHiding: false })
    }
    return cols
})

const createLinkSchema = zPostStatusPageMonitorsBody
type CreateLinkSchema = z.output<typeof createLinkSchema>
const linkCreateForm = reactive<CreateLinkSchema>({
    monitor_id: 0,
    group_id: null,
    display_name: null,
    sort_order: 0
})
const showCreateLinkModal = ref(false)

async function handleCreateLink() {
    const body: CreateLinkSchema = {
        monitor_id: linkCreateForm.monitor_id,
        group_id: linkCreateForm.group_id,
        display_name: linkCreateForm.display_name === '' ? null : linkCreateForm.display_name,
        sort_order: linkCreateForm.sort_order
    }

    const res = await useAPI((api) => api.postStatusPageMonitors({ body }))
    if (res.success) {
        toast.add({ title: 'Monitor linked', color: 'success' })
        showCreateLinkModal.value = false
        linkCreateForm.monitor_id = 0
        linkCreateForm.group_id = null
        linkCreateForm.display_name = null
        linkCreateForm.sort_order = 0
        await refreshAll()
    } else {
        toast.add({ title: 'Link failed', description: res.message, color: 'error' })
    }
}

const editLinkSchema = zPutStatusPageMonitorsByLinkIdBody
type EditLinkSchema = z.output<typeof editLinkSchema>
const selectedLink = ref<Link | null>(null)
const linkEditForm = reactive<EditLinkSchema>({})
const showEditLinkModal = ref(false)

function openEditLink(link: Link) {
    selectedLink.value = link
    linkEditForm.group_id = link.group_id
    linkEditForm.display_name = link.display_name ?? ''
    linkEditForm.sort_order = link.sort_order
    showEditLinkModal.value = true
}

async function submitEditLink() {
    if (!selectedLink.value) return
    const body: EditLinkSchema = {}
    if (linkEditForm.group_id !== selectedLink.value.group_id) body.group_id = linkEditForm.group_id
    const displayName = linkEditForm.display_name === '' ? null : linkEditForm.display_name
    if (displayName !== selectedLink.value.display_name) body.display_name = displayName
    if (linkEditForm.sort_order !== selectedLink.value.sort_order) body.sort_order = linkEditForm.sort_order

    const res = await useAPI((api) => api.putStatusPageMonitorsByLinkId({
        path: { linkId: selectedLink.value!.id },
        body
    }))
    if (res.success) {
        toast.add({ title: 'Link updated', color: 'success' })
        showEditLinkModal.value = false
        await refreshAll()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

const linkDeleteTarget = ref<Link | null>(null)
const showDeleteLinkModal = ref(false)

function openDeleteLink(link: Link) {
    linkDeleteTarget.value = link
    showDeleteLinkModal.value = true
}

async function onDeleteLink() {
    if (!linkDeleteTarget.value) return
    const res = await useAPI((api) => api.deleteStatusPageMonitorsByLinkId({
        path: { linkId: linkDeleteTarget.value.id }
    }))
    if (res.success) {
        toast.add({ title: 'Monitor unlinked', color: 'success' })
        showDeleteLinkModal.value = false
        linkDeleteTarget.value = null
        await refreshAll()
    } else {
        toast.add({ title: 'Unlink failed', description: res.message, color: 'error' })
    }
}

function getLinkDropdownItems(row: { original: Link }): DropdownMenuItem[][] {
    if (!isAdmin.value) return []
    return [[
        { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEditLink(row.original) },
        { label: 'Unlink', icon: 'i-lucide-unlink', color: 'error', onSelect: () => openDeleteLink(row.original) }
    ]]
}

function incidentSeverityColor(severity: Incident['severity']) {
    return getSeverityColor(severity)
}

function maintenanceStatusColor(status: Maintenance['status']) {
    return getMaintenanceStatusColor(status)
}
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                title="Status Page"
                icon="i-lucide-layout-grid"
                description="Public status page overview"
            >
                <template #right>
                    <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="subtle" @click="refreshAll" />
                </template>
            </DashboardPageHeader>
        </template>

        <template #body>
            <DashboardPageBody>
                <div v-if="pageLoading" class="flex items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
                </div>

                <div v-else-if="!page" class="text-center py-12">
                    <UEmpty icon="i-lucide-file-x" title="Status page not available" description="Could not load the status page." variant="naked" />
                </div>

                <div v-else class="space-y-6">
                    <!-- Public preview -->
                    <div class="text-center space-y-2">
                        <h1 class="text-2xl font-bold text-white">{{ page.page.title }}</h1>
                        <p v-if="page.page.description" class="text-slate-400 max-w-2xl mx-auto">{{ page.page.description }}</p>

                        <div class="flex justify-center gap-2">
                            <UBadge :color="page.page.is_public ? 'success' : 'neutral'" variant="soft">
                                {{ page.page.is_public ? 'Public' : 'Private' }}
                            </UBadge>
                            <UBadge :color="page.page.is_enabled ? 'success' : 'neutral'" variant="soft">
                                {{ page.page.is_enabled ? 'Enabled' : 'Disabled' }}
                            </UBadge>
                        </div>
                    </div>

                    <MonitorList
                        :groups="page.groups"
                        :ungrouped="page.ungrouped"
                        :histories="history?.monitors"
                    />

                    <UCard v-if="activeIncidents.length" class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <h3 class="font-semibold text-white flex items-center gap-2">
                                <UIcon name="i-lucide-alert-triangle" class="text-error" />
                                Active Incidents
                            </h3>
                        </template>
                        <div class="space-y-4">
                            <div
                                v-for="incident in activeIncidents"
                                :key="incident.id"
                                class="p-4 rounded-lg border border-slate-800 bg-slate-900/40"
                            >
                                <div class="flex items-start justify-between gap-4">
                                    <div class="min-w-0">
                                        <p class="font-semibold text-white">{{ incident.title }}</p>
                                        <p class="text-slate-400 text-sm mt-1">{{ incident.message }}</p>
                                    </div>
                                    <div class="flex items-center gap-2 shrink-0">
                                        <UBadge :color="incidentSeverityColor(incident.severity)" variant="soft" class="capitalize">
                                            {{ incident.severity }}
                                        </UBadge>
                                        <UBadge :color="getIncidentStatusColor(incident.status)" variant="soft" class="capitalize">
                                            {{ incident.status }}
                                        </UBadge>
                                    </div>
                                </div>
                                <p class="text-xs text-slate-500 mt-3">Started {{ formatDate(incident.started_at) }}</p>
                            </div>
                        </div>
                    </UCard>

                    <UCard v-if="scheduledMaintenance.length" class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <h3 class="font-semibold text-white flex items-center gap-2">
                                <UIcon name="i-lucide-calendar-clock" class="text-warning" />
                                Scheduled Maintenance
                            </h3>
                        </template>
                        <div class="space-y-4">
                            <div
                                v-for="item in scheduledMaintenance"
                                :key="item.id"
                                class="p-4 rounded-lg border border-slate-800 bg-slate-900/40"
                            >
                                <div class="flex items-start justify-between gap-4">
                                    <div class="min-w-0">
                                        <p class="font-semibold text-white">{{ item.title }}</p>
                                        <p class="text-slate-400 text-sm mt-1">{{ item.message }}</p>
                                    </div>
                                    <UBadge :color="maintenanceStatusColor(item.status)" variant="soft" class="capitalize shrink-0">
                                        {{ item.status.replace('_', ' ') }}
                                    </UBadge>
                                </div>
                                <p class="text-xs text-slate-500 mt-3">
                                    {{ formatDate(item.scheduled_start_at) }}
                                    <span v-if="item.scheduled_end_at"> — {{ formatDate(item.scheduled_end_at) }}</span>
                                </p>
                            </div>
                        </div>
                    </UCard>

                    <UCard v-if="recentUpdates.length" class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <h3 class="font-semibold text-white flex items-center gap-2">
                                <UIcon name="i-lucide-megaphone" class="text-primary" />
                                Recent Updates
                            </h3>
                        </template>
                        <div class="space-y-4">
                            <div
                                v-for="update in recentUpdates"
                                :key="update.id"
                                class="p-4 rounded-lg border border-slate-800 bg-slate-900/40"
                            >
                                <div class="flex items-start justify-between gap-4">
                                    <div class="min-w-0">
                                        <p class="font-semibold text-white">{{ update.title }}</p>
                                        <p class="text-slate-400 text-sm mt-1">{{ update.message }}</p>
                                    </div>
                                    <UBadge variant="soft" class="capitalize shrink-0">
                                        {{ update.type }}
                                    </UBadge>
                                </div>
                                <p class="text-xs text-slate-500 mt-3">{{ formatDate(update.created_at) }}</p>
                            </div>
                        </div>
                    </UCard>

                    <!-- Admin configuration -->
                    <template v-if="isAdmin && config">
                        <UCard class="border-slate-800 bg-slate-900/60">
                            <template #header>
                                <h3 class="font-semibold text-white">Configuration</h3>
                            </template>

                            <UForm :schema="configSchema" :state="configForm" class="space-y-4" @submit="saveConfig">
                                <UFormField label="Title" name="title" required>
                                    <UInput v-model="configForm.title" class="w-full" />
                                </UFormField>

                                <UFormField label="Description" name="description">
                                    <UTextarea v-model="configForm.description" class="w-full" />
                                </UFormField>

                                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <UFormField label="Theme" name="theme">
                                        <USelect
                                            v-model="configForm.theme"
                                            :items="[
                                                { label: 'Auto', value: 'auto' },
                                                { label: 'Light', value: 'light' },
                                                { label: 'Dark', value: 'dark' }
                                            ]"
                                            class="w-full"
                                        />
                                    </UFormField>

                                    <UFormField name="is_public">
                                        <USwitch v-model="configForm.is_public" label="Public" />
                                    </UFormField>

                                    <UFormField name="is_enabled">
                                        <USwitch v-model="configForm.is_enabled" label="Enabled" />
                                    </UFormField>
                                </div>

                                <div class="pt-2">
                                    <UButton type="submit" label="Save Configuration" color="primary" icon="i-lucide-save" />
                                </div>
                            </UForm>
                        </UCard>

                        <DashboardDataTable
                            :data="groups"
                            :columns="groupColumns"
                            :loading="configLoading"
                            empty-title="No groups"
                            empty-description="Create groups to organize linked monitors."
                            empty-icon="i-lucide-folder"
                            @refresh="refreshConfig"
                        >
                            <template #header-right>
                                <UButton label="New Group" icon="i-lucide-plus" color="primary" @click="showCreateGroupModal = true" />
                            </template>

                            <template #id-cell="{ row }">
                                <span class="font-mono text-sm">#{{ row.original.id }}</span>
                            </template>

                            <template #actions-cell="{ row }">
                                <UDropdownMenu :items="getGroupDropdownItems(row)">
                                    <UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
                                </UDropdownMenu>
                            </template>

                            <template #empty-actions>
                                <UButton label="Create Group" color="primary" @click="showCreateGroupModal = true" />
                            </template>
                        </DashboardDataTable>

                        <DashboardDataTable
                            :data="links"
                            :columns="linkColumns"
                            :loading="configLoading"
                            empty-title="No linked monitors"
                            empty-description="Link monitors to display them on the status page."
                            empty-icon="i-lucide-heart-pulse"
                            @refresh="refreshConfig"
                        >
                            <template #header-right>
                                <UButton label="Link Monitor" icon="i-lucide-plus" color="primary" @click="showCreateLinkModal = true" />
                            </template>

                            <template #group-cell="{ row }">
                                <span class="text-slate-300">{{ groupById.get(row.original.group_id) ?? 'Ungrouped' }}</span>
                            </template>

                            <template #display_name-cell="{ row }">
                                <span class="text-slate-300">{{ row.original.display_name ?? row.original.monitor_name }}</span>
                            </template>

                            <template #actions-cell="{ row }">
                                <UDropdownMenu :items="getLinkDropdownItems(row)">
                                    <UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
                                </UDropdownMenu>
                            </template>

                            <template #empty-actions>
                                <UButton label="Link Monitor" color="primary" @click="showCreateLinkModal = true;" />
                            </template>
                        </DashboardDataTable>
                    </template>
                </div>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

    <!-- Admin modals -->
    <template v-if="isAdmin">
        <DashboardModal v-model:open="showCreateGroupModal" title="Create Group" icon="i-lucide-folder-plus">
            <UForm :schema="createGroupSchema" :state="groupCreateForm" class="space-y-4" @submit="handleCreateGroup">
                <UFormField label="Name" name="name" required>
                    <UInput v-model="groupCreateForm.name" class="w-full" />
                </UFormField>
                <UFormField label="Sort Order" name="sort_order">
                    <UInput v-model="groupCreateForm.sort_order" type="number" class="w-full" />
                </UFormField>
                <div class="flex justify-end gap-2 pt-4">
                    <UButton label="Cancel" color="neutral" variant="ghost" @click="showCreateGroupModal = false" />
                    <UButton type="submit" label="Create" color="primary" />
                </div>
            </UForm>
        </DashboardModal>

        <DashboardModal v-model:open="showEditGroupModal" :title="`Edit Group: ${selectedGroup?.name}`" icon="i-lucide-pencil">
            <div class="space-y-4">
                <UFormField label="Name">
                    <UInput v-model="groupEditForm.name" class="w-full" />
                </UFormField>
                <UFormField label="Sort Order">
                    <UInput v-model="groupEditForm.sort_order" type="number" class="w-full" />
                </UFormField>
                <div class="flex justify-end gap-2 pt-4">
                    <UButton label="Cancel" color="neutral" variant="ghost" @click="showEditGroupModal = false" />
                    <UButton label="Save" color="primary" @click="submitEditGroup" />
                </div>
            </div>
        </DashboardModal>

        <DashboardDeleteModal
            v-model:open="showDeleteGroupModal"
            title="Delete Group"
            :warning-text="`Are you sure you want to delete group &quot;${groupDeleteTarget?.name || ''}&quot;? Linked monitors will become ungrouped.`"
            :on-delete="onDeleteGroup"
        />

        <DashboardModal v-model:open="showCreateLinkModal" title="Link Monitor" icon="i-lucide-link">
            <UForm :schema="createLinkSchema" :state="linkCreateForm" class="space-y-4" @submit="handleCreateLink">
                <UFormField label="Monitor" name="monitor_id" required>
                    <USelect v-model="linkCreateForm.monitor_id" :items="monitorOptions" placeholder="Select a monitor" class="w-full" />
                </UFormField>
                <UFormField label="Group" name="group_id">
                    <USelect v-model="linkCreateForm.group_id" :items="groupOptions" placeholder="Ungrouped" class="w-full" />
                </UFormField>
                <UFormField label="Display Name" name="display_name">
                    <UInput v-model="linkCreateForm.display_name" placeholder="Optional display name" class="w-full" />
                </UFormField>
                <UFormField label="Sort Order" name="sort_order">
                    <UInput v-model="linkCreateForm.sort_order" type="number" class="w-full" />
                </UFormField>
                <div class="flex justify-end gap-2 pt-4">
                    <UButton label="Cancel" color="neutral" variant="ghost" @click="showCreateLinkModal = false" />
                    <UButton type="submit" label="Link" color="primary" />
                </div>
            </UForm>
        </DashboardModal>

        <DashboardModal v-model:open="showEditLinkModal" :title="`Edit Link: ${selectedLink?.monitor_name}`" icon="i-lucide-pencil">
            <div class="space-y-4">
                <UFormField label="Group">
                    <USelect v-model="linkEditForm.group_id" :items="groupOptions" placeholder="Ungrouped" class="w-full" />
                </UFormField>
                <UFormField label="Display Name">
                    <UInput v-model="linkEditForm.display_name" placeholder="Optional display name" class="w-full" />
                </UFormField>
                <UFormField label="Sort Order">
                    <UInput v-model="linkEditForm.sort_order" type="number" class="w-full" />
                </UFormField>
                <div class="flex justify-end gap-2 pt-4">
                    <UButton label="Cancel" color="neutral" variant="ghost" @click="showEditLinkModal = false" />
                    <UButton label="Save" color="primary" @click="submitEditLink" />
                </div>
            </div>
        </DashboardModal>

        <DashboardDeleteModal
            v-model:open="showDeleteLinkModal"
            title="Unlink Monitor"
            :warning-text="`Are you sure you want to unlink monitor &quot;${linkDeleteTarget?.monitor_name || ''}&quot; from the status page?`"
            :on-delete="onDeleteLink"
        />
    </template>
</template>
