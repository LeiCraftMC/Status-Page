<script setup lang="ts">
import type { FormSubmitEvent } from '#ui/types'
import * as z from 'zod'
import { zPutAdminSettingsBody } from '~/api-client/zod.gen'

type AdminSettings = GetAdminSettingsResponses[200]['data']
type StatusPage = GetAdminStatusPagesResponses[200]['data'][number]

definePageMeta({
    layout: 'dashboard'
})

useSeoMeta({
    title: 'Admin Settings | LeiCraft_MC Status Page',
    description: 'Configure global application settings'
})

const toast = useToast()

const userInfoStore = useUserInfoStore()
const currentUser = await userInfoStore.use()
if (!userInfoStore.isValid(currentUser) || currentUser.value.role !== 'admin') {
    await navigateTo('/dashboard')
}

const {
    data: settings,
    loading,
    refresh
} = await useAPILazyAsyncData<AdminSettings | null>('admin-settings', async () => {
    const res = await useAPI((api) => api.getAdminSettings({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load settings', description: res.message, color: 'error' })
        return null
    }
    return res.data
})

const {
    data: statusPages,
    loading: pagesLoading
} = await useAPILazyAsyncData<StatusPage[]>('admin-status-pages-for-settings', async () => {
    const res = await useAPI((api) => api.getAdminStatusPages({}))
    if (!res.success) {
        toast.add({ title: 'Failed to load status pages', description: res.message, color: 'error' })
        return []
    }
    return res.data
})

const schema = zPutAdminSettingsBody
type SettingsSchema = z.output<typeof schema>

const form = reactive<SettingsSchema>({
    root_status_page_id: null,
    default_theme: 'auto'
})

watchEffect(() => {
    if (settings.value) {
        form.root_status_page_id = settings.value.root_status_page_id
        form.default_theme = settings.value.default_theme
    }
})

const rootPageOptions = computed(() => {
    const pages = (statusPages.value || []).map(p => ({ label: `${p.title} (${p.slug})`, value: p.id }))
    return [{ label: 'None', value: null }, ...pages]
})

async function onSubmit(event: FormSubmitEvent<SettingsSchema>) {
    const body: SettingsSchema = {
        default_theme: event.data.default_theme
    }
    if (event.data.root_status_page_id === null) {
        body.root_status_page_id = null
    } else {
        body.root_status_page_id = event.data.root_status_page_id
    }

    const res = await useAPI((api) => api.putAdminSettings({ body }))
    if (res.success) {
        toast.add({ title: 'Settings saved', color: 'success' })
        await refresh()
    } else {
        toast.add({ title: 'Save failed', description: res.message, color: 'error' })
    }
}
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                title="Admin Settings"
                icon="i-lucide-settings"
                description="Global application configuration"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <div v-if="loading || pagesLoading" class="flex items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
                </div>

                <UCard v-else class="border-slate-800 bg-slate-900/60">
                    <UForm :schema="schema" :state="form" class="space-y-6" @submit="onSubmit">
                        <UFormField
                            label="Root Status Page"
                            name="root_status_page_id"
                            description="The status page shown on the public root URL."
                        >
                            <USelect
                                v-model="form.root_status_page_id"
                                value-key="value"
                                :items="rootPageOptions"
                                class="w-full md:w-96"
                            />
                        </UFormField>

                        <UFormField
                            label="Default Theme"
                            name="default_theme"
                            description="Theme used for public status pages."
                        >
                            <USelect
                                v-model="form.default_theme"
                                :items="[{ label: 'Auto', value: 'auto' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]"
                                class="w-full md:w-96"
                            />
                        </UFormField>

                        <div class="pt-4">
                            <UButton type="submit" label="Save Settings" color="primary" icon="i-lucide-save" />
                        </div>
                    </UForm>
                </UCard>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>
</template>
