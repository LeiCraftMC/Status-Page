<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { GetMonitorsResponses, GetStatusPageResponses, GetAdminSettingsResponses } from '@/api-client/types.gen'
import { useUserInfoStore } from '~/composables/stores/useUserStore'

type Monitor = GetMonitorsResponses[200]['data'][number]
type StatusPage = GetStatusPageResponses[200]['data']
type AdminSettings = GetAdminSettingsResponses[200]['data']

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Dashboard | LeiCraft_MC Status Page',
    description: 'Overview of monitors and status page'
})

const toast = useToast()
const userInfoStore = useUserInfoStore()
const user = await userInfoStore.use()
const isAdmin = computed(() => user.value?.role === 'admin')

const {
    data: monitors,
    loading: monitorsLoading,
    refresh: refreshMonitors
} = await useAPILazyAsyncData<Monitor[]>('dashboard-monitors', async () => {
    const res = await useAPI((api) => api.getMonitors({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load monitors', description: res.message, color: 'error' })
        return []
    }
    return res.data
})

const {
    data: statusPage,
    loading: pagesLoading,
    refresh: refreshStatusPage
} = await useAPILazyAsyncData<StatusPage | null>('dashboard-status-page-overview', async () => {
    const res = await useAPI((api) => api.getStatusPage({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load status page', description: res.message, color: 'error' })
        return null
    }
    return res.data
})

const {
    data: settings,
    loading: settingsLoading
} = await useAPILazyAsyncData<AdminSettings | null>('dashboard-settings', async () => {
    if (!isAdmin.value) return null
    const res = await useAPI((api) => api.getAdminSettings({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load settings', description: res.message, color: 'error' })
        return null
    }
    return res.data
})

const loading = computed(() => monitorsLoading.value || pagesLoading.value || (isAdmin.value && settingsLoading.value))

const monitorCounts = computed(() => {
    const list = monitors.value || []
    return {
        total: list.length,
        up: list.filter(m => m.latest_check?.status === 'up').length,
        down: list.filter(m => m.latest_check?.status === 'down').length,
        degraded: list.filter(m => m.latest_check?.status === 'degraded').length,
        unknown: list.filter(m => !m.latest_check || m.latest_check.status === 'unknown').length
    }
})

const pageOverallStatus = computed(() => {
    if (!statusPage.value) return 'unknown'
    const all = [
        ...statusPage.value.groups.flatMap((g: any) => g.monitors),
        ...statusPage.value.ungrouped
    ]
    if (all.some((m: any) => m.latest_check?.status === 'down')) return 'down'
    if (all.some((m: any) => m.latest_check?.status === 'degraded')) return 'degraded'
    if (all.every((m: any) => m.latest_check?.status === 'up')) return 'up'
    return 'unknown'
})

const activeIncidents = computed(() => (statusPage.value?.incidents || []).filter((i: any) => !i.is_resolved).length)

const adminLinks: NavigationMenuItem[] = [
    {
        label: 'Monitors',
        icon: 'i-lucide-heart-pulse',
        to: '/dashboard/admin/monitors'
    },
    {
        label: 'Status Page',
        icon: 'i-lucide-layout-grid',
        to: '/dashboard/admin/status-page'
    },
    {
        label: 'Settings',
        icon: 'i-lucide-settings',
        to: '/dashboard/admin/settings'
    }
]

function refreshAll() {
    refreshMonitors()
    refreshStatusPage()
}
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                title="Dashboard"
                icon="i-lucide-layout-dashboard"
                description="Overview of your status infrastructure"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <div v-if="loading" class="flex items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
                </div>

                <div v-else class="space-y-6">
                    <!-- Monitor Summary -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <UCard class="border-slate-800 bg-slate-900/60">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                                    <UIcon name="i-lucide-heart-pulse" class="size-5 text-slate-400" />
                                </div>
                                <div>
                                    <p class="text-2xl font-bold text-white">{{ monitorCounts.total }}</p>
                                    <p class="text-sm text-slate-400">Monitors</p>
                                </div>
                            </div>
                        </UCard>

                        <UCard class="border-slate-800 bg-slate-900/60">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                    <UIcon name="i-lucide-check-circle" class="size-5 text-emerald-400" />
                                </div>
                                <div>
                                    <p class="text-2xl font-bold text-white">{{ monitorCounts.up }}</p>
                                    <p class="text-sm text-slate-400">Up</p>
                                </div>
                            </div>
                        </UCard>

                        <UCard class="border-slate-800 bg-slate-900/60">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                                    <UIcon name="i-lucide-x-circle" class="size-5 text-red-400" />
                                </div>
                                <div>
                                    <p class="text-2xl font-bold text-white">{{ monitorCounts.down }}</p>
                                    <p class="text-sm text-slate-400">Down</p>
                                </div>
                            </div>
                        </UCard>

                        <UCard class="border-slate-800 bg-slate-900/60">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                    <UIcon name="i-lucide-alert-triangle" class="size-5 text-amber-400" />
                                </div>
                                <div>
                                    <p class="text-2xl font-bold text-white">{{ monitorCounts.degraded }}</p>
                                    <p class="text-sm text-slate-400">Degraded</p>
                                </div>
                            </div>
                        </UCard>
                    </div>

                    <!-- Status Page Summary -->
                    <UCard class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
                                        <UIcon name="i-lucide-layout-grid" class="size-5 text-primary-400" />
                                    </div>
                                    <div>
                                        <h3 class="font-semibold text-white">Status Page</h3>
                                        <p class="text-sm text-slate-400">
                                            {{ statusPage?.page.title || 'Not configured' }} · {{ statusPage?.groups.length || 0 }} groups · {{ statusPage?.ungrouped.length }} monitors
                                        </p>
                                    </div>
                                </div>
                                <UButton
                                    icon="i-lucide-refresh-cw"
                                    color="neutral"
                                    variant="ghost"
                                    @click="refreshAll"
                                />
                            </div>
                        </template>

                        <div v-if="statusPage" class="space-y-4">
                            <div class="flex flex-wrap items-center gap-3">
                                <UBadge :color="pageOverallStatus === 'up' ? 'success' : pageOverallStatus === 'down' ? 'error' : pageOverallStatus === 'degraded' ? 'warning' : 'neutral'" variant="soft" class="capitalize">
                                    {{ pageOverallStatus }}
                                </UBadge>
                                <UBadge :color="statusPage.page.is_public ? 'success' : 'warning'" variant="soft" class="text-xs">
                                    {{ statusPage.page.is_public ? 'Public' : 'Private' }}
                                </UBadge>
                                <UBadge :color="statusPage.page.is_enabled ? 'success' : 'neutral'" variant="soft" class="text-xs">
                                    {{ statusPage.page.is_enabled ? 'On' : 'Off' }}
                                </UBadge>
                                <span v-if="activeIncidents > 0" class="text-sm text-red-400">{{ activeIncidents }} active incident{{ activeIncidents === 1 ? '' : 's' }}</span>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <NuxtLink
                                    to="/dashboard/status-page"
                                    class="group block p-4 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-800/60 transition-colors"
                                >
                                    <p class="font-medium text-white group-hover:text-primary-400 transition-colors">View Status Page</p>
                                    <p class="text-sm text-slate-400">See how members and the public see it.</p>
                                </NuxtLink>

                                <NuxtLink
                                    v-if="isAdmin"
                                    to="/dashboard/admin/status-page"
                                    class="group block p-4 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-800/60 transition-colors"
                                >
                                    <p class="font-medium text-white group-hover:text-primary-400 transition-colors">Edit Status Page</p>
                                    <p class="text-sm text-slate-400">Configure groups, linked monitors, and content.</p>
                                </NuxtLink>
                            </div>
                        </div>

                        <UEmpty
                            v-else
                            icon="i-lucide-layout-grid"
                            title="No status page configured"
                            description="An administrator can set up the status page in the admin settings."
                            variant="naked"
                        />
                    </UCard>

                    <!-- Admin shortcuts -->
                    <UCard v-if="isAdmin" class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                                    <UIcon name="i-lucide-shield" class="size-5 text-red-400" />
                                </div>
                                <div>
                                    <h3 class="font-semibold text-white">Administration</h3>
                                    <p class="text-sm text-slate-400">Default theme: {{ settings?.default_theme || 'auto' }}</p>
                                </div>
                            </div>
                        </template>

                        <UNavigationMenu :items="adminLinks" orientation="vertical" />
                    </UCard>
                </div>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>
</template>
