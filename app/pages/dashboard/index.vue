<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { useUserInfoStore } from '~/composables/stores/useUserStore'

type Monitor = GetMonitorsResponses[200]['data'][number]
type StatusPage = GetStatusPagesResponses[200]['data'][number]
type AdminSettings = GetAdminSettingsResponses[200]['data']

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Dashboard | LeiCraft_MC Status Page',
    description: 'Overview of monitors and status pages'
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
    data: statusPages,
    loading: pagesLoading,
    refresh: refreshPages
} = await useAPILazyAsyncData<StatusPage[]>('dashboard-status-pages', async () => {
    const res = await useAPI((api) => api.getStatusPages({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load status pages', description: res.message, color: 'error' })
        return []
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

const pageCounts = computed(() => {
    const list = statusPages.value || []
    return {
        total: list.length,
        enabled: list.filter(p => p.is_enabled).length,
        public: list.filter(p => p.is_public).length
    }
})

const adminLinks: NavigationMenuItem[] = [
    {
        label: 'Monitors',
        icon: 'i-lucide-heart-pulse',
        to: '/dashboard/admin/monitors'
    },
    {
        label: 'Status Pages',
        icon: 'i-lucide-layout-grid',
        to: '/dashboard/admin/status-pages'
    },
    {
        label: 'Settings',
        icon: 'i-lucide-settings',
        to: '/dashboard/admin/settings'
    }
]

function refreshAll() {
    refreshMonitors()
    refreshPages()
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

                    <!-- Status Pages Summary -->
                    <UCard class="border-slate-800 bg-slate-900/60">
                        <template #header>
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
                                        <UIcon name="i-lucide-layout-grid" class="size-5 text-primary-400" />
                                    </div>
                                    <div>
                                        <h3 class="font-semibold text-white">Status Pages</h3>
                                        <p class="text-sm text-slate-400">
                                            {{ pageCounts.total }} total · {{ pageCounts.enabled }} enabled · {{ pageCounts.public }} public
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

                        <div v-if="(statusPages || []).length" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <NuxtLink
                                v-for="page in statusPages"
                                :key="page.id"
                                :to="`/dashboard/status-pages/${page.slug}`"
                                class="group block p-4 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-800/60 transition-colors"
                            >
                                <div class="flex items-start justify-between gap-3">
                                    <div>
                                        <p class="font-medium text-white group-hover:text-primary-400 transition-colors">{{ page.title }}</p>
                                        <p class="text-sm text-slate-400">/{{ page.slug }}</p>
                                    </div>
                                    <div class="flex gap-1.5 shrink-0">
                                        <UBadge :color="page.is_public ? 'success' : 'warning'" variant="soft" class="text-xs">
                                            {{ page.is_public ? 'Public' : 'Private' }}
                                        </UBadge>
                                        <UBadge :color="page.is_enabled ? 'success' : 'neutral'" variant="soft" class="text-xs">
                                            {{ page.is_enabled ? 'On' : 'Off' }}
                                        </UBadge>
                                    </div>
                                </div>
                            </NuxtLink>
                        </div>

                        <UEmpty
                            v-else
                            icon="i-lucide-layout-grid"
                            title="No status pages"
                            description="Create a status page to get started."
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
                                    <p class="text-sm text-slate-400">
                                        Root page: {{ settings?.root_status_page_id ? `#${settings.root_status_page_id}` : 'None' }} · Default theme: {{ settings?.default_theme || 'auto' }}
                                    </p>
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
