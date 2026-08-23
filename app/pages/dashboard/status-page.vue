<script setup lang="ts">
import type {
    GetStatusPageResponses,
    GetStatusPageConfigResponses,
    GetStatusPageHistoryResponses,
    GetMonitorsResponses
} from '@/api-client/types.gen'
import * as z from 'zod'
import { zPutStatusPageBody } from '~/api-client/zod.gen'
import { useUserInfoStore } from '~/composables/stores/useUserStore'
import StatusPageEditor from '~/components/status-page/StatusPageEditor.vue'

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

async function refreshAll() {
    await refreshPage()
    await refreshConfig()
    await refreshMonitors()
    await refreshHistory()
}

// Admin: visual editor handlers

async function onReorderGroups(groups: { id: number; sort_order: number }[]) {
    const res = await useAPI((api) => api.putStatusPageGroupsReorder({ body: { groups } }))
    if (res.success) {
        toast.add({ title: 'Groups reordered', color: 'success' })
        await refreshConfig()
    } else {
        toast.add({ title: 'Reorder failed', description: res.message, color: 'error' })
    }
}

async function onReorderLinks(links: { id: number; group_id: number | null; sort_order: number }[]) {
    const res = await useAPI((api) => api.putStatusPageMonitorsReorder({ body: { links } }))
    if (res.success) {
        toast.add({ title: 'Monitors reordered', color: 'success' })
        await refreshAll()
    } else {
        toast.add({ title: 'Reorder failed', description: res.message, color: 'error' })
    }
}

async function onCreateLink(link: { monitor_id: number; group_id: number | null; display_name?: string | null; sort_order: number }) {
    const body = {
        monitor_id: link.monitor_id,
        group_id: link.group_id,
        display_name: link.display_name ?? null,
        sort_order: link.sort_order
    }
    const res = await useAPI((api) => api.postStatusPageMonitors({ body }))
    if (res.success) {
        toast.add({ title: 'Monitor added', color: 'success' })
        await refreshAll()
    } else {
        toast.add({ title: 'Add failed', description: res.message, color: 'error' })
    }
}

async function onUpdateLink(link: { id: number; display_name?: string | null; group_id?: number | null; sort_order?: number }) {
    const res = await useAPI((api) => api.putStatusPageMonitorsByLinkId({
        path: { linkId: link.id },
        body: link
    }))
    if (res.success) {
        toast.add({ title: 'Monitor updated', color: 'success' })
        await refreshAll()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

async function onDeleteLink(id: number) {
    const res = await useAPI((api) => api.deleteStatusPageMonitorsByLinkId({ path: { linkId: id } }))
    if (res.success) {
        toast.add({ title: 'Monitor unlinked', color: 'success' })
        await refreshAll()
    } else {
        toast.add({ title: 'Unlink failed', description: res.message, color: 'error' })
    }
}

async function onCreateGroup(group: { name: string; sort_order: number }) {
    const res = await useAPI((api) => api.postStatusPageGroups({ body: group }))
    if (res.success) {
        toast.add({ title: 'Group created', color: 'success' })
        await refreshConfig()
    } else {
        toast.add({ title: 'Create failed', description: res.message, color: 'error' })
    }
}

async function onUpdateGroup(group: { id: number; name: string; sort_order?: number }) {
    const res = await useAPI((api) => api.putStatusPageGroupsByGroupId({
        path: { groupId: group.id },
        body: { name: group.name, sort_order: group.sort_order }
    }))
    if (res.success) {
        toast.add({ title: 'Group updated', color: 'success' })
        await refreshConfig()
    } else {
        toast.add({ title: 'Update failed', description: res.message, color: 'error' })
    }
}

async function onDeleteGroup(id: number) {
    const res = await useAPI((api) => api.deleteStatusPageGroupsByGroupId({ path: { groupId: id } }))
    if (res.success) {
        toast.add({ title: 'Group deleted', color: 'success' })
        await refreshAll()
    } else {
        toast.add({ title: 'Delete failed', description: res.message, color: 'error' })
    }
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

                        <UCard class="border-slate-800 bg-slate-900/60">
                            <template #header>
                                <div class="flex items-center justify-between">
                                    <h3 class="font-semibold text-white">Layout Editor</h3>
                                    <span class="text-xs text-slate-400">Drag monitors and groups to arrange the status page</span>
                                </div>
                            </template>

                            <StatusPageEditor
                                :groups="groups"
                                :links="links"
                                :monitors="monitors"
                                :loading="configLoading"
                                @refresh="refreshAll"
                                @reorder-groups="onReorderGroups"
                                @reorder-links="onReorderLinks"
                                @create-link="onCreateLink"
                                @update-link="onUpdateLink"
                                @delete-link="onDeleteLink"
                                @create-group="onCreateGroup"
                                @update-group="onUpdateGroup"
                                @delete-group="onDeleteGroup"
                            />
                        </UCard>
                    </template>
                </div>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

</template>
