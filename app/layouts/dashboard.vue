<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import UserMenu from "~/components/dashboard/UserMenu.vue";
import LeiCraftMCLogo from "~/components/img/LeiCraftMCLogo.vue";
import LeiCraftMCIcon from "~/components/img/LeiCraftMCIcon.vue";
import { useUserInfoStore } from "~/composables/stores/useUserStore";

const route = useRoute();

const userInfoStore = useUserInfoStore();
const user = await userInfoStore.use();

const isAdmin = computed(() => user.value?.role === "admin");

const sidebarItems = computed(() => {

    const basicItems: NavigationMenuItem[] = [
        {
            label: "Project",
            icon: "i-lucide-folder",
            type: "label"
        },
        {
            label: 'Dashboard',
            icon: 'i-lucide-layout-dashboard',
            to: '/dashboard',
            exact: true,
        },
        {
            label: 'Status Pages',
            icon: 'i-lucide-layout-grid',
            to: '/dashboard/status-pages',
        },
        {
            label: 'Monitors',
            icon: 'i-lucide-heart-pulse',
            to: '/dashboard/monitors',
        }
    ];

    const adminItems: NavigationMenuItem[] = [
        {
            label: "Admin",
            icon: "i-lucide-shield",
            type: "label"
        },
        {
            label: "Users",
            icon: "i-lucide-users",
            to: "/dashboard/admin/users",
        },
        {
            label: "Monitors",
            icon: "i-lucide-heart-pulse",
            to: "/dashboard/admin/monitors",
        },
        {
            label: "Status Pages",
            icon: "i-lucide-layout-grid",
            to: "/dashboard/admin/status-pages",
        },
        {
            label: "Settings",
            icon: "i-lucide-settings",
            to: "/dashboard/admin/settings",
        },
    ];

    const settingsItems: NavigationMenuItem[] = [
        {
            label: "Settings",
            icon: "i-lucide-settings",
            type: "label",
        },
        {
            label: "General",
            icon: "i-lucide-user",
            to: "/dashboard/settings",
            exact: true,
        },
        {
            label: "Security",
            icon: "i-lucide-shield",
            to: "/dashboard/settings/security",
        },
        {
            label: "API Keys",
            icon: "i-lucide-key",
            to: "/dashboard/settings/apikeys",
            active: route.path.startsWith("/dashboard/settings/apikeys"),
        }
    ];

    return {
        basic: basicItems,
        settings: settingsItems,
        admin: adminItems,
    }
});

const displaySidebars = computed(() => {

    const settingsSidebar = route.path.startsWith('/dashboard/settings');
    const adminSidebar = route.path.startsWith('/dashboard/admin');

    return {
        basicSidebar: !settingsSidebar && !adminSidebar,
        settingsSidebar: settingsSidebar,
        adminSidebar: adminSidebar,
    }
});

</script>

<template>
    <NuxtLoadingIndicator
        color="#f97316"
        position="top"
    />

    <UDashboardGroup class="app-layout-dashboard main-bg-color">
        <UDashboardSidebar
            collapsible
            resizable
            :ui="{
                header: 'main-bg-color',
                body: 'main-bg-color',
                content: 'main-bg-color',
                footer: 'border-t border-default main-bg-color',
            }"
            :min-size="18"
            :default-size="20"
            :max-size="30"
        >
            <template #header="{ collapsed }">
                <NuxtLink to="/" :class="`${!collapsed ? 'ms-2.5' : ''} flex items-center gap-1.5`">
                    <LeiCraftMCLogo v-if="!collapsed" class="h-6 w-auto flex-none" />
                    <LeiCraftMCIcon v-else class="h-8 w-8" />
                </NuxtLink>
            </template>

            <template #default="{ collapsed }">
                <UNavigationMenu
                    v-if="displaySidebars.basicSidebar"
                    :collapsed="collapsed"
                    :items="sidebarItems.basic"
                    orientation="vertical"
                />

                <UNavigationMenu
                    v-if="displaySidebars.adminSidebar || displaySidebars.settingsSidebar"
                    :collapsed="collapsed"
                    :items="[{
                        label: 'Go back to Dashboard',
                        icon: 'i-lucide-arrow-left',
                        to: '/dashboard',
                    }]"
                    orientation="vertical"
                    class="mb-2"
                />

                <UNavigationMenu
                    v-if="isAdmin && displaySidebars.adminSidebar"
                    :collapsed="collapsed"
                    :items="sidebarItems.admin"
                    orientation="vertical"
                />

                <UNavigationMenu
                    v-if="displaySidebars.settingsSidebar"
                    :collapsed="collapsed"
                    :items="sidebarItems.settings"
                    orientation="vertical"
                />
            </template>

            <template #footer="{ collapsed }">
                <UserMenu :collapsed="collapsed"></UserMenu>
            </template>
        </UDashboardSidebar>

        <slot />
    </UDashboardGroup>
</template>

<style scoped>
.app-layout-dashboard {
    color: rgb(241 245 249);
}
</style>
