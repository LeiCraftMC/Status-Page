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

const projectItems = computed<NavigationMenuItem[]>(() => [
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
        to: '/status-pages',
    },
    {
        label: 'Monitors',
        icon: 'i-lucide-heart-pulse',
        to: '/monitors',
    }
]);

const adminItems = computed<NavigationMenuItem[]>(() => [
    {
        label: "Admin",
        icon: "i-lucide-shield",
        type: "label"
    },
    {
        label: "Users",
        icon: "i-lucide-users",
        to: "/admin/users",
    },
    {
        label: "Monitors",
        icon: "i-lucide-heart-pulse",
        to: "/admin/monitors",
    },
    {
        label: "Status Pages",
        icon: "i-lucide-layout-grid",
        to: "/admin/status-pages",
    },
    {
        label: "Settings",
        icon: "i-lucide-settings",
        to: "/admin/settings",
    },
]);

const settingsItems: NavigationMenuItem[] = [
    {
        label: "Settings",
        icon: "i-lucide-settings",
        type: "label",
    },
    {
        label: "General",
        icon: "i-lucide-user",
        to: "/settings",
        exact: true,
    },
    {
        label: "Security",
        icon: "i-lucide-shield",
        to: "/settings/security",
    }
];

const displaySidebars = computed(() => {
    const settingsSidebar = route.path.startsWith('/settings');
    const adminSidebar = route.path.startsWith('/admin');

    return {
        projectSidebar: !settingsSidebar && !adminSidebar,
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
                    v-if="displaySidebars.projectSidebar"
                    :collapsed="collapsed"
                    :items="projectItems"
                    orientation="vertical"
                />

                <UNavigationMenu
                    v-if="isAdmin && displaySidebars.adminSidebar"
                    :collapsed="collapsed"
                    :items="adminItems"
                    orientation="vertical"
                />

                <UNavigationMenu
                    v-if="displaySidebars.settingsSidebar"
                    :collapsed="collapsed"
                    :items="settingsItems"
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
                    class="mt-auto"
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
