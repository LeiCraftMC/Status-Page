<script setup lang="ts">
import type { FormSubmitEvent } from '#ui/types'
import * as z from 'zod'
import type { GetAdminMonitorsResponses, GetAdminStatusPagesByPageIdResponses } from '~/api-client'
import {
    zPutAdminStatusPagesByPageIdBody,
    zPostAdminStatusPagesByPageIdGroupsBody,
    zPostAdminStatusPagesByPageIdMonitorsBody,
    zPutAdminStatusPagesByPageIdGroupsByGroupIdBody,
    zPutAdminStatusPagesByPageIdMonitorsByLinkIdBody
} from '~/api-client/zod.gen'
import { useUserInfoStore } from '~/composables/stores/useUserStore'

type FullPage = GetAdminStatusPagesByPageIdResponses[200]['data']
type Group = FullPage['groups'][number]
type Link = FullPage['links'][number]
type Monitor = GetAdminMonitorsResponses[200]['data'][number]

const route = useRoute()
const pageId = Number(route.params.id)

if (!pageId || Number.isNaN(pageId)) {
    throw new Error('Invalid status page ID')
}

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Edit Status Page | LeiCraft_MC Status Page',
    description: 'Edit status page configuration'
})

const toast = useToast()

const userInfoStore = useUserInfoStore()
const currentUser = await userInfoStore.use()
if (!userInfoStore.isValid(currentUser) || currentUser.value.role !== 'admin') {
    await navigateTo('/dashboard')
}

const {
    data: pageDetails,
    loading,
    refresh
} = await useAPILazyAsyncData<FullPage | null>(`admin-status-page-${pageId}`, async () => {
    const res = await useAPI((api) => api.getAdminStatusPagesByPageId({ path: { pageId } }))
    if (!res.success) {
        toast.add({ title: 'Failed to load status page', description: res.message, color: 'error' })
        return null
    }
    return res.data
})

const {
    data: allMonitors,
    refresh: refreshAllMonitors
} = await useAPILazyAsyncData<Monitor[]>('admin-all-monitors', async () => {
    const res = await useAPI((api) => api.getAdminMonitors({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load monitors', description: res.message, color: 'error' })
        return []
    }
    return res.data
})

const page = computed(() => pageDetails.value?.page)
const groups = computed(() => pageDetails.value?.groups || [])
const links = computed(() => pageDetails.value?.links || [])

const updateSchema = zPutAdminStatusPagesByPageIdBody
type UpdateSchema = z.output<typeof updateSchema>
const pageForm = reactive<UpdateSchema>({
    slug: '',
    title: '',
    description: '',
    is_public: true,
    is_enabled: true,
    theme: 'auto'
})

watchEffect(() => {
    if (page.value) {
        pageForm.slug = page.value.slug
        pageForm.title = page.value.title
        pageForm.description = page.value.description || ''
        pageForm.is_public = page.value.is_public
        pageForm.is_enabled = page.value.is_enabled
        pageForm.theme = page.value.theme
    }
})

async function submitPageUpdate(event: FormSubmitEvent<UpdateSchema>) {
    const res = await useAPI((api) => api.putAdminStatusPagesByPageId({
        path: { pageId },
        body: event.data
    }))
    if (res.success) {
        toast.add({ title: 'Status page updated', color: 'success' })
        await refresh()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

// Groups
const groupSchema = zPostAdminStatusPagesByPageIdGroupsBody
type GroupSchema = z.output<typeof groupSchema>
const showCreateGroupModal = ref(false)
const groupForm = reactive<GroupSchema>({ name: '', sort_order: 0 })
const editingGroup = ref<Group | null>(null)
const editGroupForm = reactive<Partial<GroupSchema>>({ name: '', sort_order: 0 })
const deleteGroupTarget = ref<Group | null>(null)
const deleteGroupOpen = ref(false)

async function createGroup(event: FormSubmitEvent<GroupSchema>) {
    const res = await useAPI((api) => api.postAdminStatusPagesByPageIdGroups({
        path: { pageId },
        body: event.data
    }))
    if (res.success) {
        toast.add({ title: 'Group created', color: 'success' })
        showCreateGroupModal.value = false
        groupForm.name = ''
        groupForm.sort_order = 0
        await refresh()
    } else {
        toast.add({ title: 'Create failed', description: res.message, color: 'error' })
    }
}

function startEditGroup(group: Group) {
    editingGroup.value = group
    editGroupForm.name = group.name
    editGroupForm.sort_order = group.sort_order
}

async function saveGroupEdit() {
    if (!editingGroup.value) return
    const res = await useAPI((api) => api.putAdminStatusPagesByPageIdGroupsByGroupId({
        path: { pageId, groupId: editingGroup.value!.id },
        body: {
            name: editGroupForm.name,
            sort_order: editGroupForm.sort_order
        }
    }))
    if (res.success) {
        toast.add({ title: 'Group updated', color: 'success' })
        editingGroup.value = null
        await refresh()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

function openDeleteGroup(group: Group) {
    deleteGroupTarget.value = group
    deleteGroupOpen.value = true
}

async function onDeleteGroup() {
    if (!deleteGroupTarget.value) return
    const res = await useAPI((api) => api.deleteAdminStatusPagesByPageIdGroupsByGroupId({
        path: { pageId, groupId: deleteGroupTarget.value!.id }
    }))
    if (res.success) {
        toast.add({ title: 'Group deleted', color: 'success' })
        deleteGroupOpen.value = false
        deleteGroupTarget.value = null
        await refresh()
    } else {
        toast.add({ title: 'Delete failed', description: res.message, color: 'error' })
    }
}

// Link monitors
const linkSchema = zPostAdminStatusPagesByPageIdMonitorsBody
type LinkSchema = z.output<typeof linkSchema>
const showLinkModal = ref(false)
const linkForm = reactive<LinkSchema>({
    monitor_id: 0,
    group_id: undefined,
    display_name: '',
    sort_order: 0
})
const editingLink = ref<Link | null>(null)
const editLinkForm = reactive<Partial<LinkSchema>>({
    group_id: undefined,
    display_name: '',
    sort_order: 0
})
const deleteLinkTarget = ref<Link | null>(null)
const deleteLinkOpen = ref(false)

const availableMonitors = computed(() => {
    const linkedIds = new Set(links.value.map(l => l.monitor_id))
    return (allMonitors.value || []).filter(m => !linkedIds.has(m.id))
})

function getGroupName(groupId: number | null) {
    if (!groupId) return 'Ungrouped'
    return groups.value.find(g => g.id === groupId)?.name || 'Unknown group'
}

async function createLink(event: FormSubmitEvent<LinkSchema>) {
    const body: LinkSchema = {
        monitor_id: event.data.monitor_id,
        sort_order: event.data.sort_order
    }
    if (event.data.group_id) body.group_id = event.data.group_id
    if (event.data.display_name) body.display_name = event.data.display_name
    const res = await useAPI((api) => api.postAdminStatusPagesByPageIdMonitors({
        path: { pageId },
        body
    }))
    if (res.success) {
        toast.add({ title: 'Monitor linked', color: 'success' })
        showLinkModal.value = false
        linkForm.monitor_id = 0
        linkForm.group_id = undefined
        linkForm.display_name = ''
        linkForm.sort_order = 0
        await refresh()
    } else {
        toast.add({ title: 'Link failed', description: res.message, color: 'error' })
    }
}

function startEditLink(link: Link) {
    editingLink.value = link
    editLinkForm.group_id = link.group_id || undefined
    editLinkForm.display_name = link.display_name || ''
    editLinkForm.sort_order = link.sort_order
}

async function saveLinkEdit() {
    if (!editingLink.value) return
    const res = await useAPI((api) => api.putAdminStatusPagesByPageIdMonitorsByLinkId({
        path: { pageId, linkId: editingLink.value!.id },
        body: {
            group_id: editLinkForm.group_id ?? null,
            display_name: editLinkForm.display_name || null,
            sort_order: editLinkForm.sort_order
        }
    }))
    if (res.success) {
        toast.add({ title: 'Link updated', color: 'success' })
        editingLink.value = null
        await refresh()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

function openDeleteLink(link: Link) {
    deleteLinkTarget.value = link
    deleteLinkOpen.value = true
}

async function onDeleteLink() {
    if (!deleteLinkTarget.value) return
    const res = await useAPI((api) => api.deleteAdminStatusPagesByPageIdMonitorsByLinkId({
        path: { pageId, linkId: deleteLinkTarget.value!.id }
    }))
    if (res.success) {
        toast.add({ title: 'Monitor unlinked', color: 'success' })
        deleteLinkOpen.value = false
        deleteLinkTarget.value = null
        await refresh()
    } else {
        toast.add({ title: 'Unlink failed', description: res.message, color: 'error' })
    }
}
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                title="Edit Status Page"
                icon="i-lucide-layout-grid"
                description="Configure groups and linked monitors"
                :breadcrumb-items="[
                    { label: 'Status Pages', to: '/dashboard/admin/status-pages', icon: 'i-lucide-layout-grid' },
                    { label: page?.title || 'Edit', icon: 'i-lucide-pencil' }
                ]"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <div v-if="loading" class="flex items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
                </div>

                <div v-else-if="!page" class="text-center py-12 text-slate-400">
                    Status page not found.
                </div>

                <div v-else class="space-y-6">
                    <!-- Metadata form -->
                    <UCard class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
                                    <UIcon name="i-lucide-settings-2" class="size-5 text-primary-400" />
                                </div>
                                <div>
                                    <h3 class="font-semibold text-white">Page Settings</h3>
                                    <p class="text-sm text-slate-400">General metadata and visibility</p>
                                </div>
                            </div>
                        </template>

                        <UForm :schema="updateSchema" :state="pageForm" class="space-y-4" @submit="submitPageUpdate">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <UFormField label="Title" name="title">
                                    <UInput v-model="pageForm.title" class="w-full" />
                                </UFormField>
                                <UFormField label="Slug" name="slug">
                                    <UInput v-model="pageForm.slug" class="w-full" />
                                </UFormField>
                            </div>

                            <UFormField label="Description" name="description">
                                <UTextarea v-model="pageForm.description" class="w-full" />
                            </UFormField>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <UFormField label="Theme" name="theme">
                                    <USelect v-model="pageForm.theme" :items="[{ label: 'Auto', value: 'auto' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]" class="w-full" />
                                </UFormField>
                                <UFormField name="is_public" class="pt-6">
                                    <UCheckbox v-model="pageForm.is_public" label="Public" />
                                </UFormField>
                                <UFormField name="is_enabled" class="pt-6">
                                    <UCheckbox v-model="pageForm.is_enabled" label="Enabled" />
                                </UFormField>
                            </div>

                            <div class="flex justify-end gap-2 pt-2">
                                <UButton type="submit" label="Save Changes" color="primary" icon="i-lucide-save" />
                            </div>
                        </UForm>
                    </UCard>

                    <!-- Groups -->
                    <UCard class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
                                        <UIcon name="i-lucide-folder" class="size-5 text-primary-400" />
                                    </div>
                                    <div>
                                        <h3 class="font-semibold text-white">Groups</h3>
                                        <p class="text-sm text-slate-400">Organize monitors into groups</p>
                                    </div>
                                </div>
                                <UButton label="New Group" icon="i-lucide-plus" color="primary" @click="showCreateGroupModal = true;" />
                            </div>
                        </template>

                        <div v-if="groups.length" class="divide-y divide-slate-800">
                            <div v-for="group in groups" :key="group.id" class="py-3 flex items-center justify-between gap-4">
                                <div v-if="editingGroup?.id !== group.id" class="flex-1">
                                    <p class="font-medium text-white">{{ group.name }}</p>
                                    <p class="text-xs text-slate-400">Order: {{ group.sort_order }}</p>
                                </div>
                                <div v-else class="flex-1 flex items-center gap-2">
                                    <UInput v-model="editGroupForm.name" class="flex-1" />
                                    <UInput v-model="editGroupForm.sort_order" type="number" class="w-24" />
                                </div>

                                <div class="flex items-center gap-1">
                                    <template v-if="editingGroup?.id !== group.id">
                                        <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" @click="startEditGroup(group)" />
                                        <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" @click="openDeleteGroup(group)" />
                                    </template>
                                    <template v-else>
                                        <UButton icon="i-lucide-check" color="success" variant="ghost" size="xs" @click="saveGroupEdit" />
                                        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" @click="editingGroup = null;" />
                                    </template>
                                </div>
                            </div>
                        </div>

                        <UEmpty v-else icon="i-lucide-folder" title="No groups" description="Create a group to organize monitors." variant="naked" />
                    </UCard>

                    <!-- Linked Monitors -->
                    <UCard class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
                                        <UIcon name="i-lucide-heart-pulse" class="size-5 text-primary-400" />
                                    </div>
                                    <div>
                                        <h3 class="font-semibold text-white">Linked Monitors</h3>
                                        <p class="text-sm text-slate-400">Monitors displayed on this page</p>
                                    </div>
                                </div>
                                <UButton label="Link Monitor" icon="i-lucide-plus" color="primary" :disabled="!availableMonitors.length" @click="showLinkModal = true;" />
                            </div>
                        </template>

                        <div v-if="links.length" class="divide-y divide-slate-800">
                            <div v-for="link in links" :key="link.id" class="py-3 flex items-center justify-between gap-4">
                                <div v-if="editingLink?.id !== link.id" class="flex-1 min-w-0">
                                    <p class="font-medium text-white truncate">
                                        {{ link.display_name || link.monitor_name }}
                                        <span class="text-slate-400 font-normal">({{ link.monitor_name }})</span>
                                    </p>
                                    <p class="text-xs text-slate-400">
                                        Group: {{ getGroupName(link.group_id) }} · Order: {{ link.sort_order }}
                                    </p>
                                </div>
                                <div v-else class="flex-1 flex items-center gap-2">
                                    <UInput v-model="editLinkForm.display_name" placeholder="Display name" class="flex-1" />
                                    <USelect v-model="editLinkForm.group_id" :items="[{ label: 'Ungrouped', value: undefined }, ...groups.map(g => ({ label: g.name, value: g.id }))]" class="w-40" />
                                    <UInput v-model="editLinkForm.sort_order" type="number" class="w-24" />
                                </div>

                                <div class="flex items-center gap-1 shrink-0">
                                    <template v-if="editingLink?.id !== link.id">
                                        <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" @click="startEditLink(link)" />
                                        <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" @click="openDeleteLink(link)" />
                                    </template>
                                    <template v-else>
                                        <UButton icon="i-lucide-check" color="success" variant="ghost" size="xs" @click="saveLinkEdit" />
                                        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" @click="editingLink = null;" />
                                    </template>
                                </div>
                            </div>
                        </div>

                        <UEmpty v-else icon="i-lucide-heart-pulse" title="No linked monitors" description="Link a monitor to start showing status." variant="naked" />
                    </UCard>
                </div>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

    <!-- Create Group Modal -->
    <DashboardModal v-model:open="showCreateGroupModal" title="Create Group" icon="i-lucide-folder">
        <UForm :schema="groupSchema" :state="groupForm" class="space-y-4" @submit="createGroup">
            <UFormField label="Name" name="name" required>
                <UInput v-model="groupForm.name" class="w-full" />
            </UFormField>
            <UFormField label="Sort Order" name="sort_order">
                <UInput v-model="groupForm.sort_order" type="number" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showCreateGroupModal = false;" />
                <UButton type="submit" label="Create" color="primary" />
            </div>
        </UForm>
    </DashboardModal>

    <!-- Delete Group Modal -->
    <DashboardDeleteModal
        v-model:open="deleteGroupOpen"
        title="Delete Group"
        :warning-text="'Delete group “' + (deleteGroupTarget?.name || '') + '”? Linked monitors will become ungrouped.'"
        :on-delete="onDeleteGroup"
        :prevent-auto-close="true"
    />

    <!-- Link Monitor Modal -->
    <DashboardModal v-model:open="showLinkModal" title="Link Monitor" icon="i-lucide-heart-pulse">
        <UForm :schema="linkSchema" :state="linkForm" class="space-y-4" @submit="createLink">
            <UFormField label="Monitor" name="monitor_id" required>
                <USelect v-model="linkForm.monitor_id" value-key="value" :items="availableMonitors.map(m => ({ label: m.name, value: m.id }))" class="w-full" />
            </UFormField>
            <UFormField label="Group" name="group_id">
                <USelect v-model="linkForm.group_id" value-key="value" :items="[{ label: 'Ungrouped', value: undefined }, ...groups.map(g => ({ label: g.name, value: g.id }))]" class="w-full" />
            </UFormField>
            <UFormField label="Display Name" name="display_name">
                <UInput v-model="linkForm.display_name" placeholder="Optional custom name" class="w-full" />
            </UFormField>
            <UFormField label="Sort Order" name="sort_order">
                <UInput v-model="linkForm.sort_order" type="number" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-4">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="showLinkModal = false;" />
                <UButton type="submit" label="Link" color="primary" />
            </div>
        </UForm>
    </DashboardModal>

    <!-- Unlink Monitor Modal -->
    <DashboardDeleteModal
        v-model:open="deleteLinkOpen"
        title="Unlink Monitor"
        :warning-text="'Unlink monitor “' + (deleteLinkTarget?.display_name || deleteLinkTarget?.monitor_name || '') + '” from this status page?'"
        :on-delete="onDeleteLink"
        :prevent-auto-close="true"
    />
</template>
