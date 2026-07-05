<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import UserMenu from "~/components/dashboard/UserMenu.vue";
import LeiCraftMCLogo from "~/components/img/LeiCraftMCLogo.vue";
import LeiCraftMCIcon from "~/components/img/LeiCraftMCIcon.vue";
import { useUserInfoStore } from "~/composables/stores/useUserStore";
import { useSelectedProjectStore } from "~/composables/stores/useSelectedProjectStore";
import { useSessionStatus } from "~/composables/useSessionStatus";
import { deleteClaudeProjectsByAbsolutePathSessionsBySessionId, putClaudeProjectsByAbsolutePathSessionsBySessionId } from "~/api-client";
import { safeDecodeURIComponent } from "~/utils/url";
import DeleteSessionModal from "~/components/dashboard/DeleteSessionModal.vue";
import RenameSessionModal from "~/components/dashboard/RenameSessionModal.vue";

const route = useRoute();

const userInfoStore = useUserInfoStore();
const user = await userInfoStore.use();

const isAdmin = computed(() => user.value?.role === "admin");

const currentProjectStore = await useSelectedProjectStore();
const currentProject = await currentProjectStore.use();
const currentProjectSessions = computed(() => currentProject.value?.sessions || []);
const { isRunning } = useSessionStatus(computed(() => currentProject.value?.absolute_path));

const deleteModalOpen = ref(false);
const renameModalOpen = ref(false);
const activeSessionId = ref<string | null>(null);
const activeSessionTitle = ref('');

function openDeleteModal(sessionId: string, title: string) {
    activeSessionId.value = sessionId;
    activeSessionTitle.value = title;
    deleteModalOpen.value = true;
}

function openRenameModal(sessionId: string, title: string) {
    activeSessionId.value = sessionId;
    activeSessionTitle.value = title;
    renameModalOpen.value = true;
}

async function onDeleteSession() {
    const sessionId = activeSessionId.value;
    const projectPath = currentProject.value?.absolute_path;
    if (!sessionId || !projectPath) return;

    const result = await useAPI((api) => api.deleteClaudeProjectsByAbsolutePathSessionsBySessionId({
        path: {
            absolute_path: encodeURIComponent(projectPath),
            session_id: sessionId,
        }
    }));

    if (!result.success) {
        throw new Error(result.message || 'Failed to delete session');
    }

    await currentProjectStore.refresh();

    const routePath = safeDecodeURIComponent(route.params.absolute_path as string);
    if (routePath === projectPath && route.params.session_id === sessionId) {
        await navigateTo(`/projects/${encodeURIComponent(projectPath)}/sessions/new`, { replace: true });
    }
}

async function onRenameSession(title: string) {
    const sessionId = activeSessionId.value;
    const projectPath = currentProject.value?.absolute_path;
    if (!sessionId || !projectPath) return;

    const result = await useAPI((api) => api.putClaudeProjectsByAbsolutePathSessionsBySessionId({
        path: {
            absolute_path: encodeURIComponent(projectPath),
            session_id: sessionId,
        },
        body: { title }
    }));

    if (!result.success) {
        throw new Error(result.message || 'Failed to rename session');
    }

    await currentProjectStore.refresh();
}

const sidebarItems = computed(() => {

    const basicItems: NavigationMenuItem[] = [
        {
            label: "No Project Selected",
            icon: "i-lucide-folder",
            type: "label"
        },
        {
            label: 'No Session to show',
            icon: 'i-lucide-message-square',
            exact: false,
        }
    ];

    const projectItems: NavigationMenuItem[] = [
        {
            label: currentProject.value?.name || "No Project Name",
            icon: "i-lucide-folder",
            type: "label"
        }
    ];

    const projectSessionsItems: (NavigationMenuItem & { session_id?: string })[] = [];

    if (currentProjectSessions.value.length > 0) {
        projectSessionsItems.push({
            label: "Sessions",
            icon: "i-lucide-message-square",
            type: "label"
        });

        for (const session of currentProjectSessions.value) {
            projectSessionsItems.push({
                label: session.title,
                icon: 'i-lucide-message-square',
                to: `/projects/${encodeURIComponent(currentProject?.value?.absolute_path || '')}/sessions/${session.session_id}`,
                exact: false,
                slot: 'session',
                class: 'group relative',
                session_id: session.session_id,
            });
        }
    } else {
        projectSessionsItems.push({
            label: 'No Session to show',
            icon: 'i-lucide-message-square',
            exact: false,
        });
    }

    const adminItems: NavigationMenuItem[] = [
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
    ];


    const settings: NavigationMenuItem[] = [
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

    return {
        basic: basicItems,

        project: projectItems,
        projectSessions: projectSessionsItems,

        settings: settings,
        admin: adminItems,
    }
});

const displaySidebars = computed(() => {

    const settingsSidebar = route.path.startsWith('/settings');
    const adminSidebar = route.path.startsWith('/admin');
    const projectSidebar = !!route.params.absolute_path

    return {
        basicSidebar: !settingsSidebar && !adminSidebar && !projectSidebar,
        projectSidebar: projectSidebar,
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

               <div
                    v-if="displaySidebars.projectSidebar"
                    class="flex flex-col main-bg-color"
                >
                    <UNavigationMenu
                        :collapsed="collapsed"
                        :items="sidebarItems.project"
                        orientation="vertical"
                    />

                    <!-- Compose Button - Prominent -->
                    <div v-if="currentProject" class="px-2 mb-2">
                            <UButton
                                v-if="!collapsed"
                                icon="i-lucide-pen-square"
                                color="primary"
                                variant="solid"
                                size="md"
                                class="w-full justify-start"
                                :to="`/projects/${encodeURIComponent(currentProject.absolute_path)}/sessions/new`"
                            >
                                New Session
                            </UButton>
                            <UTooltip v-else text="New Session">
                                <UButton
                                    icon="i-lucide-pen-square"
                                    color="primary"
                                    variant="solid"
                                    size="md"
                                    :to="`/projects/${encodeURIComponent(currentProject.absolute_path)}/sessions/new`"
                                />
                            </UTooltip>
                        </div>

                    <UNavigationMenu
                        :collapsed="collapsed"
                        :items="sidebarItems.projectSessions"
                        orientation="vertical"
                        class="mt-0"
                    >
                        <template #session-leading="{ item }">
                            <UIcon
                                :name="isRunning((item as any).session_id) ? 'i-lucide-loader-2' : 'i-lucide-message-square'"
                                class="w-5 h-5 shrink-0"
                                :class="{ 'animate-spin': isRunning((item as any).session_id) }"
                            />
                        </template>

                        <template #session-trailing="{ item }">
                            <div
                                v-if="!collapsed"
                                class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <UButton
                                    icon="i-lucide-pencil"
                                    color="neutral"
                                    variant="ghost"
                                    size="xs"
                                    aria-label="Rename session"
                                    @click.stop.prevent="openRenameModal((item as any).session_id, (item as any).label)"
                                />
                                <UButton
                                    icon="i-lucide-trash-2"
                                    color="neutral"
                                    variant="ghost"
                                    size="xs"
                                    aria-label="Delete session"
                                    @click.stop.prevent="openDeleteModal((item as any).session_id, (item as any).label)"
                                />
                            </div>
                        </template>
                    </UNavigationMenu>
                </div>

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

                <UNavigationMenu
                    v-if="displaySidebars.adminSidebar || displaySidebars.settingsSidebar || displaySidebars.projectSidebar"
                    :collapsed="collapsed"
                    :items="[{
                        label: 'Go back to Project Selection',
                        icon: 'i-lucide-arrow-left',
                        to: '/projects',
                    }]"
                    orientation="vertical"
                    class="mt-auto"
                />

            </template>

            <template #footer="{ collapsed }">
                <UserMenu :collapsed="collapsed"></UserMenu>
            </template>
        </UDashboardSidebar>

        <DeleteSessionModal
            v-if="currentProject"
            title="Delete Session"
            :warning-text="`Are you sure you want to delete session '${activeSessionTitle}'? This action cannot be undone.`"
            v-model:open="deleteModalOpen"
            :on-delete="onDeleteSession"
        />

        <RenameSessionModal
            v-if="currentProject"
            title="Rename Session"
            v-model:open="renameModalOpen"
            :session-title="activeSessionTitle"
            :on-rename="onRenameSession"
        />

        <slot />
    </UDashboardGroup>
</template>

<style scoped>
.app-layout-dashboard {
    color: rgb(241 245 249);
}
</style>
